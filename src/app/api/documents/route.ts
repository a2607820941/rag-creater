import { NextRequest, NextResponse } from "next/server";

import {
  createDocument,
  listDocuments,
  saveDocumentFile,
  updateDocumentStatus,
  getFileTypeFromName,
} from "@/server/services/document.service";
import { documentListQuerySchema, uploadFileSchema } from "@/features/document/components/document.validation";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = documentListQuerySchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      hasCandidates: searchParams.get("hasCandidates") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const result = await listDocuments(parsed.data);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list documents";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "未提供文件" } },
        { status: 400 }
      );
    }

    const fileType = getFileTypeFromName(file.name);
    const parsed = uploadFileSchema.safeParse({
      fileName: file.name,
      fileSize: file.size,
      fileType,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0].message },
        },
        { status: 400 }
      );
    }

    // Create the document record first
    const doc = await createDocument({
      originalName: file.name,
      fileType: parsed.data.fileType,
      fileSize: file.size,
    });

    // Save file to disk
    const buffer = Buffer.from(await file.arrayBuffer());
    await saveDocumentFile(doc.id, buffer);

    // Update status to uploaded (ready for parsing)
    await updateDocumentStatus(doc.id, "uploaded");

    return NextResponse.json({
      success: true,
      data: { id: doc.id, originalName: doc.originalName, fileType: doc.fileType, fileSize: doc.fileSize, status: "uploaded" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json(
      { success: false, error: { code: "UPLOAD_ERROR", message } },
      { status: 500 }
    );
  }
}
