import { NextRequest, NextResponse } from "next/server";
import { getProgresses } from "@/lib/parse-progress";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ids = searchParams.get("ids")?.split(",").filter(Boolean) ?? [];

  if (ids.length === 0) {
    return NextResponse.json({ success: true, data: {} });
  }

  const progresses = getProgresses(ids);
  return NextResponse.json({ success: true, data: progresses });
}
