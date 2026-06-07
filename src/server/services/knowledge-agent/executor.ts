import type { ChatCitation, ChatKnowledgeFile } from "@/features/chat/chat.types";
import type { LlmInterfaceKey } from "@/features/chat/chat.validation";
import type { RagRetrieveResponse } from "@/features/rag/types";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type {
  LlmContentPart,
  LlmMessage,
} from "@/server/services/agent/llm-client";
import {
  createChatCompletion,
  streamChatCompletion,
} from "@/server/services/agent/llm-client";
import {
  buildAttachmentImageParts,
  buildAttachmentPromptContext,
} from "@/server/services/chat-attachment.service";
import { mergeRecentMessages } from "@/server/services/chat-conversation.service";
import { emitTrace, type ChatStreamEmitter } from "@/server/services/chat/chat-stream";
import { RAG_CITATION_MIN_SCORE } from "@/server/services/rag/gating";
import { retrieveRagContexts } from "@/server/services/rag/retriever";
import {
  buildKnowledgeAgentAnswerPrompt,
  buildKnowledgeAgentSelectorPrompt,
} from "@/server/services/knowledge-agent/prompts";

export type RunKnowledgeAgentInput = {
  userMessage: string;
  attachmentIds?: string[];
  llmInterface?: LlmInterfaceKey;
  recentMessages: LlmMessage[];
  memorySummary: string | null;
  signal?: AbortSignal;
  emit: ChatStreamEmitter;
};

export type RunKnowledgeAgentResult = {
  answer: string;
  knowledgeFiles: ChatKnowledgeFile[];
  citations: ChatCitation[];
};

type CandidateDocument = {
  id: string;
  title: string;
  originalName: string;
  fileType: string;
  chunkCount: number;
  snippet: string;
  knowledgeBaseIds: string[];
  knowledgeBaseNames: string[];
};

type LoadedDocument = {
  id: string;
  title: string;
  chunkCount: number;
  content: string;
  supportingChunks: Array<{
    id: string;
    content: string;
    chunkType: ChatCitation["chunkType"];
  }>;
  knowledgeBaseId: string;
};

const CANDIDATE_DOCUMENT_LIMIT = 30;
const SELECTED_DOCUMENT_LIMIT = 3;
const DOCUMENT_SNIPPET_LIMIT = 800;
const DOCUMENT_CONTENT_LIMIT = 12_000;
const MIN_DOCUMENT_CONTENT_LENGTH = 120;

const selectedDocumentsSchema = z.object({
  documentIds: z.array(z.string().trim().min(1)).max(SELECTED_DOCUMENT_LIMIT),
  reason: z.string().trim().min(1).optional(),
});

