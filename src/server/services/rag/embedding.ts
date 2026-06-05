import type { KnowledgeChunk } from "@/features/rag/types";

export const DEFAULT_EMBEDDING_MODEL = "voyage-3.5";
const VOYAGE_EMBEDDINGS_ENDPOINT = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_BATCH_SIZE = 64;
const MAX_RETRIES = 3;

export type EmbeddingVector = number[];
type EmbeddingInputType = "query" | "document";

type VoyageEmbeddingItem = {
  embedding?: unknown;
  index?: number;
};

type VoyageEmbeddingResponse = {
  data?: VoyageEmbeddingItem[];
  model?: string;
};

export async function embedQuery(query: string): Promise<EmbeddingVector> {
  const [embedding] = await embedTexts([query], "query");
  return embedding;
}

export async function embedChunks(
  chunks: KnowledgeChunk[]
): Promise<EmbeddingVector[]> {
  const texts = chunks.map(getChunkEmbeddingText);
  // 解析管线：VoyageAI 失败时用 DashScope 兜底
  try {
    return await embedTexts(texts, "document");
  } catch (voyageError) {
    console.warn(
      "VoyageAI embeddings failed for chunk indexing, falling back to DashScope:",
      voyageError instanceof Error ? voyageError.message : voyageError
    );
    const { batchEmbedTexts } = await import("@/lib/embedding");
    const results = await batchEmbedTexts(texts);
    return results
      .sort((a, b) => a.textIndex - b.textIndex)
      .map((r) => r.embedding);
  }
}

export function getEmbeddingModel() {
  return process.env.VOYAGE_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
}

/** 构建 chunk embedding 使用的稳定文本输入。 */
export function getChunkEmbeddingText(chunk: KnowledgeChunk): string {
  const tagText = chunk.tagIds?.join("\n") ?? "";

  return [
    chunk.title,
    chunk.title,
    chunk.summary ?? "",
    chunk.summary ?? "",
    chunk.categoryId ?? "",
    tagText,
    chunk.chunkType,
    chunk.content,
  ].join("\n");
}

async function embedTexts(
  texts: string[],
  inputType: EmbeddingInputType
): Promise<EmbeddingVector[]> {
  if (texts.length === 0) return [];

  const embeddings: EmbeddingVector[] = [];
  for (let start = 0; start < texts.length; start += VOYAGE_BATCH_SIZE) {
    const batch = texts.slice(start, start + VOYAGE_BATCH_SIZE);
    embeddings.push(...(await requestVoyageEmbeddings(batch, inputType)));
  }
  return embeddings;
}

async function requestVoyageEmbeddings(
  texts: string[],
  inputType: EmbeddingInputType
): Promise<EmbeddingVector[]> {
  const apiKey = process.env.VOYAGE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "VOYAGE_API_KEY 未配置，无法生成 RAG 向量。请配置后重试。"
    );
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 2s, 4s, 8s
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise((r) => setTimeout(r, delay));
    }

    const response = await fetch(VOYAGE_EMBEDDINGS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: texts,
        model: getEmbeddingModel(),
        input_type: inputType,
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      lastError = new Error(
        `Voyage embeddings API 调用失败：HTTP ${response.status} ${truncate(
          responseText
        )}`
      );
      // Retry on rate limit (429) or server errors (5xx)
      if (response.status === 429 || response.status >= 500) {
        continue;
      }
      throw lastError;
    }

    const parsed = parseVoyageResponse(responseText);
    const items = parsed.data;
    if (!items || items.length !== texts.length) {
      throw new Error(
        `Voyage embeddings API 返回数量异常：expected ${texts.length}, received ${
          items?.length ?? 0
        }`
      );
    }

    return normalizeVoyageItems(items, texts.length);
  }

  throw lastError ?? new Error("Voyage embeddings API 请求失败，已达最大重试次数。");
}

function parseVoyageResponse(responseText: string): VoyageEmbeddingResponse {
  try {
    return JSON.parse(responseText) as VoyageEmbeddingResponse;
  } catch {
    throw new Error("Voyage embeddings API 返回了无法解析的 JSON。");
  }
}

function normalizeVoyageItems(
  items: VoyageEmbeddingItem[],
  expectedLength: number
): EmbeddingVector[] {
  const orderedItems = [...items].sort((a, b) => {
    if (typeof a.index !== "number" || typeof b.index !== "number") return 0;
    return a.index - b.index;
  });

  return orderedItems.map((item, index) => {
    if (!Array.isArray(item.embedding)) {
      throw new Error(`Voyage embeddings API 第 ${index + 1} 条结果缺少向量。`);
    }

    const embedding = item.embedding.filter(
      (value): value is number => typeof value === "number"
    );
    if (embedding.length === 0) {
      throw new Error(`Voyage embeddings API 第 ${index + 1} 条结果向量为空。`);
    }
    if (orderedItems.length !== expectedLength) {
      throw new Error("Voyage embeddings API 返回结果数量不匹配。");
    }

    return embedding;
  });
}

function truncate(value: string) {
  const trimmedValue = value.trim();
  if (trimmedValue.length <= 500) return trimmedValue;
  return `${trimmedValue.slice(0, 500)}...`;
}
