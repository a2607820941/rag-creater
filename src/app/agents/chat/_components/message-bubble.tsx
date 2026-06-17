"use client";

import Image from "next/image";
import { memo, useState } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Image as ImageIcon,
  Loader2,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  ChatAttachmentDTO,
  ChatCitation,
  ChatKnowledgeFile,
  ChatStreamStatus,
} from "@/features/chat/chat.types";

import { ChatMarkdown } from "./chat-markdown";
import type { UiMessage } from "../_lib/chat-types";

function MessageBubbleComponent({ message }: { message: UiMessage }) {
  const isUser = message.role === "user";
  const isAssistantLoading =
    !isUser &&
    message.status === "loading" &&
    !message.content &&
    shouldShowAssistantLoading(message.phase);
  const [copied, setCopied] = useState(false);
  const [citationsExpanded, setCitationsExpanded] = useState(false);
  const [activeCitationRefId, setActiveCitationRefId] = useState<string | null>(
    null
  );
  const [selectedCitation, setSelectedCitation] = useState<ChatCitation | null>(
    null
  );

  if (!isUser && !message.content && !isAssistantLoading) {
    return null;
  }

  async function copyAnswer() {
    if (!message.content) return;
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function openCitationReference(refId: string) {
    const matchedCitation = message.citations.find(
      (citation) =>
        normalizeCitationRefId(citation.refId) === normalizeCitationRefId(refId)
    );

    setActiveCitationRefId(refId);

    if (!matchedCitation) return;

    setCitationsExpanded(true);
    setSelectedCitation(matchedCitation);
  }

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
        {isUser ? (
          <>
            <div className="whitespace-pre-wrap break-words">
              {message.content}
            </div>
            {message.attachments && message.attachments.length > 0 && (
              <UserAttachments attachments={message.attachments} />
            )}
          </>
        ) : (
          <>
            {isAssistantLoading ? (
              <AssistantLoadingMessage
                text={
                  message.loadingText ||
                  "\u6b63\u5728\u68c0\u7d22\u77e5\u8bc6\u5e93"
                }
              />
            ) : (
              <ChatMarkdown
                content={message.content}
                onReferenceClick={openCitationReference}
                streaming={message.status === "streaming" || message.pending}
              />
            )}
          </>
        )}
        {!isUser && message.knowledgeFiles && message.knowledgeFiles.length > 0 && (
          <KnowledgeFilesNotice files={message.knowledgeFiles} />
        )}
        {!isUser && message.citations.length > 0 && (
          <CitationSources
            activeRefId={activeCitationRefId}
            citations={message.citations}
            expanded={citationsExpanded}
            onExpandedChange={setCitationsExpanded}
            onSelectedCitationChange={setSelectedCitation}
            selectedCitation={selectedCitation}
          />
        )}
        {!isUser && !message.pending && message.content && (
          <div className="mt-3 flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={copyAnswer}
              title="Copy answer"
            >
              {copied ? (
                <Check data-icon="inline-start" />
              ) : (
                <Copy data-icon="inline-start" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
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

export const MessageBubble = memo(MessageBubbleComponent, areMessagesEqual);

function areMessagesEqual(
  previous: { message: UiMessage },
  next: { message: UiMessage }
) {
  const previousMessage = previous.message;
  const nextMessage = next.message;

  return (
    previousMessage.id === nextMessage.id &&
    previousMessage.role === nextMessage.role &&
    previousMessage.content === nextMessage.content &&
    previousMessage.pending === nextMessage.pending &&
    previousMessage.status === nextMessage.status &&
    previousMessage.phase === nextMessage.phase &&
    previousMessage.loadingText === nextMessage.loadingText &&
    previousMessage.citations === nextMessage.citations &&
    previousMessage.knowledgeFiles === nextMessage.knowledgeFiles &&
    previousMessage.attachments === nextMessage.attachments
  );
}

function shouldShowAssistantLoading(phase?: ChatStreamStatus) {
  return (
    phase === "retrieving" ||
    phase === "reading-documents" ||
    phase === "failed" ||
    phase === "stopped"
  );
}

function AssistantLoadingMessage({ text }: { text: string }) {
  return (
    <div
      className="inline-flex items-center gap-2 text-sm text-slate-500"
      aria-live="polite"
    >
      <Loader2 className="animate-spin text-emerald-700" aria-hidden="true" />
      <span>{text}</span>
      <span className="inline-flex items-center gap-1" aria-hidden="true">
        <span className="size-1.5 rounded-full bg-emerald-600/70 [animation-delay:0ms] animate-bounce" />
        <span className="size-1.5 rounded-full bg-emerald-600/70 [animation-delay:120ms] animate-bounce" />
        <span className="size-1.5 rounded-full bg-emerald-600/70 [animation-delay:240ms] animate-bounce" />
      </span>
    </div>
  );
}

function UserAttachments({
  attachments,
}: {
  attachments: ChatAttachmentDTO[];
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-white/20 pt-3">
      {attachments.map((attachment) => {
        const Icon = attachment.kind === "image" ? ImageIcon : FileText;
        const content =
          attachment.kind === "image" && attachment.fileUrl ? (
            <>
              <Image
                src={attachment.fileUrl}
                alt={attachment.fileName}
                width={80}
                height={80}
                className="h-20 w-20 rounded-md object-cover ring-1 ring-white/30"
              />
              <span className="max-w-44 truncate">{attachment.fileName}</span>
            </>
          ) : (
            <>
              <Icon aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="max-w-44 truncate">{attachment.fileName}</span>
            </>
          );

        if (attachment.fileUrl) {
          return (
            <a
              key={attachment.id}
              href={attachment.fileUrl}
              target="_blank"
              rel="noreferrer"
              title={attachment.fileName}
              className={`inline-flex max-w-full items-center gap-2 rounded-md bg-white/15 px-2.5 py-1.5 text-xs text-white hover:bg-white/25 ${
                attachment.kind === "image" ? "flex-col items-start" : ""
              }`}
            >
              {content}
            </a>
          );
        }

        return (
          <div
            key={attachment.id}
            className="inline-flex max-w-full items-center gap-2 rounded-md bg-white/15 px-2.5 py-1.5 text-xs text-white"
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}

function KnowledgeFilesNotice({ files }: { files: ChatKnowledgeFile[] }) {
  return (
    <div className="mt-3 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
      <div className="mb-1 flex items-center gap-2 font-medium">
        <FileText aria-hidden="true" />
        <span>Read {files.length} knowledge file(s)</span>
      </div>
      <div className="flex flex-col gap-1 text-emerald-700">
        {files.map((file) => (
          <span key={file.id} className="truncate">
            {file.title} / {file.chunkCount} chunks
          </span>
        ))}
      </div>
    </div>
  );
}

function CitationSources({
  activeRefId,
  citations,
  expanded,
  onExpandedChange,
  onSelectedCitationChange,
  selectedCitation,
}: {
  activeRefId: string | null;
  citations: ChatCitation[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onSelectedCitationChange: (citation: ChatCitation | null) => void;
  selectedCitation: ChatCitation | null;
}) {
  const visibleCitations = expanded ? citations : [];

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onExpandedChange(!expanded)}
          className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 hover:text-slate-900"
        >
          References {citations.length}
          <ChevronDown
            aria-hidden="true"
            className={
              expanded ? "rotate-180 transition-transform" : "transition-transform"
            }
          />
        </button>
        {expanded && citations.length > 3 && (
          <span className="text-xs text-slate-400">Showing all</span>
        )}
      </div>

      {visibleCitations.map((citation) => (
        <button
          type="button"
          key={`${citation.refId}-${citation.chunkId}`}
          onClick={() => onSelectedCitationChange(citation)}
          className={`rounded-md p-3 text-left text-xs text-slate-600 transition-colors hover:bg-emerald-50 ${
            activeRefId &&
            normalizeCitationRefId(citation.refId) ===
              normalizeCitationRefId(activeRefId)
              ? "bg-emerald-100 ring-1 ring-emerald-200"
              : "bg-emerald-50/70"
          }`}
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
        </button>
      ))}

      <CitationDetailDialog
        citation={selectedCitation}
        onOpenChange={(open) => {
          if (!open) onSelectedCitationChange(null);
        }}
      />
    </div>
  );
}

function normalizeCitationRefId(refId: string) {
  return refId.replace(/^\[|\]$/g, "").replace("-", "_").toLowerCase();
}

function CitationDetailDialog({
  citation,
  onOpenChange,
}: {
  citation: ChatCitation | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(citation)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{citation?.title || "Reference detail"}</DialogTitle>
          <DialogDescription>
            Retrieved source content used by this answer.
          </DialogDescription>
        </DialogHeader>

        {citation && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">[{citation.refId}]</Badge>
              <Badge variant="outline">Score {citation.score.toFixed(3)}</Badge>
              <Badge variant="outline">{citation.chunkType}</Badge>
            </div>

            <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <div>
                <dt className="font-medium text-foreground">
                  Knowledge base ID
                </dt>
                <dd className="mt-1 break-all">{citation.knowledgeBaseId}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Document ID</dt>
                <dd className="mt-1 break-all">{citation.documentId}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Knowledge ID</dt>
                <dd className="mt-1 break-all">{citation.knowledgeId}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Chunk ID</dt>
                <dd className="mt-1 break-all">{citation.chunkId}</dd>
              </div>
            </dl>

            <div className="whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-4 text-sm leading-7">
              {citation.content}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function summarizeCitationContent(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return "No preview available";

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
      ? `Structured fields: ${values.join(", ")}`
      : "Structured JSON content";
  }

  return normalized.length > 180 ? `${normalized.slice(0, 180)}...` : normalized;
}
