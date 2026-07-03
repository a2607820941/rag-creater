import { RAG_CONFIG } from "@/server/services/rag/config";
import {
  rewriteQueryWithLlm,
  type LlmQueryRewriteResult,
} from "@/server/services/rag/llm-query-rewriter";

export type RetrievalQueryType =
  | "original"
  | "main_rewrite"
  | "sub_query"
  | "synonym_rewrite";

export type RetrievalTargetSource = "vector" | "bm25";

export type RetrievalQuerySpec = {
  query: string;
  type: RetrievalQueryType;
  weight: number;
  targetSources: RetrievalTargetSource[];
  reason?: string;
};

export type ProcessedQuery = {
  originalQuery: string;
  normalizedQuery: string;
  expandedQueries: string[];
  llmRewrittenQueries: string[];
  retrievalQueries: string[];
  structuredQueries: RetrievalQuerySpec[];
  mainRewrittenQuery?: string;
  subQueries: string[];
};

type QueryParts = {
  originalQuery: string;
  normalizedQuery: string;
  expandedQueries: string[];
};

const QUESTION_SUFFIX_PATTERN =
  /(吗|呢|么|嘛|吗？|呢？|么？|嘛？|如何|怎么|怎样)$/;

const ALL_TARGET_SOURCES: RetrievalTargetSource[] = ["vector", "bm25"];

const EMPTY_LLM_REWRITE: LlmQueryRewriteResult = {
  subQueries: [],
};

const QUERY_REWRITE_RULES: Array<[RegExp, string[]]> = [
  [/怎么|怎样|如何/g, ["怎么", "如何", "怎样"]],
  [/配置|设置|分配|修改|更改|改/g, ["配置", "设置", "分配", "修改"]],
  [/权限|角色|管理员/g, ["权限", "角色", "管理员"]],
  [/成员|用户|账号|账户/g, ["成员", "用户", "账号"]],
  [/删除|移除|禁用/g, ["删除", "移除", "禁用"]],
];

/**
 * query 处理模块。
 *
 * 职责：
 * 1. 保留原始 query，避免 rewrite 改坏用户原意。
 * 2. 使用 LLM 生成主改写和子查询拆解。
 * 3. 使用少量本地同义扩展补召回。
 * 4. 输出结构化 retrieval query，给 hybrid 召回和加权 RRF 使用。
 */
export function processQuery(query: string): ProcessedQuery {
  const queryParts = buildQueryParts(query);
  return buildProcessedQuery(queryParts, EMPTY_LLM_REWRITE);
}

/**
 * 异步 query 处理入口。
 *
 * LLM rewrite 返回主改写和子查询；
 * 失败时默认 fail-open，保留原始 query 和同义扩展。
 */
export async function processQueryWithRewrite(
  query: string
): Promise<ProcessedQuery> {
  const queryParts = buildQueryParts(query);
  const llmRewrite = await getLlmStructuredRewrite(queryParts);

  return buildProcessedQuery(queryParts, llmRewrite);
}

function buildQueryParts(query: string): QueryParts {
  const originalQuery = query;
  const normalizedQuery = normalizeQuery(query);
  const expandedQueries = RAG_CONFIG.queryExpansionEnabled
    ? expandQuery(normalizedQuery)
    : [];

  return {
    originalQuery,
    normalizedQuery,
    expandedQueries,
  };
}

function buildProcessedQuery(
  queryParts: QueryParts,
  llmRewrite: LlmQueryRewriteResult
): ProcessedQuery {
  const mainRewrittenQuery = sanitizeQuery(
    llmRewrite.mainRewrite,
    RAG_CONFIG.maxLlmRewrittenQueryChars
  );
  const subQueries = sanitizeQueryList(
    llmRewrite.subQueries,
    RAG_CONFIG.maxSubQueryChars,
    RAG_CONFIG.maxSubQueries
  );
  const llmRewrittenQueries = uniqueNonEmpty([
    ...(mainRewrittenQuery ? [mainRewrittenQuery] : []),
    ...subQueries,
  ]);
  const structuredQueries = buildStructuredQueries({
    ...queryParts,
    mainRewrittenQuery,
    subQueries,
  });
  const retrievalQueries = uniqueNonEmpty(
    structuredQueries.map((item) => item.query)
  );

  return {
    ...queryParts,
    llmRewrittenQueries,
    retrievalQueries,
    structuredQueries,
    ...(mainRewrittenQuery ? { mainRewrittenQuery } : {}),
    subQueries,
  };
}

/**
 * 基于固定规则生成同义扩展 query。
 *
 * 同义扩展只作为低权重补召回，不替代原始 query 和 LLM 改写结果。
 */
