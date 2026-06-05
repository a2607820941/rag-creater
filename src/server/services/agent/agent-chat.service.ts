import { prisma } from "@/lib/db";
import type { ExpertAgent } from "@/generated/prisma/client";
import type { ChatConversation, ChatMessage } from "@/generated/prisma/client";

type AgentConversation = ChatConversation;
type AgentMessage = ChatMessage;
import {
  parseAgentKnowledgeScope,
  toRagRetrieveScope,
} from "@/features/agent/agent.validation";
import type {
  AgentConversationListQuery,
  LlmInterfaceKey,
} from "@/features/agent/agent-chat.validation";
import type {
  AgentConversationDTO,
  ChatCitation,
  ChatMessageDTO,
} from "@/features/agent/agent-chat.types";
import type { RagRetrieveResponse } from "@/features/rag/types";
import {
  RAG_CITATION_MIN_SCORE,
  shouldUseRagForMessage,
} from "@/server/services/rag/gating";
import { retrieveRagContexts } from "@/server/services/rag/retriever";

import {
  createChatCompletion,
  streamChatCompletion,
  type LlmMessage,
} from "./llm-client";

const RECENT_MESSAGE_LIMIT = 8;
const MEMORY_CONTEXT_WINDOW_TOKENS = 8000;
const MEMORY_COMPACT_THRESHOLD_TOKENS = MEMORY_CONTEXT_WINDOW_TOKENS / 2;
const MEMORY_SUMMARY_RETRY_LIMIT = 3;

type PreparedChat = {
  agent: ExpertAgent;
  conversation: AgentConversation;
  messages: LlmMessage[];
  citations: ChatCitation[];
};

export async function listAgentConversations(
  agentId: string,
  options: AgentConversationListQuery
) {
  const { page, pageSize } = options;

  const [items, total] = await Promise.all([
    prisma.chatConversation.findMany({
      where: { agentId, status: "active" },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.chatConversation.count({
      where: { agentId, status: "active" },
    }),
  ]);

  return {
    items: items.map(toConversationDTO),
    total,
    page,
    pageSize,
  };
}

export async function listConversationMessages(
  conversationId: string
): Promise<ChatMessageDTO[]> {
  const messages = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

  return messages.map(toMessageDTO);
}

export async function prepareAgentChat(input: {
  agentId: string;
  conversationId?: string;
  message: string;
  llmInterface?: LlmInterfaceKey;
}): Promise<PreparedChat> {
  const agent = await prisma.expertAgent.findUnique({
    where: { id: input.agentId },
  });

  if (!agent) {
    throw new Error("Agent 不存在");
  }
  if (agent.status !== "active") {
    throw new Error("Agent 未启用");
  }

  const conversation = await getOrCreateConversation({
    agentId: agent.id,
    conversationId: input.conversationId,
    title: createConversationTitle(input.message),
  });

  const existingMessages = await prisma.chatMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
  });

  const compactedConversation = await compactMemoryIfNeeded({
    agent,
    conversation,
    messages: existingMessages,
    llmInterface: input.llmInterface ?? "default",
  });
  const recentMessages = existingMessages.slice(-RECENT_MESSAGE_LIMIT);
  const shouldUseKnowledge = shouldUseRagForMessage(input.message);
  const retrieve = shouldUseKnowledge
    ? await retrieveKnowledgeContext(agent, input.message)
    : createEmptyRetrieveResponse(input.message);

  return {
    agent,
    conversation: compactedConversation,
    messages: shouldUseKnowledge
      ? buildPromptMessages({
          agent,
          memorySummary: compactedConversation.memorySummary,
          recentMessages,
          retrieve,
          userMessage: input.message,
        })
      : buildDirectAgentMessages({
          agent,
          memorySummary: compactedConversation.memorySummary,
          recentMessages,
          userMessage: input.message,
        }),
    citations: toCitations(retrieve),
  };
}

export async function streamAndPersistAgentAnswer(input: {
  conversationId: string;
  userMessage: string;
  messages: LlmMessage[];
  citations: ChatCitation[];
  llmInterface?: LlmInterfaceKey;
  signal?: AbortSignal;
  onToken: (token: string) => void;
}): Promise<string> {
  const answer = await streamChatCompletion(
    input.messages,
    input.onToken,
    input.llmInterface ?? "default",
    { signal: input.signal }
  );

  await prisma.$transaction(async (tx) => {
    await tx.chatMessage.create({
      data: {
        conversationId: input.conversationId,
        role: "user",
        content: input.userMessage,
      },
    });
    await tx.chatMessage.create({
      data: {
        conversationId: input.conversationId,
        role: "assistant",
        content: answer,
        citationsJson: JSON.stringify(input.citations),
      },
    });
    await tx.chatConversation.update({
      where: { id: input.conversationId },
      data: { updatedAt: new Date() },
    });
  });

  return answer;
}

