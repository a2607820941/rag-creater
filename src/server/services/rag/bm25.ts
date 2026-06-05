import { RAG_CONFIG } from "@/server/services/rag/config";
import type { KnowledgeChunk } from "@/features/rag/types";

/**
 * BM25 关键词检索模块。
 *
 * 职责：
 * 1. 将 query 和知识片段文本切成可匹配的轻量 token。
 * 2. 基于 BM25 计算关键词相关性分数。
 * 3. 输出带 rank/source 的结果，供 hybrid 模块和向量结果融合。
 */
export type Bm25SearchResult = {
  chunk: KnowledgeChunk;
  score: number;
  rank: number;
  source: "bm25";
};

type IndexedChunk = {
  chunk: KnowledgeChunk;
  termFrequency: Map<string, number>;
  length: number;
};

const BM25_K1 = 1.5;
const BM25_B = 0.75;

/**
 * 使用 BM25 从给定 chunk 集合中召回关键词相关结果。
 *
 * title、summary、content 会按不同权重进入词频统计；
 * 适合补足向量检索对专有名词、文件名、角色名、功能名等精确词不稳定的问题。
 */
export function searchByBm25(
  chunks: KnowledgeChunk[],
  query: string
): Bm25SearchResult[] {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0 || chunks.length === 0) return [];

  const indexedChunks = chunks.map(indexChunk);
  const averageLength =
    indexedChunks.reduce((sum, item) => sum + item.length, 0) /
    indexedChunks.length;
  const documentFrequency = getDocumentFrequency(indexedChunks);
  const uniqueQueryTerms = Array.from(new Set(queryTerms));

  return indexedChunks
    .map(({ chunk, termFrequency, length }) => {
      let score = 0;

      for (const term of uniqueQueryTerms) {
        const frequency = termFrequency.get(term) ?? 0;
        if (frequency === 0) continue;

        const df = documentFrequency.get(term) ?? 0;
        const idf = Math.log(
          1 + (indexedChunks.length - df + 0.5) / (df + 0.5)
        );
        const denominator =
          frequency +
          BM25_K1 *
            (1 - BM25_B + BM25_B * (length / Math.max(averageLength, 1)));

        score += idf * ((frequency * (BM25_K1 + 1)) / denominator);
      }

      return {
        chunk,
        score: Number(score.toFixed(4)),
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((result, index) => ({
      ...result,
      rank: index + 1,
      source: "bm25" as const,
    }));
}

/** 将单个知识片段转换成 BM25 需要的词频索引结构。 */
function indexChunk(chunk: KnowledgeChunk): IndexedChunk {
  const termFrequency = new Map<string, number>();
  let length = 0;

  length += addWeightedTerms(
    termFrequency,
    tokenize(chunk.title),
    RAG_CONFIG.bm25TitleWeight
  );
  length += addWeightedTerms(
    termFrequency,
    tokenize(chunk.summary ?? ""),
    RAG_CONFIG.bm25SummaryWeight
  );
  length += addWeightedTerms(
    termFrequency,
    tokenize(chunk.content),
    RAG_CONFIG.bm25ContentWeight
  );

  return {
    chunk,
    termFrequency,
    length,
  };
}

/** 统计每个 token 出现在多少个 chunk 中，用于计算 IDF。 */
function getDocumentFrequency(indexedChunks: IndexedChunk[]): Map<string, number> {
  const documentFrequency = new Map<string, number>();

  for (const indexedChunk of indexedChunks) {
    for (const term of indexedChunk.termFrequency.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  return documentFrequency;
}

function addWeightedTerms(
  termFrequency: Map<string, number>,
  tokens: string[],
  weight: number
): number {
  for (const token of tokens) {
    termFrequency.set(token, (termFrequency.get(token) ?? 0) + weight);
  }

  return tokens.length * weight;
}

/** 轻量分词：英文/数字按词，中文按相邻双字 bigram。 */
function tokenize(input: string): string[] {
  const normalized = input.toLowerCase().trim();
  const asciiTokens = normalized.match(/[a-z0-9_]+/g) ?? [];
  const cjkText = Array.from(normalized)
    .filter((char) => /[\u4e00-\u9fff]/.test(char))
    .join("");
  const cjkTokens: string[] = [];

  if (cjkText.length === 1) {
    cjkTokens.push(cjkText);
  }

  for (let index = 0; index < cjkText.length - 1; index += 1) {
    cjkTokens.push(cjkText.slice(index, index + 2));
  }

  return [...asciiTokens, ...cjkTokens];
}
