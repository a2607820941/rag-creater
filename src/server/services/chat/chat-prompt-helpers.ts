import type {
  LlmContentPart,
  LlmMessage,
} from "@/server/services/agent/llm-client";

export function renderAttachmentInstruction(attachmentContext: string): string {
  if (!attachmentContext) {
    return "No attachments were uploaded for this turn.";
  }

  return `${attachmentContext}

Attachment usage rules:
1. Use attachment content first when the user asks to summarize, explain, extract, or analyze the attachment.
2. Attachment content is only current conversation context and is not automatically part of the business knowledge base.
3. Do not label attachment content as a knowledge-base citation source.`;
}

export function attachImagesToCurrentUserMessage(
  messages: LlmMessage[],
  imageParts: LlmContentPart[]
): LlmMessage[] {
  if (imageParts.length === 0) return messages;

  const index = messages.findLastIndex((message) => message.role === "user");
  if (index < 0) return messages;

  return messages.map((message, messageIndex) => {
    if (messageIndex !== index) return message;

    const text = getTextMessageContent(message.content);
    return {
      ...message,
      content: [{ type: "text", text }, ...imageParts],
    };
  });
}

export function getTextMessageContent(content: LlmMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter(
      (part): part is Extract<LlmContentPart, { type: "text" }> =>
        part.type === "text"
    )
    .map((part) => part.text)
    .join("\n");
}
