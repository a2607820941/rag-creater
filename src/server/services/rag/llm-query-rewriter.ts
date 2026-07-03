import { RAG_CONFIG } from "@/server/services/rag/config";
import { createChatCompletion } from "@/server/services/agent/llm-client";

/**
 * LLM query rewrite 模块。
 *
 * 规则 rewrite 负责稳定扩展常见同义词；
 * LLM rewrite 负责把用户自然语言问题整理成结构化检索意图：
 * 主改写和子查询拆解。
 */
export type LlmQueryRewriteOptions = {
  normalizedQuery: string;
  ruleExpandedQueries: string[];
  maxRewrites: number;
};

export type LlmQueryRewriteProvider = (
  query: string,
  options: LlmQueryRewriteOptions
) => Promise<LlmQueryRewriteResult>;

export type LlmQueryRewriteResult = {
  mainRewrite?: string;
  subQueries: string[];
};

const EMPTY_REWRITE_RESULT: LlmQueryRewriteResult = {
  subQueries: [],
};

/** 调用 LLM 生成更适合检索的结构化 query 改写结果。 */
export async function rewriteQueryWithLlm(
  query: string,
  options: LlmQueryRewriteOptions
): Promise<LlmQueryRewriteResult> {
  if (options.maxRewrites <= 0) return EMPTY_REWRITE_RESULT;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    RAG_CONFIG.llmQueryRewriteTimeoutMs
  );

  try {
    const content = await createChatCompletion(
      [
        {
          role: "system",
          content:
            "你是 RAG 检索查询改写器。只输出 JSON 对象，不要输出解释。你的任务是生成检索 query，不回答问题，不引入新事实，不扩写背景。必须保留用户原意，并保留专有名词、英文配置项、数字、API 路径、错误码、类名、表名和文件名。",
        },
        {
          role: "user",
          content: buildRewritePrompt(query, options),
        },
      ],
      "openai",
      { signal: controller.signal }
    );

    return parseRewriteResponse(content);
  } finally {
    clearTimeout(timeout);
  }
}

function buildRewritePrompt(
  query: string,
  options: LlmQueryRewriteOptions
): string {
  return [
    `原始问题：${query}`,
    `标准化问题：${options.normalizedQuery}`,
    `同义扩展候选：${JSON.stringify(options.ruleExpandedQueries)}`,
    "请输出一个 JSON 对象，字段如下：",
    `- mainRewrite: string，可选，最多 1 条，规范化主查询，不超过 ${RAG_CONFIG.maxLlmRewrittenQueryChars} 个字符。`,
    `- subQueries: string[]，只在复杂、多意图、并列、对比、步骤类问题中输出，最多 ${RAG_CONFIG.maxSubQueries} 条，每条不超过 ${RAG_CONFIG.maxSubQueryChars} 个字符；单意图问题输出空数组。`,
    "子查询必须能独立检索，且不能引入原问题没有的新业务事实。",
    "输出示例：{\"mainRewrite\":\"知识库导入失败重新解析和权限配置\",\"subQueries\":[\"知识库导入失败重新解析\",\"知识库权限配置\"]}",
  ].join("\n");
}

function parseRewriteResponse(content: string): LlmQueryRewriteResult {
  const jsonObjectText = extractJsonObject(content);
  if (!jsonObjectText) return EMPTY_REWRITE_RESULT;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonObjectText);
  } catch {
    return EMPTY_REWRITE_RESULT;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return EMPTY_REWRITE_RESULT;
  }

  const record = parsed as Record<string, unknown>;
  const mainRewrite = sanitizeOptionalString(
    record.mainRewrite,
    RAG_CONFIG.maxLlmRewrittenQueryChars
  );
  const subQueries = RAG_CONFIG.subQueryRewriteEnabled
    ? uniqueNonEmptyStrings(
        record.subQueries,
        RAG_CONFIG.maxSubQueryChars,
        RAG_CONFIG.maxSubQueries
      )
    : [];

  return {
    ...(mainRewrite ? { mainRewrite } : {}),
    subQueries,
  };
}

function extractJsonObject(content: string): string | undefined {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (withoutFence.startsWith("{") && withoutFence.endsWith("}")) {
    return withoutFence;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;

  return trimmed.slice(start, end + 1);
}

function sanitizeOptionalString(
  value: unknown,
  maxChars: number
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxChars) return undefined;

  return trimmed;
}

function uniqueNonEmptyStrings(
  values: unknown,
  maxChars: number,
  maxItems: number
): string[] {
  if (!Array.isArray(values)) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > maxChars || seen.has(trimmed)) continue;

    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= maxItems) break;
  }

  return result;
}
