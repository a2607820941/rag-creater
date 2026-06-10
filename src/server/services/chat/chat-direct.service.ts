import type {
  ChatCitation,
  ChatKnowledgeFile,
  ChatRagSummary,
} from "@/features/chat/chat.types";
import type { DirectChatRequest } from "@/features/chat/chat.validation";
import { parseAgentKnowledgeScope } from "@/features/agent/agent.validation";
import type { RagRetrieveResponse, RagRetrieveScope } from "@/features/rag/types";
import { prisma } from "@/lib/db";
import {
  buildAttachmentImageParts,
  buildAttachmentPromptContext,
} from "@/server/services/chat-attachment.service";
import { mergeRecentMessages } from "@/server/services/chat-conversation.service";
import { createUsageLog } from "@/server/services/analytics.service";
import type { LlmMessage } from "@/server/services/agent/llm-client";
import {
  RAG_CITATION_MIN_SCORE,
  shouldUseRagForMessage,
} from "@/server/services/rag/gating";
import { retrieveRagContexts } from "@/server/services/rag/retriever";

import {
  attachImagesToCurrentUserMessage,
  renderAttachmentInstruction,
} from "./chat-prompt-helpers";

export type DirectChatPreparation = {
  messages: LlmMessage[];
  citations: ChatCitation[];
  ragSummary: ChatRagSummary;
};

type DirectChatInput = Pick<
  DirectChatRequest,
  "message" | "agentId" | "chatMode" | "attachmentIds"
>;

export async function prepareDirectChat(input: {
  request: DirectChatInput;
  origin: string;
  recentMessages: LlmMessage[];
  memorySummary: string | null;
}): Promise<DirectChatPreparation> {
  const { request, origin, recentMessages, memorySummary } = input;
  const [attachmentContext, imageParts] = await Promise.all([
    buildAttachmentPromptContext(request.attachmentIds),
    buildAttachmentImageParts(request.attachmentIds),
  ]);

  if (request.chatMode === "agent") {
    const agent = await getActiveAgent(request.agentId);
    const agentContext = await retrieveAgentContext(request.message, agent);
    const citations = agentContext ? toCitations(agentContext.retrieve) : [];
    if (agentContext) {
      await reportRagUsage({
        origin,
        query: request.message,
        scope: agentContext.scope,
        retrieve: agentContext.retrieve,
      });
    }

    return {
      messages: attachImagesToCurrentUserMessage(
        mergeRecentMessages(
          buildAgentMessages({
            userMessage: request.message,
            systemPrompt: appendAgentKnowledgeContext(
              agent.systemPrompt,
              agentContext?.retrieve ?? null
            ),
            attachmentContext,
          }),
          recentMessages,
          memorySummary
        ),
        imageParts
      ),
      citations,
      ragSummary: {
        status: citations.length > 0 ? "hit" : "miss",
        citationCount: citations.length,
      },
    };
  }

  if (request.chatMode === "rag-openai") {
    const shouldUseKnowledgeBase = shouldUseRagForMessage(request.message);
    if (!shouldUseKnowledgeBase) {
      return {
        messages: attachImagesToCurrentUserMessage(
          mergeRecentMessages(
            buildPlainChatMessages(request.message, attachmentContext),
            recentMessages,
            memorySummary
          ),
          imageParts
        ),
        citations: [],
        ragSummary: { status: "skipped", citationCount: 0 },
      };
    }

    const { retrieve, scope } = await retrieveOpenaiContext(request.message);
    const citations = toCitations(retrieve);
    await reportRagUsage({
      origin,
      query: request.message,
      scope,
      retrieve,
    });

    return {
      messages: attachImagesToCurrentUserMessage(
        mergeRecentMessages(
          buildRagOnlyMessages(
            request.message,
            retrieve,
            attachmentContext
          ),
          recentMessages,
          memorySummary
        ),
        imageParts
      ),
      citations,
      ragSummary: {
        status: citations.length > 0 ? "hit" : "miss",
        citationCount: citations.length,
      },
    };
  }

  return {
    messages: attachImagesToCurrentUserMessage(
      mergeRecentMessages(
        buildPlainChatMessages(request.message, attachmentContext),
        recentMessages,
        memorySummary
      ),
      imageParts
    ),
    citations: [],
    ragSummary: { status: "not-applicable", citationCount: 0 },
  };
}

