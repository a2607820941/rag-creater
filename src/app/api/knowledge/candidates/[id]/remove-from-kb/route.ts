import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deleteChunkEmbeddings } from "@/server/services/rag/vector-index-repository";

/**
 * POST /api/knowledge/candidates/[id]/remove-from-kb
 *
 * 从知识库中移除一条已入库的知识条目：
 * - 删除向量 embedding
 * - 将 chunkStatus 设为 disabled
 * - 不影响文档与知识库的关联关系
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await prisma.documentChunk.findFirst({
      where: { id, chunkType: "knowledge", reviewStatus: "confirmed" },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "知识条目不存在或未确认入库" },
        },
        { status: 404 }
      );
    }

    // 删除向量 embedding
    try {
      await deleteChunkEmbeddings([id]);
    } catch {
      // embedding 不存在也不影响主流程
    }

    // 禁用分片
    await prisma.documentChunk.update({
      where: { id },
      data: {
        chunkStatus: "disabled",
        reviewStatus: "rejected",
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "已从知识库移除该知识条目",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "服务器内部错误";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
