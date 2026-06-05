"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Plus, Sparkles, Trash2 } from "lucide-react";

import { AdminShell } from "@/components/layout/admin-shell";
import type {
  ChatConversationDTO,
  ChatMessageDTO,
  ChatSkillDraftSaved,
} from "@/features/chat/chat.types";

import { ChatComposer } from "./_components/chat-composer";
import { ConversationSidebar } from "./_components/conversation-sidebar";
import { MessageBubble } from "./_components/message-bubble";
import { SkillPublishDialog } from "./_components/skill-publish-dialog";
import { CHAT_MODE_OPTIONS } from "./_lib/chat-constants";
import { readSseStream } from "./_lib/chat-sse";
import type {
  AgentItem,
  ChatAttachmentDTO,
  ChatComposerAttachment,
  ChatMode,
  ChatModeOption,
  SkillPublishResponse,
  SkillPublishState,
  UiMessage,
} from "./_lib/chat-types";

type AgentListResponse = {
  success: boolean;
  data?: {
    items: AgentItem[];
  };
  error?: {
    message?: string;
  };
};

type MessageListResponse = {
  success: boolean;
  data?: ChatMessageDTO[];
};

type ConversationListResponse = {
  success: boolean;
  data?: {
    items: ChatConversationDTO[];
  };
  error?: {
    message?: string;
  };
};

type ChatAttachmentResponse = {
  success: boolean;
  data?: ChatAttachmentDTO;
  error?: {
    message?: string;
  };
};

<<<<<<< HEAD
const CHAT_MODE_OPTIONS: Array<{
  value: ChatMode;
  label: string;
  hint: string;
}> = [
  {
    value: "knowledge-agent",
    label: "Knowledge Agent",
    hint: "知识库消费助手",
  },
  { value: "agent", label: "Agent", hint: "角色对话" },
  { value: "openai", label: "OpenAI", hint: "直接问模型" },
];

const AGENT_MENU_ITEM_HEIGHT = 56;
const AGENT_MENU_VISIBLE_COUNT = 4;
const AGENT_MENU_MAX_HEIGHT = AGENT_MENU_ITEM_HEIGHT * AGENT_MENU_VISIBLE_COUNT;

