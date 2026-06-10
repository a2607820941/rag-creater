"use client";

import { X } from "lucide-react";

import type { RagTag } from "@/features/knowledge-bases/types";
import { cn } from "@/lib/utils";

type KnowledgeBaseTagBadgeProps = {
  tag: Pick<RagTag, "id" | "name" | "color">;
  removable?: boolean;
  onRemove?: (tagId: string) => void;
  className?: string;
};

function softenHexColor(color: string) {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);

  const mixWithWhite = (value: number) =>
    Math.round(value + (255 - value) * 0.48)
      .toString(16)
      .padStart(2, "0");

  return `#${mixWithWhite(red)}${mixWithWhite(green)}${mixWithWhite(blue)}`;
}

export function KnowledgeBaseTagBadge({
  tag,
  removable = false,
  onRemove,
  className,
}: KnowledgeBaseTagBadgeProps) {
  const color =
    tag.color && /^#[0-9a-fA-F]{6}$/.test(tag.color) ? tag.color : "#64748B";
  const displayColor = softenHexColor(color);

  return (
    <span
      className={cn(
        "group inline-flex h-6 max-w-20 items-center gap-1 rounded-md border px-2 text-xs font-medium leading-none text-black",
        className
      )}
      style={{
        backgroundColor: displayColor,
        borderColor: displayColor,
      }}
      title={tag.name}
    >
      <span className="truncate">{tag.name}</span>
      {removable ? (
        <button
          type="button"
          className="hidden rounded-full p-0.5 hover:bg-black/10 group-hover:inline-flex"
          onClick={(event) => {
            event.stopPropagation();
            onRemove?.(tag.id);
          }}
          aria-label={`移除标签 ${tag.name}`}
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}
