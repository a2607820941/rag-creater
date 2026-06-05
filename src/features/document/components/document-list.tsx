"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface ProgressInfo {
  stage: string;
  percent: number;
}

interface DocumentItem {
  id: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  status: string;
  chunkCount: number;
  candidatePending: number;
  candidateConfirmed: number;
  createdAt: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  uploading: { label: "上传中", color: "text-yellow-600 bg-yellow-50" },
  uploaded: { label: "待解析", color: "text-blue-600 bg-blue-50" },
  parsing: { label: "解析中", color: "text-yellow-600 bg-yellow-50" },
  parsed: { label: "已解析", color: "text-green-600 bg-green-50" },
  failed: { label: "解析失败", color: "text-red-600 bg-red-50" },
};

const FILTER_OPTIONS = [
  { key: "", label: "全部" },
  { key: "uploaded", label: "待解析" },
  { key: "parsing", label: "解析中" },
  { key: "parsed", label: "已解析" },
  { key: "extracted", label: "已提炼" },
  { key: "failed", label: "失败" },
];

function getStatusDisplay(status: string) {
  return STATUS_LABELS[status] ?? { label: status, color: "text-zinc-600 bg-zinc-50" };
}

interface DocumentListProps {
  refreshKey: number;
  parsingIds: string[];
  onParse: (ids: string[]) => void;
  onPreview: (id: string) => void;
}

