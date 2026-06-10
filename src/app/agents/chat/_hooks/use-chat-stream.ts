"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";

import type {
  ChatMessageDTO,
  ChatStreamStatus,
  ChatSkillDraftSaved,
} from "@/features/chat/chat.types";

import { useTypingQueue } from "./use-typing-queue";
import {
  publishSkillDraftRequest,
  startChatStream,
} from "../_lib/chat-page-api";
import { readSseStream } from "../_lib/chat-sse";
import type {
  ChatComposerAttachment,
  ChatMode,
  SkillPublishState,
  UiMessage,
} from "../_lib/chat-types";
import { isSkillPublishCommand } from "../_lib/chat-page-utils";

const TYPING_DELAY_MIN_MS = 20;
const TYPING_DELAY_MAX_MS = 40;
const TYPING_CHUNK_CHAR_MIN = 1;
const TYPING_CHUNK_CHAR_MAX = 3;

type UseChatStreamOptions = {
  agentId: string;
  attachments: ChatComposerAttachment[];
  chatMode: ChatMode;
  conversationId?: string;
  loading: boolean;
  onAttachmentsClear: () => void;
  onConversationIdChange: (conversationId: string | undefined) => void;
  onConversationsRefresh: () => void;
  onError: (message: string | null) => void;
  onLoadingChange: (loading: boolean) => void;
  onResetScrollTracking: () => void;
};

