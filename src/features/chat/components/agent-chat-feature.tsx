"use client";

import Link from "next/link";
import { Suspense, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, PackageCheck, Plus, Sparkles, Trash2 } from "lucide-react";

import { AdminShell } from "@/components/layout/admin-shell";
import { ChatComposer } from "@/app/agents/chat/_components/chat-composer";
import { ConversationSidebar } from "@/app/agents/chat/_components/conversation-sidebar";
import { MessageBubble } from "@/app/agents/chat/_components/message-bubble";
import { SkillPublishDialog } from "@/app/agents/chat/_components/skill-publish-dialog";
import { useChatScroll } from "@/app/agents/chat/_hooks/use-chat-scroll";
import { useChatSessionController } from "@/app/agents/chat/_hooks/use-chat-session-controller";

const BOTTOM_SCROLL_THRESHOLD_PX = 60;

export function AgentChatFeature() {
  return (
    <Suspense fallback={<AgentChatFeatureFallback />}>
      <AgentChatFeatureContent />
    </Suspense>
  );
}

function AgentChatFeatureContent() {
  const resetScrollTrackingRef = useRef<() => void>(() => undefined);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const controller = useChatSessionController({
    onResetScrollTracking: () => resetScrollTrackingRef.current(),
  });

  // eslint-disable-next-line react-hooks/incompatible-library -- React 19 rejects flushSync during virtual item measurement.
  const messageVirtualizer = useVirtualizer(
    {
      count: controller.messages.length,
      getScrollElement: () => scrollContainerRef.current,
      estimateSize: () => 128,
      overscan: 6,
      getItemKey: (index) => controller.messages[index]?.id ?? index,
      shouldAdjustScrollPositionOnItemSizeChange: () => false,
      useFlushSync: false,
    } as Parameters<typeof useVirtualizer>[0]
  );

  const scrollToLatest = useCallback(() => {
    if (controller.messages.length === 0) return;

    messageVirtualizer.scrollToIndex(controller.messages.length - 1, {
      align: "end",
    });
  }, [controller.messages.length, messageVirtualizer]);

  const {
    handleMessageScroll,
    jumpToBottom,
    resetScrollTracking,
    showScrollToBottom,
  } = useChatScroll({
    bottomThresholdPx: BOTTOM_SCROLL_THRESHOLD_PX,
    itemCount: controller.messages.length,
    scrollToLatest,
    scrollContainerRef,
  });
  resetScrollTrackingRef.current = resetScrollTracking;
  const hasSelectedConversation = Boolean(controller.conversationId);
  const hasMessages = controller.messages.length > 0;
  const showWelcome = !hasSelectedConversation && !hasMessages;
  const showConversationChrome = hasSelectedConversation || hasMessages;

  const sidebarContent = (
    <ConversationSidebar
      conversations={controller.conversations}
      activeConversationId={controller.conversationId}
      loading={controller.loading}
      onNewConversation={controller.startNewConversation}
      onOpenConversation={controller.openConversation}
      onOpenMenu={(id, x, y) => controller.setConversationMenu({ id, x, y })}
    />
  );

  return (
    <AdminShell sidebarContent={sidebarContent}>
      <div className="flex h-[calc(100dvh-6.5rem)] min-h-[520px] overflow-hidden bg-[#f7faf8] text-slate-950">
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.13),transparent_55%)]" />

          {showConversationChrome && (
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
                      {controller.currentChatMode.label}
                      {controller.currentAgent
                        ? ` / ${controller.currentAgent.name}`
                        : ""}
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
                    onClick={controller.startNewConversation}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <Plus aria-hidden="true" />
                    New
                  </button>
                </div>
              </div>
            </header>
          )}

          {showWelcome ? (
            <section className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-10 md:px-8">
              <div className="flex w-full max-w-4xl flex-col items-center gap-9">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="flex size-12 items-center justify-center rounded-md bg-emerald-700 text-white shadow-lg shadow-emerald-900/15">
                    <Sparkles aria-hidden="true" />
                  </div>
                  <h1 className="text-3xl font-semibold tracking-normal text-slate-950 md:text-4xl">
                    Ask Embark anything
                  </h1>
                  {controller.chatMode === "skill-agent" && (
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
                  value={controller.input}
                  attachments={controller.attachments}
                  loading={controller.loading}
                  hasUploadingAttachments={controller.hasUploadingAttachments}
                  error={controller.error}
                  menuOpen={controller.menuOpen}
                  currentChatMode={controller.currentChatMode}
                  chatMode={controller.chatMode}
                  agents={controller.agents}
                  agentId={controller.agentId}
                  onValueChange={controller.setInput}
                  onSubmit={controller.submitMessage}
                  onStop={controller.stopMessage}
                  onUploadAttachments={controller.uploadAttachments}
                  onRemoveAttachment={controller.removeAttachment}
                  onMenuOpenChange={controller.setMenuOpen}
                  onModelChange={(mode, nextAgentId) => {
                    void controller.handleModelChange(mode, nextAgentId);
                  }}
                />
              </div>
            </section>
          ) : !hasMessages ? (
            <section className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-10 md:px-8">
              <div className="flex w-full max-w-4xl flex-col items-center gap-6">
                {controller.isLoadingMessages ? (
                  <ConversationLoadingState />
                ) : (
                  <SelectedEmptyConversationState />
                )}

                {!controller.isLoadingMessages && (
                  <ChatComposer
                    value={controller.input}
                    attachments={controller.attachments}
                    loading={controller.loading}
                    hasUploadingAttachments={controller.hasUploadingAttachments}
                    error={controller.error}
                    menuOpen={controller.menuOpen}
                    currentChatMode={controller.currentChatMode}
                    chatMode={controller.chatMode}
                    agents={controller.agents}
                    agentId={controller.agentId}
                    onValueChange={controller.setInput}
                    onSubmit={controller.submitMessage}
                    onStop={controller.stopMessage}
                    onUploadAttachments={controller.uploadAttachments}
                    onRemoveAttachment={controller.removeAttachment}
                    onMenuOpenChange={controller.setMenuOpen}
                    onModelChange={(mode, nextAgentId) => {
                      void controller.handleModelChange(mode, nextAgentId);
                    }}
                  />
                )}
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
                      const message = controller.messages[virtualItem.index];
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
                    value={controller.input}
                    attachments={controller.attachments}
                    loading={controller.loading}
                    hasUploadingAttachments={controller.hasUploadingAttachments}
                    error={controller.error}
                    menuOpen={controller.menuOpen}
                    currentChatMode={controller.currentChatMode}
                    chatMode={controller.chatMode}
                    agents={controller.agents}
                    agentId={controller.agentId}
                    onValueChange={controller.setInput}
                    onSubmit={controller.submitMessage}
                    onStop={controller.stopMessage}
                    onUploadAttachments={controller.uploadAttachments}
                    onRemoveAttachment={controller.removeAttachment}
                    onMenuOpenChange={controller.setMenuOpen}
                    onModelChange={(mode, nextAgentId) => {
                      void controller.handleModelChange(mode, nextAgentId);
                    }}
                  />
                </div>
              </footer>
            </>
          )}
        </main>

        {controller.conversationMenu && (
          <div
            className="fixed z-50 min-w-32 rounded-md border border-slate-200 bg-white p-1 text-sm shadow-xl shadow-slate-900/10"
            style={{
              left: controller.conversationMenu.x,
              top: controller.conversationMenu.y,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() =>
                controller.deleteConversation(controller.conversationMenu!.id)
              }
              disabled={controller.loading}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 aria-hidden="true" className="size-4" />
              Delete
            </button>
          </div>
        )}
        <SkillPublishDialog
          draft={controller.pendingSkillDraft}
          state={controller.skillPublishState}
          onPublish={controller.publishPendingSkillDraft}
          onClose={controller.closeSkillPublishDialog}
        />
      </div>
    </AdminShell>
  );
}

function AgentChatFeatureFallback() {
  return (
    <AdminShell sidebarContent={null}>
      <div className="flex h-[calc(100dvh-6.5rem)] min-h-[520px] items-center justify-center bg-[#f7faf8] text-sm text-slate-500">
        Loading chat...
      </div>
    </AdminShell>
  );
}

function ConversationLoadingState() {
  return (
    <div className="flex w-full max-w-3xl flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="h-4 w-36 animate-pulse rounded bg-slate-200" />
      <div className="flex flex-col gap-3">
        <div className="h-16 animate-pulse rounded-md bg-slate-100" />
        <div className="h-20 animate-pulse rounded-md bg-slate-100" />
        <div className="h-14 animate-pulse rounded-md bg-slate-100" />
      </div>
    </div>
  );
}

function SelectedEmptyConversationState() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="flex size-12 items-center justify-center rounded-md bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200">
        <Sparkles aria-hidden="true" />
      </div>
      <div>
        <h1 className="text-xl font-semibold tracking-normal text-slate-950">
          This conversation has no messages yet
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Start this conversation from the composer below.
        </p>
      </div>
    </div>
  );
}