export async function runKnowledgeAgent(
  input: RunKnowledgeAgentInput
): Promise<RunKnowledgeAgentResult> {
  const [attachmentContext, imageParts, candidateDocuments] = await Promise.all([
    buildAttachmentPromptContext(input.attachmentIds),
    buildAttachmentImageParts(input.attachmentIds),
    listCandidateDocuments(CANDIDATE_DOCUMENT_LIMIT),
  ]);

  emitTrace(input.emit, {
    type: "plan",
    title: "Build temporary knowledge map",
    detail: `${candidateDocuments.length} active parsed document(s) are available for selection.`,
    status: "completed",
  });

  input.emit("rag-summary", { status: "not-applicable", citationCount: 0 });
  input.emit("citations", []);
  input.emit("status", { status: "organizing" });

  const selection = await selectDocuments({
    candidateDocuments,
    userMessage: input.userMessage,
    llmInterface: input.llmInterface ?? "openai",
    signal: input.signal,
    emit: input.emit,
  });

  const selectedDocumentIds =
    selection?.documentIds.filter((documentId) =>
      candidateDocuments.some((document) => document.id === documentId)
    ) ?? [];

  if (selectedDocumentIds.length === 0) {
    return runFallbackKnowledgeAgent({
      input,
      imageParts,
      attachmentContext,
      candidateDocuments,
      reason:
        selection === null
          ? "Document selection did not return valid JSON."
          : "Document selection did not return any usable document ids.",
    });
  }

  input.emit("status", { status: "reading-documents" });
  emitTrace(input.emit, {
    type: "retrieval",
    title: "Read selected documents",
    detail: `${selectedDocumentIds.length} document(s) selected for direct reading.`,
    status: "running",
  });

  const loadedDocuments = await loadSelectedDocuments(selectedDocumentIds);

  if (!hasUsefulDocumentContent(loadedDocuments)) {
    return runFallbackKnowledgeAgent({
      input,
      imageParts,
      attachmentContext,
      candidateDocuments,
      reason: "Selected documents did not contain enough readable content.",
    });
  }

  input.emit("status", { status: "generating" });
  emitTrace(input.emit, {
    type: "generation",
    title: "Generate Knowledge Agent answer",
    detail: "Generate the final answer from the selected documents.",
    status: "running",
  });

  const answerMessages = attachImagesToCurrentUserMessage(
    mergeRecentMessages(
      [
        {
          role: "system",
          content: buildKnowledgeAgentAnswerPrompt({
            question: input.userMessage,
            documents: formatLoadedDocuments(loadedDocuments),
            attachmentContext,
          }),
        },
        {
          role: "user",
          content: input.userMessage,
        },
      ],
      input.recentMessages,
      input.memorySummary
    ),
    imageParts
  );

  const answer = await streamChatCompletion(
    answerMessages,
    (token) => input.emit("token", token),
    input.llmInterface ?? "openai",
    { signal: input.signal }
  );

  const citations = buildDocumentCitations(loadedDocuments);
  const knowledgeFiles = dedupeKnowledgeFiles(
    loadedDocuments.map((document) => ({
      id: document.id,
      title: document.title,
      chunkCount: document.chunkCount,
    }))
  );
  input.emit("citations", citations);
  input.emit("knowledge-files", knowledgeFiles);
  emitTrace(input.emit, {
    type: "generation",
    title: "Knowledge Agent answer generated",
    status: "completed",
  });

  return {
    answer,
    citations,
    knowledgeFiles,
  };
}

async function selectDocuments(input: {
  candidateDocuments: CandidateDocument[];
  userMessage: string;
  llmInterface: LlmInterfaceKey;
  signal?: AbortSignal;
  emit: ChatStreamEmitter;
}) {
  if (input.candidateDocuments.length === 0) {
    return null;
  }

  emitTrace(input.emit, {
    type: "plan",
    title: "Select target documents",
    detail: "Use a small model turn to choose the most relevant documents.",
    status: "running",
  });

  const rawSelection = await createChatCompletion(
    [
      {
        role: "system",
        content: "Return only strict JSON. Do not wrap the JSON in markdown fences.",
      },
      {
        role: "user",
        content: buildKnowledgeAgentSelectorPrompt({
          question: input.userMessage,
          documents: formatCandidateDocuments(input.candidateDocuments),
        }),
      },
    ],
    input.llmInterface,
    { signal: input.signal }
  );

  const parsed = selectedDocumentsSchema.safeParse(
    parseLooseJsonObject(rawSelection)
  );
  if (!parsed.success) {
    emitTrace(input.emit, {
      type: "warning",
      title: "Document selection fell back",
      detail: "The selector output was not valid JSON.",
      status: "completed",
    });
    return null;
  }

  emitTrace(input.emit, {
    type: "plan",
    title: "Target documents selected",
    detail: `${parsed.data.documentIds.length} document(s) selected.`,
    status: "completed",
  });

  return parsed.data;
}

