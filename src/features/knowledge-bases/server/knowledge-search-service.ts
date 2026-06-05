import { prisma } from "@/lib/db";

import { notFound } from "./errors";
import type { KnowledgeBaseKeywordSearchQuery } from "./schemas";

export type KnowledgeKeywordSearchResult = {
  id: string;
  type: "document" | "chunk";
  title: string;
  snippet: string;
  score: number;
  matchedField: "documentTitle" | "fileName" | "chunkTitle" | "chunkContent";
  documentId: string;
  documentTitle: string;
  chunkId?: string;
  chunkIndex?: number;
  chunkType?: string;
  reviewStatus?: string | null;
  updatedAt: string;
};

type MatchField = KnowledgeKeywordSearchResult["matchedField"];

type MatchInfo = {
  field: MatchField;
  text: string;
  priority: number;
  count: number;
};

const FIELD_PRIORITY: Record<MatchField, number> = {
  documentTitle: 4,
  fileName: 3,
  chunkTitle: 2,
  chunkContent: 1,
};

export async function searchKnowledgeBaseKeywordsService(
  knowledgeBaseId: string,
  query: KnowledgeBaseKeywordSearchQuery
) {
  const knowledgeBase = await prisma.knowledgeBase.findUnique({
    where: { id: knowledgeBaseId },
    select: { id: true },
  });

  if (!knowledgeBase) throw notFound("knowledge base not found");

  const keyword = query.keyword.trim();
  const relations = await prisma.knowledgeBaseDocument.findMany({
    where: {
      knowledgeBaseId,
      document: {
        OR: [
          { title: { contains: keyword } },
          { originalName: { contains: keyword } },
          { fileName: { contains: keyword } },
          {
            chunks: {
              some: {
                OR: [
                  { title: { contains: keyword } },
                  { content: { contains: keyword } },
                ],
              },
            },
          },
        ],
      },
    },
    include: {
      document: {
        include: {
          chunks: {
            where: {
              OR: [
                { title: { contains: keyword } },
                { content: { contains: keyword } },
              ],
            },
            orderBy: { chunkIndex: "asc" },
          },
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  const results: KnowledgeKeywordSearchResult[] = [];

  for (const relation of relations) {
    const document = relation.document;
    const documentTitle = document.title || document.originalName;
    const documentMatch = getBestMatch(keyword, [
      { field: "documentTitle", text: document.title },
      { field: "fileName", text: document.fileName },
      { field: "fileName", text: document.originalName },
    ]);

    if (documentMatch) {
      results.push({
        id: `document:${document.id}`,
        type: "document",
        title: documentTitle,
        snippet: buildSnippet(documentMatch.text, keyword),
        score: buildScore(documentMatch, document.updatedAt),
        matchedField: documentMatch.field,
        documentId: document.id,
        documentTitle,
        updatedAt: document.updatedAt.toISOString(),
      });
    }

    for (const chunk of document.chunks) {
      const chunkMatch = getBestMatch(keyword, [
        { field: "chunkTitle", text: chunk.title },
        { field: "chunkContent", text: chunk.content },
      ]);

      if (!chunkMatch) continue;

      results.push({
        id: `chunk:${chunk.id}`,
        type: "chunk",
        title: chunk.title || `${documentTitle} #${chunk.chunkIndex + 1}`,
        snippet: buildSnippet(chunkMatch.text, keyword),
        score: buildScore(chunkMatch, chunk.updatedAt),
        matchedField: chunkMatch.field,
        documentId: document.id,
        documentTitle,
        chunkId: chunk.id,
        chunkIndex: chunk.chunkIndex,
        chunkType: chunk.chunkType,
        reviewStatus: chunk.reviewStatus,
        updatedAt: chunk.updatedAt.toISOString(),
      });
    }
  }

  return results
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    })
    .slice(0, query.limit);
}

function getBestMatch(
  keyword: string,
  fields: Array<{ field: MatchField; text: string | null }>
): MatchInfo | undefined {
  const matches = fields.flatMap((item) => {
    if (!item.text || !isKeywordMatched(item.text, keyword)) return [];

    return {
      field: item.field,
      text: item.text,
      priority: FIELD_PRIORITY[item.field],
      count: countKeywordOccurrences(item.text, keyword),
    };
  });

  return matches.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.count - a.count;
  })[0];
}

function isKeywordMatched(text: string, keyword: string) {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function countKeywordOccurrences(text: string, keyword: string) {
  const normalizedText = text.toLowerCase();
  const normalizedKeyword = keyword.toLowerCase();
  let count = 0;
  let index = normalizedText.indexOf(normalizedKeyword);

  while (index !== -1) {
    count += 1;
    index = normalizedText.indexOf(normalizedKeyword, index + normalizedKeyword.length);
  }

  return count;
}

function buildScore(match: MatchInfo, updatedAt: Date) {
  const recencyScore = Math.min(
    Date.now() - updatedAt.getTime(),
    30 * 24 * 60 * 60 * 1000
  );
  const recencyBoost = 1 - recencyScore / (30 * 24 * 60 * 60 * 1000);

  return Number(
    (match.priority * 1000 + match.count * 10 + recencyBoost).toFixed(4)
  );
}

function buildSnippet(text: string, keyword: string) {
  const maxLength = 120;
  if (text.length <= maxLength) return text;

  const matchedIndex = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (matchedIndex === -1) return `${text.slice(0, maxLength)}...`;

  const start = Math.max(0, matchedIndex - 40);
  const end = Math.min(text.length, start + maxLength);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";

  return `${prefix}${text.slice(start, end)}${suffix}`;
}
