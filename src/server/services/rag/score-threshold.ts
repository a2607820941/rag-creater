import { RAG_CONFIG } from "@/server/services/rag/config";
import type { ScoredKnowledgeChunk } from "@/server/services/rag/context-builder";
import type { RankedRetrievalResult } from "@/server/services/rag/hybrid";
import type { RagRetrieveMetrics } from "@/features/rag/types";

type ScoreThresholdPassResult = {
  status: "pass";
  candidates: RankedRetrievalResult[];
};

type ScoreThresholdFallbackResult = {
  status: "fallback_top1";
  fallbackChunk: ScoredKnowledgeChunk;
  metrics: RagRetrieveMetrics;
};

type ScoreThresholdEmptyResult = {
  status: "empty";
  metrics: RagRetrieveMetrics;
};

export type ScoreThresholdResult =
  | ScoreThresholdPassResult
  | ScoreThresholdFallbackResult
  | ScoreThresholdEmptyResult;

/**
 * 在规则精排后执行最终 minScore 过滤，并在无结果时按配置决定是否保留 top1。
 */
export function applyMinScoreThreshold(
  candidates: RankedRetrievalResult[]
): ScoreThresholdResult {
  const filteredCandidates = candidates.filter(
    (candidate) => candidate.score >= RAG_CONFIG.minScore
  );

  if (filteredCandidates.length > 0) {
    return {
      status: "pass",
      candidates: filteredCandidates,
    };
  }

  const topCandidate = getTopCandidate(candidates);
  const topScore = topCandidate?.score;

  if (
    topCandidate &&
    RAG_CONFIG.enableFallbackTop1 &&
    topCandidate.score >= RAG_CONFIG.fallbackTop1Score
  ) {
    return {
      status: "fallback_top1",
      fallbackChunk: {
        chunk: topCandidate.chunk,
        score: topCandidate.score,
        contextMetadata: {
          fallback: true,
          fallbackReason: "below_min_score_but_keep_top1",
        },
      },
      metrics: buildMetrics(
        candidates.length,
        filteredCandidates.length,
        topScore,
        true,
        "below_min_score_but_keep_top1"
      ),
    };
  }

  return {
    status: "empty",
    metrics: buildMetrics(
      candidates.length,
      filteredCandidates.length,
      topScore,
      false,
      "no_relevant_context"
    ),
  };
}

/** 按 score 和 rank 选出过滤前最值得兜底保留的 top1。 */
function getTopCandidate(
  candidates: RankedRetrievalResult[]
): RankedRetrievalResult | undefined {
  return candidates.reduce<RankedRetrievalResult | undefined>(
    (bestCandidate, candidate) => {
      if (!bestCandidate) return candidate;
      if (candidate.score !== bestCandidate.score) {
        return candidate.score > bestCandidate.score ? candidate : bestCandidate;
      }

      return candidate.rank < bestCandidate.rank ? candidate : bestCandidate;
    },
    undefined
  );
}

/** 构建 fallback 相关的检索指标信息。 */
function buildMetrics(
  beforeMinScoreCount: number,
  afterMinScoreCount: number,
  topScore: number | undefined,
  fallback: boolean,
  fallbackReason: RagRetrieveMetrics["fallbackReason"]
): RagRetrieveMetrics {
  return {
    fallback,
    fallbackReason,
    minScore: RAG_CONFIG.minScore,
    fallbackTop1Score: RAG_CONFIG.fallbackTop1Score,
    beforeMinScoreCount,
    afterMinScoreCount,
    topScore,
  };
}
