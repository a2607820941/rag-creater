"use client";

import {
  useEffect,
  useMemo,
  useRef,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronDown,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Send,
  Square,
  X,
} from "lucide-react";

import {
  AGENT_MENU_ITEM_HEIGHT,
  AGENT_MENU_MAX_HEIGHT,
  CHAT_MODE_OPTIONS,
} from "../_lib/chat-constants";
import type {
  AgentItem,
  ChatComposerAttachment,
  ChatMode,
  ChatModeOption,
} from "../_lib/chat-types";

export function ChatComposer({
  value,
  attachments,
  loading,
  hasUploadingAttachments,
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
  onUploadAttachments,
  onRemoveAttachment,
  onMenuOpenChange,
  onModelChange,
}: {
  value: string;
  attachments: ChatComposerAttachment[];
  loading: boolean;
  hasUploadingAttachments: boolean;
  error: string | null;
  menuOpen: boolean;
  currentChatMode: ChatModeOption;
  chatMode: ChatMode;
  agents: AgentItem[];
  agentId: string;
  compact?: boolean;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onUploadAttachments: (files: File[]) => void;
  onRemoveAttachment: (localId: string) => void;
  onMenuOpenChange: (open: boolean) => void;
  onModelChange: (mode: ChatMode, agentId?: string) => void;
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const agentMenuScrollRef = useRef<HTMLDivElement>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const currentAgent = agents.find((agent) => agent.id === agentId);
  const modeButtonLabel =
    chatMode === "agent" && currentAgent ? currentAgent.name : currentChatMode.label;
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
        hint:
          CHAT_MODE_OPTIONS.find((option) => option.value === "openai")?.hint ??
          "Direct model chat",
      },
      {
        key: "mode:rag-openai",
        type: "mode" as const,
        mode: "rag-openai" as const,
        label: "RAG OpenAI",
        hint:
          CHAT_MODE_OPTIONS.find((option) => option.value === "rag-openai")
            ?.hint ?? "Grounded model chat",
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
        hint: agent.description || "Expert agent",
      })),
    ],
    [agents]
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- Keep the long Agent menu virtualized without lifecycle flushSync.
  const agentMenuVirtualizer = useVirtualizer({
    count: agentMenuItems.length,
    getScrollElement: () => agentMenuScrollRef.current,
    estimateSize: () => AGENT_MENU_ITEM_HEIGHT,
    overscan: 6,
    getItemKey: (index) => agentMenuItems[index]?.key ?? index,
    useFlushSync: false,
  });
  const agentMenuHeight = Math.min(
    agentMenuItems.length * AGENT_MENU_ITEM_HEIGHT,
    AGENT_MENU_MAX_HEIGHT
  );

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length > 0) onUploadAttachments(files);
  }

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && modeMenuRef.current?.contains(target)) {
        return;
      }

      onMenuOpenChange(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onMenuOpenChange(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen, onMenuOpenChange]);

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
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.csv,.xlsx,.docx,.pdf"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        {attachments.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <AttachmentChip
                key={attachment.localId}
                attachment={attachment}
                onRemove={() => onRemoveAttachment(attachment.localId)}
              />
            ))}
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
          placeholder="Ask a question or describe what you need..."
          className={`w-full resize-none border-0 bg-transparent text-base leading-7 text-slate-900 outline-none placeholder:text-slate-400 ${
            compact ? "min-h-16" : "min-h-28"
          }`}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div ref={modeMenuRef} className="relative">
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
                                    onModelChange("agent", item.agentId);
                                  } else {
                                    onModelChange(item.mode);
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
              label="Attach image"
              disabled={loading}
              onClick={() => imageInputRef.current?.click()}
            >
              <ImageIcon aria-hidden="true" />
            </IconToolButton>
            <IconToolButton
              label="Attach file"
              disabled={loading}
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
                aria-label="Stop generating"
                className="inline-flex size-9 items-center justify-center rounded-md bg-slate-900 text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300"
              >
                <Square aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={
                  (!value.trim() &&
                    !attachments.some(
                      (attachment) => attachment.status === "ready"
                    )) ||
                  hasUploadingAttachments
                }
                aria-label="Send message"
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
}

function ModeMenuButton({
  active,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-md px-2 py-1.5 text-left text-xs ${
        active
          ? "bg-emerald-50 text-emerald-800"
          : "text-slate-700 hover:bg-slate-50"
      }`}
    >
      <span className="block truncate font-medium leading-5">{label}</span>
      <span className="block truncate text-[11px] leading-4 text-slate-500">
        {hint}
      </span>
    </button>
  );
}

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
  attachment: ChatComposerAttachment;
  onRemove: () => void;
}) {
  const Icon = attachment.kind === "image" ? ImageIcon : FileText;
  const statusText =
    attachment.status === "ready"
      ? "Ready"
      : attachment.status === "failed"
        ? "Failed"
        : "Uploading";

  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
      {attachment.status === "uploading" ? (
        <Loader2 className="animate-spin" aria-hidden="true" />
      ) : (
        <Icon aria-hidden="true" />
      )}
      <div className="min-w-0">
        <div className="max-w-44 truncate font-medium">
          {attachment.fileName}
        </div>
        <div className="max-w-44 truncate text-slate-500">
          {statusText}
          {attachment.textPreview ? ` / ${attachment.textPreview}` : ""}
        </div>
      </div>
      <button
        type="button"
        aria-label="Remove attachment"
        onClick={onRemove}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700"
      >
        <X aria-hidden="true" />
      </button>
    </div>
  );
}
