import { NextRequest, NextResponse } from "next/server";
import { FromDocumentRequestSchema } from "@/features/extraction/extraction.validation";
import { extractFromDocument } from "@/server/services/extraction.service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = FromDocumentRequestSchema.safeParse(body);

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
          error: {
            code: "INTERNAL_ERROR",
            message: "提炼结果为空",
          },
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
        rawCandidateCount: data.rawCandidateCount,
        dedupedCandidateCount: data.dedupedCandidateCount,
        candidates: data.candidates,
        errors: data.errors,
      },
      message: `从「${data.documentName}」提炼完成：${data.totalChunks} 个分段 → ${data.dedupedCandidateCount} 条候选知识${
        data.errors && data.errors.length > 0
          ? `（${data.errors.length} 个分段失败）`
          : ""
      }`,
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
