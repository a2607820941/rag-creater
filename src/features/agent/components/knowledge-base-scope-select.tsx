"use client";

import { useEffect, useMemo, useState } from "react";

import {
  fetchActiveKnowledgeBaseOptions,
  type AgentKnowledgeBaseOption,
} from "@/features/agent/api/knowledge-bases";

type KnowledgeBaseScopeSelectProps = {
  value: string[];
  onChange: (nextIds: string[]) => void;
};

export function KnowledgeBaseScopeSelect({
  value,
  onChange,
}: KnowledgeBaseScopeSelectProps) {
  const [items, setItems] = useState<AgentKnowledgeBaseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadKnowledgeBases() {
      setLoading(true);
      setError(null);

      try {
        const nextItems = await fetchActiveKnowledgeBaseOptions(
          controller.signal
        );
        if (!controller.signal.aborted) {
          setItems(nextItems);
        }
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "知识库列表加载失败"
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadKnowledgeBases();

    return () => {
      controller.abort();
    };
  }, []);

  const selectedIds = useMemo(() => new Set(value), [value]);
  const visibleIds = useMemo(() => new Set(items.map((item) => item.id)), [
    items,
  ]);
  const missingIds = value.filter((id) => !visibleIds.has(id));

  const toggleKnowledgeBase = (id: string) => {
    if (selectedIds.has(id)) {
      onChange(value.filter((item) => item !== id));
      return;
    }

    onChange([...value, id]);
  };

  const clearSelection = () => {
    onChange([]);
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-zinc-800">绑定知识库</div>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            从已启用的知识库中选择 Agent 允许检索的范围。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-500">
            必填 · {value.length}
          </span>
          {value.length > 0 ? (
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-800"
            >
              清空
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="rounded-md border border-dashed border-zinc-200 bg-white px-3 py-6 text-center text-sm text-zinc-500">
          正在加载知识库...
        </div>
      ) : error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-200 bg-white px-3 py-6 text-center text-sm text-zinc-500">
          暂无启用知识库。可以先保存草稿，等知识库启用后再回来绑定。
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {items.map((item) => {
            const checked = selectedIds.has(item.id);

            return (
              <label
                key={item.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-3 transition-colors ${
                  checked
                    ? "border-cyan-400 bg-cyan-50"
                    : "border-zinc-200 hover:border-zinc-300"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleKnowledgeBase(item.id)}
                  className="mt-1 h-4 w-4"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-900">
                    {item.name}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-xs leading-5 text-zinc-500">
                    {item.description || "暂无描述"}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-400">
                    <span>文档 {item.documentCount}</span>
                    <span>片段 {item.chunkCount}</span>
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}

      {missingIds.length > 0 ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
          已保存的部分知识库当前未启用或不存在，仍会保留 ID：
          {missingIds.join("、")}
        </div>
      ) : null}
    </div>
  );
}
