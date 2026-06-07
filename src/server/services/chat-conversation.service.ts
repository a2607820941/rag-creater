import type {
  ChatCitation,
  ChatConversationDTO,
  ChatKnowledgeFile,
  ChatMessageDTO,
} from "@/features/chat/chat.types";
import type { LlmInterfaceKey } from "@/features/chat/chat.validation";
import type { ChatConversation, ChatMessage } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  createChatCompletion,
  type LlmMessage,
} from "@/server/services/agent/llm-client";

const RECENT_CHAT_MESSAGE_LIMIT = 8;
const MEMORY_CONTEXT_WINDOW_TOKENS = 8000;
const MEMORY_COMPACT_THRESHOLD_TOKENS = MEMORY_CONTEXT_WINDOW_TOKENS / 2;
const MEMORY_SUMMARY_RETRY_LIMIT = 3;

export async function listChatConversations(options?: {
  page?: number;
  pageSize?: number;
}): Promise<{
  items: ChatConversationDTO[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 50;
  const where = { status: "active" };

  const [items, total] = await Promise.all([
    prisma.chatConversation.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: {
          select: { messages: true },
        },
      },
    }),
    prisma.chatConversation.count({ where }),
  ]);

  return {
    items: items.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      mode: conversation.mode,
      agentId: conversation.agentId,
      status: conversation.status,
      messageCount: conversation._count.messages,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}

export async function createEmptyChatConversation(input?: {
  mode?: string;
  agentId?: string;
}): Promise<ChatConversationDTO> {
  const conversation = await prisma.chatConversation.create({
    data: {
      title: "New conversation",
      mode: input?.mode ?? "knowledge-agent",
      agentId: input?.agentId,
    },
    include: {
      _count: {
        select: { messages: true },
      },
    },
  });

  return {
    id: conversation.id,
    title: conversation.title,
    mode: conversation.mode,
    agentId: conversation.agentId,
    status: conversation.status,
    messageCount: conversation._count.messages,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

export async function getOrCreateChatConversation(input: {
  conversationId?: string;
  message: string;
  mode: string;
  agentId?: string;
}) {
  if (input.conversationId) {
    const existing = await prisma.chatConversation.findUnique({
      where: { id: input.conversationId },
    });

    if (existing) {
      if (existing.title === "New conversation") {
        return prisma.chatConversation.update({
          where: { id: existing.id },
          data: {
            title: createConversationTitle(input.message),
            mode: input.mode,
            agentId: input.agentId,
          },
        });
      }

      return existing;
    }
  }

  return prisma.chatConversation.create({
    data: {
      title: createConversationTitle(input.message),
      mode: input.mode,
      agentId: input.agentId,
    },
  });
}

export async function listChatConversationMessages(
  conversationId: string
): Promise<ChatMessageDTO[] | null> {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: { id: true, status: true },
  });

  if (!conversation || conversation.status !== "active") return null;

  const messages = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

  return messages.map((message) => ({
    id: message.id,
    role: message.role === "user" ? "user" : "assistant",
    content: message.content,
    citations: parseJsonArray<ChatCitation>(message.citationsJson),
    knowledgeFiles: parseJsonArray<ChatKnowledgeFile>(
      message.knowledgeFilesJson
    ),
    createdAt: message.createdAt.toISOString(),
  }));
}

export async function deleteChatConversation(
  conversationId: string
): Promise<boolean> {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: { id: true },
  });

  if (!conversation) return false;

  await prisma.chatConversation.update({
    where: { id: conversationId },
    data: {
      status: "deleted",
      updatedAt: new Date(),
    },
  });

  return true;
}

