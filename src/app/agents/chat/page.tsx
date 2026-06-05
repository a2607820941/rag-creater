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
          throw new Error(json.error?.message || "Failed to load conversations");
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
      const json = (await res.json().catch(() => null)) as
        | ChatAttachmentResponse
        | null;

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
      const attachmentIds = readyAttachments.map((attachment) => attachment.id);
      const res = await fetch("/api/chat", {
        method: "POST",
        signal: abortController.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          conversationId,
          ...(agentId ? { agentId } : {}),
          chatMode,
          llmInterface: "openai",
          attachmentIds,
        }),
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
        throw new Error(json?.error?.message || "Failed to delete conversation");
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
                      Embark Chat
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {currentChatMode.label}
                      {currentAgent ? ` / ${currentAgent.name}` : ""}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={startNewConversation}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <Plus aria-hidden="true" />
                  New
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
                    Ask Embark anything
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

function isSkillPublishCommand(message: string) {
  return /^(publish|publish skill|发布|确认发布)$/i.test(message.trim());
}

function getFileType(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase().trim();
  return extension || "file";
}

function isImageFileType(fileType: string) {
  return ["png", "jpg", "jpeg", "webp", "bmp"].includes(fileType);
}

function getMimeType(fileType: string) {
  if (fileType === "jpg") return "image/jpeg";
  if (isImageFileType(fileType)) return `image/${fileType}`;
  return "application/octet-stream";
}

function toClientChatMode(mode: string, agentId: string | null): ChatMode {
  if (agentId || mode === "agent") return "agent";
  if (mode === "skill-agent") return "skill-agent";
  if (mode === "openai") return "openai";
  if (mode === "rag-openai") return "rag-openai";
  return "knowledge-agent";
}
