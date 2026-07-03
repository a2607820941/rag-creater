import { RAG_CONFIG } from "@/server/services/rag/config";
import type { RetrievalQueryType } from "@/server/services/rag/query-processor";
import type { KnowledgeChunk } from "@/features/rag/types";

/**
 * 混合检索融合模块。
 *
 * 职责：
 * 1. 接收向量检索、增强 BM25 等多路候选结果。
 * 2. 使用 RRF 按排名融合结果，避免直接比较不同检索器的原始分数。
 * 3. 按 chunk.id 去重并输出统一的排序结果。
 */
export type RetrievalResultSource = "vector" | "bm25" | "exact" | "hybrid";

export type RetrievalFusionMatch = {
  source: RetrievalResultSource;
  query?: string;
  queryType?: RetrievalQueryType;
  rank: number;
  rrfScore: number;
  queryWeight: number;
  sourceWeight: number;
};

export type RankedRetrievalResult = {
  chunk: KnowledgeChunk;
  score: number;
  rank: number;
  source: RetrievalResultSource;
  query?: string;
  queryType?: RetrievalQueryType;
  queryWeight?: number;
  sourceWeight?: number;
  fusionMatches?: RetrievalFusionMatch[];
};

type FusionCandidate = {
  chunk: KnowledgeChunk;
  score: number;
  sources: Set<RetrievalResultSource>;
  matches: RetrievalFusionMatch[];
};

/**
 * 使用 RRF 融合多路检索结果。
 *
 * RRF 主要依赖每路结果中的 rank，不直接比较原始 score；
 * 在结构化 query 接入后，会额外乘以 query 类型权重和召回源权重。
 * 同一 chunk 被多路命中时会累加融合分，通常能兼顾语义召回和关键词召回。
 */
export function fuseByRrf(
  resultGroups: RankedRetrievalResult[][]
): RankedRetrievalResult[] {
  const candidates = new Map<string, FusionCandidate>();

  for (const results of resultGroups) {
    for (const result of results) {
      const existing = candidates.get(result.chunk.id);
      const queryWeight = result.queryWeight ?? 1;
      const sourceWeight = result.sourceWeight ?? 1;
      const rrfScore =
        (queryWeight * sourceWeight) / (RAG_CONFIG.rrfK + result.rank);
      const fusionMatch: RetrievalFusionMatch = {
        source: result.source,
        query: result.query,
        queryType: result.queryType,
        rank: result.rank,
        rrfScore: Number(rrfScore.toFixed(6)),
        queryWeight,
        sourceWeight,
      };

      if (existing) {
        existing.score += rrfScore;
        existing.sources.add(result.source);
        existing.matches.push(fusionMatch);
      } else {
        candidates.set(result.chunk.id, {
          chunk: result.chunk,
          score: rrfScore,
          sources: new Set([result.source]),
          matches: [fusionMatch],
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
      fusionMatches: candidate.matches,
    }));
}

/** 当某个 chunk 只来自单一路检索时，保留它的来源标记。 */
function firstSource(
  sources: Set<RetrievalResultSource>
): RetrievalResultSource {
  return sources.values().next().value ?? "hybrid";
}
