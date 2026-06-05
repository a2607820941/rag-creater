/**
 * 向量语义检索服务
 *
 * 基于余弦相似度在文档块向量中进行语义检索。
 * 查询文本先通过 Embedding 转为向量，再与库中所有已向量化的块计算相似度，
 * 返回 Top-K 最相关的结果。
 */

import { prisma } from "@/lib/db";
import { embedSingle } from "@/lib/embedding";

export interface SearchResult {
  /** 文档块 ID */
  chunkId: string;
  /** 所属文档 ID */
  documentSourceId: string;
  /** 文档名称 */
  documentName: string;
  /** 文件类型 */
  fileType: string;
  /** 块序号 */
  chunkIndex: number;
  /** 块内容 */
  content: string;
  /** 相似度分数 (0-1) */
  score: number;
}

/**
 * 计算两个向量的余弦相似度。
 * 返回值范围 [-1, 1]，越接近 1 表示越相似。
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`,
    );
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * 语义检索：将查询文本转为向量，在已向量化的文档块中检索最相关的 Top-K 条结果。
 *
 * @param query - 用户查询文本
 * @param topK - 返回结果数量，默认 5
 * @returns 按相似度降序排列的检索结果
 */
export async function semanticSearch(
  query: string,
  topK: number = 5,
): Promise<SearchResult[]> {
  // 1. 将查询转为向量
  const queryVector = await embedSingle(query);

  // 2. 加载所有已向量化的文档块（连带文档信息）
  const chunks = await prisma.documentChunk.findMany({
    where: { embedding: { not: null } },
    include: {
      documentSource: {
        select: {
          originalName: true,
          fileType: true,
        },
      },
    },
  });

  if (chunks.length === 0) return [];

  // 3. 计算相似度
  const scored = chunks.map((chunk) => {
    let vector: number[];
    try {
      vector = JSON.parse(chunk.embedding!);
    } catch {
      return null; // 无效向量，跳过
    }

    const score = cosineSimilarity(queryVector, vector);

    if (!chunk.documentSource) return null;

    return {
      chunkId: chunk.id,
      documentSourceId: chunk.documentSourceId,
      documentName: chunk.documentSource.originalName,
      fileType: chunk.documentSource.fileType,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      score,
    };
  });

  // 4. 按相似度降序排列，取 Top-K
  const valid = scored.filter(
    (s): s is SearchResult => s !== null,
  );

  valid.sort((a, b) => b.score - a.score);

  return valid.slice(0, topK);
}
