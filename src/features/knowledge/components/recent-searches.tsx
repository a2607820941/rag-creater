"use client";

/**
 * 最近搜索记录组件，负责展示和操作知识搜索历史关键词。
 */

import type { RecentKnowledgeSearch } from "@/features/knowledge/types";

export type RecentSearchesProps = {
  searches: RecentKnowledgeSearch[];
  disabled?: boolean;
  title?: string;
  emptyText?: string;
  onSelect: (keyword: string) => void;
  onRemove?: (keyword: string) => void;
  onClear?: () => void;
};

/** 渲染最近搜索记录列表，并提供回填、删除和清空操作。 */
export function RecentSearches({
  searches,
  disabled = false,
  title = "最近搜索",
  emptyText = "暂无最近搜索",
  onSelect,
  onRemove,
  onClear,
}: RecentSearchesProps) {
  if (searches.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="text-sm font-medium text-zinc-700">{title}</div>
        <div className="mt-2 text-sm text-zinc-400">{emptyText}</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-zinc-700">{title}</div>
        {onClear && (
          <button
            type="button"
            disabled={disabled}
            onClick={onClear}
            className="rounded px-2 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            清空
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {searches.map((item) => (
          <span
            key={`${item.keyword}-${item.searchedAt}`}
            className="inline-flex overflow-hidden rounded-full border border-zinc-200 bg-zinc-50"
          >
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(item.keyword)}
              className="px-3 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
              title={formatSearchTime(item.searchedAt)}
            >
              {item.keyword}
            </button>
            {onRemove && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemove(item.keyword)}
                className="border-l border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={`删除最近搜索：${item.keyword}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 将最近搜索时间格式化为悬停提示文案。 */
function formatSearchTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "搜索时间未知";

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
