import { NextRequest, NextResponse } from "next/server";
import {
  listCandidates,
  listCandidatesByDocument,
} from "@/server/services/extraction.service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentSourceId = searchParams.get("documentSourceId");

    const candidates = documentSourceId
      ? await listCandidatesByDocument(documentSourceId)
      : await listCandidates();

    return NextResponse.json({
      success: true,
      data: { candidates, count: candidates.length },
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
