"use client";

import { useMemo, useState } from "react";
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
import {
  debugKnowledgeBase,
  updateKnowledgeBase,
} from "@/features/knowledge-bases/api";
import type {
  RagDebugDiagnostic,
  RagDebugHit,
  RagDebugMode,
  RagDebugRequest,
  RagDebugViewResult,
} from "@/features/knowledge-bases/types";
import type { RagContext, RagRetrieveResponse } from "@/features/rag/types";

import { DebugPromptDialog } from "./debug-prompt-dialog";
import { DebugResultCard } from "./debug-result-card";

type DebugPanelProps = {
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  initialTopK: number;
  initialSimilarityThreshold: number;
  onConfigSaved?: () => void | Promise<void>;
};

function clampTopK(value: number) {
  if (!Number.isFinite(value)) return 5;
  return Math.min(Math.max(Math.round(value), 1), 20);
}

function clampThreshold(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function getDefaultTopKByMode(mode: RagDebugMode) {
  if (mode === "fast") return 3;
  if (mode === "detailed") return 8;
  return 5;
}

function findReferenceId(
  context: RagContext,
  references: RagRetrieveResponse["references"]
) {
  const reference = references.find(
    (item) =>
      item.chunkId === context.chunkId || item.knowledgeId === context.knowledgeId
  );

  return reference?.refId;
}

function buildDiagnostics(params: {
  response: RagRetrieveResponse;
  topK: number;
  similarityThreshold: number;
  results: RagDebugHit[];
  belowThresholdCount: number;
}): RagDebugDiagnostic[] {
  const diagnostics: RagDebugDiagnostic[] = [];
  const { response, topK, similarityThreshold, results, belowThresholdCount } =
    params;

  if (response.contexts.length === 0) {
    diagnostics.push({
      level: "warning",
      title: "无召回结果",
      message: "当前问题没有召回任何 chunk，可检查知识库内容、问题关键词或向量检索状态。",
    });
  }

  if (response.contexts.length > 0 && results.length === 0) {
    diagnostics.push({
      level: "warning",
      title: "过滤后为空",
      message: "已有召回结果，但当前 TopK 设置没有可展示项，可尝试调高 TopK。",
    });
  }

  if (response.contexts.length > topK) {
    diagnostics.push({
      level: "info",
      title: "TopK 前端截断",
      message: `已有接口返回 ${response.contexts.length} 条结果，当前页面仅展示前 ${topK} 条。`,
    });
  }

  if (similarityThreshold > 0 && belowThresholdCount > 0) {
    diagnostics.push({
      level: "info",
      title: "阈值兼容模式",
      message: `当前展示结果中有 ${belowThresholdCount} 条低于相似度阈值。兼容已有接口时，Debug 不会隐藏后端实际返回的 chunk。`,
    });
  }

  return diagnostics;
}

function toDebugResult(params: {
  response: RagRetrieveResponse;
  request: RagDebugRequest;
  topK: number;
  similarityThreshold: number;
}): RagDebugViewResult {
  const { response, topK, similarityThreshold } = params;
  const sortedContexts = [...response.contexts].sort((a, b) => b.score - a.score);
  const topContexts = sortedContexts.slice(0, topK);
  const belowThresholdCount = topContexts.filter(
    (context) => context.score < similarityThreshold
  ).length;

  const results = topContexts.map<RagDebugHit>((context, index) => {
      const refId = findReferenceId(context, response.references);

      return {
        rank: index + 1,
        chunkId: context.chunkId,
        knowledgeId: context.knowledgeId,
        knowledgeBaseId: context.knowledgeBaseId,
        title: context.title,
        content: context.content,
        chunkType: context.chunkType,
        score: context.score,
        refId,
        includedInPrompt: Boolean(refId),
      };
    });

  return {
    query: response.query,
    results,
    llmContext: response.llmContext,
    references: response.references.map((reference) => ({
      refId: reference.refId,
      knowledgeBaseId: reference.knowledgeBaseId,
      knowledgeId: reference.knowledgeId,
      chunkId: reference.chunkId,
      title: reference.title,
      chunkType: reference.chunkType,
    })),
    diagnostics: buildDiagnostics({
      response,
      topK,
      similarityThreshold,
      results,
      belowThresholdCount,
    }),
    summary: {
      returnedCount: response.contexts.length,
      promptContextCount: response.references.length,
      topScore: sortedContexts[0]?.score ?? null,
      noHit: results.length === 0,
    },
  };
}

export function DebugPanel({
  knowledgeBaseId,
  knowledgeBaseName,
  initialTopK,
  initialSimilarityThreshold,
  onConfigSaved,
}: DebugPanelProps) {
  const [query, setQuery] = useState("");
  const [queryRewriteEnabled, setQueryRewriteEnabled] = useState(false);
  const [mode, setMode] = useState<RagDebugMode>("balanced");
  const [topK, setTopK] = useState(() => clampTopK(initialTopK));
  const [similarityThreshold] = useState(() =>
    clampThreshold(initialSimilarityThreshold)
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RagDebugViewResult | null>(null);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);

  const normalizedQuery = query.trim();
  const canDebug = normalizedQuery.length > 0 && !loading;

  const rewriteDisplay = useMemo(() => {
    if (!queryRewriteEnabled) return "";
    return "当前兼容已有接口，暂未返回独立 Query Rewrite 结果。";
  }, [queryRewriteEnabled]);

  async function runDebug() {
    if (!normalizedQuery) {
      setError("请输入需要测试的问题。");
      return;
    }

    setLoading(true);
    setError(null);

    const request: RagDebugRequest = {
      query: normalizedQuery,
      mode,
      topK,
      similarityThreshold,
      queryRewriteEnabled,
    };

    try {
      const response = await debugKnowledgeBase(knowledgeBaseId, request);
      setResult(
        toDebugResult({
          response,
          request,
          topK,
          similarityThreshold,
        })
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Debug 检索失败，请稍后重试。"
      );
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    setSaving(true);
    setError(null);

    try {
      await updateKnowledgeBase(knowledgeBaseId, {
        topK,
        similarityThreshold,
      });
      await onConfigSaved?.();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "保存配置失败，请稍后重试。"
      );
    } finally {
      setSaving(false);
    }
  }

  function handleModeChange(value: string) {
    const nextMode = value as RagDebugMode;
    setMode(nextMode);
    setTopK(getDefaultTopKByMode(nextMode));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bug className="h-5 w-5" />
                RAG Debug
              </CardTitle>
              <CardDescription>
                在「{knowledgeBaseName}」中测试问题召回效果，查看 chunk 排序、Prompt
                上下文和过滤诊断。
              </CardDescription>
            </div>
            {result ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPromptDialogOpen(true)}
              >
                查看完整 Prompt
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入需要测试召回效果的问题"
              className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="flex flex-col gap-2 lg:w-36">
              <Button onClick={runDebug} disabled={!canDebug}>
                {loading ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    data-icon="inline-start"
                  />
                ) : (
                  <SearchCheck className="h-4 w-4" data-icon="inline-start" />
                )}
                Debug
              </Button>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-xs text-muted-foreground">Rewrite</span>
                <Switch
                  checked={queryRewriteEnabled}
                  onCheckedChange={setQueryRewriteEnabled}
                />
              </div>
            </div>
          </div>

          {queryRewriteEnabled ? (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                改写后的问题
              </div>
              <Input value={rewriteDisplay} readOnly />
            </div>
          ) : null}

          <div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              当前 Debug 页面优先兼容已有 RAG 接口。TopK 和 Query Rewrite
              开关保留前端操作入口，底层检索暂不改变已有服务行为。
            </span>
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">调试参数</CardTitle>
            <CardDescription>保存后会更新当前知识库的基础 RAG 配置。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="rag-debug-mode">
                检索模式
              </label>
              <Select
                value={mode}
                onValueChange={handleModeChange}
              >
                <SelectTrigger id="rag-debug-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fast">快速</SelectItem>
                  <SelectItem value="balanced">均衡</SelectItem>
                  <SelectItem value="detailed">详细</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="rag-debug-topk">
                TopK
              </label>
              <Input
                id="rag-debug-topk"
                type="number"
                min={1}
                max={20}
                value={topK}
                onChange={(event) => setTopK(clampTopK(Number(event.target.value)))}
              />
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={saveConfig}
              disabled={saving}
            >
              {saving ? (
                <Loader2
                  className="h-4 w-4 animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <Save className="h-4 w-4" data-icon="inline-start" />
              )}
              保存配置
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSearch className="h-4 w-4" />
              召回结果
            </CardTitle>
            {result ? (
              <CardDescription>
                原始召回 {result.summary.returnedCount} 条，当前展示{" "}
                {result.results.length} 条，引用来源 {result.summary.promptContextCount} 条。
              </CardDescription>
            ) : (
              <CardDescription>输入问题并点击 Debug 后查看 chunk 召回链路。</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {result?.diagnostics.length ? (
              <div className="space-y-2">
                {result.diagnostics.map((diagnostic, index) => (
                  <div
                    key={`${diagnostic.level}-${index}`}
                    className="rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground"
                  >
                    <span className="font-medium text-foreground">
                      {diagnostic.title}：
                    </span>
                    {diagnostic.message}
                  </div>
                ))}
              </div>
            ) : null}

            {!result && !loading ? (
              <div className="flex min-h-56 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                暂无调试结果
              </div>
            ) : null}

            {loading ? (
              <div className="flex min-h-56 items-center justify-center gap-2 rounded-md border border-dashed text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在执行召回测试
              </div>
            ) : null}

            {result?.summary.noHit && !loading ? (
              <div className="flex min-h-56 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                当前参数下没有可展示的召回 chunk
              </div>
            ) : null}

            {result?.results.map((hit) => (
              <DebugResultCard key={`${hit.chunkId}-${hit.rank}`} hit={hit} />
            ))}
          </CardContent>
        </Card>
      </div>

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
    </div>
  );
}
