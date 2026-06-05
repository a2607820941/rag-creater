import { NextRequest, NextResponse } from "next/server";
import {
  deleteCandidateHard,
  rejectCandidate,
  updateCandidate,
} from "@/server/services/extraction.service";
import { UpdateCandidateSchema } from "@/features/extraction/extraction.validation";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = UpdateCandidateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const tags = parsed.data.suggestedTags
      ? typeof parsed.data.suggestedTags === "string"
        ? parsed.data.suggestedTags.split(",").map((t: string) => t.trim())
        : parsed.data.suggestedTags
      : undefined;

    const result = await updateCandidate(id, {
      title: parsed.data.title,
      content: parsed.data.content,
      suggestedCategory: parsed.data.suggestedCategory,
      suggestedTags: tags,
      type: parsed.data.type,
    });

    if (!result) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "候选知识不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: result.id,
        title: result.title,
        content: result.content,
        suggestedCategory: result.suggestedCategory,
        suggestedTags: JSON.parse(result.suggestedTags || "[]"),
        type: result.knowledgeType || result.chunkType,
        status: result.reviewStatus ?? result.chunkStatus,
      },
      message: "更新成功",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "服务器内部错误";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    // action=reject → 软删除（拒绝）
    if (action === "reject") {
      const result = await rejectCandidate(id);
      if (!result) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "NOT_FOUND", message: "候选知识不存在" },
          },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        message: "已拒绝该候选知识",
      });
    }

    // 默认 → 硬删除
    const result = await deleteCandidateHard(id);
    if (!result) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "候选知识不存在" },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "已删除该候选知识",
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
