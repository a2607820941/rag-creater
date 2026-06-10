"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { KnowledgeTagDto } from "@/features/knowledge/types";

import { KnowledgeBaseTagBadge } from "./knowledge-base-tag-badge";

type KnowledgeBaseTagEditorProps = {
  allTags: KnowledgeTagDto[];
  selectedTagIds: string[];
  disabled?: boolean;
  onChange: (tagIds: string[]) => void;
  onCreateClick: () => void;
};

const MAX_SELECTED_TAGS = 10;

export function KnowledgeBaseTagEditor({
  allTags,
  selectedTagIds,
  disabled = false,
  onChange,
  onCreateClick,
}: KnowledgeBaseTagEditorProps) {
  const selectedIdSet = new Set(selectedTagIds);
  const selectedTags = allTags.filter((tag) => selectedIdSet.has(tag.id));
  const availableTags = allTags.filter((tag) => !selectedIdSet.has(tag.id));
  const reachedLimit = selectedTagIds.length >= MAX_SELECTED_TAGS;

  function addTag(tagId: string) {
    if (disabled || reachedLimit || selectedIdSet.has(tagId)) return;
    onChange([...selectedTagIds, tagId]);
  }

  function removeTag(tagId: string) {
    if (disabled) return;
    onChange(selectedTagIds.filter((id) => id !== tagId));
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">标签</div>
          <div className="text-xs text-muted-foreground">
            最多绑定 10 个，卡片展示前 5 个
          </div>
        </div>
        <Button
          type="button"
          size="icon"
          className="h-8 w-8 bg-blue-600 hover:bg-blue-700"
          disabled={disabled}
          onClick={onCreateClick}
          aria-label="新增标签"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex min-h-8 flex-wrap gap-1.5">
        {selectedTags.length > 0 ? (
          selectedTags.map((tag) => (
            <KnowledgeBaseTagBadge
              key={tag.id}
              tag={tag}
              removable
              onRemove={removeTag}
            />
          ))
        ) : (
          <span className="text-xs text-muted-foreground">暂无已选标签</span>
        )}
      </div>

      <div className="border-t border-border pt-3">
        <div className="mb-2 text-xs font-medium text-muted-foreground">
          可选标签
        </div>
        <div className="flex flex-wrap gap-1.5">
          {availableTags.length > 0 ? (
            availableTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                disabled={disabled || reachedLimit}
                onClick={() => addTag(tag.id)}
                className="disabled:cursor-not-allowed disabled:opacity-50"
              >
                <KnowledgeBaseTagBadge tag={tag} />
              </button>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">暂无可选标签</span>
          )}
        </div>
        {reachedLimit ? (
          <div className="mt-2 text-xs text-destructive">
            单个知识库最多绑定 10 个标签
          </div>
        ) : null}
      </div>
    </div>
  );
}
