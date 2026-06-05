import { NextRequest, NextResponse } from "next/server";

import { parseDocument } from "@/server/services/document.service";
import { setProgress } from "@/lib/parse-progress";
import { documentIdSchema } from "@/features/document/components/document.validation";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsed = documentIdSchema.safeParse({ id });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Invalid document id" } },
        { status: 400 }
      );
    }

    const result = await parseDocument(id, (stage, percent) => setProgress(id, stage, percent));
    return NextResponse.json({
      success: true,
      data: {
        id,
        content: result.rawContent,
        chunkCount: result.chunkCount,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parse failed";
    return NextResponse.json(
      { success: false, error: { code: "PARSE_ERROR", message } },
      { status: 500 }
    );
  }
}
