import { NextRequest, NextResponse } from "next/server";

import { directChatRequestSchema } from "@/features/chat/chat.validation";
import {
  getOrCreateChatConversation,
  prepareChatConversationMemory,
} from "@/server/services/chat-conversation.service";
import { orchestrateChat } from "@/server/services/chat/chat-orchestrator";
import { createChatSseEmitter } from "@/server/services/chat/chat-stream";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = directChatRequestSchema.safeParse(body);

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

  const stream = new ReadableStream({
    async start(controller) {
      const emit = createChatSseEmitter(controller, request.signal);

      try {
        const conversation = await getOrCreateChatConversation({
          conversationId: parsed.data.conversationId,
          message: parsed.data.message,
          mode: parsed.data.chatMode,
          agentId: parsed.data.agentId,
        });
        const { recentMessages, memorySummary } =
          await prepareChatConversationMemory(
            conversation.id,
            parsed.data.llmInterface ?? "openai"
          );

        emit("meta", {
          conversationId: conversation.id,
        });
        emit("status", {
          status:
            parsed.data.chatMode === "rag-openai" ? "retrieving" : "organizing",
        });

        await orchestrateChat({
          request: parsed.data,
          conversationId: conversation.id,
          emit,
          origin: request.nextUrl.origin,
          recentMessages,
          memorySummary,
          signal: request.signal,
        });
      } catch (error) {
        if (request.signal.aborted || (error as Error).name === "AbortError") {
          return;
        }

        emit("status", { status: "failed" });
        emit("error", {
          code: "CHAT_ERROR",
          message: error instanceof Error ? error.message : "Chat failed",
        });
      } finally {
        try {
          controller.close();
        } catch {
          // Client may have already closed the stream.
        }
      }
    },
    cancel() {
      // The client controls cancellation through request.signal.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