export async function reportKnowledgeAgentUsage(input: {
  query: string;
  knowledgeFiles: ChatKnowledgeFile[];
}) {
  try {
    const references = await buildKnowledgeAgentReferences(input.knowledgeFiles);
    const scopeKnowledgeBaseIds = Array.from(
      new Set(references.map((reference) => reference.knowledgeBaseId))
    );

    if (scopeKnowledgeBaseIds.length === 0) {
      const activeKnowledgeBases = await prisma.knowledgeBase.findMany({
        where: { status: "active" },
        select: { id: true },
      });
      scopeKnowledgeBaseIds.push(
        ...activeKnowledgeBases.map((knowledgeBase) => knowledgeBase.id)
      );
    }

    await createUsageLog({
      query: input.query,
      mode: "balanced",
      scope: {
        knowledgeBaseIds:
          scopeKnowledgeBaseIds.length > 0
            ? scopeKnowledgeBaseIds
            : ["knowledge-agent"],
      },
      contexts: [],
      references,
    });
  } catch (error) {
    console.warn("Failed to report knowledge-agent usage log", error);
  }
}

export async function reportDirectChatUsage(input: {
  query: string;
  chatMode: "agent" | "openai";
}) {
  try {
    await createUsageLog({
      source: input.chatMode === "agent" ? "agent_chat" : "openai_chat",
      query: input.query,
      mode: "balanced",
      scope: {
        knowledgeBaseIds: [input.chatMode],
      },
      contexts: [],
      references: [],
      noHit: false,
    });
  } catch (error) {
    console.warn("Failed to report direct chat usage log", error);
  }
}

async function getActiveAgent(agentId?: string) {
  if (!agentId) {
    throw new Error("Agent mode requires an active Agent");
  }

  const agent = await prisma.expertAgent.findUnique({
    where: { id: agentId },
  });

  if (!agent) throw new Error("Agent not found");
  if (agent.status !== "active") throw new Error("Agent is not active");
  return agent;
}

async function retrieveAgentContext(
  query: string,
  agent: Awaited<ReturnType<typeof getActiveAgent>>
): Promise<{ retrieve: RagRetrieveResponse; scope: RagRetrieveScope } | null> {
  const configuredScope = parseAgentKnowledgeScope(agent.knowledgeScope);
  let knowledgeBaseIds = configuredScope.knowledgeBaseIds;

  if (configuredScope.mode === "all" || knowledgeBaseIds.length === 0) {
    const activeKnowledgeBases = await prisma.knowledgeBase.findMany({
      where: { status: "active" },
      select: { id: true },
    });
    knowledgeBaseIds = activeKnowledgeBases.map((item) => item.id);
  }

  if (knowledgeBaseIds.length === 0) {
    return null;
  }

  const scope: RagRetrieveScope = { knowledgeBaseIds };
  if (configuredScope.knowledgeIds.length > 0) {
    scope.knowledgeIds = configuredScope.knowledgeIds;
  }
  if (configuredScope.categoryIds.length > 0) {
    scope.categoryIds = configuredScope.categoryIds;
  }
  if (configuredScope.tagIds.length > 0) {
    scope.tagIds = configuredScope.tagIds;
  }
  if (configuredScope.chunkTypes.length > 0) {
    scope.chunkTypes = configuredScope.chunkTypes;
  }

  const retrieve = await retrieveRagContexts({
    query,
    mode: "balanced",
    scope,
  });

  return { retrieve, scope };
}

async function retrieveOpenaiContext(
  query: string
): Promise<{ retrieve: RagRetrieveResponse; scope: RagRetrieveScope }> {
  const knowledgeBases = await prisma.knowledgeBase.findMany({
    where: { status: "active" },
    select: { id: true },
  });
  const knowledgeBaseIds = knowledgeBases.map((item) => item.id);
  const scope = {
    knowledgeBaseIds:
      knowledgeBaseIds.length > 0 ? knowledgeBaseIds : ["kb_001", "kb_rag"],
  };

  const retrieve = await retrieveRagContexts({
    query,
    mode: "balanced",
    scope,
  });

  return { retrieve, scope };
}