export function useChatStream({
  agentId,
  attachments,
  chatMode,
  conversationId,
  loading,
  onAttachmentsClear,
  onConversationIdChange,
  onConversationsRefresh,
  onError,
  onLoadingChange,
  onResetScrollTracking,
}: UseChatStreamOptions) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [pendingSkillDraft, setPendingSkillDraft] =
    useState<ChatSkillDraftSaved | null>(null);
  const [skillPublishState, setSkillPublishState] =
    useState<SkillPublishState>({ status: "idle" });
  const localMessageIdRef = useRef(0);
  const chatAbortRef = useRef<AbortController | null>(null);

  const appendAssistantText = useCallback((messageId: string, text: string) => {
    if (!text) return;

    startTransition(() => {
      setMessages((prev) =>
        prev.map((item) =>
          item.id === messageId
            ? {
                ...item,
                content: item.content + text,
                status: "streaming",
                phase: "generating",
                loadingText: undefined,
              }
            : item
        )
      );
    });
  }, []);

  const {
    beginTypingSession,
    enqueueTypingChunk,
    markTypingStreamDone,
    stopTypingSession,
    waitForTypingDrain,
  } = useTypingQueue({
    chunkCharMax: TYPING_CHUNK_CHAR_MAX,
    chunkCharMin: TYPING_CHUNK_CHAR_MIN,
    delayMaxMs: TYPING_DELAY_MAX_MS,
    delayMinMs: TYPING_DELAY_MIN_MS,
    onAppendText: appendAssistantText,
  });

  const replaceMessages = useCallback((nextMessages: ChatMessageDTO[]) => {
    setMessages(
      nextMessages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        citations: message.citations,
        knowledgeFiles: message.knowledgeFiles,
        status: "done",
      }))
    );
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const abortActiveStream = useCallback(() => {
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    stopTypingSession();
    onLoadingChange(false);
  }, [onLoadingChange, stopTypingSession]);

  const stopMessage = useCallback(() => {
    abortActiveStream();
  }, [abortActiveStream]);

  const publishPendingSkillDraft = useCallback(async () => {
    if (!pendingSkillDraft || skillPublishState.status === "publishing") return;

    onError(null);
    setSkillPublishState({ status: "publishing" });
    try {
      const { response, json } = await publishSkillDraftRequest(
        pendingSkillDraft.publishEndpoint
      );

      if (!response.ok || !json?.success || !json.data) {
        throw new Error(json?.error?.message || "Skill publish failed");
      }

      setSkillPublishState({
        status: "published",
        skill: json.data.skill,
        endpoint: json.data.manifest.runtime.endpoint,
        apiKey: json.data.apiKey,
      });
    } catch (err) {
      const messageText =
        err instanceof Error ? err.message : "Skill publish failed";
      onError(messageText);
      setSkillPublishState({ status: "idle" });
    }
  }, [onError, pendingSkillDraft, skillPublishState.status]);

  const sendMessage = useCallback(
    async (input: string) => {
      const typedMessage = input.trim();
      const readyAttachments = attachments.filter(
        (attachment) => attachment.status === "ready"
      );
      if ((!typedMessage && readyAttachments.length === 0) || loading) {
        return false;
      }

      if (
        chatMode === "skill-agent" &&
        pendingSkillDraft &&
        isSkillPublishCommand(typedMessage)
      ) {
        await publishPendingSkillDraft();
        return true;
      }

      onError(null);
      onLoadingChange(true);
      stopTypingSession();
      const abortController = new AbortController();
      chatAbortRef.current = abortController;
      onResetScrollTracking();
      localMessageIdRef.current += 1;
      const localId = localMessageIdRef.current;
      const message =
        typedMessage || "Please analyze the uploaded attachment(s).";

      const userMessage: UiMessage = {
        id: `user-${localId}`,
        role: "user",
        content: message,
        citations: [],
        attachments: readyAttachments,
      };
      const assistantMessage: UiMessage = {
        id: `assistant-${localId}`,
        role: "assistant",
        content: "",
        citations: [],
        pending: true,
        status: "loading",
        phase: getInitialAssistantPhase(chatMode),
        loadingText: getAssistantLoadingText(getInitialAssistantPhase(chatMode)),
      };
      const typingSessionId = beginTypingSession(assistantMessage.id);
      setMessages((prev) => [...prev, userMessage, assistantMessage]);

      if (chatMode === "agent" && !agentId) {
        stopTypingSession();
        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantMessage.id
              ? {
                  ...item,
                  content: "Please select an Agent before sending.",
                  pending: false,
                  status: "done",
                  loadingText: undefined,
                }
              : item
          )
        );
        if (chatAbortRef.current === abortController) {
          chatAbortRef.current = null;
        }
        onLoadingChange(false);
        return true;
      }

      try {
        const attachmentIds = readyAttachments.map((attachment) => attachment.id);
        const res = await startChatStream(
          {
            message,
            conversationId,
            ...(agentId ? { agentId } : {}),
            chatMode,
            llmInterface: "openai",
            attachmentIds,
          },
          abortController.signal
        );

        if (!res.ok || !res.body) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error?.message || "Chat request failed");
        }

        await readSseStream(res.body, {
          meta: (data) => {
            if (data.conversationId) onConversationIdChange(data.conversationId);
          },
          token: (token) => {
            enqueueTypingChunk(typingSessionId, token);
          },
          citations: (citations) => {
            setMessages((prev) =>
              prev.map((item) =>
                item.id === assistantMessage.id ? { ...item, citations } : item
              )
            );
          },
          status: (data) => {
            setMessages((prev) =>
              prev.map((item) =>
                item.id === assistantMessage.id && !item.content
                  ? {
                      ...item,
                      status:
                        data.status === "failed" || data.status === "stopped"
                          ? "done"
                          : "loading",
                      phase: data.status,
                      loadingText: getAssistantLoadingText(data.status),
                    }
                  : item
              )
            );
          },
          trace: () => undefined,
          knowledgeFiles: (knowledgeFiles) => {
            setMessages((prev) =>
              prev.map((item) =>
                item.id === assistantMessage.id
                  ? { ...item, knowledgeFiles }
                  : item
              )
            );
          },
          skillDraftSaved: (skillDraft) => {
            setPendingSkillDraft(skillDraft);
            setSkillPublishState({ status: "idle" });
          },
          error: (data) => {
            throw new Error(data.message || "Chat failed");
          },
        });
        markTypingStreamDone(typingSessionId);
        await waitForTypingDrain(typingSessionId);

        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantMessage.id
              ? {
                  ...item,
                  pending: false,
                  status: "done",
                  loadingText: undefined,
                }
              : item
          )
        );
        onAttachmentsClear();
        onConversationsRefresh();
        return true;
      } catch (err) {
        if (
          abortController.signal.aborted ||
          (err instanceof Error && err.name === "AbortError")
        ) {
          stopTypingSession();
          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantMessage.id
                ? {
                    ...item,
                    content: item.content || "Stopped",
                    pending: false,
                    status: "done",
                    loadingText: undefined,
                  }
                : item
            )
          );
          return true;
        }

        const messageText = err instanceof Error ? err.message : "Chat failed";
        stopTypingSession();
        onError(messageText);
        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantMessage.id
              ? {
                  ...item,
                  content: `Request failed: ${messageText}`,
                  pending: false,
                  status: "done",
                  loadingText: undefined,
                }
              : item
          )
        );
        return true;
      } finally {
        if (chatAbortRef.current === abortController) {
          chatAbortRef.current = null;
        }
        onLoadingChange(false);
      }
    },
    [
      agentId,
      attachments,
      beginTypingSession,
      chatMode,
      conversationId,
      enqueueTypingChunk,
      loading,
      markTypingStreamDone,
      onAttachmentsClear,
      onConversationIdChange,
      onConversationsRefresh,
      onError,
      onLoadingChange,
      onResetScrollTracking,
      pendingSkillDraft,
      publishPendingSkillDraft,
      stopTypingSession,
      waitForTypingDrain,
    ]
  );

  const closeSkillPublishDialog = useCallback(() => {
    setPendingSkillDraft(null);
    setSkillPublishState({ status: "idle" });
  }, []);

  const resetSkillPublishState = useCallback(() => {
    setPendingSkillDraft(null);
    setSkillPublishState({ status: "idle" });
  }, []);

  useEffect(() => {
    return () => {
      chatAbortRef.current?.abort();
      stopTypingSession();
    };
  }, [stopTypingSession]);

  return {
    messages,
    pendingSkillDraft,
    skillPublishState,
    replaceMessages,
    clearMessages,
    sendMessage,
    stopMessage,
    abortActiveStream,
    publishPendingSkillDraft,
    closeSkillPublishDialog,
    resetSkillPublishState,
  };
}

function getInitialAssistantPhase(chatMode: ChatMode): ChatStreamStatus {
  return chatMode === "openai" ? "generating" : "retrieving";
}

function getAssistantLoadingText(status: ChatStreamStatus) {
  if (status === "retrieving") return "\u6b63\u5728\u68c0\u7d22\u77e5\u8bc6\u5e93";
  if (status === "organizing") return "\u6b63\u5728\u6574\u7406\u76f8\u5173\u5185\u5bb9";
  if (status === "reading-documents") return "\u6b63\u5728\u8bfb\u53d6\u77e5\u8bc6\u6587\u4ef6";
  if (status === "generating") return "\u6b63\u5728\u601d\u8003\u4e2d";
  if (status === "failed") return "\u8bf7\u6c42\u5931\u8d25";
  if (status === "stopped") return "\u5df2\u505c\u6b62";
  return "\u6b63\u5728\u601d\u8003\u4e2d";
}
