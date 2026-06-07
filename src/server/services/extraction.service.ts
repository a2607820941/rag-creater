import { prisma } from "@/lib/db";
import {
  getDocumentById,
  getDocumentChunks,
} from "@/server/services/document.service";
import {
  extractKnowledge,
  deduplicateCandidates,
  type ExtractResult,
} from "@/lib/ai-extract";
import { renderChunkUserPrompt } from "@/lib/prompts/extraction";
import type { CandidateKnowledgeItem } from "@/features/extraction/extraction.validation";
import { mapDocumentChunkToKnowledgeChunk } from "@/server/services/rag/chunk-mapper";
import {
  deleteChunkEmbeddings,
  indexChunks,
} from "@/server/services/rag/vector-index-repository";

// ===== 类型 =====

export interface KnowledgeChunkRow {
  id: string;
  documentSourceId: string | null;
  title: string | null;
  content: string;
  suggestedCategory: string | null;
  suggestedTags: string | null;
  chunkType: string;
  knowledgeType: string | null;
  reviewStatus: string | null;
  chunkStatus: string;
  createdAt: Date;
  updatedAt: Date;
  sourceType?: string | null;
  documentTitle?: string | null;
}

export interface ExtractionFromDocumentResult {
  documentId: string;
  documentName: string;
  totalChunks: number;
  rawCandidateCount: number;
  dedupedCandidateCount: number;
  candidates: KnowledgeChunkRow[];
  errors?: Array<{ chunkIndex: number; error: string }>;
}

// ===== 辅助函数 =====

function toKnowledgeChunkData(
  item: CandidateKnowledgeItem,
  documentSourceId: string,
  baseIndex = 0
) {
  const tagsJson = JSON.stringify(item.suggestedTags || []);
  return {
    documentSourceId,
    content: item.content,
    title: item.title,
    chunkType: "knowledge",
    knowledgeType: item.type,
    suggestedCategory: item.suggestedCategory || null,
    suggestedTags: tagsJson === "[]" ? null : tagsJson,
    reviewStatus: "pending",
    chunkStatus: "disabled",
    chunkIndex: baseIndex,
    charStart: 0,
    charEnd: item.content.length,
  };
}

// ===== 从文本提炼 =====

export async function extractFromText(
  text: string
): Promise<ExtractResult> {
  return extractKnowledge(text);
}

// ===== 从文档提炼 =====

