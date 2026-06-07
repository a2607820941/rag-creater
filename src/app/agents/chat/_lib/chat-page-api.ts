import type {
  AgentListResponse,
  ChatAttachmentResponse,
  ConversationCreateResponse,
  ConversationUpdateResponse,
  MessageListResponse,
} from "./chat-page-types";
import type { ChatMode, SkillPublishResponse } from "./chat-types";

async function parseJsonResponse<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}

export async function fetchConversationMessages(conversationId: string) {
  const response = await fetch(`/api/conversations/${conversationId}/messages`);
  return parseJsonResponse<MessageListResponse>(response);
}

export async function fetchActiveAgents() {
  const response = await fetch("/api/agents?status=active&pageSize=100");
  return parseJsonResponse<AgentListResponse>(response);
}

export async function uploadChatAttachment(
  formData: FormData,
  signal: AbortSignal
) {
  const response = await fetch("/api/chat/attachments", {
    method: "POST",
    signal,
    body: formData,
  });
  const json = await parseJsonResponse<ChatAttachmentResponse>(response);

  return { response, json };
}

export type StartChatStreamPayload = {
  message: string;
  conversationId?: string;
  agentId?: string;
  chatMode: ChatMode;
  llmInterface: "openai";
  attachmentIds: string[];
};

export function startChatStream(
  payload: StartChatStreamPayload,
  signal: AbortSignal
) {
  return fetch("/api/chat", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteConversationRequest(conversationId: string) {
  const response = await fetch(`/api/conversations/${conversationId}`, {
    method: "DELETE",
  });
  const json = await parseJsonResponse<{
    success?: boolean;
    error?: { message?: string };
  }>(response);

  return { response, json };
}

export async function createConversationRequest(
  payload: { agentId?: string; mode: ChatMode } = { mode: "knowledge-agent" }
) {
  const response = await fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await parseJsonResponse<ConversationCreateResponse>(response);

  return { response, json };
}

export async function updateConversationModelRequest(
  conversationId: string,
  payload: { agentId?: string | null; mode: ChatMode }
) {
  const response = await fetch(`/api/conversations/${conversationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await parseJsonResponse<ConversationUpdateResponse>(response);

  return { response, json };
}

export async function publishSkillDraftRequest(publishEndpoint: string) {
  const response = await fetch(publishEndpoint, {
    method: "POST",
  });
  const json = await parseJsonResponse<SkillPublishResponse>(response);

  return { response, json };
}
