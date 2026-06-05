import { NextRequest, NextResponse } from "next/server";

import { getDocumentChunks } from "@/server/services/document.service";
import { documentIdSchema } from "@/features/document/components/document.validation";

export async function GET(
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

    const chunks = await getDocumentChunks(id);
    return NextResponse.json({ success: true, data: chunks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get chunks";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
