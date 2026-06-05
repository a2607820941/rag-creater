import {
  embedChunks,
  getChunkEmbeddingText,
  getEmbeddingModel,
  type EmbeddingVector,
} from "@/server/services/rag/embedding";
import { prisma } from "@/lib/db";
import type { KnowledgeChunk } from "@/features/rag/types";

export type ChunkEmbedding = {
  chunkId: string;
  embedding: EmbeddingVector;
  embeddingModel: string;
  contentHash: string;
  updatedAt: string;
};

/** 计算 chunk 当前 embedding 输入内容的稳定 hash，用于判断索引是否过期。 */
export function computeChunkContentHash(chunk: KnowledgeChunk): string {
  return hashString(getChunkEmbeddingText(chunk));
}

/** 为单个 chunk 生成 embedding 并写入本地 SQLite/Prisma 索引。 */
export async function indexChunk(chunk: KnowledgeChunk): Promise<ChunkEmbedding> {
  const [savedEmbedding] = await indexChunks([chunk]);
  return savedEmbedding;
}

/** 批量为 chunks 生成 embedding 并写入本地 SQLite/Prisma 索引。 */
export async function indexChunks(
  chunks: KnowledgeChunk[]
): Promise<ChunkEmbedding[]> {
  if (chunks.length === 0) return [];

  const embeddingModel = getEmbeddingModel();
  const embeddings = await embedChunks(chunks);
  const records = chunks.map((chunk, index) => ({
    chunkId: chunk.id,
    embedding: serializeEmbedding(embeddings[index]),
    embeddingModel,
    contentHash: computeChunkContentHash(chunk),
  }));

  const savedEmbeddings = await prisma.$transaction(
    records.map((record) =>
      prisma.chunkEmbedding.upsert({
        where: {
          chunkId: record.chunkId,
        },
        create: record,
        update: record,
      })
    )
  );

  return savedEmbeddings.map(toChunkEmbedding);
}

/** 删除指定 chunk 的本地 embedding 索引。 */
export async function deleteChunkEmbedding(chunkId: string): Promise<boolean> {
  const count = await deleteChunkEmbeddings([chunkId]);
  return count > 0;
}

/** 批量删除指定 chunks 的本地 embedding 索引。 */
export async function deleteChunkEmbeddings(chunkIds: string[]): Promise<number> {
  const uniqueChunkIds = [...new Set(chunkIds)].filter(Boolean);
  if (uniqueChunkIds.length === 0) return 0;

  const result = await prisma.chunkEmbedding.deleteMany({
    where: {
      chunkId: { in: uniqueChunkIds },
    },
  });

  return result.count;
}

/** 读取指定 chunkId 的本地 embedding 索引。 */
export async function getChunkEmbedding(
  chunkId: string
): Promise<ChunkEmbedding | undefined> {
  const chunkEmbedding = await prisma.chunkEmbedding.findUnique({
    where: {
      chunkId,
    },
  });

  return chunkEmbedding ? toChunkEmbedding(chunkEmbedding) : undefined;
}

/** 批量重建缺失或内容已过期的 chunk embedding 索引。 */
export async function reindexOutdatedChunks(
  chunks: KnowledgeChunk[]
): Promise<ChunkEmbedding[]> {
  const freshEmbeddingMap = await getFreshChunkEmbeddingMap(chunks);
  return indexChunks(
    chunks.filter((chunk) => !freshEmbeddingMap.has(chunk.id))
  );
}

/** 只读取当前可用的 chunk embedding；缺失或过期时返回 undefined。 */
export async function getFreshChunkEmbedding(
  chunk: KnowledgeChunk
): Promise<ChunkEmbedding | undefined> {
  const currentEmbedding = await getChunkEmbedding(chunk.id);
  if (!currentEmbedding) return undefined;

  return isChunkEmbeddingFresh(chunk, currentEmbedding)
    ? currentEmbedding
    : undefined;
}

/** 批量读取 fresh embedding，供检索阶段使用；不会在查询时重建向量。 */
export async function getFreshChunkEmbeddingMap(
  chunks: KnowledgeChunk[]
): Promise<Map<string, ChunkEmbedding>> {
  if (chunks.length === 0) return new Map();

  const chunkIds = chunks.map((chunk) => chunk.id);
  const currentModel = getEmbeddingModel();
  const embeddings = await prisma.chunkEmbedding.findMany({
    where: {
      chunkId: { in: chunkIds },
      embeddingModel: currentModel,
    },
  });
  const embeddingMap = new Map(
    embeddings.map((embedding) => [
      embedding.chunkId,
      toChunkEmbedding(embedding),
    ])
  );

  const freshEmbeddingMap = new Map<string, ChunkEmbedding>();
  for (const chunk of chunks) {
    const embedding = embeddingMap.get(chunk.id);
    if (embedding && isChunkEmbeddingFresh(chunk, embedding)) {
      freshEmbeddingMap.set(chunk.id, embedding);
    }
  }

  return freshEmbeddingMap;
}

/** 判断已有 embedding 是否仍匹配当前 chunk 内容和 embedding 模型。 */
export function isChunkEmbeddingFresh(
  chunk: KnowledgeChunk,
  chunkEmbedding?: ChunkEmbedding
): boolean {
  if (!chunkEmbedding) return false;

  return (
    chunkEmbedding.embeddingModel === getEmbeddingModel() &&
    chunkEmbedding.contentHash === computeChunkContentHash(chunk)
  );
}

/** 将数据库记录转换成 RAG 内部使用的 ChunkEmbedding。 */
function toChunkEmbedding(chunkEmbedding: {
  chunkId: string;
  embedding: string;
  embeddingModel: string;
  contentHash: string;
  updatedAt: Date;
}): ChunkEmbedding {
  return {
    chunkId: chunkEmbedding.chunkId,
    embedding: deserializeEmbedding(chunkEmbedding.embedding),
    embeddingModel: chunkEmbedding.embeddingModel,
    contentHash: chunkEmbedding.contentHash,
    updatedAt: chunkEmbedding.updatedAt.toISOString(),
  };
}

/** 将向量数组序列化成 SQLite 可存储的 JSON 字符串。 */
function serializeEmbedding(embedding: EmbeddingVector): string {
  return JSON.stringify(embedding);
}

/** 将 SQLite 中的 JSON 字符串还原成向量数组。 */
function deserializeEmbedding(value: string): EmbeddingVector {
  const parsedValue: unknown = JSON.parse(value);

  if (!Array.isArray(parsedValue)) return [];
  return parsedValue.filter((item): item is number => typeof item === "number");
}

/** 对字符串生成稳定、轻量的本地 hash。 */
function hashString(input: string): string {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
