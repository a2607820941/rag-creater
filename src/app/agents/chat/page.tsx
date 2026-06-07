"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, PackageCheck, Plus, Sparkles, Trash2 } from "lucide-react";

import { AdminShell } from "@/components/layout/admin-shell";
import type { ChatConversationDTO, ChatSkillDraftSaved } from "@/features/chat/chat.types";
import { useAppStore } from "@/store";

import { ChatComposer } from "./_components/chat-composer";
import { ConversationSidebar } from "./_components/conversation-sidebar";
import { MessageBubble } from "./_components/message-bubble";
import { SkillPublishDialog } from "./_components/skill-publish-dialog";
import { useChatScroll } from "./_hooks/use-chat-scroll";
import { useTypingQueue } from "./_hooks/use-typing-queue";
import {
  createConversationRequest,
  deleteConversationRequest,
  fetchActiveAgents,
  fetchConversationMessages,
  publishSkillDraftRequest,
  startChatStream,
  updateConversationModelRequest,
  uploadChatAttachment,
} from "./_lib/chat-page-api";
import { CHAT_MODE_OPTIONS } from "./_lib/chat-constants";
import { readSseStream } from "./_lib/chat-sse";
import type {
  AgentItem,
  ChatComposerAttachment,
  ChatMode,
  ChatModeOption,
  SkillPublishState,
  UiMessage,
} from "./_lib/chat-types";
import {
  getFileType,
  getMimeType,
  isImageFileType,
  isSkillPublishCommand,
  toClientChatMode,
} from "./_lib/chat-page-utils";

const TYPING_DELAY_MIN_MS = 25;
const TYPING_DELAY_MAX_MS = 50;
const TYPING_CHUNK_CHAR_MIN = 1;
const TYPING_CHUNK_CHAR_MAX = 3;
const BOTTOM_SCROLL_THRESHOLD_PX = 60;
const OPEN_CONVERSATION_EVENT = "chat:open-conversation";
const CREATE_EMPTY_CONVERSATION_EVENT = "chat:create-empty-conversation";
const REFRESH_CONVERSATIONS_EVENT = "chat:refresh-conversations";

