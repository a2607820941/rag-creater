import { prisma } from "@/lib/db";
import {
  isRetrievableDocumentChunk,
  mapDocumentChunkToKnowledgeChunk,
} from "@/server/services/rag/chunk-mapper";
import {
  deleteChunkEmbedding,
  indexChunks,
} from "@/server/services/rag/vector-index-repository";

import { notFound } from "./errors";

export async function deleteChunkService(id: string) {
  const current = await prisma.documentChunk.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!current) throw notFound("chunk not found");

  await deleteChunkEmbedding(id);
  await prisma.documentChunk.delete({ where: { id } });

  return { id };
}

export async function updateChunkService(
  id: string,
  data: { content?: string; charStart?: number; charEnd?: number }
) {
  const current = await prisma.documentChunk.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!current) throw notFound("chunk not found");

  const updatedChunk = await prisma.documentChunk.update({
    where: { id },
    data: {
      ...(data.content !== undefined && { content: data.content }),
      ...(data.charStart !== undefined && { charStart: data.charStart }),
      ...(data.charEnd !== undefined && { charEnd: data.charEnd }),
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

  if (shouldIndexChunk(updatedChunk)) {
    try {
      await indexChunks([mapDocumentChunkToKnowledgeChunk(updatedChunk)]);
    } catch (error) {
      await deleteChunkEmbedding(id);
      await prisma.documentChunk.update({
        where: { id },
        data: { chunkStatus: "disabled" },
      });
      throw error;
    }
  } else {
    await deleteChunkEmbedding(id);
  }

  return updatedChunk;
}

function shouldIndexChunk(chunk: {
  content: string;
  chunkStatus: string;
  chunkType: string;
  reviewStatus: string | null;
  documentSource: {
    status: string;
    activeStatus: string;
  } | null;
}) {
  return (
    chunk.content.trim() !== "" &&
    chunk.chunkStatus === "active" &&
    isRetrievableDocumentChunk(chunk) &&
    chunk.documentSource?.status === "parsed" &&
    chunk.documentSource.activeStatus === "active"
  );
}
