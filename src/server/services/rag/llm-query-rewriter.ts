import { RAG_CONFIG } from "@/server/services/rag/config";
import { createChatCompletion } from "@/server/services/agent/llm-client";

/**
 * LLM query rewrite 模块。
 *
 * 规则 rewrite 负责稳定扩展常见同义词；
 * LLM rewrite 负责把用户自然语言问题改写成更适合检索的短查询。
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

/** 调用 LLM 生成更适合检索的 query 改写结果。 */
export async function rewriteQueryWithLlm(
  query: string,
  options: LlmQueryRewriteOptions
): Promise<string[]> {
  if (options.maxRewrites <= 0) return [];

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
            "你是 RAG 检索查询改写器。只输出 JSON 字符串数组，不要输出解释。每条改写必须保留用户原意，不回答问题，不引入新事实，并保留专有名词、英文配置项、数字、API 路径和文件名。",
        },
        {
          role: "user",
          content: buildRewritePrompt(query, options),
        },
      ],
      "openai",
      { signal: controller.signal }
    );

    return parseRewriteResponse(content, options);
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
    `规则改写候选：${JSON.stringify(options.ruleExpandedQueries)}`,
    `最多输出 ${options.maxRewrites} 条。`,
    `每条不超过 ${RAG_CONFIG.maxLlmRewrittenQueryChars} 个字符。`,
    "输出示例：[\"成员权限配置\", \"管理员角色设置\"]",
  ].join("\n");
}

function parseRewriteResponse(
  content: string,
  options: LlmQueryRewriteOptions
): string[] {
  const jsonArrayText = extractJsonArray(content);
  if (!jsonArrayText) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonArrayText);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  return uniqueNonEmptyStrings(parsed)
    .filter((item) => item.length <= RAG_CONFIG.maxLlmRewrittenQueryChars)
    .slice(0, options.maxRewrites);
}

function extractJsonArray(content: string): string | undefined {
  const trimmed = content.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return trimmed;

  const withoutFence = trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  if (withoutFence.startsWith("[") && withoutFence.endsWith("]")) {
    return withoutFence;
  }

  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start < 0 || end <= start) return undefined;

  return trimmed.slice(start, end + 1);
}

function uniqueNonEmptyStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;

    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}
