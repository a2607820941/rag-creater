"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DocumentPreview } from "@/features/document/components/document-preview";
import { getSourceTypeLabel } from "@/lib/source-type";

type RecentDocument = {
  id: string;
  originalName: string;
  fileType: string;
  status: string;
  chunkCount: number;
  candidatePending: number;
  candidateConfirmed: number;
  createdAt: string;
};

type RecentKnowledgeItem = {
  id: string;
  knowledgeBaseId: string | null;
  title: string;
  content: string;
  suggestedCategory: string | null;
  suggestedTags: string[];
  type: string;
  sourceType: string;
  status: string;
  parseStatus: string;
  createdAt: string;
};

type KnowledgeProductionActivityProps = {
  documents: RecentDocument[];
  knowledge: RecentKnowledgeItem[];
};

type DocumentAction =
  | { kind: "parse"; label: string; disabled?: boolean }
  | { kind: "extract"; label: string; disabled?: boolean }
  | { kind: "view"; label: string; disabled?: boolean };

const KNOWLEDGE_TYPE_LABELS: Record<string, string> = {
  faq: "问答",
  concept: "概念",
  procedure: "步骤",
  note: "注意",
  summary: "总结",
};

const KNOWLEDGE_TYPE_COLORS: Record<string, string> = {
  faq: "bg-purple-100 text-purple-700",
  concept: "bg-blue-100 text-blue-700",
  procedure: "bg-green-100 text-green-700",
  note: "bg-yellow-100 text-yellow-700",
  summary: "bg-gray-100 text-gray-700",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDocumentStatus(status: string): string {
  if (status === "uploading") return "上传中";
  if (status === "uploaded") return "待解析";
  if (status === "parsing") return "解析中";
  if (status === "parsed") return "已解析";
  if (status === "failed") return "解析失败";
  return status;
}

function formatKnowledgeStatus(status: string): string {
  if (status === "pending") return "待审核";
  if (status === "confirmed") return "已确认";
  if (status === "rejected") return "已驳回";
  if (status === "active") return "可用";
  return status;
}

function getDocumentAction(document: RecentDocument): DocumentAction {
  const hasCandidates =
    document.candidatePending > 0 || document.candidateConfirmed > 0;

  if (document.status === "uploading" || document.status === "parsing") {
    return { kind: "parse", label: "解析中...", disabled: true };
  }

  if (document.status === "uploaded" || document.status === "failed") {
    return { kind: "parse", label: "解析" };
  }

  if (document.status === "parsed" && !hasCandidates) {
    return { kind: "extract", label: "提炼" };
  }

  return { kind: "view", label: "查看详情" };
}

export function KnowledgeProductionActivity({
  documents,
  knowledge,
}: KnowledgeProductionActivityProps) {
  const router = useRouter();
  const [pendingActions, setPendingActions] = useState<Record<string, string>>(
    {}
  );
  const [previewId, setPreviewId] = useState<string | null>(null);

  const setPendingAction = (documentId: string, label: string | null) => {
    setPendingActions((current) => {
      if (!label) {
        const next = { ...current };
        delete next[documentId];
        return next;
      }

      return {
        ...current,
        [documentId]: label,
      };
    });
  };

  const handleParse = async (documentId: string) => {
    setPendingAction(documentId, "解析中...");
    try {
      const response = await fetch(`/api/documents/${documentId}/parse`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to parse document");
      }

      router.refresh();
    } finally {
      setPendingAction(documentId, null);
    }
  };

  const handleExtract = async (documentId: string) => {
    setPendingAction(documentId, "提炼中...");
    try {
      const response = await fetch("/api/ai/extract/from-document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentId }),
      });

      if (!response.ok) {
        throw new Error("Failed to extract knowledge");
      }

      router.refresh();
    } finally {
      setPendingAction(documentId, null);
    }
  };

  const handlePrimaryAction = async (
    event: React.MouseEvent<HTMLButtonElement>,
    document: RecentDocument
  ) => {
    event.stopPropagation();

    const action = getDocumentAction(document);
    if (action.disabled || pendingActions[document.id]) {
      return;
    }

    if (action.kind === "parse") {
      await handleParse(document.id);
      return;
    }

    if (action.kind === "extract") {
      await handleExtract(document.id);
      return;
    }

    setPreviewId(document.id);
  };

  return (
    <>
      <section className="h-full min-h-[320px] rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-950">
              知识生产动态
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              从导入素材到生成知识的最新进展
            </p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-zinc-900">
                最近新增素材
              </h3>
              <Link
                href="/documents"
                className="text-sm font-medium text-blue-600"
              >
                去导入
              </Link>
            </div>
            {documents.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 py-8 text-center text-sm text-zinc-400">
                暂无导入素材
              </p>
            ) : (
              <div className="divide-y divide-zinc-100">
                {documents.slice(0, 3).map((document) => {
                  const action = getDocumentAction(document);
                  const pendingLabel = pendingActions[document.id];
                  const buttonLabel = pendingLabel ?? action.label;
                  const isButtonDisabled =
                    Boolean(pendingLabel) || action.disabled;

                  return (
                    <div
                      key={document.id}
                      onClick={() => setPreviewId(document.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setPreviewId(document.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className="flex w-full items-center gap-3 rounded-lg py-3 text-left transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-semibold uppercase text-blue-600">
                        {document.fileType}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-900">
                          {document.originalName}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {formatDocumentStatus(document.status)} ·{" "}
                          {document.chunkCount} 段 · {formatDate(document.createdAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(event) =>
                          void handlePrimaryAction(event, document)
                        }
                        disabled={isButtonDisabled}
                        className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {buttonLabel}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-zinc-900">
              最近提炼知识
            </h3>
          </div>
            {knowledge.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 py-8 text-center text-sm text-zinc-400">
                暂无提炼知识
              </p>
            ) : (
              <div className="divide-y divide-zinc-100">
                {knowledge.slice(0, 3).map((item) => {
                  const statusLabel = formatKnowledgeStatus(item.status);

                  return (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-900">
                          {item.title}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {getSourceTypeLabel(item.sourceType)} ·{" "}
                          {formatDate(item.createdAt)}
                        </p>
                      </div>
                      {item.status === "pending" ? (
                        <button
                          type="button"
                          onClick={() => router.push("/candidates")}
                          className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-200"
                        >
                          {statusLabel}
                        </button>
                      ) : item.status === "confirmed" ? (
                        <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
                          {statusLabel}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
                          {statusLabel}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      <DocumentPreview
        documentId={previewId}
        onClose={() => setPreviewId(null)}
      />
    </>
  );
}