=======
>>>>>>> 983f3dd (feat:实现了skill的生成和上下文压缩)
export default function AgentChatPage() {
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [conversations, setConversations] = useState<ChatConversationDTO[]>([]);
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
  const scrollContainerRef = useRef<HTMLElement>(null);
  const localMessageIdRef = useRef(0);
  const localUploadIdRef = useRef(0);
  const shouldAutoScrollRef = useRef(true);
  const chatAbortRef = useRef<AbortController | null>(null);
  const uploadAbortControllersRef = useRef<Map<string, AbortController>>(
    new Map()
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

  // eslint-disable-next-line react-hooks/incompatible-library -- React 19 rejects flushSync during virtual item measurement.
  const messageVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 128,
    overscan: 6,
    getItemKey: (index) => messages[index]?.id ?? index,
    useFlushSync: false,
  });

  const fetchConversations = useCallback(() => {
    fetch("/api/conversations?pageSize=100")
      .then((res) => res.json())
      .then((json: ConversationListResponse) => {
        if (!json.success || !json.data) {
          throw new Error(
            json.error?.message || "Failed to load conversations"
          );
        }
        setConversations(json.data.items);
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load conversations"
        );
      });
  }, []);

  const fetchConversationMessages = useCallback((id: string) => {
    fetch(`/api/conversations/${id}/messages`)
      .then((res) => res.json())
      .then((json: MessageListResponse) => {
        if (json.success && json.data) {
          setMessages(
            json.data.map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
              citations: message.citations,
              knowledgeFiles: message.knowledgeFiles,
            }))
          );
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const initialAgentId = new URLSearchParams(window.location.search).get(
      "agentId"
    );

    fetch("/api/agents?status=active&pageSize=100")
      .then((res) => res.json())
      .then((json: AgentListResponse) => {
        if (!json.success || !json.data) {
          throw new Error(json.error?.message || "Failed to load agents");
        }

        const items = json.data.items;
        const hasInitialAgent =
          initialAgentId && items.some((agent) => agent.id === initialAgentId);

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
    fetchConversations();
  }, [fetchConversations]);

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
    if (!shouldAutoScrollRef.current || messages.length === 0) return;

    const frame = window.requestAnimationFrame(() => {
      messageVirtualizer.scrollToIndex(messages.length - 1, {
        align: "end",
      });

      const container = scrollContainerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages, messageVirtualizer]);

  function handleMessageScroll() {
    const container = scrollContainerRef.current;
    if (!container) return;

    const distanceToBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldAutoScrollRef.current = distanceToBottom < 120;
  }

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

      const res = await fetch("/api/chat/attachments", {
        method: "POST",
        signal: abortController.signal,
        body: formData,
      });
      const json = (await res
        .json()
        .catch(() => null)) as ChatAttachmentResponse | null;

      if (!res.ok || !json?.success || !json.data) {
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

  function abortPendingUploads() {
    uploadAbortControllersRef.current.forEach((controller) =>
      controller.abort()
    );
    uploadAbortControllersRef.current.clear();
  }

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
    const abortController = new AbortController();
    chatAbortRef.current = abortController;
    setInput("");
    shouldAutoScrollRef.current = true;
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
    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    if (chatMode === "agent" && !agentId) {
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
<<<<<<< HEAD
      const endpoint =
        chatMode === "agent" && agentId
          ? `/api/agents/${agentId}/chat`
          : "/api/chat";
      const attachmentIds = attachments
        .filter((attachment) => attachment.status === "ready")
        .map((attachment) => attachment.id);
      const res = await fetch(endpoint, {
=======
      const attachmentIds = readyAttachments.map((attachment) => attachment.id);
      const res = await fetch("/api/chat", {
>>>>>>> 983f3dd (feat:实现了skill的生成和上下文压缩)
        method: "POST",
        signal: abortController.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          chatMode === "agent" && agentId
            ? {
                message,
                conversationId,
                llmInterface: "openai",
              }
            : {
                message,
                conversationId,
                ...(agentId ? { agentId } : {}),
                chatMode,
                llmInterface: "openai",
                attachmentIds,
              }
        ),
      });

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message || "Chat request failed");
      }

      await readSseStream(res.body, {
        meta: (data) => {
          if (data.conversationId) setConversationId(data.conversationId);
        },
        token: (token) => {
          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantMessage.id
                ? { ...item, content: item.content + token }
                : item
            )
          );
        },
        citations: (citations) => {
          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantMessage.id ? { ...item, citations } : item
            )
          );
        },
<<<<<<< HEAD
        status: (status) => {
          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantMessage.id
                ? { ...item, streamStatus: status.status }
                : item
            )
          );
        },
        ragSummary: (ragSummary) => {
          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantMessage.id ? { ...item, ragSummary } : item
            )
          );
        },
=======
        status: () => undefined,
        trace: () => undefined,
