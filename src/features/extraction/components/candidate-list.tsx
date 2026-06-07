"use client";

import { useEffect, useState } from "react";
import CandidateCard from "./candidate-card";

interface Candidate {
  id: string;
  title: string;
  content: string;
  suggested_category: string | null;
  suggested_tags: string[];
  type: string;
  sourceType?: string | null;
  documentTitle?: string | null;
}

interface Props {
  candidates: Candidate[];
  initialSelectedId?: string | null;
  onConfirm: (ids: string[]) => void;
  onDelete: (id: string) => void;
  onBatchDelete: (ids: string[]) => void;
  onEdit: (candidate: Candidate) => void;
  onRetry: () => void;
  loading: boolean;
}

export default function CandidateList({
  candidates,
  initialSelectedId = null,
  onConfirm,
  onDelete,
  onBatchDelete,
  onEdit,
  onRetry,
  loading,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!initialSelectedId) {
      return;
    }

    const targetExists = candidates.some(
      (candidate) => candidate.id === initialSelectedId
    );

    if (!targetExists) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setSelected(new Set([initialSelectedId]));
      const element = document.getElementById(`candidate-${initialSelectedId}`);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [candidates, initialSelectedId]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === candidates.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(candidates.map((c) => c.id)));
    }
  };

  const handleConfirm = () => {
    if (selected.size === 0) return;
    onConfirm(Array.from(selected));
    setSelected(new Set());
  };

  if (candidates.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-lg">暂无候选知识</p>
        <p className="text-sm mt-1">
          输入文本并点击「AI 提炼知识」生成候选知识
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={
                selected.size === candidates.length &&
                candidates.length > 0
              }
              onChange={toggleAll}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            全选
          </label>
          <span className="text-sm text-gray-400">
            已选 {selected.size} / {candidates.length} 条
          </span>
        </div>

        <div className="flex gap-2 items-center">
          <button
            onClick={handleConfirm}
            disabled={selected.size === 0 || loading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            确认入库 ({selected.size})
          </button>
          <button
            onClick={() => {
              if (selected.size === 0) return;
              onBatchDelete(Array.from(selected));
              setSelected(new Set());
            }}
            disabled={selected.size === 0 || loading}
            className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            批量删除 ({selected.size})
          </button>
          <button
            onClick={onRetry}
            disabled={loading}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            重新提炼
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {candidates.map((c) => (
          <CandidateCard
            key={c.id}
            candidate={c}
            selected={selected.has(c.id)}
            highlighted={initialSelectedId === c.id}
            onToggle={toggle}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
