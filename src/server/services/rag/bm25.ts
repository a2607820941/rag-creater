import { RAG_CONFIG } from "@/server/services/rag/config";
import type { KnowledgeChunk } from "@/features/rag/types";

/**
 * 增强 BM25 关键词检索模块。
 *
 * 职责：
 * 1. 对 scoped chunks 构建可复用的轻量 BM25 索引，避免多 query rewrite 重复建索引。
 * 2. 分字段计算 title / summary / content / metadata 的 BM25 分数并加权。
 * 3. 对标题、摘要、正文中的完整短语命中做 boost，吸收原 exact 检索中有价值的部分。
 * 4. 使用通用工程 tokenizer 处理 API path、错误码、camelCase、snake_case 和 CJK ngram。
 */
export type Bm25SearchResult = {
  chunk: KnowledgeChunk;
  score: number;
  rank: number;
  source: "bm25";
};

type Bm25Field = "title" | "summary" | "content" | "metadata";

type IndexedField = {
  text: string;
  termFrequency: Map<string, number>;
  length: number;
};

type IndexedChunk = {
  chunk: KnowledgeChunk;
  fields: Record<Bm25Field, IndexedField>;
};

export type Bm25Index = {
  indexedChunks: IndexedChunk[];
  documentFrequencyByField: Record<Bm25Field, Map<string, number>>;
  averageLengthByField: Record<Bm25Field, number>;
  totalDocuments: number;
};

type QueryProfile = {
  phrase: string;
  terms: string[];
};

const BM25_K1 = 1.2;
const BM25_B = 0.75;
const BM25_FIELDS: Bm25Field[] = ["title", "summary", "content", "metadata"];

const FIELD_WEIGHTS: Record<Bm25Field, number> = {
  title: RAG_CONFIG.bm25TitleWeight,
  summary: RAG_CONFIG.bm25SummaryWeight,
  content: RAG_CONFIG.bm25ContentWeight,
  metadata: RAG_CONFIG.bm25MetadataWeight,
};

const PHRASE_BOOSTS: Record<Bm25Field, number> = {
  title: RAG_CONFIG.bm25TitlePhraseBoost,
  summary: RAG_CONFIG.bm25SummaryPhraseBoost,
  content: RAG_CONFIG.bm25ContentPhraseBoost,
  metadata: RAG_CONFIG.bm25MetadataPhraseBoost,
};

