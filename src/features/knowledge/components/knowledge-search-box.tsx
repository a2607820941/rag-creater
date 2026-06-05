"use client";

/**
 * 知识搜索框组件，提供关键词输入、清空、提交和可选防抖通知能力。
 */

import { useEffect } from "react";
import type { KeyboardEvent } from "react";

export type KnowledgeSearchBoxProps = {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
  debounceMs?: number;
  onChange: (value: string) => void;
  onSearch?: (keyword: string) => void;
  onClear?: () => void;
  onDebouncedChange?: (keyword: string) => void;
};

/** 渲染受控知识搜索框，不直接绑定任何后端查询接口。 */
export function KnowledgeSearchBox({
  value,
  placeholder = "搜索知识标题、摘要或正文关键词",
  disabled = false,
  loading = false,
  autoFocus = false,
  maxLength = 100,
  debounceMs,
  onChange,
  onSearch,
  onClear,
  onDebouncedChange,
}: KnowledgeSearchBoxProps) {
  const trimmedKeyword = value.trim();
  const canSubmit = !disabled && !loading;
  const showClearButton = value.length > 0 && !disabled;

  useEffect(() => {
    if (!onDebouncedChange || debounceMs === undefined) return;

    const timer = window.setTimeout(() => {
      onDebouncedChange(value.trim());
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [debounceMs, onDebouncedChange, value]);

  /** 提交当前关键词，并在提交前统一去除首尾空格。 */
  const submitSearch = () => {
    if (!canSubmit) return;
    onSearch?.(trimmedKeyword);
  };

  /** 清空当前关键词并通知调用方。 */
  const clearSearch = () => {
    if (disabled) return;
    onChange("");
    onClear?.();
  };

  /** 在输入框内按 Enter 时触发搜索提交。 */
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submitSearch();
  };

  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <input
          value={value}
          autoFocus={autoFocus}
          disabled={disabled}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 pr-16 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400"
        />
        {showClearButton && (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          >
            清空
          </button>
        )}
      </div>
      <button
        type="button"
        disabled={!canSubmit}
        onClick={submitSearch}
        className="h-10 rounded-md bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {loading ? "搜索中..." : "搜索"}
      </button>
    </div>
  );
}