>>>>>>> 983f3dd (feat:实现了skill的生成和上下文压缩)
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

      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantMessage.id ? { ...item, pending: false } : item
        )
      );
      setAttachments([]);
      fetchConversations();
    } catch (err) {
      if (
        abortController.signal.aborted ||
        (err instanceof Error && err.name === "AbortError")
      ) {
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
  }

  function startNewConversation() {
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    abortPendingUploads();
    setLoading(false);
    setConversationId(undefined);
    setMessages([]);
    setAttachments([]);
    setError(null);
    shouldAutoScrollRef.current = true;
  }

  function openConversation(conversation: ChatConversationDTO) {
    if (loading) return;

    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    abortPendingUploads();
    setConversationId(conversation.id);
    setMessages([]);
    setInput("");
    setAttachments([]);
    setError(null);
    setConversationMenu(null);
    setAgentId(conversation.agentId ?? "");
    setChatMode(toClientChatMode(conversation.mode, conversation.agentId));
    fetchConversationMessages(conversation.id);
    shouldAutoScrollRef.current = true;
  }

  async function deleteConversation(id: string) {
    if (loading) return;

    setConversationMenu(null);
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(
          json?.error?.message || "Failed to delete conversation"
        );
      }

      setConversations((prev) => prev.filter((item) => item.id !== id));
      if (conversationId === id) {
        startNewConversation();
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
      const res = await fetch(pendingSkillDraft.publishEndpoint, {
        method: "POST",
      });
      const json = (await res.json().catch(() => null)) as
        | SkillPublishResponse
        | null;

      if (!res.ok || !json?.success || !json.data) {
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
<<<<<<< HEAD
                      Embark 知识助手
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {currentChatMode.label}
                      {currentAgent ? ` · ${currentAgent.name}` : ""}
=======
                      Embark Chat
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {currentChatMode.label}
                      {currentAgent ? ` / ${currentAgent.name}` : ""}
>>>>>>> 983f3dd (feat:实现了skill的生成和上下文压缩)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={startNewConversation}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <Plus aria-hidden="true" />
<<<<<<< HEAD
                  新对话
=======
                  New
>>>>>>> 983f3dd (feat:实现了skill的生成和上下文压缩)
                </button>
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
<<<<<<< HEAD
                    Hi，我是 Embark，让你的知识触手可及
=======
                    Ask Embark anything
>>>>>>> 983f3dd (feat:实现了skill的生成和上下文压缩)
                  </h1>
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
                  onModeChange={setChatMode}
                  onAgentChange={setAgentId}
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

              <footer className="relative shrink-0 px-4 pb-1 md:px-8">
                <div className="mx-auto max-w-5xl">
                  <ChatComposer
                    compact
                    value={input}
                    attachments={attachments}
                    loading={loading}
<<<<<<< HEAD
                    uploadingAttachment={uploadingAttachment}
=======
                    hasUploadingAttachments={hasUploadingAttachments}
>>>>>>> 983f3dd (feat:实现了skill的生成和上下文压缩)
                    error={error}
                    menuOpen={menuOpen}
                    currentChatMode={currentChatMode}
                    chatMode={chatMode}
                    agents={agents}
                    agentId={agentId}
                    onValueChange={setInput}
                    onSubmit={sendMessage}
                    onStop={stopMessage}
<<<<<<< HEAD
                    onUploadAttachment={uploadAttachment}
=======
                    onUploadAttachments={uploadAttachments}
>>>>>>> 983f3dd (feat:实现了skill的生成和上下文压缩)
                    onRemoveAttachment={removeAttachment}
                    onMenuOpenChange={setMenuOpen}
                    onModeChange={setChatMode}
                    onAgentChange={setAgentId}
                  />
                </div>
              </footer>
            </>
          )}
        </main>
<<<<<<< HEAD
=======

>>>>>>> 983f3dd (feat:实现了skill的生成和上下文压缩)
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
<<<<<<< HEAD
=======
        <SkillPublishDialog
          draft={pendingSkillDraft}
          state={skillPublishState}
          onPublish={publishPendingSkillDraft}
          onClose={closeSkillPublishDialog}
        />
>>>>>>> 983f3dd (feat:实现了skill的生成和上下文压缩)
      </div>
    </AdminShell>
  );
}