export function DocumentList({ refreshKey, parsingIds, onParse, onPreview }: DocumentListProps) {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [extractingIds, setExtractingIds] = useState<Set<string>>(new Set());
  const [extractMsg, setExtractMsg] = useState<string | null>(null);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [parseProgress, setParseProgress] = useState<Map<string, ProgressInfo>>(
    new Map()
  );

  const someSelected = selected.size > 0 && selected.size < documents.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const hasLoadedRef = useRef(false);

  const fetchDocuments = useCallback(async () => {
    setError(null);
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter === "extracted") {
        params.set("hasCandidates", "true");
      } else if (filter) {
        params.set("status", filter);
      }
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await fetch(`/api/documents?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setDocuments(json.data.items);
        setTotal(json.data.total);
        hasLoadedRef.current = true;
      } else {
        throw new Error(json.error?.message || "加载失败");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments, refreshKey]);

  useEffect(() => {
    if (extractMsg) {
      const timer = setTimeout(() => setExtractMsg(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [extractMsg]);

  // Poll parse progress for documents in "parsing" state, plus parsingIds from parent
  const pollingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (pollingRef.current) return;
    const statusIds = documents
      .filter((d) => d.status === "parsing")
      .map((d) => d.id);
    // Merge with parsingIds from parent (for batch parse, before server status updates)
    const ids = [...new Set([...statusIds, ...parsingIds])];
    if (ids.length === 0) return;

    pollingRef.current = true;
    setParseProgress((prev) => {
      const next = new Map(prev);
      for (const id of ids) {
        if (!next.has(id)) next.set(id, { stage: "开始", percent: 0 });
      }
      return next;
    });
    const doneIds = new Set<string>();

    const finish = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      pollingRef.current = false;
      setParseProgress(new Map());
      fetchDocuments();
    };

    const poll = async () => {
      if (doneIds.size >= ids.length) {
        finish();
        return;
      }

      const res = await fetch(
        `/api/documents/parse-progress?ids=${ids.join(",")}`
      );
      const json = await res.json();
      if (!json.success) return;

      let hasNewDone = false;
      setParseProgress((prev) => {
        const next = new Map(prev);
        for (const [id, p] of Object.entries(json.data) as [
          string,
          ProgressInfo | undefined,
        ][]) {
          if (p) {
            next.set(id, p);
            if (p.percent >= 100 || p.stage === "done" || p.stage === "failed") {
              if (!doneIds.has(id)) hasNewDone = true;
              doneIds.add(id);
            }
          }
        }
        return next;
      });

      // Refresh list immediately when any doc completes
      if (hasNewDone) {
        fetchDocuments();
        if (doneIds.size >= ids.length) {
          finish();
        }
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      pollingRef.current = false;
    };
  }, [documents, parsingIds]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定删除「${name}」？`)) return;
    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setDocuments((prev) => {
          const next = prev.filter((d) => d.id !== id);
          if (next.length === 0 && page > 1) setPage(page - 1);
          return next;
        });
        setSelected((prev) => { prev.delete(id); return new Set(prev); });
      }
    } catch { /* ignore */ }
  };

  const handleNoteUpdate = async (id: string, name: string) => {
    if (!confirm(`确定从知识笔记重新同步「${name}」的内容并重新解析？`)) return;
    onParse([id]);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (documents.length === 0) return;
    const allSelected = documents.every((d) => selected.has(d.id));
    setSelected((prev) => {
      const next = new Set(prev);
      documents.forEach((d) => allSelected ? next.delete(d.id) : next.add(d.id));
      return next;
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedList = Array.from(selected);
  const parseIds = selectedList.filter((id) => {
    const doc = documents.find((d) => d.id === id);
    return doc && (doc.status === "uploaded" || doc.status === "failed");
  });

  const handleBatchDelete = async () => {
    if (selectedList.length === 0 || batchDeleting) return;
    if (!confirm(`确定删除选中的 ${selectedList.length} 个文档？`)) return;
    setBatchDeleting(true);
    try {
      const res = await fetch("/api/documents/batch-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedList }),
      });
      const json = await res.json();
      if (!json.success) return;
      setSelected(new Set());
      if (selectedList.length === documents.length && page > 1) {
        setPage(page - 1);
      } else {
        fetchDocuments();
      }
    } catch { /* ignore */ } finally { setBatchDeleting(false); }
  };

  async function handleExtract(id: string) {
    setExtractingIds((prev) => new Set(prev).add(id));
    setExtractMsg(null);
    try {
      const res = await fetch("/api/ai/extract/from-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: id }),
      });
      const json = await res.json();
      if (json.success) {
        setExtractMsg(`提炼完成！生成 ${json.data.dedupedCandidateCount} 条候选知识`);
        fetchDocuments();
      } else {
        setExtractMsg(json.error?.message || "提炼失败");
      }
    } catch {
      setExtractMsg("网络错误，请重试");
    } finally {
      setExtractingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const filterBar = (
    <div className="mb-3 flex flex-wrap items-center gap-1">
      {FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          onClick={() => { setFilter(opt.key); setPage(1); setSelected(new Set()); }}
          className={`rounded-full px-2 py-1 text-xs font-medium transition-colors ${
            filter === opt.key
              ? "bg-blue-600 text-white"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
          }`}
        >
          {opt.label}
        </button>
      ))}
      <div className="ml-auto flex items-center gap-2">
        {parseIds.length > 0 && (
          <button
            onClick={() => { onParse(parseIds); }}
            disabled={batchDeleting}
            className="rounded px-2 py-1 text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            批量解析（{parseIds.length}）
          </button>
        )}
        {selectedList.length > 0 && (
          <button
            onClick={handleBatchDelete}
            disabled={batchDeleting}
            className="rounded px-2 py-1 text-xs font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
          >
            {batchDeleting ? "删除中..." : `批量删除（${selectedList.length}）`}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div>
      {filterBar}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-zinc-500">
          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
          加载中...
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error}
          <button onClick={() => fetchDocuments()} className="ml-2 underline">重试</button>
        </div>
      ) : documents.length === 0 ? (
        <div className="py-16 text-center text-sm text-zinc-400">
          {filter ? "该状态下暂无记录" : "暂无导入记录，请上传文件"}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase text-zinc-500">
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    ref={selectAllRef}
                    checked={documents.length > 0 && selected.size === documents.length}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 rounded"
                  />
                </th>
                <th className="px-3 py-3">文件名</th>
                <th className="px-3 py-3">类型</th>
                <th className="px-3 py-3">大小</th>
                <th className="px-3 py-3">分段</th>
                <th className="px-3 py-3">AI知识</th>
                <th className="px-3 py-3">状态</th>
                <th className="px-3 py-3">上传时间</th>
                <th className="px-3 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {documents.map((doc) => {
                const isActivelyParsing = parsingIds.includes(doc.id);
                const effectiveStatus = isActivelyParsing ? "parsing" : doc.status;
                const statusDisplay = getStatusDisplay(effectiveStatus);
                const hasCandidates = doc.candidatePending > 0 || doc.candidateConfirmed > 0;
                return (
                  <tr key={doc.id} className="hover:bg-zinc-50">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(doc.id)}
                        onChange={() => toggleSelect(doc.id)}
                        className="h-3.5 w-3.5 rounded border-zinc-300"
                      />
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-3 font-medium text-zinc-900">
                      {doc.originalName}
                    </td>
                    <td className="px-3 py-3 text-zinc-500">
                      .{doc.fileType}
                    </td>
                    <td className="px-3 py-3 text-zinc-500">
                      {formatFileSize(doc.fileSize)}
                    </td>
                    <td className="px-3 py-3 text-zinc-500">
                      {effectiveStatus === "parsed" && doc.chunkCount > 0
                        ? `${doc.chunkCount} 段`
                        : effectiveStatus === "parsing"
                          ? "..."
                          : "-"}
                    </td>
                    <td className="px-3 py-3">
                      {hasCandidates ? (
                        <div className="flex items-center gap-1.5">
                          {doc.candidatePending > 0 && (
                            <button
                              onClick={() => router.push("/candidates")}
                              className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium"
                            >
                              {doc.candidatePending} 待审核
                            </button>
                          )}
                          {doc.candidateConfirmed > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                              {doc.candidateConfirmed} 已入库
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusDisplay.color}`}
                      >
                        {statusDisplay.label}
                      </span>
                      {effectiveStatus === "parsing" && parseProgress.has(doc.id) ? (
                        <div className="mt-1">
                          <div className="h-1 w-full rounded-full bg-zinc-100">
                            <div
                              className="h-1 rounded-full bg-blue-500 transition-all duration-300"
                              style={{
                                width: `${parseProgress.get(doc.id)!.percent}%`,
                              }}
                            />
                          </div>
                          <span className="mt-0.5 block text-[10px] text-zinc-400">
                            {parseProgress.get(doc.id)!.stage}
                          </span>
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-zinc-500">
                      {formatDate(doc.createdAt)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        {effectiveStatus !== "parsing" && effectiveStatus !== "parsed" && (
                          <button
                            onClick={() => onParse([doc.id])}
                            className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                          >
                            {doc.status === "failed" ? "重新解析" : "解析"}
                          </button>
                        )}
                        {effectiveStatus === "parsed" && (
                          <>
                            <button
                              onClick={() => onPreview(doc.id)}
                              className="rounded px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50"
                            >
                              预览
                            </button>
                            <button
                              onClick={() => handleExtract(doc.id)}
                              disabled={extractingIds.has(doc.id)}
                              className="rounded px-2 py-1 text-xs font-medium text-purple-600 hover:bg-purple-50 disabled:opacity-50"
                            >
                              {extractingIds.has(doc.id) ? "提炼中..." : "提炼"}
                            </button>
                            {doc.candidatePending > 0 && (
                              <button
                                onClick={() => router.push("/candidates")}
                                className="rounded px-2 py-1 text-xs font-medium text-amber-600 hover:bg-amber-50"
                              >
                                审核
                              </button>
                            )}
                          </>
                        )}
                        {doc.fileType === "note" ? (
                          <button
                            onClick={() => handleNoteUpdate(doc.id, doc.originalName)}
                            className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                          >
                            更新
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDelete(doc.id, doc.originalName)}
                            className="rounded px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50"
                          >
                            删除
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* 分页 */}
          <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3">
            <span className="text-xs text-zinc-500">
              共 {total} 条记录，第 {page}/{totalPages} 页
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                上一页
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                下一页
              </button>
            </div>
          </div>

          {/* 提炼结果提示 */}
          {extractMsg && (
            <div className={`border-t px-4 py-3 text-sm ${
              extractMsg.includes("完成")
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-600"
            }`}>
              {extractMsg}
              {extractMsg.includes("完成") && (
                <button
                  onClick={() => router.push("/candidates")}
                  className="ml-3 font-medium underline"
                >
                  前往审核
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