export default function AgentChatPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [agentId, setAgentId] = useState("");
  const [chatMode, setChatMode] = useState<ChatMode>("knowledge-agent");
  const [menuOpen, setMenuOpen] = useState(false);
  const [conversationMenu, setConversationMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ChatComposerAttachment[]>([]);
  const [pendingSkillDraft, setPendingSkillDraft] =
    useState<ChatSkillDraftSaved | null>(null);
  const [skillPublishState, setSkillPublishState] =
    useState<SkillPublishState>({ status: "idle" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const localMessageIdRef = useRef(0);
  const localUploadIdRef = useRef(0);
  const chatAbortRef = useRef<AbortController | null>(null);
  const uploadAbortControllersRef = useRef<Map<string, AbortController>>(
    new Map()
  );
  const conversations = useAppStore((state) => state.chatConversations);
  const loadConversations = useAppStore((state) => state.loadChatConversations);
  const setConversations = useAppStore((state) => state.setChatConversations);
  const upsertConversation = useAppStore(
    (state) => state.upsertChatConversation
  );
  const removeConversation = useAppStore(
    (state) => state.removeChatConversation
  );

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
  const hasUploadingAttachments = useMemo(
    () => attachments.some((attachment) => attachment.status === "uploading"),
    [attachments]
  );

  const appendAssistantText = useCallback((messageId: string, text: string) => {
    if (!text) return;

    startTransition(() => {
      setMessages((prev) =>
        prev.map((item) =>
          item.id === messageId
            ? { ...item, content: item.content + text }
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

  // eslint-disable-next-line react-hooks/incompatible-library -- React 19 rejects flushSync during virtual item measurement.
  const messageVirtualizer = useVirtualizer(
    {
      count: messages.length,
      getScrollElement: () => scrollContainerRef.current,
      estimateSize: () => 128,
      overscan: 6,
      getItemKey: (index) => messages[index]?.id ?? index,
      shouldAdjustScrollPositionOnItemSizeChange: () => false,
      useFlushSync: false,
    } as Parameters<typeof useVirtualizer>[0]
  );

  const scrollToLatest = useCallback(() => {
    if (messages.length === 0) return;

    messageVirtualizer.scrollToIndex(messages.length - 1, {
      align: "end",
    });
  }, [messageVirtualizer, messages.length]);

  const {
    handleMessageScroll,
    jumpToBottom,
    resetScrollTracking,
    scrollContainerRef,
    showScrollToBottom,
  } = useChatScroll({
    bottomThresholdPx: BOTTOM_SCROLL_THRESHOLD_PX,
    itemCount: messages.length,
    scrollToLatest,
  });

  const fetchConversations = useCallback(() => {
    loadConversations({ force: true })
      .then((items) => {
        setConversations(items);
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load conversations"
        );
      });
  }, [loadConversations, setConversations]);

  const loadConversationMessages = useCallback(async (id: string) => {
    const json = await fetchConversationMessages(id);
    if (!json?.success || !json.data) {
      throw new Error("Failed to load conversation messages");
    }

    setMessages(
      json.data.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        citations: message.citations,
        knowledgeFiles: message.knowledgeFiles,
      }))
    );
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialAgentId = params.get("agentId");
    const initialMode = params.get("mode");

    if (initialMode === "skill-agent") {
      setChatMode("skill-agent");
    }

    fetchActiveAgents()
      .then((json) => {
        if (!json?.success || !json.data) {
          throw new Error(json?.error?.message || "Failed to load agents");
        }

        const items = json.data.items;
        const hasInitialAgent =
          initialAgentId &&
          items.some((agent) => agent.id === initialAgentId);

        if (hasInitialAgent) {
          setChatMode("agent");
        }

        setAgents(items);
        setAgentId((current) => {
          if (current) return current;
          if (hasInitialAgent) return initialAgentId;
          return "";
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load agents");
      });
  }, []);

  useEffect(() => {
    const initialConversationId = new URLSearchParams(
      window.location.search
    ).get("conversationId");

    loadConversations()
      .then((items) => {
        if (!initialConversationId) return;

        const initialConversation = items.find(
          (conversation) => conversation.id === initialConversationId
        );
        if (initialConversation) {
          openConversation(initialConversation);
        }
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load conversations"
        );
      });
  }, [loadConversations]);

  useEffect(() => {
    function handleOpenConversation(event: Event) {
      const nextConversationId = (
        event as CustomEvent<{ conversationId?: string }>
      ).detail?.conversationId;
      if (!nextConversationId) return;

      const conversation = conversations.find(
        (item) => item.id === nextConversationId
      );
      if (conversation) {
        openConversation(conversation);
      }
    }

    window.addEventListener(OPEN_CONVERSATION_EVENT, handleOpenConversation);

    return () => {
      window.removeEventListener(
        OPEN_CONVERSATION_EVENT,
        handleOpenConversation
      );
    };
  }, [conversations]);

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

  function uploadAttachments(files: File[]) {
    if (loading) return;

    files.forEach((file) => {
      void uploadAttachment(file);
    });
  }

  async function uploadAttachment(file: File) {
    if (loading) return;

    setError(null);
    localUploadIdRef.current += 1;
    const localId = `upload-${localUploadIdRef.current}`;
    const abortController = new AbortController();
    uploadAbortControllersRef.current.set(localId, abortController);

    const fileType = getFileType(file.name);
    setAttachments((prev) => [
      ...prev,
      {
        localId,
        id: localId,
        fileName: file.name,
        mimeType: file.type || getMimeType(fileType),
        fileSize: file.size,
        fileType,
        kind: isImageFileType(fileType) ? "image" : "file",
        status: "uploading",
        textPreview: "",
        error: null,
      },
    ]);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const { response, json } = await uploadChatAttachment(
        formData,
        abortController.signal
      );

      if (!response.ok || !json?.success || !json.data) {
        throw new Error(json?.error?.message || "Attachment upload failed");
      }

      setAttachments((prev) =>
        prev.map((attachment) =>
          attachment.localId === localId
            ? { ...json.data!, localId }
            : attachment
        )
      );
    } catch (err) {
      if (
        abortController.signal.aborted ||
        (err instanceof Error && err.name === "AbortError")
      ) {
        setAttachments((prev) =>
          prev.filter((attachment) => attachment.localId !== localId)
        );
        return;
      }

      const messageText =
        err instanceof Error ? err.message : "Attachment upload failed";
      setError(err instanceof Error ? err.message : "Attachment upload failed");
      setAttachments((prev) =>
        prev.map((attachment) =>
          attachment.localId === localId
            ? { ...attachment, status: "failed", error: messageText }
            : attachment
        )
      );
    } finally {
      uploadAbortControllersRef.current.delete(localId);
    }
  }

  function removeAttachment(localId: string) {
    uploadAbortControllersRef.current.get(localId)?.abort();
    uploadAbortControllersRef.current.delete(localId);
    setAttachments((prev) => prev.filter((item) => item.localId !== localId));
  }

  const abortPendingUploads = useCallback(() => {
    uploadAbortControllersRef.current.forEach((controller) =>
      controller.abort()
    );
    uploadAbortControllersRef.current.clear();
  }, []);

  useEffect(() => {
    function handleCreateEmptyConversation(event: Event) {
      const conversation = (
        event as CustomEvent<{ conversation?: ChatConversationDTO }>
      ).detail?.conversation;
      if (!conversation) return;

      chatAbortRef.current?.abort();
      chatAbortRef.current = null;
      stopTypingSession();
      abortPendingUploads();
      upsertConversation(conversation);
      setConversationId(conversation.id);
      setMessages([]);
      setInput("");
      setAttachments([]);
      setError(null);
      setConversationMenu(null);
      setAgentId(conversation.agentId ?? "");
      setChatMode(toClientChatMode(conversation.mode, conversation.agentId));
      resetScrollTracking();
    }

    window.addEventListener(
      CREATE_EMPTY_CONVERSATION_EVENT,
      handleCreateEmptyConversation
    );

    return () => {
      window.removeEventListener(
        CREATE_EMPTY_CONVERSATION_EVENT,
        handleCreateEmptyConversation
      );
    };
  }, [
    abortPendingUploads,
    resetScrollTracking,
    stopTypingSession,
    upsertConversation,
  ]);

  useEffect(() => {
    return () => {
      chatAbortRef.current?.abort();
      abortPendingUploads();
      stopTypingSession();
    };
  }, [abortPendingUploads, stopTypingSession]);

  async function sendMessage() {
    const typedMessage = input.trim();
    const readyAttachments = attachments.filter(
      (attachment) => attachment.status === "ready"
    );
    if ((!typedMessage && readyAttachments.length === 0) || loading) return;

    if (
      chatMode === "skill-agent" &&
      pendingSkillDraft &&
      isSkillPublishCommand(typedMessage)
    ) {
      setInput("");
      await publishPendingSkillDraft();
      return;
    }

    setError(null);
    setLoading(true);
    stopTypingSession();
    const abortController = new AbortController();
    chatAbortRef.current = abortController;
    setInput("");
    resetScrollTracking();
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
              }
            : item
        )
      );
      if (chatAbortRef.current === abortController) {
        chatAbortRef.current = null;
      }
      setLoading(false);
      return;
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
          if (data.conversationId) setConversationId(data.conversationId);
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
        status: () => undefined,
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
          item.id === assistantMessage.id ? { ...item, pending: false } : item
        )
      );
      setAttachments([]);
      fetchConversations();
      window.dispatchEvent(new Event(REFRESH_CONVERSATIONS_EVENT));
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
                }
              : item
          )
        );
        return;
      }

      const messageText = err instanceof Error ? err.message : "Chat failed";
      stopTypingSession();
      setError(messageText);
      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantMessage.id
            ? {
                ...item,
                content: `Request failed: ${messageText}`,
                pending: false,
              }
            : item
        )
      );
    } finally {
      if (chatAbortRef.current === abortController) {
        chatAbortRef.current = null;
      }
      setLoading(false);
    }
  }

  function stopMessage() {
    chatAbortRef.current?.abort();
    stopTypingSession();
  }

  function resetConversationDraft() {
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    stopTypingSession();
    abortPendingUploads();
    setLoading(false);
    setConversationId(undefined);
    setMessages([]);
    setAttachments([]);
    setError(null);
    resetScrollTracking();
  }

  async function startNewConversation() {
    if (loading) return;

    resetConversationDraft();
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
      setConversationId(conversation.id);
      setAgentId(conversation.agentId ?? "");
      setChatMode(toClientChatMode(conversation.mode, conversation.agentId));
      router.push(`/agents/chat?conversationId=${conversation.id}`);
      window.dispatchEvent(new Event(REFRESH_CONVERSATIONS_EVENT));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create conversation"
      );
    }
  }

  function openConversation(conversation: ChatConversationDTO) {
    if (loading) return;

    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    stopTypingSession();
    abortPendingUploads();
    setConversationId(conversation.id);
    setMessages([]);
    setInput("");
    setAttachments([]);
    setError(null);
    setConversationMenu(null);
    setAgentId(conversation.agentId ?? "");
    setChatMode(toClientChatMode(conversation.mode, conversation.agentId));
    resetScrollTracking();
    void loadConversationMessages(conversation.id).catch(() => {
      setError("Failed to load conversation messages");
    });
  }

  async function handleModelChange(mode: ChatMode, nextAgentId?: string) {
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
  }

  async function deleteConversation(id: string) {
    if (loading) return;

    setConversationMenu(null);
    try {
      const { response, json } = await deleteConversationRequest(id);
      if (!response.ok || !json?.success) {
        throw new Error(json?.error?.message || "Failed to delete conversation");
      }

      removeConversation(id);
      if (conversationId === id) {
        resetConversationDraft();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete conversation"
      );
    }
  }

  async function publishPendingSkillDraft() {
    if (!pendingSkillDraft || skillPublishState.status === "publishing") return;

    setError(null);
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
      setError(messageText);
      setSkillPublishState({ status: "idle" });
    }
  }

  function closeSkillPublishDialog() {
    setPendingSkillDraft(null);
    setSkillPublishState({ status: "idle" });
  }

  const sidebarContent = (
    <ConversationSidebar
      conversations={conversations}
      activeConversationId={conversationId}
      loading={loading}
      onNewConversation={startNewConversation}
      onOpenConversation={openConversation}
      onOpenMenu={(id, x, y) => setConversationMenu({ id, x, y })}
    />
  );

  return (
    <AdminShell sidebarContent={sidebarContent}>
      <div className="flex h-[calc(100dvh-6.5rem)] min-h-[520px] overflow-hidden bg-[#f7faf8] text-slate-950">
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.13),transparent_55%)]" />

          {messages.length > 0 && (
            <header className="relative shrink-0 border-b border-slate-200/80 bg-white/85 px-4 py-3 shadow-sm backdrop-blur md:px-8">
              <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-md bg-emerald-700 text-white shadow-sm">
                    <Sparkles aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      Embark Chat
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {currentChatMode.label}
                      {currentAgent ? ` / ${currentAgent.name}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href="/skills"
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <PackageCheck aria-hidden="true" className="size-4" />
                    Skill 管理
                  </Link>
                  <button
                    type="button"
                    onClick={startNewConversation}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <Plus aria-hidden="true" />
                    New
                  </button>
                </div>
              </div>
            </header>
          )}

          {messages.length === 0 ? (
            <section className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-10 md:px-8">
              <div className="flex w-full max-w-4xl flex-col items-center gap-9">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="flex size-12 items-center justify-center rounded-md bg-emerald-700 text-white shadow-lg shadow-emerald-900/15">
                    <Sparkles aria-hidden="true" />
                  </div>
                  <h1 className="text-3xl font-semibold tracking-normal text-slate-950 md:text-4xl">
                    Ask Embark anything
                  </h1>
                  {chatMode === "skill-agent" && (
                    <Link
                      href="/skills"
                      className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      <PackageCheck aria-hidden="true" className="size-4" />
                      Skill 管理
                    </Link>
                  )}
                </div>

                <ChatComposer
                  value={input}
                  attachments={attachments}
                  loading={loading}
                  hasUploadingAttachments={hasUploadingAttachments}
                  error={error}
                  menuOpen={menuOpen}
                  currentChatMode={currentChatMode}
                  chatMode={chatMode}
                  agents={agents}
                  agentId={agentId}
                  onValueChange={setInput}
                  onSubmit={sendMessage}
                  onStop={stopMessage}
                  onUploadAttachments={uploadAttachments}
                  onRemoveAttachment={removeAttachment}
                  onMenuOpenChange={setMenuOpen}
                  onModelChange={(mode, nextAgentId) => {
                    void handleModelChange(mode, nextAgentId);
                  }}
                />
              </div>
            </section>
          ) : (
            <>
              <section
                ref={scrollContainerRef}
                onScroll={handleMessageScroll}
                className="relative min-h-0 flex-1 overflow-y-auto px-4 py-7 md:px-8"
              >
                <div className="mx-auto max-w-5xl">
                  <div
                    className="relative w-full"
                    style={{
                      height: `${messageVirtualizer.getTotalSize()}px`,
                    }}
                  >
                    {messageVirtualizer.getVirtualItems().map((virtualItem) => {
                      const message = messages[virtualItem.index];
                      if (!message) return null;

                      return (
                        <div
                          key={virtualItem.key}
                          ref={messageVirtualizer.measureElement}
                          data-index={virtualItem.index}
                          className="absolute left-0 top-0 w-full py-2"
                          style={{
                            transform: `translateY(${virtualItem.start}px)`,
                          }}
                        >
                          <MessageBubble message={message} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              {showScrollToBottom && (
                <div className="pointer-events-none absolute inset-x-0 bottom-28 z-10 flex justify-center px-4 md:px-8">
                  <div className="pointer-events-auto mx-auto flex w-full max-w-5xl justify-end">
                    <button
                      type="button"
                      onClick={jumpToBottom}
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-lg shadow-slate-900/10 hover:bg-slate-50"
                    >
                      <ArrowDown aria-hidden="true" className="size-4" />
                      回到底部
                    </button>
                  </div>
                </div>
              )}

              <footer className="relative shrink-0 px-4 pb-1 md:px-8">
                <div className="mx-auto max-w-5xl">
                  <ChatComposer
                    compact
                    value={input}
                    attachments={attachments}
                    loading={loading}
                    hasUploadingAttachments={hasUploadingAttachments}
                    error={error}
                    menuOpen={menuOpen}
                    currentChatMode={currentChatMode}
                    chatMode={chatMode}
                    agents={agents}
                    agentId={agentId}
                    onValueChange={setInput}
                    onSubmit={sendMessage}
                    onStop={stopMessage}
                    onUploadAttachments={uploadAttachments}
                    onRemoveAttachment={removeAttachment}
                    onMenuOpenChange={setMenuOpen}
                    onModelChange={(mode, nextAgentId) => {
                      void handleModelChange(mode, nextAgentId);
                    }}
                  />
                </div>
              </footer>
            </>
          )}
        </main>

        {conversationMenu && (
          <div
            className="fixed z-50 min-w-32 rounded-md border border-slate-200 bg-white p-1 text-sm shadow-xl shadow-slate-900/10"
            style={{ left: conversationMenu.x, top: conversationMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => deleteConversation(conversationMenu.id)}
              disabled={loading}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 aria-hidden="true" className="size-4" />
              Delete
            </button>
          </div>
        )}
        <SkillPublishDialog
          draft={pendingSkillDraft}
          state={skillPublishState}
          onPublish={publishPendingSkillDraft}
          onClose={closeSkillPublishDialog}
        />
      </div>
    </AdminShell>
  );
}