async function runFallbackKnowledgeAgent(input: {
  input: RunKnowledgeAgentInput;
  imageParts: LlmContentPart[];
  attachmentContext: string;
  candidateDocuments: CandidateDocument[];
  reason: string;
}): Promise<RunKnowledgeAgentResult> {
  const fallbackKnowledgeBaseIds = Array.from(
    new Set(
      input.candidateDocuments.flatMap((document) => document.knowledgeBaseIds)
    )
  );

  emitTrace(input.input.emit, {
    type: "warning",
    title: "Fallback to RAG",
    detail: input.reason,
    status: "completed",
  });

  const retrieve =
    fallbackKnowledgeBaseIds.length > 0
      ? await retrieveRagContexts({
          query: input.input.userMessage,
          scope: { knowledgeBaseIds: fallbackKnowledgeBaseIds },
          mode: "balanced",
        })
      : {
          query: input.input.userMessage,
          contexts: [],
          llmContext: "",
          references: [],
        };

  const citations = toCitations(retrieve);
  const knowledgeFiles = await buildKnowledgeFilesFromCitations(citations);
  const fallbackDocumentText =
    retrieve.llmContext.trim() || "No reliable retrieved context was available.";

  input.input.emit("rag-summary", {
    status: citations.length > 0 ? "hit" : "miss",
    citationCount: citations.length,
  });
  input.input.emit("citations", citations);
  input.input.emit("knowledge-files", knowledgeFiles);
  input.input.emit("status", { status: "generating" });

  const fallbackMessages = attachImagesToCurrentUserMessage(
    mergeRecentMessages(
      [
        {
          role: "system",
          content: buildKnowledgeAgentAnswerPrompt({
            question: input.input.userMessage,
            documents: fallbackDocumentText,
            attachmentContext: input.attachmentContext,
          }),
        },
        {
          role: "user",
          content: input.input.userMessage,
        },
      ],
      input.input.recentMessages,
      input.input.memorySummary
    ),
    input.imageParts
  );

  const answer = await streamChatCompletion(
    fallbackMessages,
    (token) => input.input.emit("token", token),
    input.input.llmInterface ?? "openai",
    { signal: input.input.signal }
  );

  emitTrace(input.input.emit, {
    type: "generation",
    title: "Knowledge Agent answer generated",
    detail: "Answered using the fallback RAG path.",
    status: "completed",
  });

  return {
    answer,
    citations,
    knowledgeFiles,
  };
}

async function listCandidateDocuments(limit: number): Promise<CandidateDocument[]> {
  const documents = await prisma.documentSource.findMany({
    where: { status: "parsed", activeStatus: "active" },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      originalName: true,
      fileType: true,
      chunkCount: true,
      rawContent: true,
      chunks: {
        where: { chunkStatus: "active", content: { not: "" } },
        orderBy: { chunkIndex: "asc" },
        take: 3,
        select: { content: true },
      },
      knowledgeBases: {
        where: {
          status: "active",
          knowledgeBase: { status: "active" },
        },
        select: {
          knowledgeBaseId: true,
          knowledgeBase: { select: { name: true } },
        },
      },
    },
  });

  return documents.map((document) => ({
    id: document.id,
    title: document.title,
    originalName: document.originalName,
    fileType: document.fileType,
    chunkCount: document.chunkCount,
    snippet: buildSnippet(
      document.rawContent ?? document.chunks.map((chunk) => chunk.content).join("\n\n")
    ),
    knowledgeBaseIds: document.knowledgeBases.map((item) => item.knowledgeBaseId),
    knowledgeBaseNames: document.knowledgeBases.map((item) => item.knowledgeBase.name),
  }));
}

async function loadSelectedDocuments(
  documentIds: string[]
): Promise<LoadedDocument[]> {
  const documents = await prisma.documentSource.findMany({
    where: {
      id: { in: documentIds.slice(0, SELECTED_DOCUMENT_LIMIT) },
      status: "parsed",
      activeStatus: "active",
    },
    select: {
      id: true,
      title: true,
      chunkCount: true,
      rawContent: true,
      knowledgeBases: {
        where: {
          status: "active",
          knowledgeBase: { status: "active" },
        },
        select: { knowledgeBaseId: true },
        take: 1,
      },
      chunks: {
        where: { chunkStatus: "active", content: { not: "" } },
        orderBy: { chunkIndex: "asc" },
        take: 20,
        select: {
          id: true,
          content: true,
          chunkType: true,
        },
      },
    },
  });

  const order = new Map(documentIds.map((id, index) => [id, index]));
  return documents
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((document) => ({
      id: document.id,
      title: document.title,
      chunkCount: document.chunkCount,
      content: buildSnippet(
        document.rawContent ?? document.chunks.map((chunk) => chunk.content).join("\n\n"),
        DOCUMENT_CONTENT_LIMIT
      ),
      supportingChunks: document.chunks.slice(0, 3).map((chunk) => ({
        id: chunk.id,
        content: buildSnippet(chunk.content, 600),
        chunkType: normalizeChunkType(chunk.chunkType),
      })),
      knowledgeBaseId: document.knowledgeBases[0]?.knowledgeBaseId ?? "",
    }));
}