export async function extractFromDocument(
  documentId: string
): Promise<{
  success: boolean;
  data?: ExtractionFromDocumentResult;
  error?: { code: string; message: string };
}> {
  // 1. 获取文档信息并校验状态
  const doc = await getDocumentById(documentId);
  if (!doc) {
    return {
      success: false,
      error: { code: "NOT_FOUND", message: "文档不存在" },
    };
  }
  if (doc.status !== "parsed") {
    return {
      success: false,
      error: {
        code: "INVALID_STATUS",
        message: `文档尚未解析完成，当前状态: ${doc.status}`,
      },
    };
  }

  // 2. 获取分段
  const chunks = await getDocumentChunks(documentId);
  if (!chunks || chunks.length === 0) {
    return {
      success: false,
      error: {
        code: "EMPTY_DOCUMENT",
        message: "该文档没有可提炼的内容（分段为空）",
      },
    };
  }

  // 3. 逐段提炼
  const allCandidates: CandidateKnowledgeItem[] = [];
  const errors: Array<{ chunkIndex: number; error: string }> = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      const contextualizedText = renderChunkUserPrompt(
        chunk.content,
        doc.originalName,
        chunk.chunkIndex,
        chunks.length
      );

      const result = await extractKnowledge(contextualizedText);

      if (
        result.success &&
        result.candidates &&
        result.candidates.length > 0
      ) {
        allCandidates.push(...result.candidates);
      }
    } catch (err: unknown) {
      errors.push({
        chunkIndex: chunk.chunkIndex,
        error: err instanceof Error ? err.message : "提炼失败",
      });
    }
  }

  // 4. 检查是否全部失败
  if (allCandidates.length === 0) {
    return {
      success: false,
      error: {
        code: "EXTRACTION_FAILED",
        message:
          errors.length === chunks.length
            ? "所有分段提炼均失败，可能是文档内容不适合提炼或 LLM 服务异常"
            : `提炼失败: ${errors.map((e) => `第${e.chunkIndex + 1}段: ${e.error}`).join("; ")}`,
      },
    };
  }

  // 5. 去重
  const deduped = deduplicateCandidates(allCandidates);

  // 6. 获取该文档下 knowledge 类型 chunk 的最大 chunkIndex
  const maxKnowledgeChunk = await prisma.documentChunk.findFirst({
    where: { documentSourceId: documentId, chunkType: "knowledge" },
    orderBy: { chunkIndex: "desc" },
    select: { chunkIndex: true },
  });
  let baseIndex = (maxKnowledgeChunk?.chunkIndex ?? -1) + 1;

  // 7. 写入 DocumentChunk（替代旧的 CandidateKnowledge）
  const rows = deduped.map((item) => {
    const data = toKnowledgeChunkData(item, documentId, baseIndex);
    baseIndex += 1;
    return data;
  });
  await prisma.documentChunk.createMany({ data: rows });

  // 8. 查询刚写入的记录返回
  const saved = await prisma.documentChunk.findMany({
    where: {
      documentSourceId: documentId,
      chunkType: "knowledge",
      reviewStatus: "pending",
    },
    orderBy: { createdAt: "desc" },
    take: deduped.length,
  });

  return {
    success: true,
    data: {
      documentId,
      documentName: doc.originalName,
      totalChunks: chunks.length,
      rawCandidateCount: allCandidates.length,
      dedupedCandidateCount: deduped.length,
      candidates: saved.map((c) => ({
        id: c.id,
        documentSourceId: c.documentSourceId,
        title: c.title,
        content: c.content,
        suggestedCategory: c.suggestedCategory,
        suggestedTags: c.suggestedTags,
        chunkType: c.chunkType,
        knowledgeType: c.knowledgeType,
        reviewStatus: c.reviewStatus,
        chunkStatus: c.chunkStatus,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      errors: errors.length > 0 ? errors : undefined,
    },
  };
}

// ===== 候选知识 CRUD（操作 DocumentChunk where chunkType="knowledge"） =====

export async function listCandidates() {
  const items = await prisma.documentChunk.findMany({
    where: { chunkType: "knowledge", reviewStatus: "pending" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      documentSourceId: true,
      title: true,
      content: true,
      suggestedCategory: true,
      suggestedTags: true,
      chunkType: true,
      knowledgeType: true,
      reviewStatus: true,
      chunkStatus: true,
      createdAt: true,
      updatedAt: true,
      documentSource: {
        select: {
          sourceType: true,
          title: true,
          originalName: true,
        },
      },
    },
  });
  return items.map(mapKnowledgeChunkToCandidate);
}

export async function getCandidateById(id: string) {
  return prisma.documentChunk.findFirst({
    where: { id, chunkType: "knowledge" },
  });
}

export async function rejectCandidate(id: string) {
  const existing = await prisma.documentChunk.findFirst({
    where: { id, chunkType: "knowledge" },
  });
  if (!existing) return null;
  await deleteChunkEmbeddings([id]);
  await prisma.documentChunk.update({
    where: { id },
    data: { reviewStatus: "rejected", chunkStatus: "disabled" },
  });
  return existing;
}

export async function deleteCandidateHard(id: string) {
  const existing = await prisma.documentChunk.findFirst({
    where: { id, chunkType: "knowledge" },
  });
  if (!existing) return null;
  await deleteChunkEmbeddings([id]);
  await prisma.documentChunk.delete({
    where: { id },
  });
  return existing;
}

export async function deleteCandidatesBatch(ids: string[]) {
  const results: { id: string; success: boolean; error?: string }[] = [];

  for (const id of ids) {
    try {
      const result = await deleteCandidateHard(id);
      if (!result) {
        results.push({ id, success: false, error: "Not found" });
      } else {
        results.push({ id, success: true });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Delete failed";
      results.push({ id, success: false, error: message });
    }
  }

  return results;
}

export async function listCandidatesByDocument(
  documentSourceId: string
) {
  const items = await prisma.documentChunk.findMany({
    where: { documentSourceId, chunkType: "knowledge" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      documentSourceId: true,
      title: true,
      content: true,
      suggestedCategory: true,
      suggestedTags: true,
      chunkType: true,
      knowledgeType: true,
      reviewStatus: true,
      chunkStatus: true,
      createdAt: true,
      updatedAt: true,
      documentSource: {
        select: {
          sourceType: true,
          title: true,
          originalName: true,
        },
      },
    },
  });
  return items.map(mapKnowledgeChunkToCandidate);
}

export async function updateCandidate(
  id: string,
  data: {
    title?: string;
    content?: string;
    suggestedCategory?: string | null;
    suggestedTags?: string[];
    type?: string;
  }
) {
  const existing = await prisma.documentChunk.findFirst({
    where: { id, chunkType: "knowledge" },
  });
  if (!existing) return null;

  const updatedChunk = await prisma.documentChunk.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.content !== undefined && { content: data.content }),
      ...(data.suggestedCategory !== undefined && {
        suggestedCategory: data.suggestedCategory,
      }),
      ...(data.suggestedTags !== undefined && {
        suggestedTags: JSON.stringify(data.suggestedTags),
      }),
      ...(data.type !== undefined && {
        knowledgeType: data.type,
      }),
      updatedAt: new Date(),
    },
    include: {
      documentSource: {
        include: {
          knowledgeBases: {
            orderBy: { sortOrder: "asc" },
            include: {
              knowledgeBase: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (
    updatedChunk.reviewStatus === "confirmed" &&
    updatedChunk.chunkStatus === "active"
  ) {
    try {
      await indexChunks([mapDocumentChunkToKnowledgeChunk(updatedChunk)]);
    } catch (error) {
      await deleteChunkEmbeddings([id]);
      await prisma.documentChunk.update({
        where: { id },
        data: { chunkStatus: "disabled" },
      });
      throw error;
    }
  } else {
    await deleteChunkEmbeddings([id]);
  }

  return updatedChunk;
}

// ===== 确认入库（生成 embedding） =====

export async function confirmCandidates(ids: string[], knowledgeBaseIds: string[]) {
  const pendingChunks = await prisma.documentChunk.findMany({
    where: {
      id: { in: ids },
      chunkType: "knowledge",
      reviewStatus: "pending",
    },
    include: {
      documentSource: {
        include: {
          knowledgeBases: {
            include: {
              knowledgeBase: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (pendingChunks.length === 0) return 0;

  // 确保文档已绑定到选中的知识库（跳过已存在的关联）。
  const docIds = [...new Set(pendingChunks.map((c) => c.documentSourceId).filter((id): id is string => id !== null))];
  if (docIds.length > 0) {
    const existingRelations = await prisma.knowledgeBaseDocument.findMany({
      where: {
        documentId: { in: docIds },
        knowledgeBaseId: { in: knowledgeBaseIds },
      },
      select: { documentId: true, knowledgeBaseId: true },
    });
    const existingPairs = new Set(
      existingRelations.map((r) => `${r.documentId}:${r.knowledgeBaseId}`)
    );
    const missingPairs: { documentId: string; knowledgeBaseId: string }[] = [];
    for (const docId of docIds) {
      for (const kbId of knowledgeBaseIds) {
        if (!existingPairs.has(`${docId}:${kbId}`)) {
          missingPairs.push({ documentId: docId, knowledgeBaseId: kbId });
        }
      }
    }
    if (missingPairs.length > 0) {
      await prisma.knowledgeBaseDocument.createMany({ data: missingPairs });
    }

    await prisma.documentSource.updateMany({
      where: {
        id: { in: docIds },
        sourceType: "conversation",
        status: "parsed",
      },
      data: {
        activeStatus: "active",
        updatedAt: new Date(),
      },
    });
  }

  const chunksForIndex = await prisma.documentChunk.findMany({
    where: {
      id: { in: pendingChunks.map((chunk) => chunk.id) },
      chunkType: "knowledge",
      reviewStatus: "pending",
    },
    include: {
      documentSource: {
        include: {
          knowledgeBases: {
            where: {
              knowledgeBaseId: { in: knowledgeBaseIds },
            },
            orderBy: { sortOrder: "asc" },
            include: {
              knowledgeBase: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                },
              },
            },
          },
        },
      },
    },
  });
  const ragChunks = chunksForIndex.map((chunk) =>
    mapDocumentChunkToKnowledgeChunk(chunk, {
      knowledgeBaseId: knowledgeBaseIds[0],
      knowledgeBaseName:
        chunk.documentSource?.knowledgeBases[0]?.knowledgeBase.name,
    })
  );

  try {
    await indexChunks(ragChunks);
  } catch (error) {
    await deleteChunkEmbeddings(pendingChunks.map((chunk) => chunk.id));
    throw error;
  }

  // 使用第一个选中的知识库作为 chunk 归属
  const targetKnowledgeBaseId = knowledgeBaseIds[0];

  await prisma.documentChunk.updateMany({
    where: {
      id: { in: pendingChunks.map((chunk) => chunk.id) },
      chunkType: "knowledge",
      reviewStatus: "pending",
    },
    data: {
      reviewStatus: "confirmed",
      chunkStatus: "active",
      knowledgeBaseId: targetKnowledgeBaseId,
      updatedAt: new Date(),
    },
  });

  return pendingChunks.length;
}

// ===== 映射辅助 =====

function mapKnowledgeChunkToCandidate(c: {
  id: string;
  documentSourceId: string | null;
  title: string | null;
  content: string;
  suggestedCategory: string | null;
  suggestedTags: string | null;
  chunkType: string;
  knowledgeType: string | null;
  reviewStatus: string | null;
  chunkStatus: string;
  createdAt: Date;
  updatedAt: Date;
  documentSource?: {
    sourceType: string;
    title: string;
    originalName: string;
  } | null;
}) {
  let suggestedTags: string[] = [];
  try {
    suggestedTags = c.suggestedTags ? JSON.parse(c.suggestedTags) : [];
  } catch {
    suggestedTags = [];
  }

  // Use stored knowledgeType from AI extraction, fallback to chunkType
  const type = c.knowledgeType || (c.chunkType === "knowledge" ? "concept" : c.chunkType);

  return {
    id: c.id,
    title: c.title ?? c.content.slice(0, 50),
    content: c.content,
    suggested_category: c.suggestedCategory,
    suggested_tags: suggestedTags,
    type,
    status: c.reviewStatus ?? c.chunkStatus,
    documentSourceId: c.documentSourceId,
    sourceType: c.documentSource?.sourceType ?? null,
    documentTitle:
      c.documentSource?.title ?? c.documentSource?.originalName ?? null,
    created_at: c.createdAt.toISOString(),
  };
}
