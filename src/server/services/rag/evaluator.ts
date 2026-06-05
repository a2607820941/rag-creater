import {
  ragEvalCases,
  type RetrievalEvalCase,
} from "@/server/services/rag/eval-cases";
import { retrieveRagContexts } from "@/server/services/rag/retriever";
import type { RagContext } from "@/features/rag/types";

/**
 * RAG 离线评测模块。
 *
 * 职责：
 * 1. 使用固定 eval cases 调用检索主流程。
 * 2. 计算 Hit@K、Recall@K、MRR@K 和平均耗时。
 * 3. 为后续 BM25、混合检索、rerank 等策略调整提供量化对比。
 */
export type RetrievalEvalCaseResult = {
  id: string;
  query: string;
  hit: boolean;
  recall: number;
  mrr: number;
  durationMs: number;
  returnedChunkIds: string[];
  returnedKnowledgeIds: string[];
};

export type RetrievalEvalReport = {
  k: number;
  total: number;
  hitAtK: number;
  recallAtK: number;
  mrrAtK: number;
  averageDurationMs: number;
  cases: RetrievalEvalCaseResult[];
};

/**
 * 离线评测入口。
 *
 * 初版只计算 Hit@K、Recall@K、MRR@K 和平均耗时；
 * 后续新增 BM25、混合检索或 rerank 后，可以复用它观察指标变化。
 */
export async function evaluateRetrieval(
  cases: RetrievalEvalCase[] = ragEvalCases,
  k = 5
): Promise<RetrievalEvalReport> {
  const results: RetrievalEvalCaseResult[] = [];

  for (const evalCase of cases) {
    const startedAt = Date.now();
    const response = await retrieveRagContexts(evalCase);
    const durationMs = Date.now() - startedAt;
    const topContexts = response.contexts.slice(0, k);
    const expectedKeys = getExpectedKeys(evalCase);
    const returnedKeys = topContexts.map(toContextKeySet);
    const firstHitIndex = returnedKeys.findIndex((keys) =>
      keys.some((key) => expectedKeys.has(key))
    );
    const matchedKeys = new Set<string>();

    for (const keys of returnedKeys) {
      for (const key of keys) {
        if (expectedKeys.has(key)) {
          matchedKeys.add(key);
        }
      }
    }

    results.push({
      id: evalCase.id,
      query: evalCase.query,
      hit: firstHitIndex >= 0,
      recall:
        expectedKeys.size === 0 ? 0 : matchedKeys.size / expectedKeys.size,
      mrr: firstHitIndex >= 0 ? 1 / (firstHitIndex + 1) : 0,
      durationMs,
      returnedChunkIds: topContexts.map((context) => context.chunkId),
      returnedKnowledgeIds: Array.from(
        new Set(topContexts.map((context) => context.knowledgeId))
      ),
    });
  }

  return {
    k,
    total: results.length,
    hitAtK: average(results.map((result) => (result.hit ? 1 : 0))),
    recallAtK: average(results.map((result) => result.recall)),
    mrrAtK: average(results.map((result) => result.mrr)),
    averageDurationMs: average(results.map((result) => result.durationMs)),
    cases: results,
  };
}

/** 将评测结果格式化成适合命令行或日志展示的文本。 */
export function formatEvaluationReport(report: RetrievalEvalReport): string {
  const lines = [
    `RAG retrieval evaluation @${report.k}`,
    `Total: ${report.total}`,
    `Hit@${report.k}: ${formatMetric(report.hitAtK)}`,
    `Recall@${report.k}: ${formatMetric(report.recallAtK)}`,
    `MRR@${report.k}: ${formatMetric(report.mrrAtK)}`,
    `Avg duration: ${report.averageDurationMs.toFixed(1)}ms`,
    "",
    "Cases:",
  ];

  for (const result of report.cases) {
    lines.push(
      `- ${result.id}: hit=${result.hit ? "yes" : "no"}, recall=${formatMetric(
        result.recall
      )}, mrr=${formatMetric(result.mrr)}, duration=${result.durationMs}ms`
    );
  }

  return lines.join("\n");
}

/** 把期望命中的 chunkId/knowledgeId 统一成可比较的 key。 */
function getExpectedKeys(evalCase: RetrievalEvalCase): Set<string> {
  return new Set([
    ...(evalCase.expectedChunkIds ?? []).map((id) => `chunk:${id}`),
    ...(evalCase.expectedKnowledgeIds ?? []).map((id) => `knowledge:${id}`),
  ]);
}

/** 把实际返回的 context 转成可和 expectedKeys 比较的 key。 */
function toContextKeySet(context: RagContext): string[] {
  return [`chunk:${context.chunkId}`, `knowledge:${context.knowledgeId}`];
}

/** 计算平均值；空数组返回 0，避免评测集为空时报错。 */
function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** 统一指标展示精度。 */
function formatMetric(value: number): string {
  return value.toFixed(3);
}
