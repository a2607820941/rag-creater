import type { ChatCitation, ChatKnowledgeFile } from "@/features/chat/chat.types";
import type { RagContext, RagRetrieveScope } from "@/features/rag/types";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { getRetrievableChunkWhere } from "@/server/services/rag/chunk-mapper";
import { retrieveRagContexts } from "@/server/services/rag/retriever";
import {
  formatKnowledgeMapItems,
  getDocumentWhereForScope,
  listKnowledgeMapItems,
} from "@/server/services/knowledge-agent/knowledge-map";
import {
  KNOWLEDGE_AGENT_ROUND_CHAR_BUDGET,
  KNOWLEDGE_AGENT_TOTAL_CHAR_BUDGET,
  type KnowledgeAgentBudgetState,
  type KnowledgeAgentToolName,
  type KnowledgeAgentToolResult,
  type KnowledgeAgentScope,
  type ListKnowledgeMapInput,
  type RetrieveFilesInput,
  type SearchChunksInput,
} from "@/server/services/knowledge-agent/types";

type ToolBudget = {
  roundBudget?: number;
  budgetState: KnowledgeAgentBudgetState;
};

type RetrievedDocument = {
  id: string;
  title: string;
  originalName: string;
  fileType: string;
  sourceType: string;
  chunkCount: number;
  knowledgeMap: {
    summary: string;
    keywordsJson: string;
    outlineJson: string;
    signalsJson: string;
  } | null;
  chunks: Array<{
    id: string;
    content: string;
    chunkIndex: number;
    chunkType: string;
    title: string | null;
    chunkStatus: string;
    reviewStatus: string | null;
  }>;
  knowledgeBases: Array<{
    knowledgeBaseId: string;
    knowledgeBase: {
      id: string;
      name: string;
      status: string;
    };
  }>;
};

const DEFAULT_RETRIEVE_LIMIT = 5;
const DEFAULT_SEARCH_LIMIT = 10;

export async function runListKnowledgeMapTool(
  input: ListKnowledgeMapInput,
  budget: ToolBudget
): Promise<KnowledgeAgentToolResult> {
  const items = await listKnowledgeMapItems(input);

  return buildToolResult(
    "list_knowledge_map",
    formatKnowledgeMapItems(items),
    budget
  );
}

export async function runRetrieveFilesTool(
  input: RetrieveFilesInput,
  budget: ToolBudget
): Promise<KnowledgeAgentToolResult> {
  const documents = await findDocumentsForRetrieval(input);
  const selectedDocuments = selectDocumentsForBudget(input.mode, documents, budget);
  const content = formatRetrievedDocuments(input.mode, selectedDocuments);

  return buildToolResult("retrieve_files", content, budget, {
    knowledgeFiles: selectedDocuments.map(toKnowledgeFile),
  });
}

export async function runSearchChunksTool(
  input: SearchChunksInput,
  budget: ToolBudget
): Promise<KnowledgeAgentToolResult> {
  const ragScope = await toRagRetrieveScope(input.scope);

  if (ragScope.knowledgeBaseIds.length === 0) {
    return buildToolResult(
      "search_chunks",
      "No active knowledge-base relation matched this scope, so no chunks are searchable.",
      budget,
      { knowledgeFiles: [] }
    );
  }

  const retrieve = await retrieveRagContexts({
    query: input.query,
    scope: ragScope,
    mode: input.limit > DEFAULT_SEARCH_LIMIT ? "detailed" : "balanced",
  });
  const limitedContexts = selectSearchContextsForBudget(
    retrieve.contexts.slice(0, input.limit),
    budget
  );
  const content =
    limitedContexts.length > 0
      ? formatSearchContexts(limitedContexts)
      : "No relevant active chunks matched this query and scope.";

  return buildToolResult("search_chunks", content, budget, {
    citations: toCitations(limitedContexts),
    knowledgeFiles: await toKnowledgeFilesFromContexts(limitedContexts),
  });
}

