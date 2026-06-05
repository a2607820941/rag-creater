import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { deleteCandidatesBatch } from "@/server/services/extraction.service";

const batchDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = batchDeleteSchema.safeParse(body);
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

    const results = await deleteCandidatesBatch(parsed.data.ids);

    const succeeded = results.filter((r) => r.success).length;
    return NextResponse.json({
      success: true,
      data: { total: results.length, succeeded, results },
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "批量删除失败";
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message },
      },
      { status: 500 }
    );
  }
}
