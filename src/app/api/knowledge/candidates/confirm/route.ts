import { NextRequest, NextResponse } from "next/server";
import { ConfirmRequestSchema } from "@/features/extraction/extraction.validation";
import { confirmCandidates } from "@/server/services/extraction.service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ConfirmRequestSchema.safeParse(body);

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

    const count = await confirmCandidates(parsed.data.ids, parsed.data.knowledgeBaseIds);

    return NextResponse.json({
      success: true,
      message: `已确认 ${count} 条知识，已进入可用状态`,
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
