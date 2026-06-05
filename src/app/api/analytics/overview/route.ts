import { NextResponse } from "next/server";

import { getAnalyticsOverview } from "@/server/services/analytics.service";

export async function GET() {
  try {
    const overview = await getAnalyticsOverview();
    return NextResponse.json({
      success: true,
      data: overview,
      message: "统计总览获取成功",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get analytics overview";

    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
