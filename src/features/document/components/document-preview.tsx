"use client";

import { useCallback, useEffect, useState } from "react";

interface CandidateItem {
  id: string;
  title: string;
  content: string;
  suggested_category: string | null;
  suggested_tags: string[];
  type: string;
  status: string;
}

interface DocInfo {
  id: string;
  originalName: string;
  rawContent: string | null;
  status: string;
}

interface DocumentPreviewProps {
  documentId: string | null;
  onClose: () => void;
}

const typeLabels: Record<string, string> = {
  faq: "问答", concept: "概念", procedure: "步骤", note: "注意", summary: "总结",
};
const typeColors: Record<string, string> = {
  faq: "bg-purple-100 text-purple-700", concept: "bg-blue-100 text-blue-700",
  procedure: "bg-green-100 text-green-700", note: "bg-yellow-100 text-yellow-700",
  summary: "bg-gray-100 text-gray-700",
};
const statusBadge: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700", confirmed: "bg-green-100 text-green-700",
};

interface ChunkItem {
  id: string;
  chunkIndex: number;
  content: string;
}

type Tab = "text" | "segments" | "knowledge";

export function DocumentPreview({ documentId, onClose }: DocumentPreviewProps) {
  const [tab, setTab] = useState<Tab>("text");
  const [docInfo, setDocInfo] = useState<DocInfo | null>(null);
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [chunks, setChunks] = useState<ChunkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<CandidateItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [editText, setEditText] = useState("");
  const [editingChunkId, setEditingChunkId] = useState<string | null>(null);
  const [editChunkContent, setEditChunkContent] = useState("");
  const [chunkSaving, setChunkSaving] = useState(false);
  const [editTextSaving, setEditTextSaving] = useState(false);

  const fetchData = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const [docRes, candRes, chunkRes] = await Promise.all([
        fetch(`/api/documents/${id}`),
        fetch(`/api/knowledge/candidates?documentSourceId=${id}`),
        fetch(`/api/documents/${id}/chunks`),
      ]);
      const docData = await docRes.json();
      if (docData.success) {
        setDocInfo(docData.data);
        setEditText(docData.data.rawContent || "");
      }
      const candData = await candRes.json();
      if (candData.success) {
        setCandidates(candData.data.candidates);
      }
      const chunkData = await chunkRes.json();
      if (chunkData.success) {
        setChunks(chunkData.data);
      }
    } catch {
      setError("加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!documentId) return;
    setTab("text");
    fetchData(documentId);
  }, [documentId, fetchData]);

  useEffect(() => {
    if (!editTarget) {
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      window.addEventListener("keydown", handleEsc);
      return () => window.removeEventListener("keydown", handleEsc);
    }
  }, [editTarget, onClose]);

  const handleSaveCandidate = async () => {
    if (!editTarget || !editTarget.title.trim() || !editTarget.content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/knowledge/candidates/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTarget.title,
          content: editTarget.content,
          suggestedCategory: editTarget.suggested_category,
          suggestedTags: editTarget.suggested_tags,
          type: editTarget.type,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setCandidates((prev) =>
          prev.map((c) => (c.id === editTarget.id ? { ...editTarget } : c))
        );
        setEditTarget(null);
      }
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  const handleSaveText = async () => {
    if (!docInfo) return;
    setEditTextSaving(true);
    try {
      const res = await fetch(`/api/documents/${docInfo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editText }),
      });
      const json = await res.json();
      if (json.success) {
        setDocInfo(json.data);
      }
    } catch { /* ignore */ } finally { setEditTextSaving(false); }
  };

  const handleDeleteCandidate = async (id: string) => {
    if (!confirm("确定删除该知识条目？")) return;
    try {
      await fetch(`/api/knowledge/candidates/${id}`, { method: "DELETE" });
      setCandidates((prev) => prev.filter((c) => c.id !== id));
    } catch { /* ignore */ }
  };

  if (!documentId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="mx-4 flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-3">
          <h2 className="text-lg font-semibold text-zinc-900">
            {loading ? "加载中..." : docInfo?.originalName || "文档预览"}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-200">
          {([
            { key: "text" as Tab, label: "原文内容" },
            { key: "segments" as Tab, label: `语义分段${chunks.length > 0 ? `（${chunks.length}）` : ""}` },
            { key: "knowledge" as Tab, label: `提炼知识${candidates.length > 0 ? `（${candidates.length}）` : ""}` },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === t.key
                  ? "border-b-2 border-blue-500 text-blue-600"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-zinc-500">
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
              加载中...
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : tab === "text" ? (
            /* ── 原文内容 ── */
            <div className="space-y-4">
              {docInfo?.rawContent ? (
                <>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={18}
                    className="w-full px-4 py-3 border border-zinc-300 rounded-lg text-sm leading-relaxed text-gray-900 resize-y focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveText}
                      disabled={editText === (docInfo?.rawContent || "") || editTextSaving}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {editTextSaving ? "保存中..." : "保存修改"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="py-16 text-center text-sm text-zinc-400">
                  {docInfo?.status === "uploaded"
                    ? "文档尚未解析，请先解析后再查看"
                    : "暂无文本内容"}
                </div>
              )}
            </div>
          ) : tab === "segments" ? (
            /* ── 语义分段 ── */
            chunks.length === 0 ? (
              <div className="py-16 text-center text-sm text-zinc-400">
                {docInfo?.status === "uploaded"
                  ? "文档尚未解析"
                  : docInfo?.status === "parsing"
                    ? "正在解析中..."
                    : "暂无分段数据"}
              </div>
            ) : (
              <div className="space-y-3">
                {chunks.map((chunk, i) => (
                  <div
                    key={chunk.id}
                    className="rounded-lg border border-zinc-200 bg-zinc-50"
                  >
                    <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-1.5">
                      <span className="text-xs font-medium text-zinc-500">
                        第 {i + 1} 段
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-400">
                          {chunk.content.length.toLocaleString()} 字
                        </span>
                        {editingChunkId === chunk.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={async () => {
                                setChunkSaving(true);
                                try {
                                  const res = await fetch(`/api/chunks/${chunk.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ content: editChunkContent }),
                                  });
                                  const json = await res.json();
                                  if (json.success) {
                                    setChunks((prev) =>
                                      prev.map((c) =>
                                        c.id === chunk.id ? { ...c, content: editChunkContent } : c
                                      )
                                    );
                                    setEditingChunkId(null);
                                  }
                                } catch { /* ignore */ } finally {
                                  setChunkSaving(false);
                                }
                              }}
                              disabled={chunkSaving}
                              className="text-xs px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              {chunkSaving ? "保存中..." : "保存"}
                            </button>
                            <button
                              onClick={() => setEditingChunkId(null)}
                              className="text-xs px-2 py-0.5 rounded bg-zinc-200 text-zinc-600 hover:bg-zinc-300"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingChunkId(chunk.id);
                              setEditChunkContent(chunk.content);
                            }}
                            className="text-xs px-2 py-0.5 rounded bg-zinc-200 text-zinc-600 hover:bg-zinc-300"
                          >
                            编辑
                          </button>
                        )}
                      </div>
                    </div>
                    {editingChunkId === chunk.id ? (
                      <textarea
                        value={editChunkContent}
                        onChange={(e) => setEditChunkContent(e.target.value)}
                        rows={8}
                        className="w-full px-3 py-3 text-sm leading-relaxed text-gray-700 border-0 resize-y focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-b-lg"
                      />
                    ) : (
                      <pre className="whitespace-pre-wrap break-words px-3 py-3 text-sm leading-relaxed text-gray-700">
                        {chunk.content}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (
            /* ── 提炼知识 ── */
            candidates.length === 0 ? (
              <div className="py-16 text-center text-sm text-zinc-400">
                <p>暂无提炼知识</p>
                <p className="text-xs mt-1">请先在文档列表对该文档执行 AI 提炼</p>
              </div>
            ) : (
              <div className="space-y-3">
                {candidates.map((c) => (
                  <div key={c.id} className="rounded-lg border border-zinc-200 bg-zinc-50">
                    <div className="flex items-start justify-between px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${typeColors[c.type] || "bg-gray-100 text-gray-600"}`}>
                            {typeLabels[c.type] || c.type}
                          </span>
                          {c.suggested_category && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                              {c.suggested_category}
                            </span>
                          )}
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${statusBadge[c.status] || "bg-gray-100 text-gray-600"}`}>
                            {c.status === "confirmed" ? "已入库" : "待审核"}
                          </span>
                        </div>
                        <h3 className="font-medium text-gray-900 text-sm mb-1">{c.title}</h3>
                        <p className="text-xs text-gray-600 whitespace-pre-wrap line-clamp-4">{c.content}</p>
                        {c.suggested_tags.length > 0 && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {c.suggested_tags.map((tag: string) => (
                              <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 ml-3 flex-shrink-0">
                        <button
                          onClick={() => setEditTarget({ ...c })}
                          className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleDeleteCandidate(c.id)}
                          className="rounded px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* 编辑候选知识弹窗 */}
      {editTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
          onClick={() => setEditTarget(null)}
        >
          <div
            className="mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">编辑知识条目</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
                <input
                  value={editTarget.title}
                  onChange={(e) => setEditTarget({ ...editTarget, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">内容</label>
                <textarea
                  value={editTarget.content}
                  onChange={(e) => setEditTarget({ ...editTarget, content: e.target.value })}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
                  <input
                    value={editTarget.suggested_category || ""}
                    onChange={(e) => setEditTarget({ ...editTarget, suggested_category: e.target.value || null })}
                    placeholder="如：前端开发"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">知识类型</label>
                  <select
                    value={editTarget.type}
                    onChange={(e) => setEditTarget({ ...editTarget, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="concept">概念</option>
                    <option value="faq">问答</option>
                    <option value="procedure">步骤</option>
                    <option value="note">注意</option>
                    <option value="summary">总结</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">标签（逗号分隔）</label>
                <input
                  value={editTarget.suggested_tags.join(", ")}
                  onChange={(e) => setEditTarget({ ...editTarget, suggested_tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                  placeholder="如：React, Hooks"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setEditTarget(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">取消</button>
                <button onClick={handleSaveCandidate} disabled={!editTarget.title.trim() || !editTarget.content.trim() || saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "保存中..." : "保存修改"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
