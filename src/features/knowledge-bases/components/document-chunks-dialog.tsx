"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RagChunk, RagDoc } from "@/features/knowledge-bases/types";

import { DocumentChunkList } from "./document-chunk-list";

type DocumentChunksDialogProps = {
  open: boolean;
  document: RagDoc | null;
  chunks: RagChunk[];
  loading?: boolean;
  error?: string | null;
  highlightedChunkId?: string | null;
  highlightedCategory?: string;
  highlightedTag?: string;
  searchKeyword?: string;
  onOpenChange: (open: boolean) => void;
};

export function DocumentChunksDialog({
  open,
  document,
  chunks,
  loading = false,
  error,
  highlightedChunkId,
  highlightedCategory,
  highlightedTag,
  searchKeyword,
  onOpenChange,
}: DocumentChunksDialogProps) {
  const safeChunks = Array.isArray(chunks) ? chunks : [];

  React.useEffect(() => {
    if (!open || loading || !highlightedChunkId) return;

    window.setTimeout(() => {
      globalThis.document
        .getElementById(`chunk-${highlightedChunkId}`)
        ?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
    }, 80);
  }, [highlightedChunkId, loading, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            知识分片 - {document?.title ?? document?.name ?? "未命名文档"}
          </DialogTitle>
        </DialogHeader>

        {error ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="size-4" />
            {error}
          </div>
        ) : null}

        {loading ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              正在加载知识分片...
            </CardContent>
          </Card>
        ) : safeChunks.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              暂无知识分片
            </CardContent>
          </Card>
        ) : (
          <div className="max-h-[65vh] overflow-y-auto pr-1">
            <DocumentChunkList
              chunks={safeChunks}
              highlightedChunkId={highlightedChunkId}
              highlightedCategory={highlightedCategory}
              highlightedTag={highlightedTag}
              searchKeyword={searchKeyword}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
