import { RAG_CONFIG } from "@/server/services/rag/config";
import { rerankCandidates } from "@/server/services/rag/candidate-reranker";
import {
  createBm25Index,
  searchBm25Index,
} from "@/server/services/rag/bm25";
import { expandWithAdjacentChunks } from "@/server/services/rag/context-expander";
import { buildRetrieveResponse } from "@/server/services/rag/context-builder";
import { listKnowledgeChunks } from "@/server/services/rag/chunk-repository";
import { embedQuery } from "@/server/services/rag/embedding";
import {
  fuseByRrf,
  type RankedRetrievalResult,
} from "@/server/services/rag/hybrid";
import { selectByMmr } from "@/server/services/rag/mmr";
import {
  processQueryWithRewrite,
  type RetrievalQuerySpec,
  type RetrievalTargetSource,
} from "@/server/services/rag/query-processor";
import { applyMinScoreThreshold } from "@/server/services/rag/score-threshold";
import { searchByVector } from "@/server/services/rag/vector-store";
import type {
  KnowledgeChunk,
  RagRetrieveRequest,
  RagRetrieveResponse,
  RetrievalMode,
} from "@/features/rag/types";

/**
 * RAG 检索编排模块。
 *
 * 职责：
 * 1. 读取候选知识片段并应用 scope/status 过滤。
 * 2. 对用户问题做规则化 rewrite / expansion。
 * 3. 针对多条 retrieval query 执行向量检索和增强 BM25 检索。
 * 4. 使用 RRF 融合多路召回结果。
 * 5. 使用规则精排提升标题、摘要、来源和意图匹配结果。
 * 6. 过滤低于 minScore 的低相关候选，并按配置做 fallback 兜底。
 * 7. 使用 MMR 从融合候选中选择更少冗余的 anchor chunk。
 * 8. 按 mode 补充邻近 chunk 后交给 context-builder 组装响应。
 */
export async function retrieveRagContexts(
  request: RagRetrieveRequest
): Promise<RagRetrieveResponse> {
  const chunks = await listKnowledgeChunks(request.scope);
  const scopedChunks = chunks.filter((chunk) =>
    isChunkInScope(chunk, request)
  );

  const mode = request.mode ?? "balanced";
  const topK = getTopK(mode);
  const candidateLimit = topK * RAG_CONFIG.candidateMultiplier;
  const processedQuery = await processQueryWithRewrite(request.query);
  const bm25Index = createBm25Index(scopedChunks);
  const resultGroups = (
    await Promise.all(
      processedQuery.structuredQueries.map(async (retrievalQuery) => {
        const queryResultGroups: RankedRetrievalResult[][] = [];

        if (shouldSearchSource(retrievalQuery, "vector")) {
          const vectorResults = await searchByVectorWithFallback(
            scopedChunks,
            retrievalQuery.query,
            candidateLimit
          );
          queryResultGroups.push(
            attachQueryMetadata(vectorResults, retrievalQuery, "vector")
          );
        }

        if (shouldSearchSource(retrievalQuery, "bm25")) {
          const bm25Results = searchBm25Index(bm25Index, retrievalQuery.query).slice(
            0,
            candidateLimit
          );
          queryResultGroups.push(
            attachQueryMetadata(bm25Results, retrievalQuery, "bm25")
          );
        }

        return queryResultGroups;
      })
    )
  ).flat();
  const fusedChunks = fuseByRrf(resultGroups);
  const rerankedChunks = await rerankCandidates(
    fusedChunks,
    processedQuery,
    mode
  );
  const thresholdResult = applyMinScoreThreshold(rerankedChunks);

  if (thresholdResult.status === "fallback_top1") {
    return buildRetrieveResponse(
      request.query,
      [thresholdResult.fallbackChunk],
      {
        metrics: thresholdResult.metrics,
      }
    );
  }

  if (thresholdResult.status === "empty") {
    return buildRetrieveResponse(request.query, [], {
      metrics: thresholdResult.metrics,
    });
  }

  const anchorChunks = await selectByMmr(thresholdResult.candidates, topK);
  const scoredChunks = expandWithAdjacentChunks(
    anchorChunks,
    scopedChunks,
    mode
  );

  return buildRetrieveResponse(request.query, scoredChunks);
}

/** 根据 Agent 传入的 scope 和知识状态过滤可参与检索的 chunk。 */
async function searchByVectorWithFallback(
  chunks: KnowledgeChunk[],
  query: string,
  candidateLimit: number
) {
  try {
    const queryVector = await embedQuery(query);
    return (await searchByVector(chunks, queryVector))
      .filter((item) => item.score >= RAG_CONFIG.vectorMinScore)
      .slice(0, candidateLimit);
  } catch (error) {
    console.warn(
      "Vector query failed, continuing with keyword retrieval:",
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

function isChunkInScope(
  chunk: KnowledgeChunk,
  request: RagRetrieveRequest
): boolean {
  const { scope } = request;

  if (chunk.status !== "available") return false;
  if (!scope.knowledgeBaseIds.includes(chunk.knowledgeBaseId)) return false;
  if (scope.knowledgeIds && !scope.knowledgeIds.includes(chunk.knowledgeId)) {
    return false;
  }
  if (scope.categoryIds && !scope.categoryIds.includes(chunk.categoryId ?? "")) {
    return false;
  }
  if (scope.chunkTypes && !scope.chunkTypes.includes(chunk.chunkType)) {
    return false;
  }
  // tagIds 初版采用“任意标签命中”语义，后续如需“全部命中”要同步修改对接文档。
  if (scope.tagIds && !hasAnyTag(chunk.tagIds, scope.tagIds)) {
    return false;
  }

  return true;
}

/** tagIds 初版采用“任意标签命中”语义。 */
function hasAnyTag(chunkTagIds: string[] | undefined, scopeTagIds: string[]) {
  if (!chunkTagIds || chunkTagIds.length === 0) return false;
  return scopeTagIds.some((tagId) => chunkTagIds.includes(tagId));
}

/** 根据 mode 决定最终返回给下游的结果数量。 */
function getTopK(mode: RetrievalMode): number {
  if (mode === "fast") return RAG_CONFIG.fastTopK;
  if (mode === "detailed") return RAG_CONFIG.detailedTopK;
  return RAG_CONFIG.topK;
}

function shouldSearchSource(
  query: RetrievalQuerySpec,
  source: RetrievalTargetSource
): boolean {
  return query.targetSources.includes(source);
}

function attachQueryMetadata(
  results: RankedRetrievalResult[],
  query: RetrievalQuerySpec,
  source: RetrievalTargetSource
): RankedRetrievalResult[] {
  const sourceWeight = RAG_CONFIG.retrievalSourceWeights[source];

  return results.map((result) => ({
    ...result,
    query: query.query,
    queryType: query.type,
    queryWeight: query.weight,
    sourceWeight,
  }));
}
