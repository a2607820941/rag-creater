# RAG Debug Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/knowledge-bases/[id]` 详情页新增 `Debug` tab，基于现有 `/api/rag/retrieve` 接口展示 RAG 召回结果、前端参数过滤、Prompt 预览和配置保存。

**Architecture:** 第一版只做前端 Debug 工作台，不新增数据库表、不新增 Debug API、不改造 `retrieveRagContexts`。Debug 面板调用现有 RAG retrieve 接口获取 `RagRetrieveResponse`，在前端转换为展示模型，并使用现有知识库更新接口保存 `topK` 和 `similarityThreshold` 配置字段。

**Tech Stack:** Next.js App Router、React、TypeScript、Tailwind CSS、shadcn/ui、lucide-react、现有 `src/features/knowledge-bases/api.ts`、现有 `/api/rag/retrieve`。

---

## File Structure

- Modify: `src/features/knowledge-bases/types.ts`
  - Add Debug view model types used by the knowledge-base detail UI.
- Modify: `src/features/knowledge-bases/api.ts`
  - Add `debugKnowledgeBase()` wrapper around `POST /api/rag/retrieve`.
- Create: `src/features/knowledge-bases/components/debug-result-card.tsx`
  - Render one retrieved chunk card.
- Create: `src/features/knowledge-bases/components/debug-prompt-dialog.tsx`
  - Render the Prompt preview dialog.
- Create: `src/features/knowledge-bases/components/debug-panel.tsx`
  - Own Debug local state, parameter form, request flow, diagnostics, result list, and config save flow.
- Modify: `src/features/knowledge-bases/components/knowledge-base-detail-feature.tsx`
  - Add `Debug` tab and render `DebugPanel`.
- Verification only: `npm run build`, `npm run lint`, manual route checks.

---

### Task 1: Add Debug Types And API Wrapper

**Files:**
- Modify: `src/features/knowledge-bases/types.ts`
- Modify: `src/features/knowledge-bases/api.ts`

- [ ] **Step 1: Add Debug types**

Append these types to `src/features/knowledge-bases/types.ts`.

```ts
export type RagDebugMode = "fast" | "balanced" | "detailed";

export type RagDebugRequest = {
  query: string;
  mode: RagDebugMode;
  topK: number;
  similarityThreshold: number;
  queryRewriteEnabled: boolean;
};

export type RagDebugDiagnostic = {
  level: "info" | "warning" | "success";
  title: string;
  message: string;
};

export type RagDebugHit = {
  rank: number;
  chunkId: string;
  knowledgeId: string;
  knowledgeBaseId: string;
  title: string;
  content: string;
  chunkType: string;
  score: number;
  refId?: string;
  includedInPrompt: boolean;
};

export type RagDebugViewResult = {
  query: string;
  results: RagDebugHit[];
  llmContext: string;
  references: Array<{
    refId: string;
    knowledgeBaseId: string;
    knowledgeId: string;
    chunkId: string;
    title: string;
    chunkType: string;
  }>;
  diagnostics: RagDebugDiagnostic[];
  summary: {
    returnedCount: number;
    promptContextCount: number;
    topScore: number | null;
    noHit: boolean;
  };
};
```

- [ ] **Step 2: Add API wrapper imports**

At the top of `src/features/knowledge-bases/api.ts`, add type imports.

```ts
import type { RagRetrieveResponse } from "@/features/rag/types";
import type { RagDebugRequest } from "@/features/knowledge-bases/types";
```

- [ ] **Step 3: Add `debugKnowledgeBase` wrapper**

Append this function to `src/features/knowledge-bases/api.ts`.

