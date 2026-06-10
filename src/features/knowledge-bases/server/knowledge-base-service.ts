import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { replaceTextChunksAndIndex } from "@/server/services/document.service";

import { badRequest, conflict, notFound } from "./errors";
import { mapKnowledgeBaseListItem, mapKnowledgeBaseTree } from "./mappers";
import type {
  CreateKnowledgeBaseInput,
  CreateDocumentSourceInput,
  UpdateKnowledgeBaseInput,
} from "./schemas";

export async function getKnowledgeBaseListService(params: {
  keyword?: string;
  status?: "active" | "disabled" | "all";
}) {
  const where: Prisma.KnowledgeBaseWhereInput = {
    ...(params.keyword
      ? {
          OR: [
            { name: { contains: params.keyword } },
            { description: { contains: params.keyword } },
            {
              tags: {
                some: {
                  tag: {
                    name: { contains: params.keyword },
                  },
                },
              },
            },
          ],
        }
      : {}),
    ...(params.status && params.status !== "all"
      ? { status: params.status }
      : {}),
  };

  const items = await prisma.knowledgeBase.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      tags: {
        include: {
          tag: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      documents: {
        include: {
          document: {
            include: {
              chunks: {
                where: { chunkStatus: "active" },
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });

  return items.map(mapKnowledgeBaseListItem);
}

export async function getKnowledgeBaseTreeService(id: string) {
  const item = await prisma.knowledgeBase.findUnique({
    where: { id },
    include: {
      tags: {
        include: {
          tag: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      documents: {
        orderBy: { sortOrder: "asc" },
        include: {
          document: {
            include: {
              chunks: {
                where: {
                  OR: [
                    // 文本分片对任何关联 KB 都可见
                    { chunkType: "text" },
                    // 知识分片：属于当前 KB 的已确认分片
                    { chunkType: "knowledge", knowledgeBaseId: id, reviewStatus: "confirmed" },
                    // 知识分片：待审核的分片（还未确认到任何 KB）
                    { chunkType: "knowledge", reviewStatus: "pending" },
                  ],
                },
                orderBy: { chunkIndex: "asc" },
              },
            },
          },
        },
      },
    },
  });

  if (!item) throw notFound("knowledge base not found");

  return mapKnowledgeBaseTree(item);
}

async function assertDocumentIdsExist(
  tx: Prisma.TransactionClient,
  documentIds: string[]
) {
  const uniqueDocumentIds = [...new Set(documentIds)];

  if (uniqueDocumentIds.length === 0) return uniqueDocumentIds;

  const existingDocuments = await tx.documentSource.findMany({
    where: { id: { in: uniqueDocumentIds } },
    select: { id: true },
  });

  if (existingDocuments.length !== uniqueDocumentIds.length) {
    const existingIds = new Set(
      existingDocuments.map((document) => document.id)
    );
    const missingIds = uniqueDocumentIds.filter((id) => !existingIds.has(id));

    throw badRequest("some documents do not exist", {
      documentIds: missingIds,
    });
  }

  return uniqueDocumentIds;
}

async function assertTagIdsExist(
  tx: Prisma.TransactionClient,
  tagIds: string[] | undefined
) {
  const uniqueTagIds = [...new Set(tagIds ?? [])];

  if (uniqueTagIds.length === 0) return uniqueTagIds;

  const tags = await tx.knowledgeTag.findMany({
    where: { id: { in: uniqueTagIds } },
    select: { id: true },
  });

  if (tags.length !== uniqueTagIds.length) {
    const existingIds = new Set(tags.map((tag) => tag.id));
    const missingIds = uniqueTagIds.filter((id) => !existingIds.has(id));

    throw badRequest("some tags do not exist", {
      tagIds: missingIds,
    });
  }

  return uniqueTagIds;
}

async function deleteUnusedKnowledgeBaseTags(
  tx: Prisma.TransactionClient,
  tagIds: string[]
) {
  const uniqueTagIds = [...new Set(tagIds)];

  if (uniqueTagIds.length === 0) return;

  await tx.knowledgeTag.deleteMany({
    where: {
      id: { in: uniqueTagIds },
      knowledgeBases: { none: {} },
    },
  });
}

async function assertDocumentsCanBeKnowledgeSource(
  tx: Prisma.TransactionClient,
  documentIds: string[]
) {
  const uniqueDocumentIds = [...new Set(documentIds)];

  if (uniqueDocumentIds.length === 0) return uniqueDocumentIds;

  const documents = await tx.documentSource.findMany({
    where: { id: { in: uniqueDocumentIds } },
    select: {
      id: true,
      status: true,
      activeStatus: true,
    },
  });

  if (documents.length !== uniqueDocumentIds.length) {
    const existingIds = new Set(documents.map((document) => document.id));
    const missingIds = uniqueDocumentIds.filter((id) => !existingIds.has(id));

    throw badRequest("some documents do not exist", {
      documentIds: missingIds,
    });
  }

  const unavailableIds = documents
    .filter(
      (document) =>
        document.status !== "parsed" || document.activeStatus !== "active"
    )
    .map((document) => document.id);

  if (unavailableIds.length > 0) {
    throw badRequest("some documents are not available knowledge sources", {
      documentIds: unavailableIds,
    });
  }

  return uniqueDocumentIds;
}

async function createDocumentWithChunks(
  tx: Prisma.TransactionClient,
  input: CreateDocumentSourceInput
) {
  return tx.documentSource.create({
    data: {
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
    },
    select: { id: true },
  });
}

export async function createKnowledgeBaseService(
  input: CreateKnowledgeBaseInput
) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const existingDocumentIds = input.documentIds
        ? await assertDocumentIdsExist(tx, input.documentIds)
        : [];
      const createdDocuments = await Promise.all(
        (input.documents ?? []).map((document) =>
          createDocumentWithChunks(tx, document)
        )
      );
      const documentIds = [
        ...existingDocumentIds,
        ...createdDocuments.map((document) => document.id),
      ];
      const tagIds = await assertTagIdsExist(tx, input.tagIds);

      const item = await tx.knowledgeBase.create({
        data: {
          name: input.name,
          description: input.description,
          icon: input.icon,
          similarityThreshold: input.similarityThreshold,
          topK: input.topK,
          status: input.status,
          tags:
            tagIds.length > 0
              ? {
                  create: tagIds.map((tagId) => ({
                    tagId,
                  })),
                }
              : undefined,
          documents:
            documentIds.length > 0
              ? {
                  create: documentIds.map((documentId, index) => ({
                    documentId,
                    sortOrder: index,
                  })),
                }
              : undefined,
        },
        include: {
          tags: {
            include: {
              tag: true,
            },
            orderBy: {
              createdAt: "asc",
            },
          },
          documents: {
            orderBy: { sortOrder: "asc" },
            include: {
              document: {
                include: {
                  chunks: {
                    orderBy: { chunkIndex: "asc" },
                  },
                },
              },
            },
          },
        },
      });

      if (documentIds.length > 0) {
        await tx.documentSource.updateMany({
          where: {
            id: { in: documentIds },
            knowledgeBaseId: null,
          },
          data: { knowledgeBaseId: item.id },
        });
      }

      return {
        item,
        createdDocuments,
      };
    });

    const createdInputDocuments = input.documents ?? [];
    for (let index = 0; index < result.createdDocuments.length; index += 1) {
      const sourceInput = createdInputDocuments[index];
      if (!sourceInput?.chunks || sourceInput.chunks.length === 0) continue;

      await replaceTextChunksAndIndex(
        result.createdDocuments[index].id,
        sourceInput.chunks.map((chunk) => ({
          content: chunk.content,
          charStart: chunk.startIndex ?? 0,
          charEnd: chunk.endIndex ?? chunk.content.length,
        })),
        { rawContent: sourceInput.rawContent }
      );
    }

    if (
      result.createdDocuments.some(
        (_, index) => createdInputDocuments[index]?.chunks?.length
      )
    ) {
      return getKnowledgeBaseTreeService(result.item.id);
    }

    return mapKnowledgeBaseTree(result.item);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw conflict("knowledge base name already exists");
    }

    throw error;
  }
}

export async function updateKnowledgeBaseService(
  id: string,
  input: UpdateKnowledgeBaseInput
) {
  try {
    const item = await prisma.$transaction(async (tx) => {
      const tagIds =
        input.tagIds === undefined
          ? undefined
          : await assertTagIdsExist(tx, input.tagIds);
      const previousTagIds =
        tagIds === undefined
          ? []
          : (
              await tx.knowledgeBaseTag.findMany({
                where: { knowledgeBaseId: id },
                select: { tagId: true },
              })
            ).map((relation) => relation.tagId);

      await tx.knowledgeBase.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description,
          icon: input.icon,
          similarityThreshold: input.similarityThreshold,
          topK: input.topK,
          status: input.status,
        },
      });

      if (tagIds !== undefined) {
        await tx.knowledgeBaseTag.deleteMany({
          where: { knowledgeBaseId: id },
        });

        if (tagIds.length > 0) {
          await tx.knowledgeBaseTag.createMany({
            data: tagIds.map((tagId) => ({
              knowledgeBaseId: id,
              tagId,
            })),
          });
        }

        await deleteUnusedKnowledgeBaseTags(tx, previousTagIds);
      }

      return tx.knowledgeBase.findUniqueOrThrow({
        where: { id },
        include: {
          tags: {
            include: {
              tag: true,
            },
            orderBy: {
              createdAt: "asc",
            },
          },
          documents: {
            orderBy: { sortOrder: "asc" },
            include: {
              document: {
                include: {
                  chunks: {
                    where: {
                      OR: [
                        { chunkType: "text" },
                        {
                          chunkType: "knowledge",
                          knowledgeBaseId: id,
                          reviewStatus: "confirmed",
                        },
                        { chunkType: "knowledge", reviewStatus: "pending" },
                      ],
                    },
                    orderBy: { chunkIndex: "asc" },
                  },
                },
              },
            },
          },
        },
      });
    });

    return mapKnowledgeBaseTree(item);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw notFound("knowledge base not found");
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw conflict("knowledge base name already exists");
    }

    throw error;
  }
}

