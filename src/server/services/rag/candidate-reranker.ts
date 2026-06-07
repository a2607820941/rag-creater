import { RAG_CONFIG } from "@/server/services/rag/config";
import type { RankedRetrievalResult } from "@/server/services/rag/hybrid";
import type { ProcessedQuery } from "@/server/services/rag/query-processor";
import {
  rerankByRules,
  scoreByRules,
} from "@/server/services/rag/rules-reranker";
import { rerankWithVoyage } from "@/server/services/rag/voyage-reranker";
import type { RetrievalMode } from "@/features/rag/types";

type CombinedRerankScore = {
  result: RankedRetrievalResult;
  voyageScore: number;
  ruleScore: number;
  rrfScore: number;
  finalScore: number;
};

/**
 * 候选重排编排层。
 *
 * RRF 负责把多路召回合并成候选池；
 * Voyage reranker 负责 query-document 语义相关性；
 * rules reranker 继续提供标题、摘要、metadata、来源和意图等业务增强。
 */
export async function rerankCandidates(
  results: RankedRetrievalResult[],
  processedQuery: ProcessedQuery,
  mode: RetrievalMode
): Promise<RankedRetrievalResult[]> {
  if (results.length <= 1) return rerankByRules(results, processedQuery, mode);
  if (!RAG_CONFIG.voyageRerankEnabled) {
    return rerankByRules(results, processedQuery, mode);
  }

  const candidates = results.slice(0, RAG_CONFIG.voyageRerankCandidateLimit);

  try {
    const voyageScores = await rerankWithVoyage(
      processedQuery.originalQuery,
      candidates
    );

    if (voyageScores.length === 0) {
      throw new Error("Voyage reranker 未返回有效候选分数。");
    }

    return combineRerankScores(
      candidates,
      processedQuery,
      mode,
      new Map(voyageScores.map((item) => [item.chunkId, item.score]))
    );
  } catch (error) {
    if (!RAG_CONFIG.voyageRerankFailOpen) throw error;

    console.warn(
      "Voyage rerank failed, falling back to rules rerank:",
      error instanceof Error ? error.message : error
    );
    return rerankByRules(results, processedQuery, mode);
  }
}

function combineRerankScores(
  candidates: RankedRetrievalResult[],
  processedQuery: ProcessedQuery,
  mode: RetrievalMode,
  voyageScoreMap: Map<string, number>
): RankedRetrievalResult[] {
  const ruleScoreMap = new Map(
    scoreByRules(candidates, processedQuery, mode).map((item) => [
      item.result.chunk.id,
      item.finalScore,
    ])
  );
  const rrfScoreMap = new Map(
    candidates.map((candidate) => [candidate.chunk.id, candidate.score])
  );
  const normalizedVoyageScores = normalizeScoreMap(voyageScoreMap);
  const normalizedRuleScores = normalizeScoreMap(ruleScoreMap);
  const normalizedRrfScores = normalizeScoreMap(rrfScoreMap);
  const weightSum =
    RAG_CONFIG.voyageRerankWeight +
    RAG_CONFIG.rulesRerankWeight +
    RAG_CONFIG.rrfRerankWeight;

  const scoredResults = candidates.map((result): CombinedRerankScore => {
    const chunkId = result.chunk.id;
    const voyageScore = normalizedVoyageScores.get(chunkId) ?? 0;
    const ruleScore = normalizedRuleScores.get(chunkId) ?? 0;
    const rrfScore = normalizedRrfScores.get(chunkId) ?? 0;
    const finalScore =
      weightSum === 0
        ? result.score
        : (RAG_CONFIG.voyageRerankWeight * voyageScore +
            RAG_CONFIG.rulesRerankWeight * ruleScore +
            RAG_CONFIG.rrfRerankWeight * rrfScore) /
          weightSum;

    return {
      result,
      voyageScore,
      ruleScore,
      rrfScore,
      finalScore,
    };
  });

  return scoredResults
    .sort(compareCombinedScores)
    .map(({ result, finalScore }, index) => ({
      ...result,
      score: Number(finalScore.toFixed(4)),
      rank: index + 1,
    }));
}

function compareCombinedScores(
  left: CombinedRerankScore,
  right: CombinedRerankScore
) {
  if (left.finalScore !== right.finalScore) {
    return right.finalScore - left.finalScore;
  }
  if (left.voyageScore !== right.voyageScore) {
    return right.voyageScore - left.voyageScore;
  }
  if (left.ruleScore !== right.ruleScore) {
    return right.ruleScore - left.ruleScore;
  }
  return left.result.rank - right.result.rank;
}

function normalizeScoreMap(scoreMap: Map<string, number>): Map<string, number> {
  const entries = Array.from(scoreMap.entries());
  if (entries.length === 0) return new Map();

  const scores = entries.map(([, score]) => score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const scoreRange = maxScore - minScore;

  return new Map(
    entries.map(([id, score]) => [
      id,
      scoreRange === 0 ? (maxScore > 0 ? 1 : 0) : (score - minScore) / scoreRange,
    ])
  );
}
