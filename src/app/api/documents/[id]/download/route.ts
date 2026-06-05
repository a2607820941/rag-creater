import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";

import { getDocumentById } from "@/server/services/document.service";
import { documentIdSchema } from "@/features/document/components/document.validation";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

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

    const doc = await getDocumentById(id);
    if (!doc) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Document not found" } },
        { status: 404 }
      );
    }

    const filePath = path.join(UPLOAD_DIR, id);
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(filePath);
    } catch {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "File not found on disk" } },
        { status: 404 }
      );
    }

    const mimeMap: Record<string, string> = {
      txt: "text/plain",
      md: "text/markdown",
      csv: "text/csv",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      bmp: "image/bmp",
    };

    const mime = mimeMap[doc.fileType] ?? "application/octet-stream";
    const encodedName = encodeURIComponent(doc.originalName);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Download failed";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
