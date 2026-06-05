"use client";

import * as React from "react";
import { Search, X, Trash2, BookOpen, Lightbulb, ListChecks, AlertTriangle, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { RagChunk, RagDoc } from "@/features/knowledge-bases/types";

// ===== 类型 =====

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  chunkType: string;
  knowledgeType: string | null;
  suggestedCategory: string | null;
  suggestedTags: string[];
  knowledgeBaseId: string | null;
  reviewStatus: string | null;
  chunkStatus: string;
  chunkIndex: number;
  documentId: string | null;
  documentName: string;
}

// ===== 工具函数 =====

function parseTags(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

const typeLabels: Record<string, string> = {
  faq: "问答",
  concept: "概念",
  procedure: "步骤",
  note: "注意",
  summary: "总结",
};

const typeColors: Record<string, string> = {
  faq: "bg-purple-100 text-purple-700 border-purple-200",
  concept: "bg-blue-100 text-blue-700 border-blue-200",
  procedure: "bg-green-100 text-green-700 border-green-200",
  note: "bg-yellow-100 text-yellow-700 border-yellow-200",
  summary: "bg-gray-100 text-gray-700 border-gray-200",
};

const typeIcons: Record<string, React.ReactNode> = {
  faq: <Lightbulb className="size-3.5" />,
  concept: <BookOpen className="size-3.5" />,
  procedure: <ListChecks className="size-3.5" />,
  note: <AlertTriangle className="size-3.5" />,
  summary: <FileText className="size-3.5" />,
};

function extractKnowledgeItems(documents: RagDoc[]): KnowledgeItem[] {
  const items: KnowledgeItem[] = [];

  for (const doc of documents) {
    const chunks = doc.chunks ?? [];
    for (const chunk of chunks) {
      // 只取知识类型的已确认分片
      if (chunk.chunkType !== "knowledge") continue;
      if (chunk.reviewStatus !== "confirmed") continue;

      items.push({
        id: chunk.id,
        title: chunk.title ?? chunk.content.slice(0, 50),
        content: chunk.content,
        chunkType: chunk.chunkType ?? "knowledge",
        knowledgeType: chunk.knowledgeType ?? null,
        suggestedCategory: chunk.suggestedCategory ?? null,
        suggestedTags: parseTags(chunk.suggestedTags),
        knowledgeBaseId: chunk.knowledgeBaseId ?? null,
        reviewStatus: chunk.reviewStatus ?? null,
        chunkStatus: chunk.status ?? "active",
        chunkIndex: chunk.chunkIndex ?? 0,
        documentId: chunk.documentId ?? null,
        documentName: doc.title ?? doc.name ?? "未知文档",
      });
    }
  }

  return items;
}

// ===== Props =====

interface KnowledgeItemsPanelProps {
  documents: RagDoc[];
  onRemoveItem?: (item: KnowledgeItem) => void;
  removing?: boolean;
}

// ===== 组件 =====

export function KnowledgeItemsPanel({
  documents,
  onRemoveItem,
  removing = false,
}: KnowledgeItemsPanelProps) {
  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<string | null>(null);

  const allItems = React.useMemo(() => extractKnowledgeItems(documents), [documents]);

  const filteredItems = React.useMemo(() => {
    let result = allItems;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.content.toLowerCase().includes(q) ||
          (item.suggestedCategory?.toLowerCase().includes(q) ?? false) ||
          item.suggestedTags.some((tag) => tag.toLowerCase().includes(q))
      );
    }

    if (typeFilter) {
      result = result.filter((item) => item.knowledgeType === typeFilter);
    }

    return result;
  }, [allItems, search, typeFilter]);

  // 统计各类型数量
  const typeCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of allItems) {
      const t = item.knowledgeType ?? "unknown";
      counts[t] = (counts[t] ?? 0) + 1;
    }
    return counts;
  }, [allItems]);

  // 去重类型列表
  const availableTypes = React.useMemo(() => {
    const types = new Set(allItems.map((item) => item.knowledgeType).filter(Boolean) as string[]);
    return [...types];
  }, [allItems]);

  if (allItems.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>知识条目</CardTitle>
          <CardDescription>已确认入库的 AI 提炼知识条目</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-dashed bg-muted/30 px-4 py-12 text-center">
            <BookOpen className="mx-auto size-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium text-muted-foreground">暂无知识条目</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              在审核工作台中将候选知识确认入库后，知识条目将显示在此处
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>知识条目</CardTitle>
            <CardDescription>
              已确认入库的 AI 提炼知识条目 · 共 {allItems.length} 条
            </CardDescription>
          </div>
        </div>

        {/* 搜索和筛选 */}
        <div className="flex items-center gap-3 pt-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="搜索知识条目..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* 类型筛选 */}
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setTypeFilter(null)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                typeFilter === null
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:border-foreground/30"
              }`}
            >
              全部 ({allItems.length})
            </button>
            {availableTypes.map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(typeFilter === t ? null : t)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  typeFilter === t
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background text-muted-foreground border-border hover:border-foreground/30"
                }`}
              >
                {typeLabels[t] || t} ({typeCounts[t] ?? 0})
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {filteredItems.length === 0 ? (
          <div className="rounded-md border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            没有匹配的知识条目
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredItems.map((item) => (
              <KnowledgeItemCard
                key={item.id}
                item={item}
                onRemove={onRemoveItem}
                removing={removing}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ===== 知识条目卡片 =====

function KnowledgeItemCard({
  item,
  onRemove,
  removing,
}: {
  item: KnowledgeItem;
  onRemove?: (item: KnowledgeItem) => void;
  removing: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const kType = item.knowledgeType ?? "unknown";

  return (
    <article className="rounded-lg border bg-background p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-start gap-3">
        {/* 类型图标 */}
        <div
          className={`flex size-8 shrink-0 items-center justify-center rounded-lg border ${
            typeColors[kType] || "bg-gray-100 text-gray-600 border-gray-200"
          }`}
        >
          {typeIcons[kType] || <FileText className="size-3.5" />}
        </div>

        <div className="flex-1 min-w-0">
          {/* 标题行 */}
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <h4 className="font-medium text-sm text-foreground truncate">
              {item.title}
            </h4>
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 ${
                typeColors[kType] || ""
              }`}
            >
              {typeLabels[kType] || kType}
            </Badge>
            {item.suggestedCategory && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {item.suggestedCategory}
              </Badge>
            )}
          </div>

          {/* 内容预览 */}
          <div className="text-sm text-muted-foreground">
            {expanded ? (
              <p className="whitespace-pre-wrap leading-6">{item.content}</p>
            ) : (
              <p className="line-clamp-2 leading-6">{item.content}</p>
            )}
          </div>

          {/* 标签 */}
          {item.suggestedTags.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {item.suggestedTags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* 底栏 */}
          <div className="flex items-center justify-between mt-2.5 gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
              <span>来源: {item.documentName}</span>
              <span>·</span>
              <span>状态: {item.chunkStatus === "active" ? "可用" : "已禁用"}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {expanded ? "收起" : "展开"}
              </button>
              {onRemove && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={removing}
                  onClick={() => onRemove(item)}
                  className="h-7 px-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="size-3 mr-1" />
                  移除
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