async function getOrCreateConversation(input: {
  agentId: string;
  conversationId?: string;
  title: string;
}): Promise<AgentConversation> {
  if (!input.conversationId) {
    return prisma.chatConversation.create({
      data: {
        agentId: input.agentId,
        title: input.title,
        mode: "agent",
      },
    });
  }

  const conversation = await prisma.chatConversation.findUnique({
    where: { id: input.conversationId },
  });

  if (!conversation || conversation.agentId !== input.agentId) {
    throw new Error("会话不存在");
  }

  return conversation;
}

async function compactMemoryIfNeeded(input: {
  agent: ExpertAgent;
  conversation: AgentConversation;
  messages: AgentMessage[];
  llmInterface: LlmInterfaceKey;
}): Promise<AgentConversation> {
  const cursorIndex = input.conversation.memoryCursorMessageId
    ? input.messages.findIndex(
        (message) => message.id === input.conversation.memoryCursorMessageId
      )
    : -1;
  const pendingMessages = input.messages.slice(Math.max(cursorIndex + 1, 0));
  const estimatedTokens = estimateTokens(
    pendingMessages.map((message) => message.content).join("\n\n")
  );

  if (
    estimatedTokens <= MEMORY_COMPACT_THRESHOLD_TOKENS ||
    pendingMessages.length <= RECENT_MESSAGE_LIMIT
  ) {
    return input.conversation;
  }

  const compactableMessages = selectCompactableMessages(pendingMessages);
  if (compactableMessages.length === 0) {
    return input.conversation;
  }

  const oldMessageText = compactableMessages
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n\n");
  const cursorMessageId =
    compactableMessages[compactableMessages.length - 1]?.id ??
    input.conversation.memoryCursorMessageId;

  let summary = "";
  let lastError: unknown;
  for (let attempt = 1; attempt <= MEMORY_SUMMARY_RETRY_LIMIT; attempt += 1) {
    try {
      summary = await createChatCompletion(
        [
          {
            role: "system",
            content:
              "你负责压缩 Agent 多轮对话记忆。请输出 Markdown 摘要，保留用户目标、已确认事实、关键约束、未解决问题，不要加入知识库引用编号。",
          },
          {
            role: "user",
            content: `已有长期记忆：\n${
              input.conversation.memorySummary || "暂无"
            }\n\n需要合并进长期记忆的短期会话：\n${oldMessageText}`,
          },
        ],
        input.llmInterface
      );
      break;
    } catch (error) {
      lastError = error;
    }
  }

  const failed = !summary.trim();
  const nextSummary = failed
    ? buildFallbackMemorySummary({
        previousSummary: input.conversation.memorySummary,
        oldMessageText,
        error: lastError,
      })
    : summary.trim();

  return prisma.chatConversation.update({
    where: { id: input.conversation.id },
    data: {
      memorySummary: nextSummary,
      memoryCursorMessageId: cursorMessageId,
      memoryFailureCount: failed
        ? { increment: MEMORY_SUMMARY_RETRY_LIMIT }
        : 0,
    },
  });
}

async function retrieveKnowledgeContext(
  agent: ExpertAgent,
  query: string
): Promise<RagRetrieveResponse> {
  const scope = parseAgentKnowledgeScope(agent.knowledgeScope);
  const knowledgeBaseIds =
    scope.knowledgeBaseIds.length > 0
      ? scope.knowledgeBaseIds
      : await listActiveKnowledgeBaseIds();

  if (knowledgeBaseIds.length === 0) {
    return {
      query,
      contexts: [],
      llmContext: "",
      references: [],
    };
  }

  return retrieveRagContexts({
    query,
    mode: "balanced",
    scope: toRagRetrieveScope({ ...scope, knowledgeBaseIds }),
  });
}

