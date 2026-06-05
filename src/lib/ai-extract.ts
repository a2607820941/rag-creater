import {
  CandidateKnowledgeSchema,
  type CandidateKnowledgeItem,
} from "@/features/extraction/extraction.validation";
import {
  EXTRACTION_SYSTEM_PROMPT,
  renderUserPrompt,
} from "@/lib/prompts/extraction";

// ===== 类型定义 =====

export interface ExtractResult {
  success: boolean;
  candidates?: CandidateKnowledgeItem[];
  error?: string;
  retryable?: boolean;
}

// ===== JSON 解析容错（5 层策略） =====

function tryParseJSON(raw: string): unknown | undefined {
  // 策略1: 直接解析
  try {
    return JSON.parse(raw);
  } catch {
    /* fall through */
  }

  // 策略2: 去掉尾部多余内容，只保留到最后一个 ]
  const lastBracket = raw.lastIndexOf("]");
  if (lastBracket > 0) {
    const trimmed = raw.slice(0, lastBracket + 1);
    try {
      return JSON.parse(trimmed);
    } catch {
      /* fall through */
    }
  }

  // 策略3: 修复常见 JSON 错误
  const repaired = raw
    .replace(/,(\s*[}\]])/g, "$1") // 去掉尾部多余逗号
    .replace(/,\s*,/g, ",") // 去掉连续逗号
    .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3'); // 给无引号 key 加引号

  try {
    return JSON.parse(repaired);
  } catch {
    /* fall through */
  }

  // 策略4: 修复 + 截断到最后一个合法 ]
  const lastBracket2 = repaired.lastIndexOf("]");
  if (lastBracket2 > 0) {
    try {
      return JSON.parse(repaired.slice(0, lastBracket2 + 1));
    } catch {
      /* fall through */
    }
  }

  // 策略5: 逐个对象提取
  const objMatches = raw.match(/\{[^{}]*\}/g);
  if (objMatches && objMatches.length > 0) {
    const validObjs: unknown[] = [];
    for (const m of objMatches) {
      try {
        const obj = JSON.parse(m);
        if (
          obj &&
          typeof obj === "object" &&
          ((obj as Record<string, unknown>).title ||
            (obj as Record<string, unknown>).content)
        ) {
          validObjs.push(obj);
        }
      } catch {
        /* skip malformed object */
      }
    }
    if (validObjs.length > 0) return validObjs;
  }

  return undefined;
}

// ===== LLM 调用 =====

/** 通用 LLM chat 调用，传入 system + user prompt，返回文本响应 */
export async function chatWithLLM(
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 4096,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `LLM API error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody.slice(0, 200)}` : ""}`
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned empty response");
  return content;
}

/** 多模态调用：传入图片 base64 + prompt，返回文本描述 */
export async function chatWithVision(
  imageBuffer: Buffer,
  mimeType: string,
  prompt: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const apiKey = process.env.VISION_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.VISION_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.VISION_MODEL || "mimo-v2.5";
  const base64 = imageBuffer.toString("base64");

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
          ],
        },
      ],
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 2048,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Vision API error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody.slice(0, 200)}` : ""}`
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Vision model returned empty response");
  return content;
}

async function callLLM(text: string): Promise<unknown> {
  const userPrompt = renderUserPrompt(text);
  const content = await chatWithLLM(EXTRACTION_SYSTEM_PROMPT, userPrompt);

  let jsonStr = content;

  // 尝试从 ```json ... ``` 代码块中提取
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // 找到 JSON 数组起始位置
  const startIdx = jsonStr.indexOf("[");
  if (startIdx === -1) {
    console.error(
      "LLM raw response (first 500 chars):",
      content.slice(0, 500)
    );
    throw new Error("No JSON array found in response");
  }

  const arrayStr = jsonStr.slice(startIdx);
  const parsed = tryParseJSON(arrayStr);

  if (parsed !== undefined) return parsed;

  console.error("LLM raw response:", content.slice(0, 800));
  throw new Error("Failed to parse LLM response as JSON");
}

// ===== 主提炼函数 =====

export async function extractKnowledge(
  text: string
): Promise<ExtractResult> {
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const rawResult = await callLLM(text);
      const parsed = CandidateKnowledgeSchema.parse(rawResult);

      if (parsed.length === 0) {
        return {
          success: false,
          error: "未能从文本中提取到知识条目",
          retryable: false,
        };
      }

      return { success: true, candidates: parsed };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "未知错误";
      if (attempt === maxRetries) {
        return {
          success: false,
          error: `知识提炼失败: ${message}`,
          retryable: true,
        };
      }
      // 等 500ms 后重试
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return { success: false, error: "未知错误", retryable: false };
}

// ===== 去重工具 =====

/** 简单的 title 相似度判断 */
function titleSimilar(a: string, b: string): boolean {
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la === lb) return true;
  if (la.length > 5 && lb.includes(la)) return true;
  if (lb.length > 5 && la.includes(lb)) return true;
  return false;
}

/** 按 title 相似度去重 */
export function deduplicateCandidates(
  candidates: CandidateKnowledgeItem[]
): CandidateKnowledgeItem[] {
  const kept: CandidateKnowledgeItem[] = [];
  for (const c of candidates) {
    const isDuplicate = kept.some((k) => titleSimilar(k.title, c.title));
    if (!isDuplicate) kept.push(c);
  }
  return kept;
}
