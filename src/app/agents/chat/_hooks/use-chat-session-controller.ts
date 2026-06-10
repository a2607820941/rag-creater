"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ChatConversationDTO } from "@/features/chat/chat.types";
import { useAppStore } from "@/store";

import { useChatAttachments } from "./use-chat-attachments";
import { useChatStream } from "./use-chat-stream";
import {
  createConversationRequest,
  deleteConversationRequest,
  fetchActiveAgents,
  fetchConversationMessages,
  updateConversationModelRequest,
} from "../_lib/chat-page-api";
import { CHAT_MODE_OPTIONS } from "../_lib/chat-constants";
import type { AgentItem, ChatMode, ChatModeOption } from "../_lib/chat-types";
import { toClientChatMode } from "../_lib/chat-page-utils";

type UseChatSessionControllerOptions = {
  onResetScrollTracking: () => void;
};

export function useChatSessionController({
  onResetScrollTracking,
}: UseChatSessionControllerOptions) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryConversationId = searchParams.get("conversationId") ?? undefined;
  const queryMode = searchParams.get("mode");
  const queryAgentId = searchParams.get("agentId");
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [agentId, setAgentId] = useState("");
  const [chatMode, setChatMode] = useState<ChatMode>(
    queryMode === "skill-agent" ? "skill-agent" : "knowledge-agent"
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [conversationMenu, setConversationMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messageLoadRequestRef = useRef(0);
  const conversations = useAppStore((state) => state.chatConversations);
  const loadConversations = useAppStore((state) => state.loadChatConversations);
  const upsertConversation = useAppStore(
    (state) => state.upsertChatConversation
  );
  const removeConversation = useAppStore(
    (state) => state.removeChatConversation
  );

  const attachmentsController = useChatAttachments({
    loading,
    onError: setError,
  });
  const {
    attachments,
    hasUploadingAttachments,
    uploadAttachments,
    removeAttachment,
    clearAttachments,
    abortPendingUploads,
  } = attachmentsController;

  const refreshConversations = useCallback(() => {
    void loadConversations({ force: true }).catch((err) => {
      setError(
        err instanceof Error ? err.message : "Failed to load conversations"
      );
    });
  }, [loadConversations]);

  const streamController = useChatStream({
    agentId,
    attachments,
    chatMode,
    conversationId,
    loading,
    onAttachmentsClear: clearAttachments,
    onConversationIdChange: setConversationId,
    onConversationsRefresh: refreshConversations,
    onError: setError,
    onLoadingChange: setLoading,
    onResetScrollTracking,
  });
  const {
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
  } = streamController;

  const currentAgent = useMemo(
    () => agents.find((agent) => agent.id === agentId),
    [agents, agentId]
  );
  const currentChatMode = useMemo<ChatModeOption>(
    () =>
      chatMode === "skill-agent"
        ? {
            value: "skill-agent",
            label: "Skill Agent",
            hint: "Create API Skill",
          }
        : CHAT_MODE_OPTIONS.find((option) => option.value === chatMode) ??
          CHAT_MODE_OPTIONS[0],
    [chatMode]
  );

  const clearConversationRuntime = useCallback(() => {
    abortActiveStream();
    abortPendingUploads();
    clearMessages();
    clearAttachments();
    resetSkillPublishState();
    setInput("");
    setError(null);
    setConversationMenu(null);
    onResetScrollTracking();
  }, [
    abortActiveStream,
    abortPendingUploads,
    clearAttachments,
    clearMessages,
    onResetScrollTracking,
    resetSkillPublishState,
  ]);

  const resetConversationDraft = useCallback(() => {
    messageLoadRequestRef.current += 1;
    clearConversationRuntime();
    setConversationId(undefined);
    setIsLoadingMessages(false);
  }, [clearConversationRuntime]);

  const loadConversation = useCallback(
    async (conversation: ChatConversationDTO) => {
      const requestId = messageLoadRequestRef.current + 1;
      messageLoadRequestRef.current = requestId;

      abortActiveStream();
      abortPendingUploads();
      clearAttachments();
      setConversationId(conversation.id);
      setIsLoadingMessages(true);
      setInput("");
      setError(null);
      setConversationMenu(null);
      setAgentId(conversation.agentId ?? "");
      setChatMode(toClientChatMode(conversation.mode, conversation.agentId));
      onResetScrollTracking();

      try {
        const json = await fetchConversationMessages(conversation.id);
        if (!json?.success || !json.data) {
          throw new Error("Failed to load conversation messages");
        }

        if (messageLoadRequestRef.current !== requestId) return;
        replaceMessages(json.data);
      } catch (err) {
        if (messageLoadRequestRef.current !== requestId) return;
        setError(
          err instanceof Error ? err.message : "Failed to load conversation messages"
        );
        replaceMessages([]);
      } finally {
        if (messageLoadRequestRef.current === requestId) {
          setIsLoadingMessages(false);
        }
      }
    },
    [
      abortActiveStream,
      abortPendingUploads,
      clearAttachments,
      onResetScrollTracking,
      replaceMessages,
    ]
  );

  useEffect(() => {
    fetchActiveAgents()
      .then((json) => {
        if (!json?.success || !json.data) {
          throw new Error(json?.error?.message || "Failed to load agents");
        }

        const items = json.data.items;
        const hasInitialAgent =
          queryAgentId && items.some((agent) => agent.id === queryAgentId);

        if (hasInitialAgent) {
          setChatMode("agent");
        }

        setAgents(items);
        setAgentId((current) => {
          if (current) return current;
          if (hasInitialAgent) return queryAgentId;
          return "";
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load agents");
      });
  }, [queryAgentId, queryMode]);

  useEffect(() => {
    void loadConversations().catch((err) => {
      setError(
        err instanceof Error ? err.message : "Failed to load conversations"
      );
    });
  }, [loadConversations]);

  useEffect(() => {
    if (!conversationMenu) return;

    const close = () => setConversationMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);

    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, [conversationMenu]);

  useEffect(() => {
    if (!queryConversationId) {
      if (conversationId) {
        const resetTimer = window.setTimeout(() => {
          resetConversationDraft();
        }, 0);
        return () => {
          window.clearTimeout(resetTimer);
        };
      }
      return;
    }

    if (queryConversationId === conversationId) {
      return;
    }

    const conversation = conversations.find(
      (item) => item.id === queryConversationId
    );
    if (conversation) {
      const loadTimer = window.setTimeout(() => {
        void loadConversation(conversation);
      }, 0);
      return () => {
        window.clearTimeout(loadTimer);
      };
    }

    loadConversations({ force: true })
      .then((items) => {
        const matchedConversation = items.find(
          (item) => item.id === queryConversationId
        );
        if (matchedConversation) {
          void loadConversation(matchedConversation);
        }
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load conversations"
        );
      });
  }, [
    conversationId,
    conversations,
    loadConversation,
    loadConversations,
    queryConversationId,
    resetConversationDraft,
  ]);

  const submitMessage = useCallback(async () => {
    const nextInput = input;
    const typedMessage = nextInput.trim();
    const readyAttachments = attachments.filter(
      (attachment) => attachment.status === "ready"
    );

    if ((!typedMessage && readyAttachments.length === 0) || loading) {
      return;
    }

    setInput("");
    await sendMessage(nextInput);
  }, [attachments, input, loading, sendMessage]);

  const startNewConversation = useCallback(async () => {
    if (loading) return;

    messageLoadRequestRef.current += 1;
    clearConversationRuntime();
    setIsLoadingMessages(false);
    setError(null);

    try {
      const { response, json } = await createConversationRequest({
        mode: "knowledge-agent",
      });

      if (!response.ok || !json?.success || !json.data) {
        throw new Error(json?.error?.message || "Failed to create conversation");
      }

      const conversation = json.data;
      upsertConversation(conversation);
      setAgentId(conversation.agentId ?? "");
      setChatMode(toClientChatMode(conversation.mode, conversation.agentId));
      router.push(`/agents/chat?conversationId=${conversation.id}`);
      refreshConversations();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create conversation"
      );
    }
  }, [
    clearConversationRuntime,
    loading,
    refreshConversations,
    router,
    upsertConversation,
  ]);

  const openConversation = useCallback(
    (conversation: ChatConversationDTO) => {
      if (loading) return;

      void loadConversation(conversation);
      router.push(`/agents/chat?conversationId=${conversation.id}`);
    },
    [loadConversation, loading, router]
  );

  const handleModelChange = useCallback(
    async (mode: ChatMode, nextAgentId?: string) => {
      const normalizedAgentId = mode === "agent" ? nextAgentId ?? "" : "";

      setChatMode(mode);
      setAgentId(normalizedAgentId);

      if (!conversationId) return;

      const currentConversation = conversations.find(
        (conversation) => conversation.id === conversationId
      );
      if (currentConversation) {
        upsertConversation({
          ...currentConversation,
          mode,
          agentId: normalizedAgentId || null,
        });
      }

      try {
        const { response, json } = await updateConversationModelRequest(
          conversationId,
          {
            mode,
            agentId: normalizedAgentId || null,
          }
        );

        if (!response.ok || !json?.success || !json.data) {
          throw new Error(
            json?.error?.message || "Failed to save conversation model"
          );
        }

        upsertConversation(json.data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to save conversation model"
        );
      }
    },
    [conversationId, conversations, upsertConversation]
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      if (loading) return;

      setConversationMenu(null);
      try {
        const { response, json } = await deleteConversationRequest(id);
        if (!response.ok || !json?.success) {
          throw new Error(
            json?.error?.message || "Failed to delete conversation"
          );
        }

        removeConversation(id);
        if (conversationId === id) {
          messageLoadRequestRef.current += 1;
          clearConversationRuntime();
          setConversationId(undefined);
          setIsLoadingMessages(false);
          router.push("/agents/chat");
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to delete conversation"
        );
      }
    },
    [clearConversationRuntime, conversationId, loading, removeConversation, router]
  );

  return {
    agents,
    agentId,
    attachments,
    chatMode,
    closeSkillPublishDialog,
    conversationId,
    conversationMenu,
    conversations,
    currentAgent,
    currentChatMode,
    deleteConversation,
    error,
    handleModelChange,
    hasUploadingAttachments,
    input,
    isLoadingMessages,
    loading,
    menuOpen,
    messages,
    openConversation,
    pendingSkillDraft,
    publishPendingSkillDraft,
    removeAttachment,
    setConversationMenu,
    setInput,
    setMenuOpen,
    skillPublishState,
    startNewConversation,
    stopMessage,
    submitMessage,
    uploadAttachments,
  };
}
