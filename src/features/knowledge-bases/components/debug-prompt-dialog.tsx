"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  RagDebugMode,
  RagDebugViewResult,
} from "@/features/knowledge-bases/types";

type DebugPromptDialogProps = {
  open: boolean;
  query: string;
  queryRewriteEnabled: boolean;
  mode: RagDebugMode;
  topK: number;
  similarityThreshold: number;
  result: RagDebugViewResult | null;
  onOpenChange: (open: boolean) => void;
};

export function DebugPromptDialog({
  open,
  query,
  queryRewriteEnabled,
  mode,
  topK,
  similarityThreshold,
  result,
  onOpenChange,
}: DebugPromptDialogProps) {
  const [copied, setCopied] = useState(false);
  const llmContext = result?.llmContext ?? "";

  async function copyContext() {
    await navigator.clipboard.writeText(llmContext);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[82vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Prompt 预览</DialogTitle>
          <DialogDescription>
            当前版本展示底层 RAG 返回的完整 llmContext，可能与前端过滤后的卡片数量不完全一致。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground md:grid-cols-2">
            <div className="md:col-span-2">
              <span className="font-medium text-foreground">原始问题：</span>
              {query || "--"}
            </div>
            <div>检索模式：{mode}</div>
            <div>
              Query Rewrite：
              {queryRewriteEnabled
                ? "保留开关，沿用系统默认策略"
                : "关闭前端开关，底层仍沿用系统默认策略"}
            </div>
            <div>前端 TopK：{topK}</div>
            <div>前端阈值：{similarityThreshold}</div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">llmContext</div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyContext}
              disabled={!llmContext}
            >
              {copied ? (
                <Check data-icon="inline-start" />
              ) : (
                <Copy data-icon="inline-start" />
              )}
              {copied ? "已复制" : "复制"}
            </Button>
          </div>

          {llmContext ? (
            <pre className="max-h-[46vh] overflow-auto whitespace-pre-wrap rounded-md border bg-background p-4 text-xs leading-6 text-foreground">
              {llmContext}
            </pre>
          ) : (
            <div className="rounded-md border border-dashed bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
              本次没有可用于拼接 Prompt 的上下文。
            </div>
          )}

          {result?.references.length ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">References</div>
              <div className="grid gap-2">
                {result.references.map((reference) => (
                  <div
                    key={`${reference.refId}-${reference.chunkId}`}
                    className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
                  >
                    <span className="font-medium text-foreground">
                      [{reference.refId}]
                    </span>{" "}
                    {reference.title} · {reference.chunkType} ·{" "}
                    {reference.chunkId}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