function formatCandidateDocuments(documents: CandidateDocument[]) {
  return documents
    .map(
      (document, index) =>
        [
          `${index + 1}. id=${document.id}`,
          `title=${document.title}`,
          `originalName=${document.originalName}`,
          `fileType=${document.fileType}`,
          `chunkCount=${document.chunkCount}`,
          `knowledgeBases=${
            document.knowledgeBaseNames.length > 0
              ? document.knowledgeBaseNames.join(", ")
              : "none"
          }`,
          `snippet=${document.snippet || "No preview available."}`,
        ].join("\n")
    )
    .join("\n\n");
}

function formatLoadedDocuments(documents: LoadedDocument[]) {
  return documents
    .map(
      (document, index) =>
        [
          `Document ${index + 1}: ${document.title} (${document.id})`,
          document.content || "No readable content available.",
        ].join("\n")
    )
    .join("\n\n");
}

function buildSnippet(value: string, limit = DOCUMENT_SNIPPET_LIMIT) {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

function hasUsefulDocumentContent(documents: LoadedDocument[]) {
  return documents.some((document) => document.content.length >= MIN_DOCUMENT_CONTENT_LENGTH);
}

function buildDocumentCitations(documents: LoadedDocument[]): ChatCitation[] {
  return documents.flatMap((document, documentIndex) =>
    document.supportingChunks.map((chunk, chunkIndex) => ({
      refId: `doc_${documentIndex + 1}_${chunkIndex + 1}`,
      chunkId: chunk.id,
      knowledgeId: document.id,
      documentId: document.id,
      knowledgeBaseId: document.knowledgeBaseId,
      title: document.title,
      content: chunk.content,
      chunkType: chunk.chunkType,
      score: 1,
    }))
  );
}

async function buildKnowledgeFilesFromCitations(citations: ChatCitation[]) {
  const documentIds = Array.from(
    new Set(citations.map((citation) => citation.documentId).filter(Boolean))
  );

  if (documentIds.length === 0) {
    return [] as ChatKnowledgeFile[];
  }

  const documents = await prisma.documentSource.findMany({
    where: { id: { in: documentIds } },
    select: { id: true, title: true, chunkCount: true },
  });

  return dedupeKnowledgeFiles(
    documents.map((document) => ({
      id: document.id,
      title: document.title,
      chunkCount: document.chunkCount,
    }))
  );
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

function parseLooseJsonObject(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  const jsonText =
    firstBrace >= 0 && lastBrace > firstBrace
      ? candidate.slice(firstBrace, lastBrace + 1)
      : candidate;

  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function normalizeChunkType(
  chunkType: string
): ChatCitation["chunkType"] {
  if (chunkType === "qa") return "qa";
  if (chunkType === "summary") return "summary";
  if (chunkType === "wiki") return "wiki";
  return "text";
}

function attachImagesToCurrentUserMessage(
  messages: LlmMessage[],
  imageParts: LlmContentPart[]
): LlmMessage[] {
  if (imageParts.length === 0) return messages;

  const index = findLastUserMessageIndex(messages);
  if (index < 0) return messages;

  return messages.map((message, messageIndex) => {
    if (messageIndex !== index) return message;
    const text = getTextMessageContent(message.content);
    return {
      ...message,
      content: [{ type: "text", text }, ...imageParts],
    };
  });
}

function findLastUserMessageIndex(messages: LlmMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return index;
  }

  return -1;
}

function getTextMessageContent(content: LlmMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter(
      (part): part is Extract<LlmContentPart, { type: "text" }> =>
        part.type === "text"
    )
    .map((part) => part.text)
    .join("\n");
}

function dedupeKnowledgeFiles(files: ChatKnowledgeFile[]) {
  const seen = new Set<string>();
  return files.filter((file) => {
    if (seen.has(file.id)) return false;
    seen.add(file.id);
    return true;
  });
}
