import { NextRequest, NextResponse } from "next/server";

import { getHotKnowledge } from "@/server/services/analytics.service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? 10);
    const data = await getHotKnowledge(Number.isFinite(limit) ? limit : 10);

    return NextResponse.json({
      success: true,
      data,
      message: "热门知识排行获取成功",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get hot knowledge";

    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
