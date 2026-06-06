import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { KnowledgeAgentScope } from "@/server/services/knowledge-agent/types";

const DEFAULT_MAP_LIMIT = 50;
const SUMMARY_LIMIT = 360;
const KEYWORD_LIMIT = 12;
const OUTLINE_LIMIT = 12;

type DocumentForMap = {
  id: string;
  title: string;
  originalName: string;
  fileType: string;
  sourceType: string;
  chunkCount: number;
  updatedAt: Date;
  knowledgeBases?: Array<{
    knowledgeBaseId: string;
    knowledgeBase: {
      id: string;
      name: string;
      status: string;
    };
  }>;
  knowledgeMap?: {
    summary: string;
    keywordsJson: string;
    outlineJson: string;
    signalsJson: string;
  } | null;
};

export type KnowledgeMapItem = {
  documentId: string;
  title: string;
  fileType: string;
  sourceType: string;
  chunkCount: number;
  knowledgeBases: Array<{ id: string; name: string }>;
  summary: string;
  keywords: string[];
  outline: string[];
  signals: Record<string, unknown>;
  updatedAt: string;
};

export function buildRuleBasedKnowledgeMap(input: {
  rawContent: string | null;
  chunks: Array<{ content: string; chunkStatus?: string }>;
}) {
  const activeChunks = input.chunks.filter(
    (chunk) => chunk.chunkStatus === undefined || chunk.chunkStatus === "active"
  );
  const text = normalizeText(
    input.rawContent || activeChunks.map((chunk) => chunk.content).join("\n\n")
  );

  return {
    summary: summarizeText(text, SUMMARY_LIMIT),
    keywordsJson: JSON.stringify(extractKeywords(text)),
    outlineJson: JSON.stringify(extractOutline(input.rawContent ?? text)),
    signalsJson: JSON.stringify({
      chunkCount: input.chunks.length,
      activeChunkCount: activeChunks.length,
      hasEmptyChunks: input.chunks.some((chunk) => !chunk.content.trim()),
      containsNumbers: /\d/.test(text),
      containsDates: /\d{4}[-/.]\d{1,2}/.test(text),
      parseQuality: getParseQuality(text, input.chunks.length),
      reviewRisk: getReviewRisk(text, input.chunks.length),
    }),
  };
}

export async function upsertDocumentKnowledgeMap(documentSourceId: string) {
  const document = await prisma.documentSource.findUnique({
    where: { id: documentSourceId },
    include: {
      chunks: {
        orderBy: { chunkIndex: "asc" },
        select: {
          content: true,
          chunkStatus: true,
        },
      },
    },
  });

  if (!document || document.status !== "parsed" || document.activeStatus !== "active") {
    return null;
  }

  const map = buildRuleBasedKnowledgeMap({
    rawContent: document.rawContent,
    chunks: document.chunks,
  });

  return prisma.documentKnowledgeMap.upsert({
    where: { documentSourceId },
    create: {
      documentSourceId,
      ...map,
    },
    update: map,
  });
}

export async function backfillDocumentKnowledgeMaps(limit = DEFAULT_MAP_LIMIT) {
  const documents = await prisma.documentSource.findMany({
    where: {
      status: "parsed",
      activeStatus: "active",
      knowledgeMap: null,
    },
    select: { id: true },
    take: limit,
    orderBy: { updatedAt: "desc" },
  });

  const results: Array<{ id: string; success: boolean; error?: string }> = [];
  for (const document of documents) {
    try {
      await upsertDocumentKnowledgeMap(document.id);
      results.push({ id: document.id, success: true });
    } catch (error) {
      results.push({
        id: document.id,
        success: false,
        error: error instanceof Error ? error.message : "map generation failed",
      });
    }
  }

  return {
    total: documents.length,
    succeeded: results.filter((result) => result.success).length,
    results,
  };
}

