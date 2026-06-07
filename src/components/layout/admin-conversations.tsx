"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessageSquare, Plus } from "lucide-react";

import type { ChatConversationDTO } from "@/features/chat/chat.types";
import { useAppStore } from "@/store";

type ConversationCreateResponse = {
  success: boolean;
  data?: ChatConversationDTO;
};

const REFRESH_CONVERSATIONS_EVENT = "chat:refresh-conversations";

export function AdminConversations() {
  const [creating, setCreating] = React.useState(false);
  const [activeConversationId, setActiveConversationId] = React.useState<
    string | undefined
  >();
  const pathname = usePathname();
  const router = useRouter();
  const conversations = useAppStore((state) => state.chatConversations);
  const loading = useAppStore((state) => state.chatConversationsLoading);
  const loadConversations = useAppStore((state) => state.loadChatConversations);
  const upsertConversation = useAppStore(
    (state) => state.upsertChatConversation
  );

  React.useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  React.useEffect(() => {
    function handleRefreshConversations() {
      void loadConversations({ force: true });
    }

    window.addEventListener(
      REFRESH_CONVERSATIONS_EVENT,
      handleRefreshConversations
    );

    return () => {
      window.removeEventListener(
        REFRESH_CONVERSATIONS_EVENT,
        handleRefreshConversations
      );
    };
  }, [loadConversations]);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setActiveConversationId(
        new URLSearchParams(window.location.search).get("conversationId") ??
          undefined
      );
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  function openConversation(conversationId: string) {
    setActiveConversationId(conversationId);
    window.dispatchEvent(
      new CustomEvent("chat:open-conversation", {
        detail: { conversationId },
      })
    );
    router.push(`/agents/chat?conversationId=${conversationId}`);
  }

  async function createConversation() {
    setCreating(true);
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "knowledge-agent" }),
      });
      const json = (await response.json().catch(() => null)) as
        | ConversationCreateResponse
        | null;

      if (!response.ok || !json?.success || !json.data) return;

      const conversation = json.data;
      upsertConversation(conversation);
      setActiveConversationId(conversation.id);
      window.dispatchEvent(
        new CustomEvent("chat:create-empty-conversation", {
          detail: { conversation },
        })
      );
      router.push(`/agents/chat?conversationId=${conversation.id}`);
    } finally {
      setCreating(false);
      void loadConversations({ force: true }).catch(() => undefined);
    }
  }

  return (
    <section className="mt-3 border-t border-sidebar-border pt-3">
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
          onClick={createConversation}
          disabled={loading || creating}
          title="New conversation"
          aria-label="New conversation"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-700 text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-100 disabled:text-emerald-300"
        >
          <Plus aria-hidden="true" className="size-4" />
        </button>
      </div>

      <div className="mt-2 min-h-0">
        {loading && conversations.length === 0 ? (
          <div className="px-2 py-5 text-center text-xs leading-5 text-sidebar-foreground/60">
            Loading conversations...
          </div>
        ) : conversations.length === 0 ? (
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
                  onClick={() => openConversation(conversation.id)}
                  className={`group grid w-full grid-cols-[auto_1fr] gap-2 rounded-md px-2 py-2 text-left transition-colors ${
                    active
                      ? "bg-emerald-50 text-emerald-900"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
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
    </section>
  );
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

function formatConversationMode(mode: string) {
  if (mode === "knowledge-agent") return "Knowledge Agent";
  if (mode === "openai" || mode === "rag-openai") return "LLM";
  if (mode === "skill-agent") return "Skill Agent";
  if (mode === "agent") return "Agent";
  return mode;
}
