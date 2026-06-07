import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  createEmptyChatConversation,
  listChatConversations,
} from "@/server/services/chat-conversation.service";

const createConversationSchema = z.object({
  mode: z
    .enum(["openai", "agent", "knowledge-agent", "skill-agent", "rag-openai"])
    .optional(),
  agentId: z.string().trim().min(1).optional(),
});

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = createConversationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_REQUEST",
            message: parsed.error.issues[0]?.message ?? "Invalid request",
          },
        },
        { status: 400 }
      );
    }

    const conversation = await createEmptyChatConversation(parsed.data);

    return NextResponse.json({ success: true, data: conversation });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create conversation";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
