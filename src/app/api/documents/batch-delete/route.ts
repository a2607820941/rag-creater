import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { deleteDocument } from "@/server/services/document.service";

const batchDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = batchDeleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const id of parsed.data.ids) {
      try {
        const doc = await deleteDocument(id);
        if (!doc) {
          results.push({ id, success: false, error: "Not found" });
        } else {
          results.push({ id, success: true });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Delete failed";
        results.push({ id, success: false, error: message });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    return NextResponse.json({
      success: true,
      data: { total: results.length, succeeded, results },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Batch delete failed" } },
      { status: 500 }
    );
  }
}
