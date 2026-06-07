import { RAG_CONFIG } from "@/server/services/rag/config";
import type { RankedRetrievalResult } from "@/server/services/rag/hybrid";

const DEFAULT_VOYAGE_RERANK_MODEL = "rerank-2.5-lite";
const VOYAGE_RERANK_ENDPOINT = "https://api.voyageai.com/v1/rerank";

type VoyageRerankItem = {
  index?: unknown;
  relevance_score?: unknown;
};

type VoyageRerankResponse = {
  data?: VoyageRerankItem[];
};

export type VoyageRerankScore = {
  chunkId: string;
  score: number;
  index: number;
};

/**
 * 使用 Voyage reranker 对 RRF 候选结果做语义精排。
 *
 * 这里不直接返回重排后的 chunk，保持它只负责模型调用和分数解析，
 * 具体如何与 rules/RRF 分数融合交给 candidate-reranker。
 */
export async function rerankWithVoyage(
  query: string,
  candidates: RankedRetrievalResult[]
): Promise<VoyageRerankScore[]> {
  if (candidates.length === 0) return [];

  const apiKey = process.env.VOYAGE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("VOYAGE_API_KEY 未配置，无法调用 Voyage reranker。");
  }

  const documents = candidates.map(toRerankDocument);
  const response = await fetch(VOYAGE_RERANK_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      documents,
      model: getVoyageRerankModel(),
      top_k: documents.length,
      return_documents: false,
      truncation: true,
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Voyage reranker API 调用失败：HTTP ${response.status} ${truncate(
        responseText,
        500
      )}`
    );
  }

  return normalizeVoyageRerankResponse(
    parseVoyageRerankResponse(responseText),
    candidates
  );
}

function getVoyageRerankModel() {
  return process.env.VOYAGE_RERANK_MODEL?.trim() || DEFAULT_VOYAGE_RERANK_MODEL;
}

function toRerankDocument(result: RankedRetrievalResult): string {
  const { chunk } = result;
  const lines = [
    `标题：${chunk.title}`,
    chunk.summary ? `摘要：${chunk.summary}` : "",
    chunk.categoryId ? `分类：${chunk.categoryId}` : "",
    chunk.tagIds?.length ? `标签：${chunk.tagIds.join("、")}` : "",
    `类型：${chunk.chunkType}`,
    `正文：${chunk.content}`,
  ].filter(Boolean);

  return truncate(lines.join("\n"), RAG_CONFIG.maxRerankDocumentChars);
}

function parseVoyageRerankResponse(
  responseText: string
): VoyageRerankResponse {
  try {
    return JSON.parse(responseText) as VoyageRerankResponse;
  } catch {
    throw new Error("Voyage reranker API 返回了无法解析的 JSON。");
  }
}

function normalizeVoyageRerankResponse(
  response: VoyageRerankResponse,
  candidates: RankedRetrievalResult[]
): VoyageRerankScore[] {
  if (!Array.isArray(response.data)) {
    throw new Error("Voyage reranker API 返回结果缺少 data。");
  }

  return response.data.flatMap((item) => {
    if (typeof item.index !== "number") return [];
    const candidate = candidates[item.index];
    if (!candidate) return [];

    return {
      chunkId: candidate.chunk.id,
      score:
        typeof item.relevance_score === "number"
          ? item.relevance_score
          : 0,
      index: item.index,
    };
  });
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}
