"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import type { KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type NoteTopbarProps = {
  title: string;
  updatedAt?: string;
  titleEditing: boolean;
  disabled: boolean;
  deletingDisabled: boolean;
  sourceEnabled: boolean;
  sourceToggleDisabled: boolean;
  sourceToggleLoading: boolean;
  onTitleClick: () => void;
  onTitleChange: (title: string) => void;
  onTitleSave: () => void;
  onSourceEnabledChange: (enabled: boolean) => void;
  onSave: () => void;
  onCreate: () => void;
  onDelete: () => void;
};

export function NoteTopbar({
  title,
  updatedAt,
  titleEditing,
  disabled,
  deletingDisabled,
  sourceEnabled,
  sourceToggleDisabled,
  sourceToggleLoading,
  onTitleClick,
  onTitleChange,
  onTitleSave,
  onSourceEnabledChange,
  onSave,
  onCreate,
  onDelete,
}: NoteTopbarProps) {
  function handleTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      onTitleSave();
    }
  }

  return (
    <div className="flex min-h-16 items-center justify-between gap-4 border-b bg-background px-4 py-3">
      <div className="min-w-0 flex-1">
        {titleEditing ? (
          <Input
            autoFocus
            className="h-8 max-w-md"
            onBlur={onTitleSave}
            onChange={(event) => onTitleChange(event.target.value)}
            onKeyDown={handleTitleKeyDown}
            value={title}
          />
        ) : (
          <button
            className="block max-w-md truncate text-left text-lg font-semibold"
            disabled={disabled}
            onClick={onTitleClick}
            type="button"
          >
            {title || "未命名文档"}
          </button>
        )}
        {updatedAt ? (
          <p className="mt-1 text-xs text-muted-foreground">
            最后更新：{new Date(updatedAt).toLocaleString()}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          title="是否成为知识源"
          aria-label="是否成为知识源"
          aria-pressed={sourceEnabled}
          disabled={sourceToggleDisabled || sourceToggleLoading}
          onClick={() => onSourceEnabledChange(!sourceEnabled)}
          className={cn(
            "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            sourceEnabled
              ? "border-emerald-500 bg-emerald-500"
              : "border-red-500 bg-red-500"
          )}
        >
          <span
            className={cn(
              "inline-block size-6 rounded-full bg-white shadow transition-transform",
              sourceEnabled ? "translate-x-6" : "translate-x-1"
            )}
          />
        </button>
        <Button disabled={disabled} onClick={onSave} variant="outline">
          <Save aria-hidden="true" data-icon="inline-start" />
          保存
        </Button>
        <Button disabled={disabled} onClick={onCreate} variant="outline">
          <Plus aria-hidden="true" data-icon="inline-start" />
          新建
        </Button>
        <Button
          disabled={deletingDisabled}
          onClick={onDelete}
          variant="destructive"
        >
          <Trash2 aria-hidden="true" data-icon="inline-start" />
          删除
        </Button>
      </div>
    </div>
  );
}