async function listActiveKnowledgeBaseIds(): Promise<string[]> {
  const knowledgeBases = await prisma.knowledgeBase.findMany({
    where: { status: "active" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  return knowledgeBases.map((knowledgeBase) => knowledgeBase.id);
}

function buildPromptMessages(input: {
  agent: ExpertAgent;
  memorySummary: string | null;
  recentMessages: AgentMessage[];
  retrieve: RagRetrieveResponse;
  userMessage: string;
}): LlmMessage[] {
  const recentText = input.recentMessages
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n\n");
  const hasKnowledge =
    input.retrieve.contexts.length > 0 && input.retrieve.llmContext.trim();
  const referenceRule = input.agent.showReferences
    ? "如果使用某段知识，请用 [ref_x] 标注引用。"
    : "回答可以不展示引用编号，但仍必须基于检索结果。";

  return [
    {
      role: "system",
      content: `你是一个知识库 Agent。

Agent 角色设定：
${input.agent.systemPrompt || "根据知识库内容提供准确、可溯源的回答。"}

回答风格：
${input.agent.answerStyle}

历史对话摘要：
${input.memorySummary || "暂无"}

最近对话：
${recentText || "暂无"}

知识库检索结果：
${input.retrieve.llmContext || "未检索到相关知识。"}

要求：
1. 只能基于知识库检索结果和必要的历史对话回答。
2. ${referenceRule}
3. 如果知识库没有可靠依据，请明确说明没有找到可靠依据。
4. 不要编造引用编号。
5. 当前知识库检索结果状态：${hasKnowledge ? "有可用引用" : "无可用引用"}。`,
    },
    {
      role: "user",
      content: input.userMessage,
    },
  ];
}

function buildDirectAgentMessages(input: {
  agent: ExpertAgent;
  memorySummary: string | null;
  recentMessages: AgentMessage[];
  userMessage: string;
}): LlmMessage[] {
  const recentText = input.recentMessages
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n\n");

  return [
    {
      role: "system",
      content: `你是一个知识库 Agent。

Agent 角色设定：
${input.agent.systemPrompt || "根据用户问题提供准确、友好的回答。"}

回答风格：
${input.agent.answerStyle}

历史对话摘要：
${input.memorySummary || "暂无"}

最近对话：
${recentText || "暂无"}

当前问题不需要检索知识库。请自然回答，不要添加知识库引用编号。`,
    },
    {
      role: "user",
      content: input.userMessage,
    },
  ];
}

function createEmptyRetrieveResponse(query: string): RagRetrieveResponse {
  return {
    query,
    contexts: [],
    llmContext: "",
    references: [],
  };
}

function createConversationTitle(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  return normalized.length > 40 ? `${normalized.slice(0, 40)}...` : normalized;
}

function toConversationDTO(
  conversation: AgentConversation
): AgentConversationDTO {
  return {
    id: conversation.id,
    agentId: conversation.agentId,
    title: conversation.title,
    memorySummary: conversation.memorySummary,
    memoryCursorMessageId: conversation.memoryCursorMessageId,
    memoryFailureCount: conversation.memoryFailureCount,
    status: conversation.status,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

function selectCompactableMessages(messages: AgentMessage[]): AgentMessage[] {
  const retainedRecent = messages.slice(-RECENT_MESSAGE_LIMIT);
  const compactable = messages.slice(0, -retainedRecent.length);
  const lastUserIndex = compactable
    .map((message) => message.role)
    .lastIndexOf("user");

  if (lastUserIndex <= 0) {
    return compactable;
  }

  return compactable.slice(0, lastUserIndex);
}

function buildFallbackMemorySummary(input: {
  previousSummary: string | null;
  oldMessageText: string;
  error: unknown;
}): string {
  const errorMessage =
    input.error instanceof Error ? input.error.message : "未知错误";

  return [
    input.previousSummary || "",
    "",
    "## [MEMORY_SUMMARY_FALLBACK]",
    "",
    `LLM 记忆压缩连续失败 ${MEMORY_SUMMARY_RETRY_LIMIT} 次，已将原始会话片段降级写入长期记忆。失败原因：${errorMessage}`,
    "",
    input.oldMessageText,
  ]
    .filter(Boolean)
    .join("\n");
}

function toMessageDTO(message: AgentMessage): ChatMessageDTO {
  return {
    id: message.id,
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content,
    citations: parseCitations(message.citationsJson),
    createdAt: message.createdAt.toISOString(),
  };
}

function parseCitations(value: string | null): ChatCitation[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as ChatCitation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toCitations(retrieve: RagRetrieveResponse): ChatCitation[] {
  return retrieve.contexts
    .filter((context) => context.score >= RAG_CITATION_MIN_SCORE)
    .map((context, index) => {
    const reference = retrieve.references.find(
      (item) => item.chunkId === context.chunkId
    );

    return {
      refId: reference?.refId ?? `ref_${index + 1}`,
      chunkId: context.chunkId,
      knowledgeId: context.knowledgeId,
      documentId: context.knowledgeId,
      knowledgeBaseId: context.knowledgeBaseId,
      title: context.title,
      content: context.content,
      chunkType: context.chunkType,
      score: context.score,
    };
  });
}
