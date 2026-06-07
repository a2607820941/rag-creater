import fs from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

import {
  getFileTypeFromName,
  parseFileContent,
  validateFileType,
  MAX_FILE_SIZE,
} from "@/lib/file-parser";
import { splitTextIntoChunks } from "@/lib/text-splitter";
import { splitTextSemantic } from "@/lib/semantic-splitter";
import type { TextChunk } from "@/lib/text-splitter";

import { badRequest, notFound } from "@/features/knowledge-bases/server/errors";
import {
  mapDocumentChunk,
  mapDocumentSourceDetail,
  mapDocumentSourceListItem,
} from "@/features/knowledge-bases/server/mappers";
import {
  getRetrievableChunkWhere,
  mapDocumentChunkToKnowledgeChunk,
} from "@/server/services/rag/chunk-mapper";
import {
  deleteChunkEmbeddings,
  indexChunks,
} from "@/server/services/rag/vector-index-repository";
import type {
  CreateDocumentChunkInput,
  CreateDocumentSourceInput,
  UpdateDocumentSourceInput,
} from "@/features/knowledge-bases/server/schemas";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

// ========== Helpers ==========

async function ensureUploadDir(): Promise<void> {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch {
    // directory already exists
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function deleteEmbeddingsForDocumentChunks(documentSourceId: string) {
  const chunks = await prisma.documentChunk.findMany({
    where: { documentSourceId },
    select: { id: true },
  });

  await deleteChunkEmbeddings(chunks.map((chunk) => chunk.id));
}

async function reindexRetrievableDocumentChunks(documentSourceId: string) {
  const chunks = await prisma.documentChunk.findMany({
    where: {
      documentSourceId,
      chunkStatus: "active",
      content: { not: "" },
      ...getRetrievableChunkWhere(),
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
    orderBy: { chunkIndex: "asc" },
  });

  await indexChunks(chunks.map((chunk) => mapDocumentChunkToKnowledgeChunk(chunk)));
}

export async function replaceTextChunksAndIndex(
  documentSourceId: string,
  chunks: TextChunk[],
  options: { rawContent?: string }
) {
  await prisma.$transaction(async (tx) => {
    await tx.documentChunk.deleteMany({
      where: { documentSourceId, chunkType: "text" },
    });

    if (chunks.length > 0) {
      await tx.documentChunk.createMany({
        data: chunks.map((chunk: TextChunk, index: number) => ({
          documentSourceId,
          chunkIndex: index,
          content: chunk.content,
          charStart: chunk.charStart,
          charEnd: chunk.charEnd,
          chunkType: "text",
          chunkStatus: "active",
        })),
      });
    }

    await tx.documentSource.update({
      where: { id: documentSourceId },
      data: {
        status: "parsed",
        rawContent: options.rawContent,
        chunkCount: chunks.length,
        error: null,
      },
    });
  });
}

// ========== Types ==========

export type DocumentCreateInput = {
  originalName: string;
  fileType: string;
  fileSize: number;
  sourceType?: string;
};

export type DocumentListOptions = {
  page?: number;
  pageSize?: number;
  status?: string;
  hasCandidates?: boolean;
};

// ========== Low-level CRUD (used by document import pipeline) ==========

export async function createDocument(input: DocumentCreateInput) {
  const doc = await prisma.documentSource.create({
    data: {
      originalName: input.originalName,
      title: input.originalName,
      fileType: input.fileType,
      fileSize: input.fileSize,
      sourceType: input.sourceType ?? "file",
      status: "uploading",
    },
  });
  return doc;
}

export async function updateDocumentStatus(
  id: string,
  status: string,
  extra?: { rawContent?: string; error?: string }
) {
  const data: Prisma.DocumentSourceUpdateInput = { status };
  if (extra?.rawContent !== undefined) data.rawContent = extra.rawContent;
  if (extra?.error !== undefined) data.error = extra.error;
  return prisma.documentSource.update({ where: { id }, data });
}

export async function getDocumentById(id: string) {
  return prisma.documentSource.findUnique({ where: { id } });
}

export async function listDocuments(options: DocumentListOptions = {}) {
  const { page = 1, pageSize = 20, status, hasCandidates } = options;

  const where: Prisma.DocumentSourceWhereInput = {
    activeStatus: "active",
  };
  if (status) where.status = status;

  if (hasCandidates) {
    const docIds = await prisma.documentChunk.findMany({
      select: { documentSourceId: true },
      distinct: ["documentSourceId"],
      where: { chunkType: "knowledge", reviewStatus: { in: ["pending", "confirmed"] } },
    });
    where.id = { in: docIds.map((d) => d.documentSourceId).filter((id): id is string => id !== null) };
  }

  const [items, total] = await Promise.all([
    prisma.documentSource.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.documentSource.count({ where }),
  ]);

  const docIds = items.map((d) => d.id);
  const candidateCounts =
    docIds.length > 0
      ? await prisma.documentChunk.groupBy({
          by: ["documentSourceId", "reviewStatus"],
          where: {
            documentSourceId: { in: docIds },
            chunkType: "knowledge",
            reviewStatus: { in: ["pending", "confirmed"] },
          },
          _count: { id: true },
        })
      : [];

  const candidateMap: Record<
    string,
    { pending: number; confirmed: number }
  > = {};
  for (const c of candidateCounts) {
    if (!c.documentSourceId) continue;
    if (!candidateMap[c.documentSourceId]) {
      candidateMap[c.documentSourceId] = { pending: 0, confirmed: 0 };
    }
    if (c.reviewStatus === "confirmed") {
      candidateMap[c.documentSourceId].confirmed = c._count.id;
    } else if (c.reviewStatus === "pending") {
      candidateMap[c.documentSourceId].pending = c._count.id;
    }
    // "rejected" entries are intentionally excluded from both counts
  }

  const itemsWithCandidates = items.map((d) => ({
    ...d,
    candidatePending: candidateMap[d.id]?.pending ?? 0,
    candidateConfirmed: candidateMap[d.id]?.confirmed ?? 0,
  }));

  return { items: itemsWithCandidates, total, page, pageSize };
}

export async function deleteDocument(id: string) {
  const doc = await prisma.documentSource.findUnique({ where: { id } });
  if (!doc) return null;

  const filePath = path.join(UPLOAD_DIR, doc.id);
  try {
    await fs.unlink(filePath);
  } catch {
    // file may not exist on disk
  }

  await deleteEmbeddingsForDocumentChunks(id);
  await prisma.documentSource.delete({ where: { id } });
  return doc;
}

export async function saveDocumentFile(
  id: string,
  buffer: Buffer
): Promise<void> {
  await ensureUploadDir();
  const filePath = path.join(UPLOAD_DIR, id);
  await fs.writeFile(filePath, buffer);
}

export async function parseDocument(
  id: string,
  onProgress?: (stage: string, percent: number) => void
): Promise<{
  rawContent: string;
  chunkCount: number;
}> {
  const doc = await prisma.documentSource.findUnique({ where: { id } });
  if (!doc) throw new Error(`Document not found: ${id}`);
  if (doc.fileType !== "note" && !validateFileType(doc.fileType)) {
    throw new Error(`Unsupported file type: ${doc.fileType}`);
  }

  const isNote = doc.fileType === "note";

  onProgress?.("start", 0);
  await updateDocumentStatus(id, "parsing");

  try {
    let rawContent: string;

    if (isNote) {
      // Notes have rawContent in DB, no file on disk — parse as markdown
      onProgress?.("parse", 30);
      rawContent = doc.rawContent ?? "";
    } else {
      onProgress?.("read", 10);
      const filePath = path.join(UPLOAD_DIR, id);

      let fileExists = true;
      try {
        await fs.access(filePath);
      } catch {
        fileExists = false;
      }

      if (!fileExists && doc.rawContent) {
        // File missing but rawContent exists in DB (e.g., re-parse after cleanup)
        onProgress?.("parse", 30);
        rawContent = doc.rawContent;
      } else {
        const buffer = await fs.readFile(filePath);
        onProgress?.("parse", 30);
        rawContent = await parseFileContent(buffer, doc.fileType);
      }
    }

    // Note documents always allow re-parse (content may be updated externally by the note editor)
    if (doc.fileType !== "note" && doc.rawContent === rawContent && doc.status === "parsed") {
      onProgress?.("done", 100);
      await updateDocumentStatus(id, "parsed");
      return { rawContent, chunkCount: doc.chunkCount };
    }

    onProgress?.("split", 60);
    const imageTypes = ["png", "jpg", "jpeg", "webp", "bmp"];
    const isImage = imageTypes.includes(doc.fileType);

    let chunks: TextChunk[];
    if (isImage) {
      chunks = [{ content: rawContent, charStart: 0, charEnd: rawContent.length }];
    } else {
      const semanticChunks = await splitTextSemantic(rawContent);
      chunks = semanticChunks ?? splitTextIntoChunks(rawContent);
    }

    onProgress?.("save", 80);
    await replaceTextChunksAndIndex(id, chunks, { rawContent });

    onProgress?.("done", 100);
    return { rawContent, chunkCount: chunks.length };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown parse error";
    await updateDocumentStatus(id, "failed", { error: message });
    onProgress?.("failed", 100);
    throw error;
  }
}

export async function updateDocumentContent(id: string, rawContent: string) {
  const doc = await prisma.documentSource.findUnique({ where: { id } });
  if (!doc) return null;

  if (doc.rawContent === rawContent) return doc;

  const imageTypes = ["png", "jpg", "jpeg", "webp", "bmp"];
  const isImage = imageTypes.includes(doc.fileType);

  let chunks: TextChunk[];
  if (isImage) {
    chunks = [{ content: rawContent, charStart: 0, charEnd: rawContent.length }];
  } else {
    const semanticChunks = await splitTextSemantic(rawContent);
    chunks = semanticChunks ?? splitTextIntoChunks(rawContent);
  }

  await replaceTextChunksAndIndex(id, chunks, { rawContent });

  return prisma.documentSource.findUnique({ where: { id } });
}

export async function getDocumentChunks(documentSourceId: string) {
  return prisma.documentChunk.findMany({
    where: { documentSourceId },
    orderBy: { chunkIndex: "asc" },
  });
}

export async function getDocumentWithChunks(id: string) {
  return prisma.documentSource.findUnique({
    where: { id },
    include: {
      chunks: {
        orderBy: { chunkIndex: "asc" },
      },
    },
  });
}

export { MAX_FILE_SIZE, getFileTypeFromName };

// ========== Knowledge Document Service (merged from knowledge-document-service.ts) ==========

export async function getDocumentListService(params: {
  keyword?: string;
  sourceType?:
    | "manual"
    | "file"
    | "url"
    | "text"
    | "markdown"
    | "image"
    | "conversation"
    | "all";
  activeStatus?: "active" | "disabled" | "all";
  status?: "uploading" | "uploaded" | "pending" | "parsing" | "parsed" | "failed" | "all";
  includeDeleted?: boolean;
}) {
  const where: Prisma.DocumentSourceWhereInput = {
    // By default, exclude soft-deleted documents
    ...(params.includeDeleted ? {} : { deletedAt: null }),
    ...(params.keyword
      ? {
          OR: [
            { title: { contains: params.keyword } },
            { fileName: { contains: params.keyword } },
            { rawContent: { contains: params.keyword } },
          ],
        }
      : {}),
    ...(params.sourceType && params.sourceType !== "all"
      ? { sourceType: params.sourceType }
      : {}),
    ...(params.activeStatus && params.activeStatus !== "all"
      ? { activeStatus: params.activeStatus }
      : {}),
    ...(params.status && params.status !== "all"
      ? { status: params.status }
      : {}),
  };

  const documents = await prisma.documentSource.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      chunks: {
        where: { chunkStatus: "active" },
        orderBy: { chunkIndex: "asc" },
      },
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
  });

  return documents.map(mapDocumentSourceListItem);
}

async function assertKnowledgeBaseIdsExist(
  tx: Prisma.TransactionClient,
  knowledgeBaseIds: string[]
) {
  const uniqueKnowledgeBaseIds = [...new Set(knowledgeBaseIds)];

  if (uniqueKnowledgeBaseIds.length === 0) return uniqueKnowledgeBaseIds;

  const existingKnowledgeBases = await tx.knowledgeBase.findMany({
    where: { id: { in: uniqueKnowledgeBaseIds } },
    select: { id: true },
  });

  if (existingKnowledgeBases.length !== uniqueKnowledgeBaseIds.length) {
    const existingIds = new Set(
      existingKnowledgeBases.map((kb) => kb.id)
    );
    const missingIds = uniqueKnowledgeBaseIds.filter(
      (id) => !existingIds.has(id)
    );

    throw badRequest("some knowledge bases do not exist", {
      knowledgeBaseIds: missingIds,
    });
  }

  return uniqueKnowledgeBaseIds;
}

export async function createDocumentSourceService(
  input: CreateDocumentSourceInput
) {
  const document = await prisma.$transaction(async (tx) => {
    const knowledgeBaseIds = input.knowledgeBaseIds
      ? await assertKnowledgeBaseIdsExist(tx, input.knowledgeBaseIds)
      : [];

    const document = await tx.documentSource.create({
      data: {
        knowledgeBaseId: knowledgeBaseIds[0],
        title: input.title,
        originalName: input.fileName ?? input.title,
        fileType: input.fileName
          ? (input.fileName.split(".").pop() ?? "txt")
          : "txt",
        sourceType: input.sourceType,
        fileName: input.fileName,
        fileUrl: input.fileUrl,
        mimeType: input.mimeType,
        fileSize: input.fileSize ?? 0,
        rawContent: input.rawContent,
        chunkSize: input.chunkSize,
        chunkOverlap: input.chunkOverlap,
        status: input.rawContent ? "parsed" : "pending",
        activeStatus: input.activeStatus ?? "active",
        error: input.error,
        knowledgeBases:
          knowledgeBaseIds.length > 0
            ? {
                create: knowledgeBaseIds.map((kbId) => ({
                  knowledgeBaseId: kbId,
                })),
              }
            : undefined,
      },
      include: {
        chunks: {
          orderBy: { chunkIndex: "asc" },
        },
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
    });

    return mapDocumentSourceDetail(document);
  });

  if (input.chunks && input.chunks.length > 0) {
    await replaceTextChunksAndIndex(
      document.id,
      input.chunks.map((chunk) => ({
        content: chunk.content,
        charStart: chunk.startIndex ?? 0,
        charEnd: chunk.endIndex ?? chunk.content.length,
      })),
      { rawContent: input.rawContent }
    );

    return getDocumentDetailService(document.id);
  }

  return document;
}

export async function getDocumentDetailService(id: string) {
  const document = await prisma.documentSource.findUnique({
    where: { id },
    include: {
      chunks: {
        orderBy: { chunkIndex: "asc" },
      },
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
  });

  if (!document) throw notFound("document not found");

  return mapDocumentSourceDetail(document);
}

export async function updateDocumentSourceService(
  id: string,
  input: UpdateDocumentSourceInput
) {
  try {
    const currentDocument = await prisma.documentSource.findUnique({
      where: { id },
      select: { title: true, rawContent: true },
    });
    if (!currentDocument) throw notFound("document not found");

    const document = await prisma.documentSource.update({
      where: { id },
      data: {
        title: input.title,
        sourceType: input.sourceType,
        fileName: input.fileName,
        fileUrl: input.fileUrl,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        rawContent: input.rawContent,
        chunkSize: input.chunkSize,
        chunkOverlap: input.chunkOverlap,
        status: input.status,
        activeStatus: input.activeStatus,
        error: input.error,
      },
      include: {
        chunks: {
          orderBy: { chunkIndex: "asc" },
        },
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
    });

    if (
      input.title !== undefined &&
      input.title !== currentDocument.title
    ) {
      await reindexRetrievableDocumentChunks(id);
      return getDocumentDetailService(id);
    }

    return mapDocumentSourceDetail(document);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw notFound("document not found");
    }

    throw error;
  }
}

export type DeleteDocumentMode = "cascade" | "reference-only";

export async function deleteDocumentSourceService(
  id: string,
  options?: {
    mode?: DeleteDocumentMode;
    knowledgeBaseId?: string;
  }
) {
  const mode = options?.mode ?? "cascade";
  const knowledgeBaseId = options?.knowledgeBaseId;

  try {
    const document = await prisma.documentSource.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });

    if (!document) throw notFound("document not found");

    if (mode === "reference-only") {
      // Only remove the KnowledgeBaseDocument link(s), keep document and its chunks intact.
      if (knowledgeBaseId) {
        await prisma.knowledgeBaseDocument.deleteMany({
          where: {
            documentId: id,
            knowledgeBaseId,
          },
        });
      } else {
        // If no specific KB specified, remove all KB links for this document.
        await prisma.knowledgeBaseDocument.deleteMany({
          where: { documentId: id },
        });
      }

      return { id, mode: "reference-only" as const };
    }

    // mode === "cascade": Soft-delete the document and all its chunks.
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      // Soft-delete all chunks belonging to this document
      await tx.documentChunk.updateMany({
        where: { documentSourceId: id },
        data: { deletedAt: now },
      });

      // Soft-delete the document itself
      await tx.documentSource.update({
        where: { id },
        data: { deletedAt: now },
      });

      // Soft-delete KnowledgeBaseDocument links
      await tx.knowledgeBaseDocument.updateMany({
        where: { documentId: id },
        data: { status: "disabled" },
      });
    });

    return { id, mode: "cascade" as const, deletedAt: now.toISOString() };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw notFound("document not found");
    }

    throw error;
  }
}

