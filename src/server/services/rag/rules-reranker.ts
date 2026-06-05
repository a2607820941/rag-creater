import { RAG_CONFIG } from "@/server/services/rag/config";
import type { RankedRetrievalResult } from "@/server/services/rag/hybrid";
import type { ProcessedQuery } from "@/server/services/rag/query-processor";
import type {
  KnowledgeChunk,
  KnowledgeChunkType,
  RetrievalMode,
} from "@/features/rag/types";

type QueryIntent = "action" | "concept" | "permission" | "none";

type QueryTerm = {
  value: string;
  kind: "ascii" | "cjk";
  weight: number;
};

type QueryProfile = {
  phrase: string;
  terms: QueryTerm[];
  intent: QueryIntent;
};

type SearchField = {
  text: string;
  weight: number;
};

type RuleScoredResult = {
  result: RankedRetrievalResult;
  baseScore: number;
  boostScore: number;
  finalScore: number;
  updatedAtMs: number;
};

const ASCII_STOP_WORDS = new Set(["how", "what", "where", "can", "should"]);

const CJK_STOP_TERMS = new Set([
  "如何",
  "怎么",
  "怎样",
  "是否",
  "可以",
  "能否",
  "什么",
  "哪里",
  "在哪",
  "需要",
  "应该",
]);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 规则精排模块。
 *
 * 职责：
 * 1. 在 RRF 融合候选上叠加可解释的字段、来源、类型和意图规则。
 * 2. 输出同样的 RankedRetrievalResult，保持下游 MMR 和 context-builder 不变。
 * 3. 仅调整候选排序，不新增召回结果。
 */
/** 根据字段命中、来源、意图和新鲜度规则对 RRF 候选结果重新排序。 */
export function rerankByRules(
  results: RankedRetrievalResult[],
  processedQuery: ProcessedQuery,
  mode: RetrievalMode
): RankedRetrievalResult[] {
  if (results.length <= 1) return rerank(results);
  if (!RAG_CONFIG.rulesRerankEnabled) return rerank(results);

  const queryProfile = buildQueryProfile(processedQuery);
  const baseScores = normalizeScores(results.map((result) => result.score));
  const freshnessScores = getFreshnessScores(results);
  const modeBoostScale = getModeBoostScale(mode);
  const rawBoostScores = results.map(
    (result, index) =>
      modeBoostScale *
      getRuleBoostScore(result, queryProfile, freshnessScores[index])
  );
  const boostScores = normalizeScores(rawBoostScores);

  return results
    .map((result, index): RuleScoredResult => {
      const baseScore = baseScores[index];
      const boostScore = boostScores[index];
      const finalScore =
        RAG_CONFIG.rulesRerankBaseWeight * baseScore +
        RAG_CONFIG.rulesRerankBoostWeight * boostScore;

      return {
        result,
        baseScore,
        boostScore,
        finalScore,
        updatedAtMs: toTimestamp(result.chunk.updatedAt),
      };
    })
    .sort(compareRuleScoredResults)
    .map(({ result, finalScore }, index) => ({
      ...result,
      score: Number(finalScore.toFixed(4)),
      rank: index + 1,
    }));
}

/** 将 query processor 的输出整理成规则精排需要的短语、词项和意图画像。 */
function buildQueryProfile(processedQuery: ProcessedQuery): QueryProfile {
  const phrase = normalizeText(processedQuery.normalizedQuery);
  const queryText = [
    processedQuery.originalQuery,
    processedQuery.normalizedQuery,
    ...processedQuery.retrievalQueries,
  ].join(" ");

  return {
    phrase,
    terms: extractQueryTerms(queryText),
    intent: detectIntent(queryText),
  };
}

/** 从原始和扩展 query 中抽取可用于字段匹配的英文词和中文短语。 */
function extractQueryTerms(query: string): QueryTerm[] {
  const asciiTerms = unique(tokenizeAscii(normalizeText(query)))
    .filter((term) => term.length >= 2 && !ASCII_STOP_WORDS.has(term))
    .map((term) => ({
      value: term,
      kind: "ascii" as const,
      weight: 1,
    }));
  const cjkTerms = extractCjkTerms(query);

  return uniqueTerms([...asciiTerms, ...cjkTerms]).slice(
    0,
    RAG_CONFIG.maxRulesRerankTerms
  );
}

