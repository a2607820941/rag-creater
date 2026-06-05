import { NextRequest, NextResponse } from "next/server";

import { getDocumentById, deleteDocument, updateDocumentContent } from "@/server/services/document.service";
import { documentIdSchema, updateDocumentSchema } from "@/features/document/components/document.validation";

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

    return NextResponse.json({ success: true, data: doc });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get document";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateDocumentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const doc = await updateDocumentContent(id, parsed.data.content);
    if (!doc) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Document not found" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: doc });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update document";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const doc = await deleteDocument(id);

    if (!doc) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Document not found" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete document";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
