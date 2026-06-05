import { NextRequest, NextResponse } from "next/server";

import { conversationIdSchema } from "@/features/chat/chat.validation";
import { deleteChatConversation } from "@/server/services/chat-conversation.service";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const parsed = conversationIdSchema.safeParse(await params);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid conversation id" },
        },
        { status: 400 }
      );
    }

    const deleted = await deleteChatConversation(parsed.data.id);
    if (!deleted) {
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
      data: { id: parsed.data.id },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete conversation";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