/** 从中文 query 中抽取 2 到 4 字的候选短语并过滤常见问句词。 */
function extractCjkTerms(query: string): QueryTerm[] {
  const cjkText = getCjkText(query);
  if (cjkText.length === 0) return [];

  const terms: QueryTerm[] = [];
  const maxSize = Math.min(4, cjkText.length);

  for (let size = maxSize; size >= 2; size -= 1) {
    for (let index = 0; index <= cjkText.length - size; index += 1) {
      const value = cjkText.slice(index, index + size);
      if (CJK_STOP_TERMS.has(value)) continue;

      terms.push({
        value,
        kind: "cjk",
        weight: size / 2,
      });
    }
  }

  return terms;
}

/** 根据 query 中的关键词粗略识别操作、概念或权限约束意图。 */
function detectIntent(query: string): QueryIntent {
  const normalizedQuery = normalizeText(query);
  const cjkText = getCjkText(query);

  if (
    includesAny(normalizedQuery, ["能否", "不能", "权限", "角色", "管理员"]) ||
    includesAny(cjkText, ["普通成员"])
  ) {
    return "permission";
  }

  if (
    includesAny(normalizedQuery, [
      "如何",
      "怎么",
      "步骤",
      "配置",
      "设置",
      "修改",
      "删除",
      "上传",
      "导入",
    ])
  ) {
    return "action";
  }

  if (
    includesAny(normalizedQuery, [
      "是什么",
      "说明",
      "介绍",
      "概念",
      "区别",
      "规则",
    ])
  ) {
    return "concept";
  }

  return "none";
}

/** 汇总单条结果的字段匹配、来源、类型意图和新鲜度规则加分。 */
function getRuleBoostScore(
  result: RankedRetrievalResult,
  queryProfile: QueryProfile,
  freshnessScore: number
): number {
  return (
    getFieldMatchScore(result.chunk, queryProfile) +
    getSourceScore(result) +
    getChunkTypeScore(result.chunk.chunkType, queryProfile.intent) +
    freshnessScore * RAG_CONFIG.rulesFreshnessBoost
  );
}

/** 计算 query 词项在 chunk 标题、摘要、正文和 metadata 中的字段命中得分。 */
function getFieldMatchScore(
  chunk: KnowledgeChunk,
  queryProfile: QueryProfile
): number {
  return getSearchFields(chunk).reduce(
    (score, field) => score + scoreField(field, queryProfile),
    0
  );
}

/** 将 chunk 拆成带权重的可匹配字段集合。 */
function getSearchFields(chunk: KnowledgeChunk): SearchField[] {
  return [
    {
      text: chunk.title,
      weight: RAG_CONFIG.rulesTitleMatchWeight,
    },
    {
      text: chunk.summary ?? "",
      weight: RAG_CONFIG.rulesSummaryMatchWeight,
    },
    {
      text: chunk.content,
      weight: RAG_CONFIG.rulesContentMatchWeight,
    },
    {
      text: getMetadataText(chunk),
      weight: RAG_CONFIG.rulesMetadataMatchWeight,
    },
  ];
}

/** 计算单个字段对 query 短语和词项的匹配贡献。 */
function scoreField(field: SearchField, queryProfile: QueryProfile): number {
  if (!field.text.trim()) return 0;

  const normalizedText = normalizeText(field.text);
  const asciiTokens = tokenizeAscii(normalizedText);
  const cjkText = getCjkText(normalizedText);
  let score = 0;

  if (
    queryProfile.phrase.length >= 2 &&
    normalizedText.includes(queryProfile.phrase)
  ) {
    score += RAG_CONFIG.rulesPhraseMatchWeight;
  }

  for (const term of queryProfile.terms) {
    const matchCount =
      term.kind === "ascii"
        ? countAsciiMatches(asciiTokens, term.value)
        : countSubstringMatches(cjkText, term.value);

    if (matchCount > 0) {
      score += term.weight * Math.min(matchCount, 3);
    }
  }

  return score * field.weight;
}

/** 将分类、标签和 metadata 合并成可参与规则匹配的文本。 */
function getMetadataText(chunk: KnowledgeChunk): string {
  return [
    chunk.categoryId ?? "",
    ...(chunk.tagIds ?? []),
    chunk.metadata ? JSON.stringify(chunk.metadata) : "",
  ].join(" ");
}

/** 根据候选结果来源给 exact 和 hybrid 结果增加轻量权重。 */
function getSourceScore(result: RankedRetrievalResult): number {
  if (result.source === "exact") return RAG_CONFIG.rulesExactSourceBoost;
  if (result.source === "hybrid") return RAG_CONFIG.rulesHybridSourceBoost;
  return 0;
}

