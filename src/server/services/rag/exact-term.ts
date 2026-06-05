import { RAG_CONFIG } from "@/server/services/rag/config";
import type { KnowledgeChunk } from "@/features/rag/types";

/**
 * 精确词检索模块。
 *
 * 职责：
 * 1. 补足 BM25 和向量检索对短精确词、文件名、角色名等命中的不稳定性。
 * 2. 对 title / summary / content / metadata 做字段加权精确匹配。
 * 3. 输出带 rank/source 的结果，供 RRF 与其他召回链路融合。
 */
export type ExactTermSearchResult = {
  chunk: KnowledgeChunk;
  score: number;
  rank: number;
  source: "exact";
};

type ExactTerm = {
  value: string;
  kind: "ascii" | "cjk";
  weight: number;
};

type QueryProfile = {
  phrase: string;
  terms: ExactTerm[];
};

type SearchField = {
  text: string;
  weight: number;
};

export function searchByExactTerms(
  chunks: KnowledgeChunk[],
  query: string
): ExactTermSearchResult[] {
  if (!RAG_CONFIG.exactTermSearchEnabled || chunks.length === 0) return [];

  const queryProfile = buildQueryProfile(query);
  if (!queryProfile.phrase && queryProfile.terms.length === 0) return [];

  return chunks
    .map((chunk) => ({
      chunk,
      score: Number(scoreChunk(chunk, queryProfile).toFixed(4)),
    }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((result, index) => ({
      ...result,
      rank: index + 1,
      source: "exact" as const,
    }));
}

function buildQueryProfile(query: string): QueryProfile {
  const phrase = normalizeText(query);
  const terms = [
    ...extractAsciiTerms(query),
    ...extractCjkTerms(query),
  ].slice(0, RAG_CONFIG.maxExactTerms);

  return {
    phrase,
    terms,
  };
}

function scoreChunk(chunk: KnowledgeChunk, queryProfile: QueryProfile): number {
  return getSearchFields(chunk).reduce(
    (score, field) => score + scoreField(field, queryProfile),
    0
  );
}

function getSearchFields(chunk: KnowledgeChunk): SearchField[] {
  return [
    {
      text: chunk.title,
      weight: RAG_CONFIG.exactTitleWeight,
    },
    {
      text: chunk.summary ?? "",
      weight: RAG_CONFIG.exactSummaryWeight,
    },
    {
      text: chunk.content,
      weight: RAG_CONFIG.exactContentWeight,
    },
    {
      text: chunk.metadata ? JSON.stringify(chunk.metadata) : "",
      weight: RAG_CONFIG.exactMetadataWeight,
    },
  ];
}

function scoreField(field: SearchField, queryProfile: QueryProfile): number {
  if (!field.text.trim()) return 0;

  const normalizedText = normalizeText(field.text);
  const asciiTokens = tokenizeAscii(normalizedText);
  const cjkText = getCjkText(normalizedText);
  let score = 0;

  if (
    queryProfile.phrase.length >= 2 &&
    normalizedText.includes(queryProfile.phrase)
  ) {
    score += RAG_CONFIG.exactPhraseWeight;
  }

  for (const term of queryProfile.terms) {
    const matchCount =
      term.kind === "ascii"
        ? countAsciiMatches(asciiTokens, term.value)
        : countSubstringMatches(cjkText, term.value);

    if (matchCount > 0) {
      score += term.weight * Math.min(matchCount, 3);
    }
  }

  return score * field.weight;
}

function extractAsciiTerms(query: string): ExactTerm[] {
  return unique(tokenizeAscii(normalizeText(query)))
    .filter((term) => term.length >= 2)
    .map((term) => ({
      value: term,
      kind: "ascii" as const,
      weight: 1,
    }));
}

function extractCjkTerms(query: string): ExactTerm[] {
  const cjkText = getCjkText(query);
  if (cjkText.length === 0) return [];
  if (cjkText.length === 1) {
    return [
      {
        value: cjkText,
        kind: "cjk",
        weight: 0.5,
      },
    ];
  }

  const terms: ExactTerm[] = [];
  const maxSize = Math.min(4, cjkText.length);

  for (let size = maxSize; size >= 2; size -= 1) {
    for (let index = 0; index <= cjkText.length - size; index += 1) {
      terms.push({
        value: cjkText.slice(index, index + size),
        kind: "cjk",
        weight: size / 2,
      });
    }
  }

  return uniqueTerms(terms);
}

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[？?！!。；;，,、：:"“”‘’'()（）[\]{}<>《》]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeAscii(input: string): string[] {
  return input.match(/[a-z0-9_]+/g) ?? [];
}

function getCjkText(input: string): string {
  return Array.from(input)
    .filter((char) => /[\u4e00-\u9fff]/.test(char))
    .join("");
}

function countAsciiMatches(tokens: string[], term: string): number {
  return tokens.filter((token) => token === term).length;
}

function countSubstringMatches(text: string, term: string): number {
  let count = 0;
  let index = text.indexOf(term);

  while (index >= 0) {
    count += 1;
    index = text.indexOf(term, index + term.length);
  }

  return count;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function uniqueTerms(terms: ExactTerm[]): ExactTerm[] {
  const seen = new Set<string>();
  const result: ExactTerm[] = [];

  for (const term of terms) {
    const key = `${term.kind}:${term.value}`;
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(term);
  }

  return result;
}
