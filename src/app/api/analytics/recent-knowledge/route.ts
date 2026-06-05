import { NextRequest, NextResponse } from "next/server";

import { getRecentKnowledge } from "@/server/services/analytics.service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? 10);
    const data = await getRecentKnowledge(Number.isFinite(limit) ? limit : 10);

    return NextResponse.json({
      success: true,
      data,
      message: "最近新增知识获取成功",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get recent knowledge";

    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