async function reportRagUsage(input: {
  origin: string;
  query: string;
  scope: RagRetrieveScope;
  retrieve: RagRetrieveResponse;
}) {
  try {
    const response = await fetch(`${input.origin}/api/usage/logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: input.query,
        mode: "balanced",
        scope: input.scope,
        contexts: input.retrieve.contexts,
        references: input.retrieve.references,
      }),
    });

    if (!response.ok) {
      console.warn("Failed to report RAG usage log", {
        status: response.status,
        statusText: response.statusText,
      });
    }
  } catch (error) {
    console.warn("Failed to report RAG usage log", error);
  }
}

async function buildKnowledgeAgentReferences(
  knowledgeFiles: ChatKnowledgeFile[]
) {
  if (knowledgeFiles.length === 0) return [];

  const documents = await prisma.documentSource.findMany({
    where: {
      id: {
        in: knowledgeFiles.map((file) => file.id),
      },
    },
    include: {
      chunks: {
        where: {
          chunkStatus: "active",
          OR: [
            { chunkType: "text" },
            { chunkType: "knowledge", reviewStatus: "confirmed" },
          ],
        },
        orderBy: { chunkIndex: "asc" },
        take: 1,
      },
      knowledgeBases: {
        where: {
          status: "active",
          knowledgeBase: {
            status: "active",
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  return documents.flatMap((document) => {
    const chunk = document.chunks[0];
    const relation = document.knowledgeBases[0];
    if (!chunk || !relation) return [];

    return [
      {
        knowledgeBaseId: relation.knowledgeBaseId,
        knowledgeId: document.id,
        chunkId: chunk.id,
        title: chunk.title ?? document.title ?? document.originalName,
        chunkType:
          chunk.chunkType === "knowledge"
            ? chunk.knowledgeType === "faq"
              ? "qa"
              : "summary"
            : chunk.chunkType === "wiki" ||
                chunk.chunkType === "summary" ||
                chunk.chunkType === "qa"
              ? chunk.chunkType
              : "text",
      } as const,
    ];
  });
}

function buildPlainChatMessages(
  userMessage: string,
  attachmentContext: string
): LlmMessage[] {
  return [
    {
      role: "system",
      content: `You are a general AI assistant. Answer the user directly.

${renderAttachmentInstruction(attachmentContext)}`,
    },
    {
      role: "user",
      content: userMessage,
    },
  ];
}

function buildAgentMessages(input: {
  userMessage: string;
  systemPrompt: string | null;
  attachmentContext: string;
}): LlmMessage[] {
  return [
    {
      role: "system",
      content: `${input.systemPrompt || "You are a professional and reliable expert Agent."}

${renderAttachmentInstruction(input.attachmentContext)}`,
    },
    {
      role: "user",
      content: input.userMessage,
    },
  ];
}

function appendAgentKnowledgeContext(
  systemPrompt: string | null,
  retrieve: RagRetrieveResponse | null
): string {
  const basePrompt =
    systemPrompt || "You are a professional and reliable expert Agent.";
  const knowledgeContext =
    retrieve?.llmContext ||
    "No reliable knowledge-base context was retrieved for this turn.";

  return `${basePrompt}

Knowledge base context:
${knowledgeContext}

Citation rules:
1. When you use knowledge-base context, cite it with [ref_x].
2. Put citation markers immediately after the supported clause, like conclusion[ref_1][ref_2].
3. Do not wrap citation markers in parentheses or connect them with "and".
4. Do not invent citation ids that are not present in the knowledge-base context.`;
}

function buildRagOnlyMessages(
  userMessage: string,
  retrieve: RagRetrieveResponse,
  attachmentContext: string
): LlmMessage[] {
  return [
    {
      role: "system",
      content: `You are an AI assistant answering with retrieved knowledge-base context.

${renderAttachmentInstruction(attachmentContext)}

Citation format rule: put citation markers immediately after the supported clause, like conclusion[ref_1][ref_2]. Do not wrap citation markers in parentheses or connect them with "and".

Knowledge-base retrieval result:
${retrieve.llmContext || "No relevant knowledge-base context was retrieved."}

Requirements:
1. First understand the user question and any attachment context.
2. For business knowledge, answer primarily from retrieved knowledge-base context.
3. Cite used knowledge-base context with [ref_x].
4. If no reliable context was found, say that clearly.
5. Do not invent citation ids.`,
    },
    {
      role: "user",
      content: userMessage,
    },
  ];
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
