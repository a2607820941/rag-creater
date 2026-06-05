"use client";

import { Badge } from "@/components/ui/badge";
import { SearchHighlight } from "@/features/knowledge";
import type { RagChunk } from "@/features/knowledge-bases/types";
import { cn } from "@/lib/utils";

const CHUNK_TYPE_LABELS: Record<string, string> = {
  text: "文本分片",
  knowledge: "AI 知识",
  wiki: "Wiki",
  summary: "摘要",
  qa: "问答",
};

const REVIEW_STATUS_LABELS: Record<string, string> = {
  pending: "待审核",
  confirmed: "已入库",
  rejected: "已拒绝",
};

const REVIEW_STATUS_COLORS: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  confirmed: "border-green-200 bg-green-50 text-green-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
};

function parseTags(value?: string | null) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map(String).map((item) => item.trim()).filter(Boolean)
      : [];
  } catch {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

type DocumentChunkListProps = {
  chunks: RagChunk[];
  highlightedChunkId?: string | null;
  highlightedCategory?: string;
  highlightedTag?: string;
  searchKeyword?: string;
};

export function DocumentChunkList({
  chunks,
  highlightedChunkId,
  highlightedCategory,
  highlightedTag,
  searchKeyword,
}: DocumentChunkListProps) {
  if (chunks.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
        暂无分片数据
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {chunks.map((chunk) => {
        const tags = parseTags(chunk.suggestedTags);
        const categoryHighlighted =
          Boolean(highlightedCategory) &&
          chunk.suggestedCategory === highlightedCategory;
        const charCount =
          typeof chunk.startIndex === "number" &&
          typeof chunk.endIndex === "number"
            ? Math.max(chunk.endIndex - chunk.startIndex, 0)
            : chunk.charCount;

        return (
          <article
            key={chunk.id}
            id={`chunk-${chunk.id}`}
            className={`rounded-md border p-3 ${
              highlightedChunkId === chunk.id
                ? "border-blue-300 bg-blue-50 ring-2 ring-blue-200"
                : "bg-muted/20"
            }`}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline">#{(chunk.chunkIndex ?? 0) + 1}</Badge>
              {chunk.chunkType ? (
                <Badge
                  variant={chunk.chunkType === "knowledge" ? "default" : "secondary"}
                  className={
                    chunk.chunkType === "knowledge"
                      ? "bg-blue-100 text-blue-700 hover:bg-blue-100"
                      : ""
                  }
                >
                  {CHUNK_TYPE_LABELS[chunk.chunkType] || chunk.chunkType}
                </Badge>
              ) : null}
              {chunk.reviewStatus ? (
                <Badge
                  variant="outline"
                  className={REVIEW_STATUS_COLORS[chunk.reviewStatus] || ""}
                >
                  {REVIEW_STATUS_LABELS[chunk.reviewStatus] || chunk.reviewStatus}
                </Badge>
              ) : null}
              {typeof charCount === "number" ? (
                <span className="text-xs text-muted-foreground">
                  {charCount} 字符
                </span>
              ) : null}
            </div>
            {chunk.title ? (
              <div className="mb-1 text-sm font-medium">
                <SearchHighlight text={chunk.title} keyword={searchKeyword} />
              </div>
            ) : null}
            <p className="max-h-48 overflow-auto whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              <SearchHighlight
                text={chunk.content || ""}
                keyword={searchKeyword}
                emptyText="暂无内容"
              />
            </p>
            {chunk.suggestedCategory || tags.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {chunk.suggestedCategory ? (
                  <Badge
                    variant="outline"
                    className={cn(
                      "max-w-full",
                      categoryHighlighted &&
                        "border-primary/50 bg-primary/10 text-primary ring-1 ring-primary/30"
                    )}
                  >
                    分类：{chunk.suggestedCategory}
                  </Badge>
                ) : null}
                {tags.map((tag) => {
                  const tagHighlighted =
                    Boolean(highlightedTag) && tag === highlightedTag;

                  return (
                    <Badge
                      key={tag}
                      variant="outline"
                      className={cn(
                        "max-w-full",
                        tagHighlighted &&
                          "border-primary/50 bg-primary/10 text-primary ring-1 ring-primary/30"
                      )}
                    >
                      标签：{tag}
                    </Badge>
                  );
                })}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