export async function updateChatConversationModel(input: {
  conversationId: string;
  mode: string;
  agentId?: string | null;
}): Promise<ChatConversationDTO | null> {
  const existing = await prisma.chatConversation.findUnique({
    where: { id: input.conversationId },
    select: { id: true, status: true },
  });

  if (!existing || existing.status !== "active") return null;

  const conversation = await prisma.chatConversation.update({
    where: { id: input.conversationId },
    data: {
      mode: input.mode,
      agentId: input.agentId || null,
    },
    include: {
      _count: {
        select: { messages: true },
      },
    },
  });

  return {
    id: conversation.id,
    title: conversation.title,
    mode: conversation.mode,
    agentId: conversation.agentId,
    status: conversation.status,
    messageCount: conversation._count.messages,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

export async function prepareChatConversationMemory(
  conversationId: string,
  llmInterface: LlmInterfaceKey
): Promise<{ recentMessages: LlmMessage[]; memorySummary: string | null }> {
  const [conversation, messages] = await Promise.all([
    prisma.chatConversation.findUnique({ where: { id: conversationId } }),
    prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const compactedConversation = await compactMemoryIfNeeded({
    conversation,
    messages,
    llmInterface,
  });

  return {
    recentMessages: messages.slice(-RECENT_CHAT_MESSAGE_LIMIT).map((message) => ({
      role: message.role === "user" ? "user" : "assistant",
      content: message.content,
    })),
    memorySummary: compactedConversation.memorySummary,
  };
}

export async function persistChatExchange(input: {
  conversationId: string;
  userMessage: string;
  assistantMessage: string;
  citations?: ChatCitation[];
  knowledgeFiles?: ChatKnowledgeFile[];
}): Promise<{ userMessageId: string; assistantMessageId: string }> {
  return prisma.$transaction(async (tx) => {
    const userMessage = await tx.chatMessage.create({
      data: {
        conversationId: input.conversationId,
        role: "user",
        content: input.userMessage,
      },
    });

    const assistantMessage = await tx.chatMessage.create({
      data: {
        conversationId: input.conversationId,
        role: "assistant",
        content: input.assistantMessage,
        citationsJson: input.citations
          ? JSON.stringify(input.citations)
          : undefined,
        knowledgeFilesJson: input.knowledgeFiles
          ? JSON.stringify(input.knowledgeFiles)
          : undefined,
      },
    });

    await tx.chatConversation.update({
      where: { id: input.conversationId },
      data: { updatedAt: new Date() },
    });

    return {
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
    };
  });
}

export function mergeRecentMessages(
  messages: LlmMessage[],
  recentMessages: LlmMessage[],
  memorySummary?: string | null
): LlmMessage[] {
  const [systemMessage, ...rest] = messages;
  const currentUserMessage = rest[rest.length - 1];
  const middleMessages = rest.slice(0, -1);

  if (!systemMessage || systemMessage.role !== "system" || !currentUserMessage) {
    return [...recentMessages, ...messages];
  }

  const systemWithMemory = memorySummary
    ? {
        ...systemMessage,
        content: `${systemMessage.content}

长期对话记忆：
${memorySummary}`,
      }
    : systemMessage;

  return [
    systemWithMemory,
    ...middleMessages,
    ...recentMessages,
    currentUserMessage,
  ];
}

async function compactMemoryIfNeeded(input: {
  conversation: ChatConversation;
  messages: ChatMessage[];
  llmInterface: LlmInterfaceKey;
}): Promise<ChatConversation> {
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
    pendingMessages.length <= RECENT_CHAT_MESSAGE_LIMIT
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
              "你负责压缩多轮对话记忆。请输出 Markdown 摘要，保留用户目标、已确认事实、关键约束和未解决问题，不要加入知识库引用编号。",
          },
          {
            role: "user",
            content: `已有长期记忆：
${input.conversation.memorySummary || "暂无"}

需要合并进长期记忆的短期会话：
${oldMessageText}`,
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

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

function selectCompactableMessages(messages: ChatMessage[]): ChatMessage[] {
  const retainedRecent = messages.slice(-RECENT_CHAT_MESSAGE_LIMIT);
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

function createConversationTitle(message: string) {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized) return "New conversation";
  return normalized.length > 24 ? `${normalized.slice(0, 24)}...` : normalized;
}

function parseJsonArray<T>(value: string | null): T[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}