export async function deleteKnowledgeBaseService(id: string) {
  try {
    await prisma.$transaction(async (tx) => {
      const tagIds = (
        await tx.knowledgeBaseTag.findMany({
          where: { knowledgeBaseId: id },
          select: { tagId: true },
        })
      ).map((relation) => relation.tagId);

      await tx.knowledgeBase.delete({ where: { id } });
      await deleteUnusedKnowledgeBaseTags(tx, tagIds);
    });

    return { id };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw notFound("knowledge base not found");
    }

    throw error;
  }
}

export async function bindDocumentsToKnowledgeBaseService(
  knowledgeBaseId: string,
  documentIds: string[]
) {
  await prisma.$transaction(async (tx) => {
    const knowledgeBase = await tx.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      select: { id: true },
    });

    if (!knowledgeBase) throw notFound("knowledge base not found");

    const uniqueDocumentIds = await assertDocumentsCanBeKnowledgeSource(
      tx,
      documentIds
    );
    const existingRelations = await tx.knowledgeBaseDocument.findMany({
      where: {
        knowledgeBaseId,
        documentId: { in: uniqueDocumentIds },
      },
      select: { documentId: true },
    });
    const existingIds = new Set(
      existingRelations.map((relation) => relation.documentId)
    );
    const nextDocumentIds = uniqueDocumentIds.filter(
      (documentId) => !existingIds.has(documentId)
    );

    if (nextDocumentIds.length > 0) {
      const maxSort = await tx.knowledgeBaseDocument.findFirst({
        where: { knowledgeBaseId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      const baseSortOrder = (maxSort?.sortOrder ?? -1) + 1;

      await tx.knowledgeBaseDocument.createMany({
        data: nextDocumentIds.map((documentId, index) => ({
          knowledgeBaseId,
          documentId,
          sortOrder: baseSortOrder + index,
        })),
      });
      await tx.documentSource.updateMany({
        where: {
          id: { in: nextDocumentIds },
          knowledgeBaseId: null,
        },
        data: { knowledgeBaseId },
      });
    }
  });

  return getKnowledgeBaseTreeService(knowledgeBaseId);
}

export async function unbindDocumentsFromKnowledgeBaseService(
  knowledgeBaseId: string,
  documentIds: string[]
) {
  await prisma.$transaction(async (tx) => {
    const knowledgeBase = await tx.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      select: { id: true },
    });

    if (!knowledgeBase) throw notFound("knowledge base not found");

    await tx.knowledgeBaseDocument.deleteMany({
      where: {
        knowledgeBaseId,
        documentId: { in: [...new Set(documentIds)] },
      },
    });
  });

  return getKnowledgeBaseTreeService(knowledgeBaseId);
}