```ts
export async function debugKnowledgeBase(
  knowledgeBaseId: string,
  payload: RagDebugRequest
) {
  const response = await fetch("/api/rag/retrieve", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: payload.query,
      mode: payload.mode,
      scope: {
        knowledgeBaseIds: [knowledgeBaseId],
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to debug knowledge base: ${response.status}`);
  }

  return readApiData<RagRetrieveResponse>(response);
}
```

- [ ] **Step 4: Run type check through build**

Run:

```bash
npm run build
```

Expected:

```text
Build may still fail if unrelated existing project issues exist. If it fails, confirm there are no errors from the new RagDebug types or debugKnowledgeBase wrapper before continuing.
```

---

### Task 2: Build Debug Result Card

**Files:**
- Create: `src/features/knowledge-bases/components/debug-result-card.tsx`

- [ ] **Step 1: Create `debug-result-card.tsx`**

Create `src/features/knowledge-bases/components/debug-result-card.tsx` with:

```tsx
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
  return normalized.length > 260 ? `${normalized.slice(0, 260)}...` : normalized;
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
```

- [ ] **Step 2: Run lint for the new file**

Run:

```bash
npm run lint -- src/features/knowledge-bases/components/debug-result-card.tsx
```

Expected:

```text
No lint errors from debug-result-card.tsx.
```

---

### Task 3: Build Prompt Preview Dialog

**Files:**
- Create: `src/features/knowledge-bases/components/debug-prompt-dialog.tsx`

- [ ] **Step 1: Create `debug-prompt-dialog.tsx`**

Create `src/features/knowledge-bases/components/debug-prompt-dialog.tsx` with:

```tsx
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
import type { RagDebugMode, RagDebugViewResult } from "@/features/knowledge-bases/types";

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
            <div>Query Rewrite：{queryRewriteEnabled ? "保留开关，沿用系统默认策略" : "关闭前端开关，底层仍沿用系统默认策略"}</div>
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
              {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
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
                    <span className="font-medium text-foreground">[{reference.refId}]</span>{" "}
                    {reference.title} · {reference.chunkType} · {reference.chunkId}
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
```

- [ ] **Step 2: Run lint for the dialog**

Run:

```bash
npm run lint -- src/features/knowledge-bases/components/debug-prompt-dialog.tsx
```

Expected:

```text
No lint errors from debug-prompt-dialog.tsx.
```

---

### Task 4: Build Debug Panel

**Files:**
- Create: `src/features/knowledge-bases/components/debug-panel.tsx`

- [ ] **Step 1: Create `debug-panel.tsx` imports, types, and helpers**

Create `src/features/knowledge-bases/components/debug-panel.tsx` with this first section:

```tsx
"use client";

import * as React from "react";
import {
  AlertCircle,
  Bug,
  FileSearch,
  Loader2,
  Save,
  SearchCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { RagContext, RagRetrieveResponse } from "@/features/rag/types";
import {
  debugKnowledgeBase,
  updateKnowledgeBase,
} from "@/features/knowledge-bases/api";
import type {
  RagDebugDiagnostic,
  RagDebugHit,
  RagDebugMode,
  RagDebugViewResult,
} from "@/features/knowledge-bases/types";

import { DebugPromptDialog } from "./debug-prompt-dialog";
import { DebugResultCard } from "./debug-result-card";

type DebugPanelProps = {
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  initialTopK: number;
  initialSimilarityThreshold: number;
  onConfigSaved?: () => void | Promise<void>;
};

const MODE_OPTIONS: Array<{ value: RagDebugMode; label: string }> = [
  { value: "fast", label: "Fast" },
  { value: "balanced", label: "Balanced" },
  { value: "detailed", label: "Detailed" },
];

function clampTopK(value: number) {
  if (!Number.isFinite(value)) return 5;
  return Math.min(20, Math.max(1, Math.trunc(value)));
}

function clampThreshold(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function findRefId(
  references: RagRetrieveResponse["references"],
  chunkId: string
) {
  return references.find((reference) => reference.chunkId === chunkId)?.refId;
}

function buildDiagnostics(input: {
  filteredResults: RagDebugHit[];
  rawContexts: RagContext[];
  threshold: number;
  queryRewriteEnabled: boolean;
}): RagDebugDiagnostic[] {
  const diagnostics: RagDebugDiagnostic[] = [];
  const topScore = input.rawContexts[0]?.score ?? null;

  if (input.queryRewriteEnabled) {
    diagnostics.push({
      level: "info",
      title: "Query Rewrite 使用系统默认策略",
      message:
        "当前版本保留前端开关，但不向底层 RAG 传递请求级 rewrite 参数，也不展示伪造改写结果。",
    });
  }

  if (input.rawContexts.length === 0) {
    diagnostics.push({
      level: "warning",
      title: "没有召回结果",
      message:
        "现有 RAG 接口没有返回上下文。请检查当前知识库是否已引用可用文档，或确认文档是否已解析并生成可用分片。",
    });
    return diagnostics;
  }

  if (input.filteredResults.length === 0) {
    diagnostics.push({
      level: "warning",
      title: "前端阈值过滤后无结果",
      message:
        "底层 RAG 有返回结果，但没有结果高于当前前端阈值。可以降低阈值观察结果。",
    });
    return diagnostics;
  }

  if (topScore !== null && topScore < input.threshold) {
    diagnostics.push({
      level: "warning",
      title: "最高相关度低于当前阈值",
      message:
        "本次最高相关度低于当前前端阈值，结果可能不足以支撑稳定回答。",
    });
    return diagnostics;
  }

  diagnostics.push({
    level: "success",
    title: "存在可展示召回结果",
    message:
      "本次底层 RAG 返回了可展示上下文，可以打开 Prompt 预览检查最终 llmContext。",
  });

  return diagnostics;
}

function toDebugResult(
  response: RagRetrieveResponse,
  topK: number,
  threshold: number,
  queryRewriteEnabled: boolean
): RagDebugViewResult {
  const sortedContexts = [...response.contexts].sort(
    (left, right) => right.score - left.score
  );
  const filteredResults = sortedContexts
    .filter((context) => context.score >= threshold)
    .slice(0, topK)
    .map<RagDebugHit>((context, index) => ({
      rank: index + 1,
      chunkId: context.chunkId,
      knowledgeId: context.knowledgeId,
      knowledgeBaseId: context.knowledgeBaseId,
      title: context.title,
      content: context.content,
      chunkType: context.chunkType,
      score: context.score,
      refId: findRefId(response.references, context.chunkId),
      includedInPrompt: Boolean(findRefId(response.references, context.chunkId)),
    }));

  const diagnostics = buildDiagnostics({
    filteredResults,
    rawContexts: sortedContexts,
    threshold,
    queryRewriteEnabled,
  });

  return {
    query: response.query,
    results: filteredResults,
    llmContext: response.llmContext,
    references: response.references,
    diagnostics,
    summary: {
      returnedCount: sortedContexts.length,
      promptContextCount: response.references.length,
      topScore: sortedContexts[0]?.score ?? null,
      noHit: sortedContexts.length === 0,
    },
  };
}
```

- [ ] **Step 2: Add the `DebugPanel` component**

Continue in the same `debug-panel.tsx` file with:

```tsx
export function DebugPanel({
  knowledgeBaseId,
  knowledgeBaseName,
  initialTopK,
  initialSimilarityThreshold,
  onConfigSaved,
}: DebugPanelProps) {
  const [query, setQuery] = React.useState("");
  const [queryRewriteEnabled, setQueryRewriteEnabled] = React.useState(false);
  const [mode, setMode] = React.useState<RagDebugMode>("balanced");
  const [topK, setTopK] = React.useState(() => clampTopK(initialTopK));
  const [similarityThreshold, setSimilarityThreshold] = React.useState(() =>
    clampThreshold(initialSimilarityThreshold)
  );
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<RagDebugViewResult | null>(null);
  const [promptDialogOpen, setPromptDialogOpen] = React.useState(false);

  React.useEffect(() => {
    setTopK(clampTopK(initialTopK));
    setSimilarityThreshold(clampThreshold(initialSimilarityThreshold));
  }, [initialSimilarityThreshold, initialTopK]);

  const configDirty =
    topK !== clampTopK(initialTopK) ||
    similarityThreshold !== clampThreshold(initialSimilarityThreshold);

  async function runDebug() {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setError("请输入测试问题");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await debugKnowledgeBase(knowledgeBaseId, {
        query: trimmedQuery,
        mode,
        topK,
        similarityThreshold,
        queryRewriteEnabled,
      });
      setResult(
        toDebugResult(response, topK, similarityThreshold, queryRewriteEnabled)
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Debug 请求失败");
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    if (!configDirty || saving) return;

    setSaving(true);
    setError(null);

    try {
      await updateKnowledgeBase(knowledgeBaseId, {
        topK,
        similarityThreshold,
      });
      await onConfigSaved?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存配置失败");
    } finally {
      setSaving(false);
    }
  }

  function handleQueryKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void runDebug();
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bug className="size-5" />
              RAG Debug
            </CardTitle>
            <CardDescription>
              对“{knowledgeBaseName}”执行召回测试。当前版本复用现有 RAG 接口，TopK 和阈值只做前端展示层过滤。
            </CardDescription>
          </div>
          {result ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setPromptDialogOpen(true)}
            >
              <FileSearch data-icon="inline-start" />
              Prompt 预览
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="size-4" />
            {error}
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
            <textarea
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setError(null);
              }}
              onKeyDown={handleQueryKeyDown}
              placeholder="输入一个要测试召回效果的问题，例如：员工如何申请报销？"
              className="min-h-24 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <div className="flex shrink-0 flex-col gap-3 rounded-md border bg-muted/20 p-3 lg:w-64">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Query Rewrite</span>
                <Switch
                  checked={queryRewriteEnabled}
                  onCheckedChange={setQueryRewriteEnabled}
                />
              </div>
              <Button type="button" onClick={() => void runDebug()} disabled={loading}>
                {loading ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <SearchCheck data-icon="inline-start" />
                )}
                {loading ? "Debug 中..." : "Debug"}
              </Button>
            </div>
          </div>

          {queryRewriteEnabled ? (
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs leading-6 text-muted-foreground">
              当前版本沿用系统默认 Query Rewrite 策略，暂不单独返回改写后问题；该开关仅保留交互入口。
            </div>
          ) : null}
        </div>

        <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
          <aside className="space-y-4 rounded-lg border bg-muted/10 p-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                检索模式
              </label>
              <Select value={mode} onValueChange={(value) => setMode(value as RagDebugMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                前端 TopK
              </label>
              <Input
                type="number"
                min={1}
                max={20}
                value={topK}
                onChange={(event) => setTopK(clampTopK(Number(event.target.value)))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                前端相似度阈值
              </label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={similarityThreshold}
                onChange={(event) =>
                  setSimilarityThreshold(clampThreshold(Number(event.target.value)))
                }
              />
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={!configDirty || saving}
              onClick={() => void saveConfig()}
            >
              {saving ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : (
                <Save data-icon="inline-start" />
              )}
              {saving ? "保存中..." : "保存配置"}
            </Button>

            <p className="text-xs leading-5 text-muted-foreground">
              保存配置只更新知识库字段。当前底层 RAG 暂未读取知识库级 TopK 和阈值。
            </p>
          </aside>

          <section className="space-y-4">
            {result ? (
              <DebugSummary result={result} />
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground">
                输入问题后点击 Debug，召回结果会展示在这里。
              </div>
            )}

            {result?.diagnostics.length ? (
              <div className="grid gap-2">
                {result.diagnostics.map((diagnostic) => (
                  <div
                    key={`${diagnostic.level}-${diagnostic.title}`}
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <div className="font-medium">{diagnostic.title}</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">
                      {diagnostic.message}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {loading ? (
              <div className="rounded-lg border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                正在调用现有 RAG 检索接口...
              </div>
            ) : result && result.results.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                没有召回到高于当前前端阈值的知识。
              </div>
            ) : result ? (
              <div className="grid gap-3">
                {result.results.map((hit) => (
                  <DebugResultCard key={hit.chunkId} hit={hit} />
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </CardContent>

      <DebugPromptDialog
        open={promptDialogOpen}
        query={query}
        queryRewriteEnabled={queryRewriteEnabled}
        mode={mode}
        topK={topK}
        similarityThreshold={similarityThreshold}
        result={result}
        onOpenChange={setPromptDialogOpen}
      />
    </Card>
  );
}

function DebugSummary({ result }: { result: RagDebugViewResult }) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <Metric label="底层返回" value={result.summary.returnedCount} />
      <Metric label="前端展示" value={result.results.length} />
      <Metric label="引用数" value={result.summary.promptContextCount} />
      <Metric
        label="最高得分"
        value={result.summary.topScore === null ? "--" : result.summary.topScore.toFixed(3)}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
```

- [ ] **Step 3: Run lint for the Debug panel**

Run:

```bash
npm run lint -- src/features/knowledge-bases/components/debug-panel.tsx
```

Expected:

```text
No lint errors from debug-panel.tsx.
```

---

### Task 5: Wire Debug Tab Into Knowledge Base Detail Page

**Files:**
- Modify: `src/features/knowledge-bases/components/knowledge-base-detail-feature.tsx`

- [ ] **Step 1: Add icon import**

Modify the lucide import in `knowledge-base-detail-feature.tsx` to include `Bug`.

```ts
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Bug,
  FolderOpen,
  Search as SearchIcon,
} from "lucide-react";
```

- [ ] **Step 2: Add DebugPanel import**

Add this import near the local component imports.

```ts
import { DebugPanel } from "./debug-panel";
```

- [ ] **Step 3: Expand tab state type**

Replace the current active tab state:

```ts
const [activeTab, setActiveTab] = React.useState<"knowledge-items" | "documents">("knowledge-items");
```

with:

```ts
const [activeTab, setActiveTab] = React.useState<
  "knowledge-items" | "documents" | "debug"
>("knowledge-items");
```

- [ ] **Step 4: Add the Debug tab button**

In the tab switcher, after the `文档管理` button, add:

```tsx
<button
  onClick={() => setActiveTab("debug")}
  className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
    activeTab === "debug"
      ? "bg-background text-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground"
  }`}
>
  <Bug className="size-4" />
  Debug
</button>
```

- [ ] **Step 5: Render DebugPanel**

After the documents panel conditional, add:

```tsx
{activeTab === "debug" && detail && (
  <DebugPanel
    knowledgeBaseId={knowledgeBaseId}
    knowledgeBaseName={detail.name}
    initialTopK={detail.topK}
    initialSimilarityThreshold={detail.similarityThreshold}
    onConfigSaved={loadData}
  />
)}
```

- [ ] **Step 6: Run build**

Run:

```bash
npm run build
```

Expected:

```text
Build succeeds, or any failure is unrelated to Debug changes and explicitly recorded.
```

---

### Task 6: Verification And Manual QA

**Files:**
- Verify behavior only.

- [ ] **Step 1: Run lint**

Run:

```bash
npm run lint
```

Expected:

```text
No lint errors from Debug files. If existing unrelated lint errors appear, record the exact files and messages.
```

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected:

```text
Build completes successfully. If it fails, record the command and the first relevant error.
```

- [ ] **Step 3: Start the dev server**

Run:

```bash
npm run dev
```

Expected:

```text
Next.js dev server starts and prints a local URL, usually http://localhost:3000.
```

- [ ] **Step 4: Verify Debug tab**

Open:

```text
http://localhost:3000/knowledge-bases
```

Then click a knowledge base card to enter `/knowledge-bases/[id]`.

Expected:

```text
The detail page stays in AdminShell and the tab switcher shows 知识条目, 文档管理, Debug.
```

- [ ] **Step 5: Verify empty Debug state**

Click `Debug`.

Expected:

```text
The Debug panel renders a question textarea, Query Rewrite switch, Debug button, mode select, TopK input, threshold input, save button, and an empty result area.
```

- [ ] **Step 6: Verify empty query validation**

Click `Debug` without typing a question.

Expected:

```text
No network request is required. The panel shows 请输入测试问题.
```

- [ ] **Step 7: Verify RAG retrieve flow**

Enter:

```text
员工如何申请报销？
```

Click `Debug`.

Expected:

```text
The panel calls POST /api/rag/retrieve. If the knowledge base has retrievable chunks, cards render with rank, title, content preview, score, chunk id, knowledge id, and prompt marker. If it has no chunks, an empty result state renders.
```

- [ ] **Step 8: Verify Query Rewrite switch messaging**

Turn on `Query Rewrite` and run Debug again.

Expected:

```text
The page shows the compatibility notice that the current version uses the system default Query Rewrite strategy and does not show a fabricated rewritten query.
```

- [ ] **Step 9: Verify Prompt preview**

After Debug returns, click `Prompt 预览`.

Expected:

```text
Dialog opens and shows original question, mode, frontend TopK, frontend threshold, llmContext, references, and copy button.
```

- [ ] **Step 10: Verify config save**

Change `TopK` or `前端相似度阈值`, click `保存配置`.

Expected:

```text
The page calls PATCH /api/rag-management/knowledge-bases/[id]. On success, detail data refreshes and the save button becomes disabled again.
```

---

## Self-Review Checklist

- [ ] Spec coverage: Debug tab, input, Query Rewrite switch, parameter panel, result cards, Prompt dialog, loading/error/empty states, and config save are covered.
- [ ] Compatibility: Plan does not add a Debug API, Debug Service, database table, or retriever change.
- [ ] Query Rewrite: Plan keeps the switch as a frontend compatibility control and does not fake rewritten queries.
- [ ] TopK and threshold: Plan clearly implements frontend display filtering only.
- [ ] Type consistency: `RagDebugRequest`, `RagDebugViewResult`, `RagDebugHit`, and `RagDebugMode` are defined before use.
- [ ] Verification: Build, lint, dev server, and manual checks are included.