const TECHNICAL_TOKEN_PATTERNS = [
  /\/[A-Za-z0-9._~:/?#\[\]@!$&()*+,;=%-]+/g,
  /\b[A-Z][A-Z0-9_]{1,}\b/g,
  /\b[A-Za-z]+[A-Za-z0-9]*[_-][A-Za-z0-9_-]+\b/g,
  /\b[a-z]+(?:[A-Z][a-z0-9]+)+\b/g,
  /\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\b/g,
  /\b[A-Za-z0-9_.-]+\.(?:ts|tsx|js|jsx|json|md|pdf|docx?|xlsx?)\b/gi,
];

/**
 * 兼容旧调用：直接传 chunks 和 query 时，内部会临时构建索引。
 * RAG 主链路会优先使用 createBm25Index + searchBm25Index 复用索引。
 */
export function searchByBm25(
  chunks: KnowledgeChunk[],
  query: string
): Bm25SearchResult[] {
  return searchBm25Index(createBm25Index(chunks), query);
}

/** 为当前检索 scope 构建可复用的 BM25 索引。 */
export function createBm25Index(chunks: KnowledgeChunk[]): Bm25Index {
  const indexedChunks = chunks.map(indexChunk);
  const documentFrequencyByField = createEmptyFieldMaps();
  const averageLengthByField = createEmptyFieldNumbers();

  for (const field of BM25_FIELDS) {
    let totalLength = 0;

    for (const indexedChunk of indexedChunks) {
      const indexedField = indexedChunk.fields[field];
      totalLength += indexedField.length;

      for (const term of indexedField.termFrequency.keys()) {
        const fieldFrequency = documentFrequencyByField[field];
        fieldFrequency.set(term, (fieldFrequency.get(term) ?? 0) + 1);
      }
    }

    averageLengthByField[field] =
      indexedChunks.length === 0 ? 0 : totalLength / indexedChunks.length;
  }

  return {
    indexedChunks,
    documentFrequencyByField,
    averageLengthByField,
    totalDocuments: indexedChunks.length,
  };
}

/** 使用已构建的 BM25 索引执行查询。 */
export function searchBm25Index(
  index: Bm25Index,
  query: string
): Bm25SearchResult[] {
  const queryProfile = buildQueryProfile(query);
  if (queryProfile.terms.length === 0 || index.totalDocuments === 0) return [];

  return index.indexedChunks
    .map((indexedChunk) => ({
      chunk: indexedChunk.chunk,
      score: Number(scoreIndexedChunk(indexedChunk, queryProfile, index).toFixed(4)),
    }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((result, index) => ({
      ...result,
      rank: index + 1,
      source: "bm25" as const,
    }));
}

/** 将单个知识片段转换成字段化 BM25 索引结构。 */
function indexChunk(chunk: KnowledgeChunk): IndexedChunk {
  return {
    chunk,
    fields: {
      title: indexField(chunk.title),
      summary: indexField(chunk.summary ?? ""),
      content: indexField(chunk.content),
      metadata: indexField(getMetadataText(chunk)),
    },
  };
}

function indexField(text: string): IndexedField {
  const tokens = tokenize(text);
  const termFrequency = new Map<string, number>();

  for (const token of tokens) {
    termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);
  }

  return {
    text,
    termFrequency,
    length: tokens.length,
  };
}

function buildQueryProfile(query: string): QueryProfile {
  return {
    phrase: normalizeText(query),
    terms: unique(tokenize(query)),
  };
}

function scoreIndexedChunk(
  indexedChunk: IndexedChunk,
  queryProfile: QueryProfile,
  index: Bm25Index
): number {
  return BM25_FIELDS.reduce(
    (score, field) =>
      score +
      FIELD_WEIGHTS[field] *
        scoreField(indexedChunk.fields[field], field, queryProfile, index),
    0
  );
}

function scoreField(
  indexedField: IndexedField,
  field: Bm25Field,
  queryProfile: QueryProfile,
  index: Bm25Index
): number {
  if (indexedField.length === 0) return 0;

  const bm25Score = queryProfile.terms.reduce(
    (score, term) =>
      score +
      scoreTerm(
        term,
        indexedField,
        index.documentFrequencyByField[field],
        index.averageLengthByField[field],
        index.totalDocuments
      ),
    0
  );

  return bm25Score + getPhraseBoost(indexedField.text, field, queryProfile.phrase);
}

function scoreTerm(
  term: string,
  indexedField: IndexedField,
  documentFrequency: Map<string, number>,
  averageLength: number,
  totalDocuments: number
): number {
  const frequency = indexedField.termFrequency.get(term) ?? 0;
  if (frequency === 0) return 0;

  const df = documentFrequency.get(term) ?? 0;
  const idf = Math.log(1 + (totalDocuments - df + 0.5) / (df + 0.5));
  const denominator =
    frequency +
    BM25_K1 *
      (1 - BM25_B + BM25_B * (indexedField.length / Math.max(averageLength, 1)));

  return idf * ((frequency * (BM25_K1 + 1)) / denominator);
}

function getPhraseBoost(
  fieldText: string,
  field: Bm25Field,
  phrase: string
): number {
  if (phrase.length < 2) return 0;

  const normalizedText = normalizeText(fieldText);
  if (!normalizedText.includes(phrase)) return 0;

  return PHRASE_BOOSTS[field];
}

/** 将分类、标签和 metadata 合并成低权重 BM25 辅助字段。 */
function getMetadataText(chunk: KnowledgeChunk): string {
  return [
    chunk.categoryId ?? "",
    ...(chunk.tagIds ?? []),
    chunk.sourceType,
    chunk.chunkType,
    chunk.metadata ? JSON.stringify(chunk.metadata) : "",
  ].join(" ");
}

/**
 * 通用 tokenizer：
 * - 英文/数字按普通 token 提取；
 * - API path、错误码、文件名、snake_case、kebab-case、camelCase 同时保留整体和子词；
 * - 中文使用 2-gram + 3-gram，不依赖无法穷举的领域词表。
 */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const normalized = normalizeText(input);

  tokens.push(...extractTechnicalTokens(input));
  tokens.push(...(normalized.match(/[a-z0-9_./:-]+/g) ?? []));
  tokens.push(...extractCjkNgrams(normalized));

  return unique(tokens.flatMap(expandToken).filter(isUsefulToken));
}

function extractTechnicalTokens(input: string): string[] {
  const tokens: string[] = [];

  for (const pattern of TECHNICAL_TOKEN_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of input.matchAll(pattern)) {
      tokens.push(match[0]);
    }
  }

  return tokens;
}

function expandToken(token: string): string[] {
  const normalized = normalizeToken(token);
  if (!normalized) return [];

  const parts = splitTechnicalToken(token);
  return unique([normalized, ...parts]);
}

function splitTechnicalToken(token: string): string[] {
  return token
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .map((part) => normalizeToken(part))
    .filter(isUsefulToken);
}

function extractCjkNgrams(input: string): string[] {
  const cjkText = Array.from(input)
    .filter((char) => /[\u4e00-\u9fff]/.test(char))
    .join("");
  const tokens: string[] = [];

  if (cjkText.length === 1) {
    tokens.push(cjkText);
  }

  for (const size of [2, 3]) {
    for (let index = 0; index <= cjkText.length - size; index += 1) {
      tokens.push(cjkText.slice(index, index + size));
    }
  }

  return tokens;
}

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[？?！!。；;，,、：:"“”‘’'()（）[\]{}<>《》]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToken(input: string): string {
  return input
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}/]+|[^\p{L}\p{N}]+$/gu, "")
    .trim();
}

function isUsefulToken(token: string): boolean {
  return token.length >= 2 || /^[0-9]$/.test(token) || /[\u4e00-\u9fff]/.test(token);
}

function createEmptyFieldMaps(): Record<Bm25Field, Map<string, number>> {
  return {
    title: new Map(),
    summary: new Map(),
    content: new Map(),
    metadata: new Map(),
  };
}

function createEmptyFieldNumbers(): Record<Bm25Field, number> {
  return {
    title: 0,
    summary: 0,
    content: 0,
    metadata: 0,
  };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
