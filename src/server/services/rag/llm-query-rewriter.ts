/**
 * LLM query rewrite 预留模块。
 *
 * 当前阶段不接真实 LLM API，避免提前引入 API Key、费用和网络依赖。
 * 后续如果需要接 OpenAI、Voyage 或其他模型，可以实现 rewriteQueryWithLlm，
 * 并把结果合并到 query-processor 的 expandedQueries 中。
 */
export type LlmQueryRewriteOptions = {
  normalizedQuery: string;
  ruleExpandedQueries: string[];
  maxRewrites: number;
};

export type LlmQueryRewriteProvider = (
  query: string,
  options: LlmQueryRewriteOptions
) => Promise<string[]>;

/** 调用未来的 LLM API 生成更适合检索的 query 改写结果。 */
export async function rewriteQueryWithLlm(
  query: string,
  options: LlmQueryRewriteOptions
): Promise<string[]> {
  void query;
  void options;
  return [];
}
