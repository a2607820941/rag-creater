import type {
  ChatCitation,
  ChatKnowledgeFile,
  ChatRagSummary,
} from "@/features/chat/chat.types";
import type { DirectChatRequest } from "@/features/chat/chat.validation";
import { persistChatExchange } from "@/server/services/chat-conversation.service";
import { maybeCaptureFromConversation } from "@/server/services/conversation-capture.service";
import type { LlmMessage } from "@/server/services/agent/llm-client";
import { streamChatCompletion } from "@/server/services/agent/llm-client";
import { selectAndRunInstalledSkill } from "@/server/services/skill/skill-registry.service";
import {
  emitTrace,
  type ChatStreamEmitter,
} from "@/server/services/chat/chat-stream";

type AgentExecutionResult = {
  answer: string;
  citations?: ChatCitation[];
  knowledgeFiles?: ChatKnowledgeFile[];
};

type DirectChatPreparation = {
  messages: LlmMessage[];
  citations: ChatCitation[];
  ragSummary: ChatRagSummary;
};

export type ChatExecutorHandlers = {
  runSkillAgent: () => Promise<AgentExecutionResult>;
  runKnowledgeAgent: () => Promise<AgentExecutionResult>;
  prepareDirectChat: () => Promise<DirectChatPreparation>;
  afterKnowledgeAgent?: (result: AgentExecutionResult) => Promise<void>;
  afterDirectChat?: (result: AgentExecutionResult) => Promise<void>;
};

export async function executeChat(input: {
  request: DirectChatRequest;
  conversationId: string;
  emit: ChatStreamEmitter;
  handlers: ChatExecutorHandlers;
  signal?: AbortSignal;
}): Promise<void> {
  const { request, conversationId, emit, handlers, signal } = input;

  if (request.chatMode === "skill-agent") {
    emitTrace(emit, {
      type: "plan",
      title: "Run Skill Agent",
      detail: "Prepare or save an API Skill based on the current conversation.",
      status: "running",
    });
    const result = await handlers.runSkillAgent();
    await persistResult(conversationId, request.message, result);
    emit("done", { ok: true });
    return;
  }

  emitTrace(emit, {
    type: "skill",
    title: "Check installed Skills",
    detail: "Scan published skills and decide whether one matches this request.",
    status: "running",
  });
  const installedSkill = await selectAndRunInstalledSkill(
    request.message,
    request.llmInterface ?? "openai",
    { signal }
  );
  if (installedSkill) {
    const result: AgentExecutionResult = {
      answer: installedSkill.result.answer,
      citations: installedSkill.result.citations,
    };
    emitRagResult(emit, result.citations ?? []);
    emit("status", { status: "generating" });
    await emitTextAsStream(emit, result.answer, signal);
    emitTrace(emit, {
      type: "skill",
      title: "Used Skill",
      detail: installedSkill.skill.slug,
      status: "completed",
    });
    emitTrace(emit, {
      type: "evidence",
      title: "Collected citations",
      detail: `${result.citations?.length ?? 0} citation(s) returned by the Skill.`,
      status: "completed",
    });
    await persistResult(conversationId, request.message, result);
    emit("done", { ok: true });
    return;
  }
  emitTrace(emit, {
    type: "skill",
    title: "No Skill selected",
    detail: "No installed Skill clearly matched the request.",
    status: "completed",
  });

  if (request.chatMode === "knowledge-agent") {
    emitTrace(emit, {
      type: "retrieval",
      title: "Run Knowledge Agent",
      detail: "Let the agent choose imported documents to read before answering.",
      status: "running",
    });
    const result = await handlers.runKnowledgeAgent();
    emitTrace(emit, {
      type: "evidence",
      title: "Read knowledge files",
      detail: `${result.knowledgeFiles?.length ?? 0} file(s) were used.`,
      status: "completed",
    });
    await persistResult(conversationId, request.message, result);
    await handlers.afterKnowledgeAgent?.(result);
    emit("done", { ok: true });
    return;
  }

  const prepared = await handlers.prepareDirectChat();
  if (prepared.ragSummary.status === "hit") {
    emitTrace(emit, {
      type: "evidence",
      title: "Retrieved knowledge",
      detail: `${prepared.ragSummary.citationCount} citation(s) matched the request.`,
      status: "completed",
    });
  } else if (prepared.ragSummary.status === "miss") {
    emitTrace(emit, {
      type: "warning",
      title: "No reliable knowledge match",
      detail: "The answer will not be grounded in retrieved citations.",
      status: "completed",
    });
  }
  emit("rag-summary", prepared.ragSummary);
  emit("citations", prepared.citations);
  emit("status", { status: "organizing" });
  emit("status", { status: "generating" });
  emitTrace(emit, {
    type: "generation",
    title: "Generate answer",
    detail: "Send the assembled context to the configured chat model.",
    status: "running",
  });

  const answer = await streamChatCompletion(
    prepared.messages,
    (token) => emit("token", token),
    request.llmInterface ?? "openai",
    { signal }
  );
  const result: AgentExecutionResult = {
    answer,
    citations: prepared.citations,
  };
  const persisted = await persistResult(conversationId, request.message, result);
  if (shouldCaptureConversationKnowledge(request.chatMode)) {
    void maybeCaptureFromConversation({
      conversationId,
      userMessageId: persisted.userMessageId,
      assistantMessageId: persisted.assistantMessageId,
      agentId: request.agentId,
      userMessage: request.message,
      assistantMessage: result.answer,
      citations: result.citations,
    }).catch((error) => {
      console.warn("Failed to capture conversation knowledge", error);
    });
  }
  await handlers.afterDirectChat?.(result);
  emitTrace(emit, {
    type: "generation",
    title: "Answer generated",
    status: "completed",
  });
  emit("done", { ok: true });
}

function shouldCaptureConversationKnowledge(chatMode: DirectChatRequest["chatMode"]) {
  return ["agent", "knowledge-agent", "rag-openai"].includes(chatMode);
}

function emitRagResult(emit: ChatStreamEmitter, citations: ChatCitation[]) {
  emit("rag-summary", {
    status: citations.length > 0 ? "hit" : "miss",
    citationCount: citations.length,
  });
  emit("citations", citations);
}

function persistResult(
  conversationId: string,
  userMessage: string,
  result: AgentExecutionResult
) {
  return persistChatExchange({
    conversationId,
    userMessage,
    assistantMessage: result.answer,
    citations: result.citations ?? [],
    knowledgeFiles: result.knowledgeFiles,
  });
}

async function emitTextAsStream(
  emit: ChatStreamEmitter,
  text: string,
  signal?: AbortSignal
) {
  const chunks = text.match(/[\s\S]{1,18}/g) ?? [];
  for (const chunk of chunks) {
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    emit("token", chunk);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
