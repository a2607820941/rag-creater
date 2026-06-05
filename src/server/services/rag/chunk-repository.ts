import { mockKnowledgeChunks } from "@/server/services/rag/mock-data";
import {
  getRetrievableChunkWhere,
  mapDocumentChunkToKnowledgeChunk,
} from "@/server/services/rag/chunk-mapper";
import type {
  KnowledgeChunk,
  RagRetrieveScope,
} from "@/features/rag/types";

type ChunkSource = "mock" | "database";

/**
 * RAG 知识片段读取模块。
 *
 * 职责：
 * 1. 屏蔽 mock 数据和真实数据库之间的数据来源差异。
 * 2. 把当前 Prisma schema 中的 DocumentChunk 转成 RAG 对接文档里的 KnowledgeChunk。
 * 3. 让 retriever 只依赖统一的领域类型，不关心底层数据来自哪里。
 */
export async function listKnowledgeChunks(
  scope: RagRetrieveScope
): Promise<KnowledgeChunk[]> {
  if (getChunkSource() === "database") {
    return listDatabaseKnowledgeChunks(scope);
  }

  return mockKnowledgeChunks;
}

/** 默认读取真实数据库；需要演示 mock 数据时显式设置 RAG_CHUNK_SOURCE=mock。 */
function getChunkSource(): ChunkSource {
  return process.env.RAG_CHUNK_SOURCE === "mock" ? "mock" : "database";
}

/** 从 Prisma 读取真实 chunk，并适配成 RAG 统一的 KnowledgeChunk 字段。 */
async function listDatabaseKnowledgeChunks(
  scope: RagRetrieveScope
): Promise<KnowledgeChunk[]> {
  const { prisma } = await import("@/lib/db");
  const scopedKnowledgeBaseIds = new Set(scope.knowledgeBaseIds);

  const chunks = await prisma.documentChunk.findMany({
    where: {
      chunkStatus: "active",
      content: { not: "" },
      ...getRetrievableChunkWhere(),
      documentSource: {
        is: {
          status: "parsed",
          activeStatus: "active",
          knowledgeBases: {
            some: {
              knowledgeBaseId: { in: scope.knowledgeBaseIds },
              status: "active",
              knowledgeBase: {
                status: "active",
              },
            },
          },
        },
      },
      documentSourceId: scope.knowledgeIds
        ? {
            in: scope.knowledgeIds,
          }
        : undefined,
    },
    include: {
      documentSource: {
        include: {
          knowledgeBases: {
            where: {
              knowledgeBaseId: { in: scope.knowledgeBaseIds },
              status: "active",
              knowledgeBase: {
                status: "active",
              },
            },
            orderBy: {
              sortOrder: "asc",
            },
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
    orderBy: [
      {
        documentSourceId: "asc",
      },
      {
        chunkIndex: "asc",
      },
    ],
  });

  return chunks.flatMap((chunk) => {
    const document = chunk.documentSource;
    const relation = document?.knowledgeBases.find((item) =>
      scopedKnowledgeBaseIds.has(item.knowledgeBaseId)
    );

    if (!document || !relation) return [];

    return mapDocumentChunkToKnowledgeChunk(
      {
        ...chunk,
        documentSource: {
          ...document,
          knowledgeBases: [relation],
        },
      },
      {
        knowledgeBaseId: relation.knowledgeBaseId,
        knowledgeBaseName: relation.knowledgeBase.name,
      }
    );
  });
}
