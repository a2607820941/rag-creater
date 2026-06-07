import { MessageSquare, Plus } from "lucide-react";

import type { ChatConversationDTO } from "@/features/chat/chat.types";

export function ConversationSidebar({
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
                    onOpenMenu(
                      conversation.id,
                      event.clientX,
                      event.clientY
                    );
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
                      <span className="truncate">
                        {formatConversationMode(conversation.mode)}
                      </span>
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

function formatConversationMode(mode: string) {
  if (mode === "knowledge-agent") return "Knowledge Agent";
  if (mode === "openai" || mode === "rag-openai") return "LLM";
  if (mode === "skill-agent") return "Skill Agent";
  if (mode === "agent") return "Agent";
  return mode;
}

function formatConversationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  if (sameDay) {
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
