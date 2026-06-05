import { NextRequest, NextResponse } from "next/server";
import { RetryRequestSchema } from "@/features/extraction/extraction.validation";
import { extractFromDocument } from "@/server/services/extraction.service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RetryRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0].message,
          },
        },
        { status: 400 }
      );
    }

    const { documentId } = parsed.data;

    // 先删除该文档已有的 pending 候选知识（DocumentChunk where chunkType="knowledge"）
    const { prisma } = await import("@/lib/db");
    await prisma.documentChunk.deleteMany({
      where: {
        documentSourceId: documentId,
        chunkType: "knowledge",
        reviewStatus: "pending",
      },
    });

    // 重新提炼
    const result = await extractFromDocument(documentId);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: result.error?.code === "NOT_FOUND" ? 404 : 422 }
      );
    }

    const { data } = result;
    if (!data) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "重试提炼结果为空" },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        documentId: data.documentId,
        documentName: data.documentName,
        totalChunks: data.totalChunks,
        dedupedCandidateCount: data.dedupedCandidateCount,
        candidates: data.candidates,
        errors: data.errors,
      },
      message: `重试成功，从「${data.documentName}」提炼 ${data.dedupedCandidateCount} 条候选知识`,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "服务器内部错误";
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message },
      },
      { status: 500 }
    );
  }
}
