"use client";

/**
 * 标签表单组件，负责收集标签名称、颜色和排序字段。
 */

import { useState } from "react";
import type { SyntheticEvent } from "react";

import type {
  KnowledgeTagDto,
  KnowledgeTagFormValues,
} from "@/features/knowledge/types";

const DEFAULT_COLOR = "#16a34a";

/** 标签表单组件参数。 */
type TagFormProps = {
  initialValue?: KnowledgeTagDto | null;
  submitting?: boolean;
  submitLabel?: string;
  onCancel?: () => void;
  onSubmit: (values: KnowledgeTagFormValues) => Promise<void> | void;
};

/** 渲染标签创建表单。 */
export function TagForm({
  initialValue = null,
  submitting = false,
  submitLabel,
  onCancel,
  onSubmit,
}: TagFormProps) {
  const [name, setName] = useState(initialValue?.name ?? "");
  const [color, setColor] = useState(initialValue?.color ?? DEFAULT_COLOR);
  const [sortOrder, setSortOrder] = useState(
    String(initialValue?.sortOrder ?? 0)
  );

  /** 拦截表单默认提交并把本地状态转换为标签表单值。 */
  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit({
      name,
      color,
      sortOrder: Number(sortOrder || 0),
    });
  };
  const safeColor = isHexColor(color) ? color : DEFAULT_COLOR;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-zinc-200 bg-zinc-50 p-4"
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_140px_120px]">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600">
            标签名称
          </span>
          <input
            value={name}
            maxLength={30}
            required
            disabled={submitting}
            onChange={(event) => setName(event.target.value)}
            className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-blue-500 disabled:bg-zinc-100"
            placeholder="例如：权限"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600">
            颜色
          </span>
          <div className="flex h-9 items-center gap-2 rounded-md border border-zinc-300 bg-white px-2">
            <input
              value={safeColor}
              type="color"
              disabled={submitting}
              onChange={(event) => setColor(event.target.value)}
              className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0 disabled:cursor-not-allowed"
            />
            <input
              value={color}
              disabled={submitting}
              onChange={(event) => setColor(event.target.value)}
              className="min-w-0 flex-1 text-xs text-zinc-600 outline-none disabled:bg-white"
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600">
            排序
          </span>
          <input
            value={sortOrder}
            type="number"
            step={1}
            disabled={submitting}
            onChange={(event) => setSortOrder(event.target.value)}
            className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-blue-500 disabled:bg-zinc-100"
          />
        </label>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            disabled={submitting}
            onClick={onCancel}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            取消
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "保存中..." : submitLabel ?? "保存标签"}
        </button>
      </div>
    </form>
  );
}

/** 判断字符串是否为可提交的 6 位 hex 色值。 */
function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}