/** 根据 query 意图判断当前 chunk 类型是否应该获得加权。 */
function getChunkTypeScore(
  chunkType: KnowledgeChunkType,
  intent: QueryIntent
): number {
  if (intent === "concept") {
    return chunkType === "wiki" || chunkType === "summary"
      ? RAG_CONFIG.rulesIntentChunkTypeBoost
      : 0;
  }

  if (intent === "action") {
    return chunkType === "text" || chunkType === "qa"
      ? RAG_CONFIG.rulesIntentChunkTypeBoost
      : 0;
  }

  if (intent === "permission") {
    return chunkType === "wiki" || chunkType === "text" || chunkType === "qa"
      ? RAG_CONFIG.rulesIntentChunkTypeBoost
      : RAG_CONFIG.rulesIntentChunkTypeBoost / 2;
  }

  return 0;
}

/** 在更新时间差异足够明显时计算 0 到 1 的新鲜度分数。 */
function getFreshnessScores(results: RankedRetrievalResult[]): number[] {
  const timestamps = results.map((result) => toTimestamp(result.chunk.updatedAt));
  const validTimestamps = timestamps.filter((timestamp) => timestamp > 0);

  if (validTimestamps.length <= 1) {
    return results.map(() => 0);
  }

  const minTimestamp = Math.min(...validTimestamps);
  const maxTimestamp = Math.max(...validTimestamps);
  const minGapMs = RAG_CONFIG.rulesFreshnessMinGapDays * MS_PER_DAY;

  if (maxTimestamp - minTimestamp < minGapMs) {
    return results.map(() => 0);
  }

  return timestamps.map((timestamp) =>
    timestamp > 0 ? (timestamp - minTimestamp) / (maxTimestamp - minTimestamp) : 0
  );
}

/** 将一组原始分数线性归一化到 0 到 1。 */
function normalizeScores(scores: number[]): number[] {
  if (scores.length === 0) return [];

  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const scoreRange = maxScore - minScore;

  if (scoreRange === 0) {
    return scores.map(() => (maxScore > 0 ? 1 : 0));
  }

  return scores.map((score) => (score - minScore) / scoreRange);
}

/** 按最终分、原始 rank 和更新时间依次比较两条规则精排结果。 */
function compareRuleScoredResults(
  a: RuleScoredResult,
  b: RuleScoredResult
): number {
  if (a.finalScore !== b.finalScore) {
    return b.finalScore - a.finalScore;
  }
  if (a.result.rank !== b.result.rank) {
    return a.result.rank - b.result.rank;
  }

  return b.updatedAtMs - a.updatedAtMs;
}

/** 保持当前顺序不变，仅重新生成连续 rank。 */
function rerank(results: RankedRetrievalResult[]): RankedRetrievalResult[] {
  return results.map((result, index) => ({
    ...result,
    rank: index + 1,
  }));
}

/** 根据检索模式轻微调整规则 boost 的影响强度。 */
function getModeBoostScale(mode: RetrievalMode): number {
  if (mode === "fast") return 0.95;
  if (mode === "detailed") return 1.05;
  return 1;
}

/** 将文本统一成小写、去常见标点并压缩空白的匹配形式。 */
function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[？?！!。；;，,、：:"“”‘’'()（）[\]{}<>《》]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 从文本中提取英文、数字和下划线 token。 */
function tokenizeAscii(input: string): string[] {
  return input.match(/[a-z0-9_]+/g) ?? [];
}

/** 从文本中提取连续中文字符用于中文短语匹配。 */
function getCjkText(input: string): string {
  return Array.from(input)
    .filter((char) => /[\u4e00-\u9fff]/.test(char))
    .join("");
}

/** 统计英文 token 列表中某个词项的精确命中次数。 */
function countAsciiMatches(tokens: string[], term: string): number {
  return tokens.filter((token) => token === term).length;
}

/** 统计中文文本中某个短语的不重叠出现次数。 */
function countSubstringMatches(text: string, term: string): number {
  let count = 0;
  let index = text.indexOf(term);

  while (index >= 0) {
    count += 1;
    index = text.indexOf(term, index + term.length);
  }

  return count;
}

/** 判断文本是否包含任一指定关键词。 */
function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

/** 对字符串列表按首次出现顺序去重。 */
function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

/** 对 query 词项按类型和值去重并保留首次出现顺序。 */
function uniqueTerms(terms: QueryTerm[]): QueryTerm[] {
  const seen = new Set<string>();
  const result: QueryTerm[] = [];

  for (const term of terms) {
    const key = `${term.kind}:${term.value}`;
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(term);
  }

  return result;
}

/** 将时间字符串转换成时间戳，无法解析时返回 0。 */
function toTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
