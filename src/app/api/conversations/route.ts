import { NextRequest, NextResponse } from "next/server";

import { listChatConversations } from "@/server/services/chat-conversation.service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get("page") ?? 1);
    const pageSize = Number(searchParams.get("pageSize") ?? 50);

    const result = await listChatConversations({
      page: Number.isFinite(page) && page > 0 ? page : 1,
      pageSize:
        Number.isFinite(pageSize) && pageSize > 0
          ? Math.min(pageSize, 100)
          : 50,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list conversations";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
