import { RAG_CONFIG } from "@/server/services/rag/config";
import type { KnowledgeChunk } from "@/features/rag/types";

/**
 * 混合检索融合模块。
 *
 * 职责：
 * 1. 接收向量检索、BM25、精确词检索等多路候选结果。
 * 2. 使用 RRF 按排名融合结果，避免直接比较不同检索器的原始分数。
 * 3. 按 chunk.id 去重并输出统一的排序结果。
 */
export type RetrievalResultSource = "vector" | "bm25" | "exact" | "hybrid";

export type RankedRetrievalResult = {
  chunk: KnowledgeChunk;
  score: number;
  rank: number;
  source: RetrievalResultSource;
};

type FusionCandidate = {
  chunk: KnowledgeChunk;
  score: number;
  sources: Set<RetrievalResultSource>;
};

/**
 * 使用 RRF 融合多路检索结果。
 *
 * RRF 只依赖每路结果中的 rank，不依赖原始 score；
 * 同一 chunk 被多路命中时会累加融合分，通常能兼顾语义召回和关键词召回。
 */
export function fuseByRrf(
  resultGroups: RankedRetrievalResult[][]
): RankedRetrievalResult[] {
  const candidates = new Map<string, FusionCandidate>();

  for (const results of resultGroups) {
    for (const result of results) {
      const existing = candidates.get(result.chunk.id);
      const rrfScore = 1 / (RAG_CONFIG.rrfK + result.rank);

      if (existing) {
        existing.score += rrfScore;
        existing.sources.add(result.source);
      } else {
        candidates.set(result.chunk.id, {
          chunk: result.chunk,
          score: rrfScore,
          sources: new Set([result.source]),
        });
      }
    }
  }

  return Array.from(candidates.values())
    .sort((a, b) => b.score - a.score)
    .map((candidate, index) => ({
      chunk: candidate.chunk,
      score: Number(candidate.score.toFixed(4)),
      rank: index + 1,
      source: candidate.sources.size > 1 ? "hybrid" : firstSource(candidate.sources),
    }));
}

/** 当某个 chunk 只来自单一路检索时，保留它的来源标记。 */
function firstSource(
  sources: Set<RetrievalResultSource>
): RetrievalResultSource {
  return sources.values().next().value ?? "hybrid";
}
