const DASHSCOPE_BASE_URL =
  "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding";

export interface EmbeddingResult {
  textIndex: number;
  embedding: number[];
}

export async function embedSingle(text: string): Promise<number[]> {
  const results = await batchEmbedTexts([text]);
  return results[0]?.embedding ?? [];
}

export async function batchEmbedTexts(
  texts: string[]
): Promise<EmbeddingResult[]> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("DASHSCOPE_API_KEY is not configured");

  const allResults: EmbeddingResult[] = [];

  // DashScope 单次最多 25 条，分批调用
  const batchSize = 10;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    const response = await fetch(DASHSCOPE_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-v4",
        input: { texts: batch },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(
        `DashScope API error ${response.status}: ${errBody.slice(0, 200)}`
      );
    }

    const data = await response.json();
    const embeddings: EmbeddingResult[] = (
      data.output?.embeddings || []
    ).map((e: { text_index: number; embedding: number[] }) => ({
      textIndex: i + e.text_index,
      embedding: e.embedding,
    }));

    allResults.push(...embeddings);
  }

  return allResults;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
