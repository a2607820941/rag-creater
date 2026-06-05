import { NextResponse } from "next/server";

import { conversationIdSchema } from "@/features/chat/chat.validation";
import { listChatConversationMessages } from "@/server/services/chat-conversation.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsed = conversationIdSchema.safeParse({ id });
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

    const messages = await listChatConversationMessages(parsed.data.id);
    if (!messages) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Conversation not found" },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: messages,
      message: "消息列表获取成功",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list messages";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
