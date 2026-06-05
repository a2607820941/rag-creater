import type { ChatCitation, ChatKnowledgeFile } from "@/features/chat/chat.types";
import type { LlmInterfaceKey } from "@/features/chat/chat.validation";
import type {
  LlmContentPart,
  LlmMessage,
} from "@/server/services/agent/llm-client";
import { streamChatCompletion } from "@/server/services/agent/llm-client";
import {
  buildAttachmentImageParts,
  buildAttachmentPromptContext,
} from "@/server/services/chat-attachment.service";
import { mergeRecentMessages } from "@/server/services/chat-conversation.service";
import { emitTrace, type ChatStreamEmitter } from "@/server/services/chat/chat-stream";
import {
  formatKnowledgeMapItems,
  listKnowledgeMapItems,
} from "@/server/services/knowledge-agent/knowledge-map";
import { buildKnowledgeAgentSystemPrompt } from "@/server/services/knowledge-agent/prompts";
import { runKnowledgeAgentToolLoop } from "@/server/services/knowledge-agent/tool-loop";

export type RunKnowledgeAgentInput = {
  userMessage: string;
  attachmentIds?: string[];
  llmInterface?: LlmInterfaceKey;
  recentMessages: LlmMessage[];
  memorySummary: string | null;
  signal?: AbortSignal;
  emit: ChatStreamEmitter;
};

export type RunKnowledgeAgentResult = {
  answer: string;
  knowledgeFiles: ChatKnowledgeFile[];
  citations: ChatCitation[];
};

export async function runKnowledgeAgent(
  input: RunKnowledgeAgentInput
): Promise<RunKnowledgeAgentResult> {
  const [attachmentContext, imageParts, mapItems] = await Promise.all([
    buildAttachmentPromptContext(input.attachmentIds),
    buildAttachmentImageParts(input.attachmentIds),
    listKnowledgeMapItems({ scope: { type: "all" }, limit: 50 }),
  ]);

  emitTrace(input.emit, {
    type: "plan",
    title: "Build knowledge map",
    detail: `${mapItems.length} active parsed document(s) mapped.`,
    status: "completed",
  });

  const baseMessages = attachImagesToCurrentUserMessage(
    mergeRecentMessages(
      [
        {
          role: "system",
          content: buildKnowledgeAgentSystemPrompt({
            knowledgeMap: formatKnowledgeMapItems(mapItems),
            attachmentContext,
          }),
        },
        {
          role: "user",
          content: input.userMessage,
        },
      ],
      input.recentMessages,
      input.memorySummary
    ),
    imageParts
  );

  input.emit("rag-summary", { status: "not-applicable", citationCount: 0 });
  input.emit("citations", []);
  input.emit("status", { status: "organizing" });

  const loopResult = await runKnowledgeAgentToolLoop({
    messages: baseMessages,
    llmInterface: input.llmInterface ?? "openai",
    emit: input.emit,
    signal: input.signal,
  });

  input.emit("status", { status: "generating" });
  emitTrace(input.emit, {
    type: "generation",
    title: "Generate Knowledge Agent answer",
    detail: "Stream the final answer after bounded tool use.",
    status: "running",
  });

  const answer = await streamChatCompletion(
    loopResult.messages,
    (token) => input.emit("token", token),
    input.llmInterface ?? "openai",
    { signal: input.signal }
  );

  const citations = loopResult.citations;
  const knowledgeFiles = dedupeKnowledgeFiles(loopResult.knowledgeFiles);
  input.emit("citations", citations);
  input.emit("knowledge-files", knowledgeFiles);
  emitTrace(input.emit, {
    type: "generation",
    title: "Knowledge Agent answer generated",
    status: "completed",
  });

  return {
    answer,
    citations,
    knowledgeFiles,
  };
}

function attachImagesToCurrentUserMessage(
  messages: LlmMessage[],
  imageParts: LlmContentPart[]
): LlmMessage[] {
  if (imageParts.length === 0) return messages;

  const index = findLastUserMessageIndex(messages);
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

function findLastUserMessageIndex(messages: LlmMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return index;
  }

  return -1;
}

function getTextMessageContent(content: LlmMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter(
      (part): part is Extract<LlmContentPart, { type: "text" }> =>
        part.type === "text"
    )
    .map((part) => part.text)
    .join("\n");
}

function dedupeKnowledgeFiles(files: ChatKnowledgeFile[]) {
  const seen = new Set<string>();
  return files.filter((file) => {
    if (seen.has(file.id)) return false;
    seen.add(file.id);
    return true;
  });
}