export function expandQuery(query: string): string[] {
  const expansions: string[] = [];

  for (const [pattern, replacements] of QUERY_REWRITE_RULES) {
    pattern.lastIndex = 0;
    if (!pattern.test(query)) continue;
    pattern.lastIndex = 0;

    for (const replacement of replacements) {
      const expandedQuery = query.replace(pattern, replacement).trim();
      if (expandedQuery !== query) {
        expansions.push(expandedQuery);
      }
    }
  }

  return uniqueNonEmpty(expansions).slice(0, RAG_CONFIG.maxExpandedQueries);
}

/**
 * 标准化用户问题。
 *
 * normalized query 只作为 LLM prompt 和同义扩展的内部辅助，
 * 不作为独立 retrieval query，避免增加重复召回成本。
 */
export function normalizeQuery(query: string): string {
  return query
    .trim()
    .replace(/[？?！!。；;]/g, " ")
    .replace(/\s+/g, " ")
    .replace(QUESTION_SUFFIX_PATTERN, "")
    .trim();
}

/** 在配置开启时调用 LLM query rewrite，失败时默认降级为空结构化结果。 */
async function getLlmStructuredRewrite(
  queryParts: QueryParts
): Promise<LlmQueryRewriteResult> {
  if (!RAG_CONFIG.llmQueryRewriteEnabled) return EMPTY_LLM_REWRITE;

  try {
    return await rewriteQueryWithLlm(queryParts.originalQuery, {
      normalizedQuery: queryParts.normalizedQuery,
      ruleExpandedQueries: queryParts.expandedQueries,
      maxRewrites: RAG_CONFIG.maxLlmRewrittenQueries,
    });
  } catch (error) {
    if (RAG_CONFIG.llmQueryRewriteFailOpen) return EMPTY_LLM_REWRITE;
    throw error;
  }
}

function buildStructuredQueries(input: {
  originalQuery: string;
  mainRewrittenQuery?: string;
  subQueries: string[];
  expandedQueries: string[];
}): RetrievalQuerySpec[] {
  return dedupeStructuredQueries([
    createQuerySpec(
      input.originalQuery,
      "original",
      "用户原始问题，作为检索保底"
    ),
    createQuerySpec(
      input.mainRewrittenQuery,
      "main_rewrite",
      "LLM 主改写：把口语问题规范成检索表达"
    ),
    ...input.subQueries.map((query) =>
      createQuerySpec(
        query,
        "sub_query",
        "LLM 子查询拆解：处理多意图或对比问题"
      )
    ),
    ...input.expandedQueries.map((query) =>
      createQuerySpec(
        query,
        "synonym_rewrite",
        "本地同义扩展：少量低权重补召回"
      )
    ),
  ]);
}

function createQuerySpec(
  query: string | undefined,
  type: RetrievalQueryType,
  reason: string
): RetrievalQuerySpec | undefined {
  const sanitizedQuery = sanitizeQuery(query, getMaxQueryChars(type));

  if (!sanitizedQuery) return undefined;

  return {
    query: sanitizedQuery,
    type,
    weight: RAG_CONFIG.queryTypeWeights[type],
    targetSources: ALL_TARGET_SOURCES,
    reason,
  };
}

function getMaxQueryChars(type: RetrievalQueryType): number {
  if (type === "sub_query") return RAG_CONFIG.maxSubQueryChars;
  if (type === "main_rewrite") return RAG_CONFIG.maxLlmRewrittenQueryChars;

  return 300;
}

function dedupeStructuredQueries(
  values: Array<RetrievalQuerySpec | undefined>
): RetrievalQuerySpec[] {
  const seen = new Set<string>();
  const result: RetrievalQuerySpec[] = [];

  for (const value of values) {
    if (!value) continue;

    const key = normalizeQueryKey(value.query);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    result.push(value);
  }

  return result;
}

function sanitizeQuery(
  query: string | undefined,
  maxChars: number
): string | undefined {
  if (typeof query !== "string") return undefined;

  const sanitizedQuery = query.trim().replace(/\s+/g, " ");
  if (!sanitizedQuery || sanitizedQuery.length > maxChars) return undefined;

  return sanitizedQuery;
}

function sanitizeQueryList(
  queries: string[],
  maxChars: number,
  maxItems: number
): string[] {
  return uniqueNonEmpty(
    queries.flatMap((query) => {
      const sanitizedQuery = sanitizeQuery(query, maxChars);
      return sanitizedQuery ? [sanitizedQuery] : [];
    })
  ).slice(0, maxItems);
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    const key = normalizeQueryKey(normalized);
    if (!normalized || seen.has(key)) continue;

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function normalizeQueryKey(value: string): string {
  return value.trim().toLowerCase();
}