export async function restoreDocumentSourceService(id: string) {
  try {
    const document = await prisma.documentSource.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });

    if (!document) throw notFound("document not found");

    if (!document.deletedAt) {
      throw badRequest("document is not deleted");
    }

    await prisma.$transaction(async (tx) => {
      // Restore the document
      await tx.documentSource.update({
        where: { id },
        data: { deletedAt: null },
      });

      // Restore all chunks that were soft-deleted at approximately the same time
      // (chunks that share the same deletedAt timestamp as the document)
      await tx.documentChunk.updateMany({
        where: {
          documentSourceId: id,
          deletedAt: { not: null },
        },
        data: { deletedAt: null },
      });

      // Re-enable KnowledgeBaseDocument links
      await tx.knowledgeBaseDocument.updateMany({
        where: { documentId: id, status: "disabled" },
        data: { status: "active" },
      });
    });

    return getDocumentDetailService(id);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw notFound("document not found");
    }

    throw error;
  }
}

export async function getDocumentChunksService(id: string) {
  const document = await prisma.documentSource.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!document) throw notFound("document not found");

  const chunks = await prisma.documentChunk.findMany({
    where: { documentSourceId: id },
    orderBy: { chunkIndex: "asc" },
  });

  return chunks.map(mapDocumentChunk);
}

export async function replaceDocumentChunksService(
  documentSourceId: string,
  chunks: CreateDocumentChunkInput[]
) {
  const document = await prisma.documentSource.findUnique({
    where: { id: documentSourceId },
    select: { id: true },
  });

  if (!document) throw notFound("document not found");

  await replaceTextChunksAndIndex(
    documentSourceId,
    chunks.map((chunk) => ({
      content: chunk.content,
      charStart: chunk.startIndex ?? 0,
      charEnd: chunk.endIndex ?? chunk.content.length,
    })),
    {}
  );

  const nextChunks = await prisma.documentChunk.findMany({
    where: { documentSourceId },
    orderBy: { chunkIndex: "asc" },
  });

  return nextChunks.map(mapDocumentChunk);
}
