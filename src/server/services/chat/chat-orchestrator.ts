import type { DirectChatRequest } from "@/features/chat/chat.validation";
import { runKnowledgeAgent as runKnowledgeAgentExecutor } from "@/server/services/knowledge-agent/executor";
import type { LlmMessage } from "@/server/services/agent/llm-client";

import { executeChat, type ChatExecutorHandlers } from "./chat-executor";
import type { ChatStreamEmitter } from "./chat-stream";
import {
  prepareDirectChat,
  reportDirectChatUsage,
  reportKnowledgeAgentUsage,
} from "./chat-direct.service";
import { streamSkillAgentChat } from "./chat-skill-agent.service";

export async function orchestrateChat(input: {
  request: DirectChatRequest;
  conversationId: string;
  emit: ChatStreamEmitter;
  origin: string;
  recentMessages: LlmMessage[];
  memorySummary: string | null;
  signal?: AbortSignal;
}) {
  const { request, conversationId, emit, origin, recentMessages, memorySummary, signal } =
    input;

  const handlers: ChatExecutorHandlers = {
    runSkillAgent: () =>
      streamSkillAgentChat({
        request,
        conversationId,
        emit,
        recentMessages,
        memorySummary,
        signal,
      }),
    runKnowledgeAgent: () =>
      runKnowledgeAgentExecutor({
        userMessage: request.message,
        attachmentIds: request.attachmentIds,
        llmInterface: request.llmInterface,
        recentMessages,
        memorySummary,
        signal,
        emit,
      }),
    prepareDirectChat: () =>
      prepareDirectChat({
        request,
        origin,
        recentMessages,
        memorySummary,
      }),
    afterKnowledgeAgent: async (result) => {
      await reportKnowledgeAgentUsage({
        query: request.message,
        knowledgeFiles: result.knowledgeFiles ?? [],
      });
    },
    afterDirectChat: async () => {
      if (request.chatMode === "openai") {
        await reportDirectChatUsage({
          query: request.message,
          chatMode: request.chatMode,
        });
      }
    },
  };

  await executeChat({
    request,
    conversationId,
    emit,
    handlers,
    signal,
  });
}
