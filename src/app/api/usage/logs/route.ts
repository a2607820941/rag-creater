import { NextRequest, NextResponse } from "next/server";

import { usageLogCreateSchema } from "@/features/analytics/analytics.validation";
import { createUsageLog } from "@/server/services/analytics.service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = usageLogCreateSchema.safeParse(body);

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

    const usageLog = await createUsageLog(parsed.data);

    return NextResponse.json(
      {
        success: true,
        data: {
          id: usageLog.id,
          query: usageLog.query,
          hitCount: usageLog.hitCount,
          noHit: usageLog.noHit,
          references: usageLog.references,
          createdAt: usageLog.createdAt.toISOString(),
        },
        message: "检索使用日志记录成功",
      },
      { status: 201 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create usage log";

    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
