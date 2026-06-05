import { NextResponse } from "next/server";

import { getCategoryDistribution } from "@/server/services/analytics.service";

export async function GET() {
  try {
    const data = await getCategoryDistribution();

    return NextResponse.json({
      success: true,
      data,
      message: "分类知识分布获取成功",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to get category distribution";

    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