export async function listKnowledgeMapItems(input: {
  scope: KnowledgeAgentScope;
  limit?: number;
}) {
  const documents = await prisma.documentSource.findMany({
    where: getDocumentWhereForScope(input.scope),
    orderBy: { updatedAt: "desc" },
    take: input.limit ?? DEFAULT_MAP_LIMIT,
    select: {
      id: true,
      title: true,
      originalName: true,
      fileType: true,
      sourceType: true,
      chunkCount: true,
      updatedAt: true,
      knowledgeMap: {
        select: {
          summary: true,
          keywordsJson: true,
          outlineJson: true,
          signalsJson: true,
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

  const missingMapIds = documents
    .filter((document) => !document.knowledgeMap)
    .map((document) => document.id);
  const fallbackMaps = await buildFallbackMaps(missingMapIds);

  return documents.map((document) =>
    toKnowledgeMapItem(document, fallbackMaps.get(document.id) ?? null)
  );
}

export function formatKnowledgeMapItems(items: KnowledgeMapItem[]) {
  if (items.length === 0) {
    return "No active parsed documents matched this scope.";
  }

  return items
    .map((item, index) => {
      const knowledgeBases =
        item.knowledgeBases.length > 0
          ? item.knowledgeBases.map((kb) => `${kb.name} (${kb.id})`).join(", ")
          : "No active knowledge-base relation";
      const outline =
        item.outline.length > 0
          ? item.outline.map((entry) => `- ${entry}`).join("\n")
          : "No outline available";

      return [
        `${index + 1}. documentId=${item.documentId}`,
        `Title: ${item.title}`,
        `Type: ${item.fileType}; sourceType: ${item.sourceType}; chunks: ${item.chunkCount}`,
        `Knowledge bases: ${knowledgeBases}`,
        `Summary: ${item.summary || "No summary available"}`,
        `Keywords: ${item.keywords.length > 0 ? item.keywords.join(", ") : "None"}`,
        `Outline:\n${outline}`,
        `Signals: ${JSON.stringify(item.signals)}`,
        `Updated: ${item.updatedAt}`,
      ].join("\n");
    })
    .join("\n\n");
}

export function getDocumentWhereForScope(
  scope: KnowledgeAgentScope
): Prisma.DocumentSourceWhereInput {
  const base: Prisma.DocumentSourceWhereInput = {
    status: "parsed",
    activeStatus: "active",
  };

  if (scope.type === "files") {
    return { ...base, id: { in: scope.documentIds } };
  }

  if (scope.type === "knowledgeBase") {
    return {
      ...base,
      knowledgeBases: {
        some: {
          knowledgeBaseId: { in: scope.knowledgeBaseIds },
          status: "active",
          knowledgeBase: { status: "active" },
        },
      },
    };
  }

  return base;
}

async function buildFallbackMaps(documentIds: string[]) {
  const fallbackMaps = new Map<
    string,
    ReturnType<typeof buildRuleBasedKnowledgeMap>
  >();
  if (documentIds.length === 0) return fallbackMaps;

  const documents = await prisma.documentSource.findMany({
    where: {
      id: { in: documentIds },
      status: "parsed",
      activeStatus: "active",
    },
    select: {
      id: true,
      rawContent: true,
      chunks: {
        orderBy: { chunkIndex: "asc" },
        select: {
          content: true,
          chunkStatus: true,
        },
      },
    },
  });

  for (const document of documents) {
    fallbackMaps.set(
      document.id,
      buildRuleBasedKnowledgeMap({
        rawContent: document.rawContent,
        chunks: document.chunks,
      })
    );
  }

  return fallbackMaps;
}

function toKnowledgeMapItem(
  document: DocumentForMap,
  fallback: ReturnType<typeof buildRuleBasedKnowledgeMap> | null
): KnowledgeMapItem {
  const map =
    document.knowledgeMap ??
    fallback ??
    buildRuleBasedKnowledgeMap({ rawContent: "", chunks: [] });

  return {
    documentId: document.id,
    title: document.title || document.originalName,
    fileType: document.fileType,
    sourceType: document.sourceType,
    chunkCount: document.chunkCount,
    knowledgeBases:
      document.knowledgeBases?.map((item) => ({
        id: item.knowledgeBase.id,
        name: item.knowledgeBase.name,
      })) ?? [],
    summary: map.summary,
    keywords: parseJsonArray(map.keywordsJson),
    outline: parseJsonArray(map.outlineJson),
    signals: parseJsonObject(map.signalsJson),
    updatedAt: document.updatedAt.toISOString(),
  };
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function summarizeText(text: string, limit: number) {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

function extractKeywords(text: string) {
  const matches = text.match(/[\p{L}\p{N}_-]{2,}/gu) ?? [];
  const counts = new Map<string, number>();
  for (const raw of matches) {
    const token = raw.toLowerCase();
    if (token.length < 2 || /^\d+$/.test(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, KEYWORD_LIMIT)
    .map(([token]) => token);
}

function extractOutline(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const headings = lines.filter((line) =>
    /^(#{1,6}\s+|\d+[\.)]\s+|[A-Z][\w\s-]{0,80}:)/u.test(line)
  );

  return (headings.length > 0 ? headings : lines)
    .slice(0, OUTLINE_LIMIT)
    .map((line) => summarizeText(line.replace(/^#{1,6}\s+/, ""), 120));
}

function getParseQuality(text: string, chunkCount: number) {
  if (!text || chunkCount === 0) return "poor";
  if (text.length < 200 || chunkCount < 2) return "limited";
  return "good";
}

function getReviewRisk(text: string, chunkCount: number) {
  if (!text || chunkCount === 0) return "high";
  if (
    /conflict|error|failed|failure|exception|risk|todo|fix|冲突|错误|失败|异常|风险|待办|修复/i.test(
      text
    )
  ) {
    return "medium";
  }
  return "low";
}

function parseJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