<<<<<<< HEAD
function ConversationSidebar({
  conversations,
  activeConversationId,
  loading,
  onNewConversation,
  onOpenConversation,
  onOpenMenu,
}: {
  conversations: ChatConversationDTO[];
  activeConversationId?: string;
  loading: boolean;
  onNewConversation: () => void;
  onOpenConversation: (conversation: ChatConversationDTO) => void;
  onOpenMenu: (id: string, x: number, y: number) => void;
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-1 py-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-sidebar-foreground">
            Conversations
          </p>
          <p className="truncate text-xs text-sidebar-foreground/60">
            {conversations.length} saved
          </p>
        </div>
        <button
          type="button"
          onClick={onNewConversation}
          disabled={loading}
          title="New conversation"
          aria-label="New conversation"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-700 text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-100 disabled:text-emerald-300"
        >
          <Plus aria-hidden="true" className="size-4" />
        </button>
      </div>

      <div className="mt-2 min-h-0 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="px-2 py-5 text-center text-xs leading-5 text-sidebar-foreground/60">
            No saved conversations yet.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {conversations.map((conversation) => {
              const active = conversation.id === activeConversationId;
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => onOpenConversation(conversation)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onOpenMenu(conversation.id, event.clientX, event.clientY);
                  }}
                  disabled={loading}
                  className={`group grid w-full grid-cols-[auto_1fr] gap-2 rounded-md px-2 py-2 text-left transition-colors ${
                    active
                      ? "bg-emerald-50 text-emerald-900"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span
                    className={`mt-0.5 inline-flex size-7 items-center justify-center rounded-md ${
                      active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-sidebar-accent text-sidebar-foreground/70"
                    }`}
                  >
                    <MessageSquare aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {conversation.title || "New conversation"}
                    </span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-sidebar-foreground/60">
                      <span className="truncate">{conversation.mode}</span>
                      <span aria-hidden="true">/</span>
                      <span className="shrink-0">
                        {formatConversationTime(conversation.updatedAt)}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatComposer({
  value,
  attachments,
  loading,
  uploadingAttachment,
  error,
  menuOpen,
  currentChatMode,
  chatMode,
  agents,
  agentId,
  compact = false,
  onValueChange,
  onSubmit,
  onStop,
  onUploadAttachment,
  onRemoveAttachment,
  onMenuOpenChange,
  onModeChange,
  onAgentChange,
}: {
  value: string;
  attachments: ChatAttachment[];
  loading: boolean;
  uploadingAttachment: boolean;
  error: string | null;
  menuOpen: boolean;
  currentChatMode: { value: ChatMode; label: string; hint: string };
  chatMode: ChatMode;
  agents: AgentItem[];
  agentId: string;
  compact?: boolean;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onUploadAttachment: (file: File) => void;
  onRemoveAttachment: (id: string) => void;
  onMenuOpenChange: (open: boolean) => void;
  onModeChange: (mode: ChatMode) => void;
  onAgentChange: (id: string) => void;
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const agentMenuScrollRef = useRef<HTMLDivElement>(null);
  const currentAgent = agents.find((agent) => agent.id === agentId);
  const modeButtonLabel =
    chatMode === "agent" && currentAgent
      ? currentAgent.name
      : currentChatMode.label;
  const agentMenuItems = useMemo(
    () => [
      {
        key: "mode:knowledge-agent",
        type: "mode" as const,
        mode: "knowledge-agent" as const,
        label: "Knowledge Agent",
        hint: CHAT_MODE_OPTIONS[0].hint,
      },
      {
        key: "mode:openai",
        type: "mode" as const,
        mode: "openai" as const,
        label: "OpenAI",
        hint: CHAT_MODE_OPTIONS[2].hint,
      },
      {
        key: "mode:skill-agent",
        type: "mode" as const,
        mode: "skill-agent" as const,
        label: "Skill Agent",
        hint: "Create API Skill",
      },
      ...agents.map((agent) => ({
        key: `agent:${agent.id}`,
        type: "agent" as const,
        agentId: agent.id,
        label: agent.name,
        hint: agent.description || "角色对话",
      })),
    ],
    [agents]
  );
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual keeps long Agent menus lightweight.
  const agentMenuVirtualizer = useVirtualizer({
    count: agentMenuItems.length,
    getScrollElement: () => agentMenuScrollRef.current,
    estimateSize: () => AGENT_MENU_ITEM_HEIGHT,
    overscan: 6,
    getItemKey: (index) => agentMenuItems[index]?.key ?? index,
  });
  const agentMenuHeight = Math.min(
    agentMenuItems.length * AGENT_MENU_ITEM_HEIGHT,
    AGENT_MENU_MAX_HEIGHT
  );

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onUploadAttachment(file);
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {error && (
        <p className="rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div
        className={`rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-900/10 ${
          compact ? "p-3" : "p-4"
        }`}
      >
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/bmp"
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.csv,.xlsx,.docx,.pdf"
          className="hidden"
          onChange={handleFileChange}
        />

        {(attachments.length > 0 || uploadingAttachment) && (
          <div className="mb-3 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <AttachmentChip
                key={attachment.id}
                attachment={attachment}
                onRemove={() => onRemoveAttachment(attachment.id)}
              />
            ))}
            {uploadingAttachment && (
              <div className="inline-flex max-w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <Loader2 className="animate-spin" aria-hidden="true" />
                <span>附件解析中...</span>
              </div>
            )}
          </div>
        )}

        <textarea
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder="直接向模型提问"
          className={`w-full resize-none border-0 bg-transparent text-base leading-7 text-slate-900 outline-none placeholder:text-slate-400 ${
            compact ? "min-h-16" : "min-h-28"
          }`}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                aria-expanded={menuOpen}
                onClick={() => onMenuOpenChange(!menuOpen)}
                disabled={loading}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                <span className="max-w-36 truncate">{modeButtonLabel}</span>
                <ChevronDown aria-hidden="true" />
              </button>
              {menuOpen && (
                <div className="absolute bottom-11 left-0 z-20 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
                  <div
                    ref={agentMenuScrollRef}
                    className="min-h-0 overflow-y-scroll"
                    style={{ height: agentMenuHeight }}
                  >
                    <div
                      className="relative w-full"
                      style={{
                        height: `${agentMenuVirtualizer.getTotalSize()}px`,
                      }}
                    >
                      {agentMenuVirtualizer
                        .getVirtualItems()
                        .map((virtualItem) => {
                          const item = agentMenuItems[virtualItem.index];
                          if (!item) return null;

                          const active =
                            item.type === "agent"
                              ? chatMode === "agent" && item.agentId === agentId
                              : chatMode === item.mode;

                          return (
                            <div
                              key={virtualItem.key}
                              className="absolute left-0 top-0 flex w-full items-center"
                              style={{
                                height: `${virtualItem.size}px`,
                                transform: `translateY(${virtualItem.start}px)`,
                              }}
                            >
                              <ModeMenuButton
                                active={active}
                                label={item.label}
                                hint={item.hint}
                                onClick={() => {
                                  if (item.type === "agent") {
                                    onModeChange("agent");
                                    onAgentChange(item.agentId);
                                  } else {
                                    onModeChange(item.mode);
                                    onAgentChange("");
                                  }
                                  onMenuOpenChange(false);
                                }}
                              />
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <IconToolButton
              label="上传图片"
              disabled={loading || uploadingAttachment}
              onClick={() => imageInputRef.current?.click()}
            >
              <ImageIcon aria-hidden="true" />
            </IconToolButton>
            <IconToolButton
              label="上传文件"
              disabled={loading || uploadingAttachment}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip aria-hidden="true" />
            </IconToolButton>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            {loading ? (
              <button
                type="button"
                onClick={onStop}
                disabled={uploadingAttachment}
                aria-label="停止生成"
                className="inline-flex size-9 items-center justify-center rounded-md bg-slate-900 text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300"
              >
                <Square aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={!value.trim() || uploadingAttachment}
                aria-label="发送"
                className="inline-flex size-9 items-center justify-center rounded-md bg-emerald-700 text-white shadow-sm shadow-emerald-900/15 hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-50 disabled:text-emerald-200"
              >
                <Send aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
=======
function isSkillPublishCommand(message: string) {
  return /^(publish|publish skill|发布|确认发布)$/i.test(message.trim());
}

function getFileType(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase().trim();
  return extension || "file";
>>>>>>> 983f3dd (feat:实现了skill的生成和上下文压缩)
}

function isImageFileType(fileType: string) {
  return ["png", "jpg", "jpeg", "webp", "bmp"].includes(fileType);
}

<<<<<<< HEAD
function IconToolButton({
  label,
  children,
  disabled,
  onClick,
}: {
  label: string;
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: ChatAttachment;
  onRemove: () => void;
}) {
  const Icon = attachment.kind === "image" ? ImageIcon : FileText;
  const statusText =
    attachment.status === "ready"
      ? "已解析"
      : attachment.status === "failed"
      ? "解析失败"
      : "解析中";

  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
      <Icon aria-hidden="true" />
      <div className="min-w-0">
        <div className="max-w-44 truncate font-medium">
          {attachment.fileName}
        </div>
        <div className="max-w-44 truncate text-slate-500">
          {statusText}
          {attachment.textPreview ? ` · ${attachment.textPreview}` : ""}
        </div>
      </div>
      <button
        type="button"
        aria-label="移除附件"
        onClick={onRemove}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700"
      >
        <X aria-hidden="true" />
      </button>
    </div>
  );
}

function MessageBubble({ message }: { message: UiMessage }) {
  const isUser = message.role === "user";
  const pendingText = getStreamStatusLabel(message.streamStatus);

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-md bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200">
          <Bot aria-hidden="true" />
        </div>
      )}
      <div
        className={`max-w-[min(760px,82%)] rounded-lg px-4 py-3 text-sm leading-7 shadow-sm ${
          isUser
            ? "bg-emerald-700 text-white shadow-emerald-900/15"
            : "border border-slate-200 bg-white text-slate-800"
        }`}
      >
        <div className="whitespace-pre-wrap break-words">
          {message.content || (message.pending ? pendingText : "")}
        </div>
        {!isUser &&
          message.knowledgeFiles &&
          message.knowledgeFiles.length > 0 && (
            <KnowledgeFilesNotice files={message.knowledgeFiles} />
          )}
        {!isUser && <RagHitNotice summary={message.ragSummary} />}
        {!isUser && message.citations.length > 0 && (
          <CitationSources citations={message.citations} />
        )}
      </div>
      {isUser && (
        <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-md bg-emerald-700 text-white shadow-sm">
          <User aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

function getStreamStatusLabel(status?: ChatStreamStatus) {
  if (status === "retrieving") return "正在检索知识库...";
  if (status === "organizing") return "正在组织回答...";
  if (status === "reading-documents") return "正在读取导入文档...";
  if (status === "generating") return "正在生成...";
  if (status === "stopped") return "已停止生成";
  if (status === "failed") return "生成失败";
  return "正在生成...";
}

function KnowledgeFilesNotice({ files }: { files: KnowledgeFile[] }) {
  return (
    <div className="mt-3 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
      <div className="mb-1 flex items-center gap-2 font-medium">
        <FileText aria-hidden="true" />
        <span>已读取导入文档 {files.length} 个</span>
      </div>
      <div className="flex flex-col gap-1 text-emerald-700">
        {files.map((file) => (
          <span key={file.id} className="truncate">
            {file.title} · {file.chunkCount} 段
          </span>
        ))}
      </div>
    </div>
  );
}

function RagHitNotice({ summary }: { summary?: RagSummary }) {
  if (
    !summary ||
    summary.status === "not-applicable" ||
    summary.status === "skipped"
  ) {
    return null;
  }

  const isHit = summary.status === "hit";

  return (
    <div
      className={`mt-3 rounded-md border px-3 py-2 text-xs ${
        isHit
          ? "border-emerald-100 bg-emerald-50 text-emerald-800"
          : "border-amber-100 bg-amber-50 text-amber-800"
      }`}
    >
      {isHit
        ? `已基于 ${summary.citationCount} 条知识来源回答`
        : "未检索到相关知识，以下为模型直接回答"}
    </div>
  );
}

function CitationSources({ citations }: { citations: ChatCitation[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleCitations = expanded ? citations : citations.slice(0, 3);
  const hiddenCount = Math.max(citations.length - visibleCitations.length, 0);

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-emerald-700">
          引用来源 {citations.length} 条
        </p>
        {citations.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            {expanded ? "收起" : `展开 ${hiddenCount} 条`}
            <ChevronDown
              aria-hidden="true"
              className={
                expanded
                  ? "rotate-180 transition-transform"
                  : "transition-transform"
              }
            />
          </button>
        )}
      </div>

      {visibleCitations.map((citation) => (
        <div
          key={`${citation.refId}-${citation.chunkId}`}
          className="rounded-md bg-emerald-50/70 p-3 text-xs text-slate-600"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate font-medium text-slate-900">
              [{citation.refId}] {citation.title}
            </span>
            <span className="shrink-0 text-slate-500">
              {citation.score.toFixed(2)}
            </span>
          </div>
          <p className="mt-1 line-clamp-2">
            {summarizeCitationContent(citation.content)}
          </p>
        </div>
      ))}
    </div>
  );
}

function summarizeCitationContent(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return "暂无摘要";

  if (normalized.startsWith("{") || normalized.startsWith("[")) {
    const values = Array.from(
      normalized.matchAll(
        /"(?:value|name|displayName|title|dataField)"\s*:\s*"([^"]{1,80})"/g
      )
    )
      .map((match) => match[1])
      .filter((value, index, array) => value && array.indexOf(value) === index)
      .slice(0, 4);

    return values.length > 0
      ? `结构化数据片段：${values.join("、")}`
      : "结构化数据片段，已隐藏原始 JSON 内容";
  }

  return normalized.length > 180
    ? `${normalized.slice(0, 180)}...`
    : normalized;
=======
function getMimeType(fileType: string) {
  if (fileType === "jpg") return "image/jpeg";
  if (isImageFileType(fileType)) return `image/${fileType}`;
  return "application/octet-stream";
>>>>>>> 983f3dd (feat:实现了skill的生成和上下文压缩)
}

function toClientChatMode(mode: string, agentId: string | null): ChatMode {
  if (agentId || mode === "agent") return "agent";
  if (mode === "skill-agent") return "skill-agent";
  if (mode === "openai") return "openai";
  if (mode === "rag-openai") return "rag-openai";
  return "knowledge-agent";
}
