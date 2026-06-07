"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import CandidateList from "@/features/extraction/components/candidate-list";
import CandidateEditor from "@/features/extraction/components/candidate-editor";
import ConfirmDialog from "@/features/extraction/components/confirm-dialog";

interface Candidate {
  id: string;
  title: string;
  content: string;
  suggested_category: string | null;
  suggested_tags: string[];
  type: string;
  status: string;
  sourceType?: string | null;
  documentTitle?: string | null;
}

interface KnowledgeBaseItem {
  id: string;
  name: string;
  description?: string;
  status: string;
}

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [editTarget, setEditTarget] = useState<Candidate | null>(null);
  const [message, setMessage] = useState("");

  // 确认入库弹窗状态
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingConfirmIds, setPendingConfirmIds] = useState<string[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseItem[]>(
    []
  );
  const [selectedCandidateId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("candidateId");
  });

  const router = useRouter();

  const fetchCandidates = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/knowledge/candidates");
      const data = await res.json();
      if (data.success) {
        setCandidates(data.data.candidates);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const fetchKnowledgeBases = async () => {
    try {
      const res = await fetch("/api/rag-management/knowledge-bases");
      const json = await res.json();
      const list = json?.data ?? json;
      if (Array.isArray(list)) {
        setKnowledgeBases(
          list.filter((kb: KnowledgeBaseItem) => kb.status === "active")
        );
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      fetchCandidates();
      fetchKnowledgeBases();
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  // 确认入库 - 第一步：打开弹窗选择知识库
  const handleConfirmRequest = (ids: string[]) => {
    setPendingConfirmIds(ids);
    setConfirmDialogOpen(true);
  };

  // 确认入库 - 第二步：选择知识库后实际执行
  const handleConfirmWithKb = async (kbIds: string[]) => {
    setActionLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/knowledge/candidates/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: pendingConfirmIds,
          knowledgeBaseIds: kbIds,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(
          `已将 ${pendingConfirmIds.length} 条知识确认入库到 ${kbIds.length} 个知识库`
        );
        setPendingConfirmIds([]);
        // 跳转到第一个选中的知识库详情页
        if (kbIds.length > 0) {
          setTimeout(() => {
            router.push(`/knowledge-bases/${kbIds[0]}`);
          }, 800);
        } else {
          fetchCandidates();
        }
      }
    } catch {
      setMessage("入库操作失败");
    } finally {
      setActionLoading(false);
    }
  };

  // 单个删除（硬删除）
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/knowledge/candidates/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setCandidates((prev) => prev.filter((c) => c.id !== id));
        setMessage("已删除该候选知识");
      }
    } catch {
      setMessage("删除失败");
    }
  };

  // 批量删除
  const handleBatchDelete = async (ids: string[]) => {
    setActionLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/knowledge/candidates/batch-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (data.success) {
        setCandidates((prev) =>
          prev.filter((c) => !ids.includes(c.id))
        );
        setMessage(`已批量删除 ${data.data.succeeded} 条候选知识`);
      }
    } catch {
      setMessage("批量删除失败");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetry = () => {
    router.push("/documents");
  };

  const handleEditSave = async (updated: Omit<Candidate, "status">) => {
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === updated.id ? { ...updated, status: c.status } : c
      )
    );
    setEditTarget(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">审核工作台</h1>
            <p className="text-gray-500 mt-1">
              审核 AI 生成的候选知识，编辑后确认入库或删除
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/documents")}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              ← 返回文档管理
            </button>
            <button
              onClick={fetchCandidates}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              刷新列表
            </button>
          </div>
        </div>

        {message && (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm">
            {message}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-400">加载中...</div>
        ) : (
          <CandidateList
            candidates={candidates}
            initialSelectedId={selectedCandidateId}
            onConfirm={handleConfirmRequest}
            onDelete={handleDelete}
            onBatchDelete={handleBatchDelete}
            onEdit={(c) => setEditTarget({ ...c, status: "pending" })}
            onRetry={handleRetry}
            loading={actionLoading}
          />
        )}

        {editTarget && (
          <CandidateEditor
            candidate={editTarget}
            onSave={handleEditSave}
            onCancel={() => setEditTarget(null)}
          />
        )}

        <ConfirmDialog
          open={confirmDialogOpen}
          onOpenChange={setConfirmDialogOpen}
          candidateCount={pendingConfirmIds.length}
          knowledgeBases={knowledgeBases}
          loading={actionLoading}
          onConfirm={handleConfirmWithKb}
        />
      </div>
    </div>
  );
}