async function findDocumentsForRetrieval(input: RetrieveFilesInput) {
  const limit = input.limit ?? DEFAULT_RETRIEVE_LIMIT;
  const documents = await prisma.documentSource.findMany({
    where: {
      AND: [
        getDocumentWhereForScope(input.scope),
        ...getQueryWhereClauses(input.query),
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      originalName: true,
      fileType: true,
      sourceType: true,
      chunkCount: true,
      knowledgeMap: {
        select: {
          summary: true,
          keywordsJson: true,
          outlineJson: true,
          signalsJson: true,
        },
      },
      chunks: {
        where: {
          chunkStatus: "active",
          content: { not: "" },
          ...getRetrievableChunkWhere(),
        },
        orderBy: { chunkIndex: "asc" },
        select: {
          id: true,
          content: true,
          chunkIndex: true,
          chunkType: true,
          title: true,
          chunkStatus: true,
          reviewStatus: true,
        },
      },
      knowledgeBases: {
        where: {
          status: "active",
          knowledgeBase: { status: "active" },
        },
        include: {
          knowledgeBase: {
            select: { id: true, name: true, status: true },
          },
        },
      },
    },
  });

  return documents;
}

function formatRetrievedDocuments(
  mode: RetrieveFilesInput["mode"],
  documents: RetrievedDocument[]
) {
  if (documents.length === 0) {
    return "No active parsed documents matched this scope.";
  }

  if (mode === "summary") {
    return documents.map(formatDocumentSummary).join("\n\n");
  }

  if (mode === "chunks") {
    return documents.map(formatDocumentChunks).join("\n\n");
  }

  return documents.map(formatDocumentFullContent).join("\n\n");
}

function formatDocumentSummary(document: RetrievedDocument) {
  const summary = summarizeText(getDocumentText(document), 500);
  const knowledgeBases = formatKnowledgeBases(document);

  return [
    `[document:${document.id}] ${getDocumentTitle(document)}`,
    `Type: ${document.fileType}; sourceType: ${document.sourceType}; chunks: ${document.chunkCount}`,
    `Knowledge bases: ${knowledgeBases}`,
    `Summary: ${summary || "No summary available"}`,
    `Keywords: ${extractKeywords(summary).join(", ") || "None"}`,
  ].join("\n");
}

function selectDocumentsForBudget(
  mode: RetrieveFilesInput["mode"],
  documents: RetrievedDocument[],
  budget: ToolBudget
) {
  const allowedChars = getAllowedChars(budget);
  if (allowedChars <= 0 || documents.length === 0) return [];

  const selected: RetrievedDocument[] = [];
  for (const document of documents) {
    const candidate = [...selected, document];
    const formatted = formatRetrievedDocuments(mode, candidate);
    if (formatted.length <= allowedChars || selected.length === 0) {
      selected.push(document);
      if (formatted.length >= allowedChars) break;
      continue;
    }
    break;
  }

  return selected;
}

function formatDocumentChunks(document: RetrievedDocument) {
  const chunks =
    document.chunks.length > 0
      ? document.chunks
          .map((chunk) =>
            [
              `[chunk:${chunk.id}] index=${chunk.chunkIndex}; type=${chunk.chunkType}`,
              chunk.title ? `Title: ${chunk.title}` : null,
              chunk.content,
            ]
              .filter(Boolean)
              .join("\n")
          )
          .join("\n\n")
      : "No active chunks available.";

  return [
    `[document:${document.id}] ${getDocumentTitle(document)} (${document.chunkCount} chunks)`,
    chunks,
  ].join("\n");
}

function formatDocumentFullContent(document: RetrievedDocument) {
  return [
    `[document:${document.id}] ${getDocumentTitle(document)} (${document.fileType}, ${document.chunkCount} chunks)`,
    getDocumentText(document) || "No document content available.",
  ].join("\n");
}

function formatSearchContexts(contexts: RagContext[]) {
  return contexts
    .map((context, index) =>
      [
        `[ref_${index + 1}] ${context.title}`,
        `documentId=${context.knowledgeId}; chunkId=${context.chunkId}; knowledgeBaseId=${context.knowledgeBaseId}; score=${context.score.toFixed(3)}`,
        context.content,
      ].join("\n")
    )
    .join("\n\n");
}

function selectSearchContextsForBudget(
  contexts: RagContext[],
  budget: ToolBudget
) {
  const allowedChars = getAllowedChars(budget);
  if (allowedChars <= 0 || contexts.length === 0) return [];

  const selected: RagContext[] = [];
  for (const context of contexts) {
    const candidate = [...selected, context];
    const formatted = formatSearchContexts(candidate);
    if (formatted.length <= allowedChars || selected.length === 0) {
      selected.push(context);
      if (formatted.length >= allowedChars) break;
      continue;
    }
    break;
  }

  return selected;
}

async function toRagRetrieveScope(
  scope: KnowledgeAgentScope
): Promise<RagRetrieveScope> {
  if (scope.type === "knowledgeBase") {
    return { knowledgeBaseIds: scope.knowledgeBaseIds };
  }

  if (scope.type === "files") {
    const relations = await prisma.knowledgeBaseDocument.findMany({
      where: {
        documentId: { in: scope.documentIds },
        status: "active",
        knowledgeBase: { status: "active" },
        document: {
          status: "parsed",
          activeStatus: "active",
        },
      },
      select: {
        documentId: true,
        knowledgeBaseId: true,
      },
    });

    return {
      knowledgeBaseIds: unique(relations.map((relation) => relation.knowledgeBaseId)),
      knowledgeIds: unique(relations.map((relation) => relation.documentId)),
    };
  }

  const knowledgeBases = await prisma.knowledgeBase.findMany({
    where: { status: "active" },
    select: { id: true },
  });

  return { knowledgeBaseIds: knowledgeBases.map((knowledgeBase) => knowledgeBase.id) };
}

function buildToolResult(
  toolName: KnowledgeAgentToolName,
  content: string,
  budget: ToolBudget,
  extras: Pick<KnowledgeAgentToolResult, "citations" | "knowledgeFiles"> = {}
): KnowledgeAgentToolResult {
  const roundBudget = getRoundBudget(budget);
  const remainingTotalBudget = getRemainingTotalBudget(budget);
  const allowedChars = Math.min(roundBudget, remainingTotalBudget);
  const returnedContent = truncateToBudget(content, allowedChars);
  const returnedCharCount = returnedContent.length;

  budget.budgetState.remainingTotalBudget = Math.max(
    0,
    remainingTotalBudget - returnedCharCount
  );

  return {
    toolName,
    ok: true,
    content: returnedContent,
    returnedCharCount,
    remainingRoundBudget: Math.max(0, roundBudget - returnedCharCount),
    remainingTotalBudget: budget.budgetState.remainingTotalBudget,
    ...extras,
  };
}

function getAllowedChars(budget: ToolBudget) {
  return Math.min(getRoundBudget(budget), getRemainingTotalBudget(budget));
}

function getRoundBudget(budget: ToolBudget) {
  return Math.max(0, budget.roundBudget ?? KNOWLEDGE_AGENT_ROUND_CHAR_BUDGET);
}

function getRemainingTotalBudget(budget: ToolBudget) {
  return Math.max(
    0,
    Math.min(
      budget.budgetState.remainingTotalBudget,
      KNOWLEDGE_AGENT_TOTAL_CHAR_BUDGET
    )
  );
}

function truncateToBudget(content: string, budget: number) {
  if (budget <= 0) return "";
  if (content.length <= budget) return content;
  const notice = "\n\n[Tool result truncated by Knowledge Agent context budget.]";
  if (budget <= notice.length) return content.slice(0, budget);
  return `${content.slice(0, budget - notice.length)}${notice}`;
}

function getQueryWhereClauses(
  query: string | undefined
): Prisma.DocumentSourceWhereInput[] {
  if (!query) return [];
  const terms = normalizeQueryTerms(query);
  if (terms.length === 0) return [];

  return terms.map((term) => ({
    OR: [
      { id: { contains: term } },
      { title: { contains: term } },
      { originalName: { contains: term } },
      { fileType: { contains: term } },
      { sourceType: { contains: term } },
      {
        knowledgeMap: {
          is: {
            OR: [
              { summary: { contains: term } },
              { keywordsJson: { contains: term } },
              { outlineJson: { contains: term } },
            ],
          },
        },
      },
      {
        chunks: {
          some: {
            chunkStatus: "active",
            content: { contains: term },
            ...getRetrievableChunkWhere(),
          },
        },
      },
    ],
  }));
}

function normalizeQueryTerms(query: string) {
  return normalizeSearchText(query)
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function normalizeSearchText(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function getDocumentText(document: RetrievedDocument) {
  return document.chunks.map((chunk) => chunk.content).join("\n\n").trim();
}

function getDocumentTitle(document: RetrievedDocument) {
  return document.title || document.originalName;
}

function formatKnowledgeBases(document: RetrievedDocument) {
  if (document.knowledgeBases.length === 0) {
    return "No active knowledge-base relation";
  }

  return document.knowledgeBases
    .map((relation) => `${relation.knowledgeBase.name} (${relation.knowledgeBaseId})`)
    .join(", ");
}

function toCitations(contexts: RagContext[]): ChatCitation[] {
  return contexts.map((context, index) => ({
    refId: `ref_${index + 1}`,
    chunkId: context.chunkId,
    knowledgeId: context.knowledgeId,
    documentId: context.knowledgeId,
    knowledgeBaseId: context.knowledgeBaseId,
    title: context.title,
    content: context.content,
    chunkType: context.chunkType,
    score: context.score,
  }));
}

function toKnowledgeFile(document: RetrievedDocument): ChatKnowledgeFile {
  return {
    id: document.id,
    title: getDocumentTitle(document),
    chunkCount: document.chunkCount,
  };
}

async function toKnowledgeFilesFromContexts(contexts: RagContext[]) {
  const documentIds = unique(contexts.map((context) => context.knowledgeId));
  const documents = await prisma.documentSource.findMany({
    where: { id: { in: documentIds } },
    select: {
      id: true,
      title: true,
      originalName: true,
      chunkCount: true,
    },
  });
  const documentById = new Map(documents.map((document) => [document.id, document]));
  const files = new Map<string, ChatKnowledgeFile>();

  for (const context of contexts) {
    if (!files.has(context.knowledgeId)) {
      const document = documentById.get(context.knowledgeId);
      const metadataTitle =
        typeof context.metadata?.documentTitle === "string"
          ? context.metadata.documentTitle
          : undefined;
      files.set(context.knowledgeId, {
        id: context.knowledgeId,
        title: document?.title || document?.originalName || metadataTitle || context.title,
        chunkCount: document?.chunkCount ?? 0,
      });
    }
  }

  return Array.from(files.values());
}

function summarizeText(text: string, limit: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}

function extractKeywords(text: string) {
  const counts = new Map<string, number>();
  for (const raw of text.match(/[\p{L}\p{N}_-]{2,}/gu) ?? []) {
    const token = raw.toLowerCase();
    if (/^\d+$/.test(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([token]) => token);
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
