import type {
  ChatTraceStep,
  ChatStreamEventName,
  ChatStreamEventPayloadMap,
} from "@/features/chat/chat.types";

export type ChatStreamEmitter = <Name extends ChatStreamEventName>(
  event: Name,
  data: ChatStreamEventPayloadMap[Name]
) => void;

export function createChatSseEmitter(
  controller: ReadableStreamDefaultController<Uint8Array>,
  signal: AbortSignal
): ChatStreamEmitter {
  const encoder = new TextEncoder();

  return (event, data) => {
    if (signal.aborted) return;

    try {
      controller.enqueue(
        encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      );
    } catch {
      // The client may have stopped the stream between events.
    }
  };
}

export function emitTrace(
  emit: ChatStreamEmitter,
  step: Omit<ChatTraceStep, "id" | "createdAt">
) {
  emit("trace", {
    ...step,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  });
}
