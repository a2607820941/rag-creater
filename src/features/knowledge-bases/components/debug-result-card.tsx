"use client";

import { FileText, Hash, Layers, Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { RagDebugHit } from "@/features/knowledge-bases/types";

type DebugResultCardProps = {
  hit: RagDebugHit;
};

function formatScore(score: number) {
  return Number.isFinite(score) ? score.toFixed(3) : "0.000";
}

function summarizeContent(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return "暂无内容";
  return normalized.length > 260
    ? `${normalized.slice(0, 260)}...`
    : normalized;
}

export function DebugResultCard({ hit }: DebugResultCardProps) {
  return (
    <article className="rounded-lg border bg-background p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">#{hit.rank}</Badge>
            {hit.refId ? <Badge variant="outline">[{hit.refId}]</Badge> : null}
            <Badge variant="outline">{hit.chunkType}</Badge>
            {hit.includedInPrompt ? (
              <Badge className="bg-emerald-600 text-white">进入 Prompt</Badge>
            ) : (
              <Badge variant="outline">未进入 Prompt</Badge>
            )}
          </div>
          <h3 className="break-words text-sm font-semibold text-foreground">
            {hit.title || "未命名 Chunk"}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
          <Target className="size-3.5" />
          {formatScore(hit.score)}
        </div>
      </div>

      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
        {summarizeContent(hit.content)}
      </p>

      <div className="mt-4 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="size-3.5 shrink-0" />
          <span className="truncate">知识：{hit.knowledgeId}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Hash className="size-3.5 shrink-0" />
          <span className="truncate">Chunk：{hit.chunkId}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2 md:col-span-2">
          <Layers className="size-3.5 shrink-0" />
          <span className="truncate">知识库：{hit.knowledgeBaseId}</span>
        </div>
      </div>
    </article>
  );
}
