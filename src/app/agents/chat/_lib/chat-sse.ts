import type { ChatStreamEventPayloadMap } from "@/features/chat/chat.types";

export type ChatSseHandlers = {
  meta: (data: ChatStreamEventPayloadMap["meta"]) => void;
  token: (token: ChatStreamEventPayloadMap["token"]) => void;
  citations: (citations: ChatStreamEventPayloadMap["citations"]) => void;
  status: (data: ChatStreamEventPayloadMap["status"]) => void;
  trace: (data: ChatStreamEventPayloadMap["trace"]) => void;
  knowledgeFiles: (data: ChatStreamEventPayloadMap["knowledge-files"]) => void;
  skillDraftSaved: (
    data: ChatStreamEventPayloadMap["skill-draft-saved"]
  ) => void;
  error: (data: ChatStreamEventPayloadMap["error"]) => void;
};

export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  handlers: ChatSseHandlers
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const eventText of events) {
      const lines = eventText.split("\n");
      const event = lines
        .find((line) => line.startsWith("event:"))
        ?.slice(6)
        .trim();
      const dataText = lines
        .find((line) => line.startsWith("data:"))
        ?.slice(5)
        .trim();

      if (!event || !dataText) continue;
      const data = JSON.parse(dataText);

      if (event === "meta") handlers.meta(data);
      if (event === "token") handlers.token(data);
      if (event === "citations") handlers.citations(data);
      if (event === "status") handlers.status(data);
      if (event === "trace") handlers.trace(data);
      if (event === "knowledge-files") handlers.knowledgeFiles(data);
      if (event === "skill-draft-saved") handlers.skillDraftSaved(data);
      if (event === "error") handlers.error(data);
    }
  }
}
