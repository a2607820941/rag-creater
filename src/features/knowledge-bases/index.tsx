"use client";

import {
  type ComponentType,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Archive,
  BookOpen,
  Bot,
  Brain,
  BriefcaseBusiness,
  CheckCircle2,
  Database,
  FileText,
  Folder,
  GraduationCap,
  Lightbulb,
  Plus,
  Search,
  SortAsc,
  SortDesc,
  XCircle,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createTag, fetchTags } from "@/features/knowledge/api/tags";
import type {
  KnowledgeTagDto,
  KnowledgeTagFormValues,
} from "@/features/knowledge/types";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  fetchRagItems,
  updateKnowledgeBase,
} from "./api";
import { CreateKnowledgeBaseTagDialog } from "@/features/knowledge-bases/components/create-knowledge-base-tag-dialog";
import { KnowledgeBaseTagBadge } from "@/features/knowledge-bases/components/knowledge-base-tag-badge";
import { KnowledgeBaseTagEditor } from "@/features/knowledge-bases/components/knowledge-base-tag-editor";
import { KnowledgeDocumentsDialog } from "@/features/knowledge-bases/components/knowledge-documents-dialog";
import { mockRagItems } from "./mock-data";
import {
  DEFAULT_KNOWLEDGE_BASE_FORM_VALUES,
  type KnowledgeBaseFormValues,
  type RagIconName,
  type RagListItem,
  type SortDirection,
  type SortField,
  type StatusFilter,
} from "./types";
import {
  filterAndSortRagItems,
  getKnowledgeBaseStats,
  getRagIconOption,
  normalizeRagItem,
  normalizeRagItems,
  normalizeRagIcon,
  RAG_ICON_OPTIONS,
  validateKnowledgeBaseForm,
} from "./utils";

const RAG_ICON_COMPONENTS = {
  Database,
  BookOpen,
  FileText,
  Folder,
  Archive,
  Brain,
  Bot,
  GraduationCap,
  BriefcaseBusiness,
  Lightbulb,
} satisfies Record<RagIconName, ComponentType<{ className?: string }>>;

const statusFilterCards: Array<{
  key: Exclude<StatusFilter, null>;
  title: string;
  description: string;
  iconClassName: string;
}> = [
  {
    key: "all",
    title: "知识库总量",
    description: "全部知识库",
    iconClassName: "text-blue-600 bg-blue-50",
  },
  {
    key: "active",
    title: "启用知识库",
    description: "当前可用于检索",
    iconClassName: "text-emerald-600 bg-emerald-50",
  },
  {
    key: "disabled",
    title: "禁用知识库",
    description: "暂不可用于检索",
    iconClassName: "text-red-600 bg-red-50",
  },
];

function formatDate(value: string) {
  if (value === "--") return "--";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "--";

  return date.toLocaleString();
}

function getStatusText(status: RagListItem["status"]) {
  return status === "active" ? "启用" : "禁用";
}

export function RagManage() {
  const router = useRouter();
  const items = useAppStore((state) => state.items);
  const loading = useAppStore((state) => state.loading);
  const error = useAppStore((state) => state.error);
  const setItems = useAppStore((state) => state.setItems);
  const setLoading = useAppStore((state) => state.setLoading);
  const setError = useAppStore((state) => state.setError);
  const addItem = useAppStore((state) => state.addItem);
  const updateItem = useAppStore((state) => state.updateItem);
  const deleteItem = useAppStore((state) => state.deleteItem);
  const setSelectedId = useAppStore((state) => state.setSelectedId);
  const setSelected = useAppStore((state) => state.setSelected);
  const setSelectedDocs = useAppStore((state) => state.setSelectedDocs);
  const setSelectedChunks = useAppStore((state) => state.setSelectedChunks);

  const [searchInput, setSearchInput] = useState("");
  const [submittedSearchKeyword, setSubmittedSearchKeyword] = useState("");
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
  const [formDialogMode, setFormDialogMode] = useState<
    "create" | "edit" | null
  >(null);
  const [editingItem, setEditingItem] = useState<RagListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RagListItem | null>(null);
  const [formValues, setFormValues] = useState<KnowledgeBaseFormValues>(
    DEFAULT_KNOWLEDGE_BASE_FORM_VALUES
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [documentsDialogOpen, setDocumentsDialogOpen] = useState(false);
  const [allTags, setAllTags] = useState<KnowledgeTagDto[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [tagSubmitting, setTagSubmitting] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadRagItems() {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchRagItems();

        if (!ignore) {
          setItems(normalizeRagItems(data));
        }
      } catch (loadError) {
        console.warn(
          "Failed to load knowledge bases, fallback to mock data.",
          loadError
        );

        if (!ignore) {
          setItems(mockRagItems);
          setError("知识库数据加载失败，已使用本地模拟数据");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    async function loadTags() {
      setTagsLoading(true);

      try {
        const data = await fetchTags({ scope: "rag" });

        if (!ignore) {
          setAllTags(data);
        }
      } catch (loadError) {
        console.warn("Failed to load knowledge tags.", loadError);

        if (!ignore) {
          setTagError("标签数据加载失败");
        }
      } finally {
        if (!ignore) {
          setTagsLoading(false);
        }
      }
    }

    loadRagItems();
    loadTags();

    return () => {
      ignore = true;
    };
  }, [setError, setItems, setLoading]);

  const stats = useMemo(() => getKnowledgeBaseStats(items), [items]);
  const showInitialLoading = loading && items.length === 0;
  const visibleItems = useMemo(
    () =>
      filterAndSortRagItems({
        items,
        keyword: submittedSearchKeyword,
        statusFilter,
        sortField,
        sortDirection,
      }),
    [items, sortDirection, sortField, statusFilter, submittedSearchKeyword]
  );

  function toggleStatusFilter(nextFilter: Exclude<StatusFilter, null>) {
    setStatusFilter((current) => (current === nextFilter ? null : nextFilter));
  }

  function openCreateDialog() {
    setFormDialogMode("create");
    setEditingItem(null);
    setFormValues(DEFAULT_KNOWLEDGE_BASE_FORM_VALUES);
    setFormError(null);
  }

  function openEditDialog(item: RagListItem) {
    setFormDialogMode("edit");
    setEditingItem(item);
    setFormValues({
      name: item.name,
      description: item.description,
      icon: normalizeRagIcon(item.icon),
      topK: item.topK,
      similarityThreshold: item.similarityThreshold,
      tagIds: item.tags.map((tag) => tag.id),
      status: item.status,
    });
    setFormError(null);
  }

  function closeFormDialog() {
    setFormDialogMode(null);
    setEditingItem(null);
    setFormError(null);
  }

  function updateFormValue<K extends keyof KnowledgeBaseFormValues>(
    key: K,
    value: KnowledgeBaseFormValues[K]
  ) {
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function saveForm() {
    const validationError = validateKnowledgeBaseForm({
      values: formValues,
      items,
      editingId: editingItem?.id ?? null,
    });

    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormSubmitting(true);
    setFormError(null);

    try {
      const payload = {
        name: formValues.name.trim(),
        description: formValues.description.trim() || undefined,
        icon: formValues.icon,
        topK: formValues.topK,
        status: formValues.status,
        tagIds: formValues.tagIds,
      };

      if (formDialogMode === "create") {
        const created = normalizeRagItem(await createKnowledgeBase(payload));

        addItem(created);
      }

      if (formDialogMode === "edit" && editingItem) {
        const updated = normalizeRagItem(
          await updateKnowledgeBase(editingItem.id, payload)
        );

        updateItem(editingItem.id, updated);
      }

      closeFormDialog();
    } catch (error) {
      console.error("Failed to save knowledge base.", error);
      setFormError("知识库保存失败，请稍后重试");
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleCreateTag(values: KnowledgeTagFormValues) {
    setTagSubmitting(true);
    setTagError(null);

    try {
      const created = await createTag(values);
      setAllTags((current) => [...current, created]);
      setFormValues((current) => ({
        ...current,
        tagIds: [...new Set([...current.tagIds, created.id])],
      }));
      setTagDialogOpen(false);
    } catch (error) {
      setTagError(error instanceof Error ? error.message : "创建标签失败");
    } finally {
      setTagSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    setDeleteSubmitting(true);

    try {
      await deleteKnowledgeBase(deleteTarget.id);
      deleteItem(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      console.error("Failed to delete knowledge base.", error);
      setError("知识库删除失败，请稍后重试");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  function openDocumentsDialog(item: RagListItem) {
    setSelectedId(item.id);
    setSelected(item);
    setSelectedDocs([]);
    setSelectedChunks([]);
    setDocumentsDialogOpen(true);
  }

  const isCreateMode = formDialogMode === "create";

  return (
    <section className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database />
            RAG 知识库
          </CardTitle>
          <CardDescription>
            管理知识库基础信息、检索参数和启用状态。
          </CardDescription>
        </CardHeader>
      </Card>

      {error ? (
        <div className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        {statusFilterCards.map((card) => {
          const value =
            card.key === "all"
              ? stats.total
              : card.key === "active"
              ? stats.active
              : stats.disabled;
          const Icon =
            card.key === "active"
              ? CheckCircle2
              : card.key === "disabled"
              ? XCircle
              : Database;

          return (
            <Card
              key={card.key}
              className={cn(
                "cursor-pointer transition-colors",
                statusFilter === card.key && "ring-primary"
              )}
              role="button"
              tabIndex={0}
              onClick={() => toggleStatusFilter(card.key)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleStatusFilter(card.key);
                }
              }}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-md",
                      card.iconClassName
                    )}
                  >
                    <Icon />
                  </span>
                  {card.title}
                </CardTitle>
                <CardDescription>{card.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 pt-0">
          <div className="relative min-w-72 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              value={searchInput}
              placeholder="搜索知识库名称或描述"
              onChange={(event) => {
                const value = event.target.value;
                setSearchInput(value);

                if (!value) {
                  setSubmittedSearchKeyword("");
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setSubmittedSearchKeyword(searchInput.trim());
                }
              }}
            />
          </div>

          <Select
            value={sortField}
            onValueChange={(value) => setSortField(value as SortField)}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="updatedAt">更新时间</SelectItem>
                <SelectItem value="documentCount">包含文档数量</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setSortDirection((current) =>
                current === "desc" ? "asc" : "desc"
              )
            }
          >
            {sortDirection === "desc" ? (
              <SortDesc data-icon="inline-start" />
            ) : (
              <SortAsc data-icon="inline-start" />
            )}
            排序倒置
          </Button>

          <Button type="button" onClick={openCreateDialog}>
            <Plus data-icon="inline-start" />
            新建知识库
          </Button>
        </CardContent>
      </Card>

      {showInitialLoading ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            正在加载知识库...
          </CardContent>
        </Card>
      ) : null}

      {!loading && items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Database className="size-8 text-muted-foreground" />
            <div className="font-medium">暂无知识库</div>
            <p className="text-sm text-muted-foreground">
              点击新建按钮创建你的第一个知识库
            </p>
            <Button type="button" onClick={openCreateDialog}>
              <Plus data-icon="inline-start" />
              新建知识库
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!loading && items.length > 0 && visibleItems.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            没有找到符合条件的知识库
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleItems.map((item) => {
          const iconOption = getRagIconOption(item.icon);
          const KnowledgeBaseIcon = RAG_ICON_COMPONENTS[iconOption.value];
          const statusClassName =
            item.status === "active"
              ? "h-7 border-emerald-200 bg-emerald-50 px-2.5 text-[13px] font-semibold text-emerald-700"
              : "h-7 border-red-200 bg-red-50 px-2.5 text-[13px] font-semibold text-red-700";

          return (
            <Card
              key={item.id}
              className="cursor-pointer border-slate-200 bg-white shadow-sm transition duration-200 hover:scale-[1.01] hover:border-slate-300 hover:shadow-md"
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/knowledge-bases/${item.id}`)}
              onKeyDown={(event) => {
                if (event.currentTarget !== event.target) return;

                if (event.key === "Enter") {
                  router.push(`/knowledge-bases/${item.id}`);
                }
              }}
            >
              <CardHeader className="px-4 pt-4 pb-2">
                <CardTitle className="flex items-start gap-3">
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-md",
                      iconOption.className
                    )}
                  >
                    <KnowledgeBaseIcon />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate">{item.name}</span>
                    <CardDescription className="mt-0.5 line-clamp-2 text-xs leading-5">
                      {item.description}
                    </CardDescription>
                  </span>
                </CardTitle>
                <CardAction>
                  <Badge variant="outline" className={statusClassName}>
                    {getStatusText(item.status)}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 px-4 pb-3 pt-0">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[15px] font-semibold text-foreground">
                  <div>文档：{item.documentCount}</div>
                  <div>Chunks：{item.chunkCount}</div>
                  <div>TopK：{item.topK}</div>
                </div>
                <div className="flex h-[52px] flex-wrap content-start gap-1.5 overflow-hidden">
                  {item.tags.length > 0 ? (
                    item.tags
                      .slice(0, 5)
                      .map((tag) => (
                        <KnowledgeBaseTagBadge key={tag.id} tag={tag} />
                      ))
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      暂无标签
                    </span>
                  )}
                </div>
              </CardContent>
              <CardFooter className="justify-between gap-3 px-4 pb-4 pt-0">
                <span className="text-xs text-muted-foreground">
                  更新时间：{formatDate(item.updatedAt)}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 px-3"
                    onClick={(event) => {
                      event.stopPropagation();
                      openEditDialog(item);
                    }}
                  >
                    编辑
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-9 px-3"
                    onClick={(event) => {
                      event.stopPropagation();
                      setDeleteTarget(item);
                    }}
                  >
                    删除
                  </Button>
                </div>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <Dialog
        open={Boolean(formDialogMode)}
        onOpenChange={(open) => {
          if (!open) closeFormDialog();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isCreateMode ? "新建知识库" : "编辑知识库"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kb-name">知识库名称</Label>
              <Input
                id="kb-name"
                value={formValues.name}
                aria-invalid={Boolean(formError && !formValues.name.trim())}
                onChange={(event) =>
                  updateFormValue("name", event.target.value)
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kb-description">知识库描述</Label>
              <Textarea
                id="kb-description"
                value={formValues.description}
                onChange={(event) =>
                  updateFormValue("description", event.target.value)
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="knowledge-base-icon">图标</Label>
              <Select
                value={formValues.icon}
                onValueChange={(value) =>
                  updateFormValue("icon", normalizeRagIcon(value))
                }
              >
                <SelectTrigger id="knowledge-base-icon">
                  <SelectValue placeholder="选择图标" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {RAG_ICON_OPTIONS.map((option) => {
                      const Icon = RAG_ICON_COMPONENTS[option.value];

                      return (
                        <SelectItem key={option.value} value={option.value}>
                          <span className="flex items-center gap-2">
                            <span
                              className={cn(
                                "flex size-6 items-center justify-center rounded",
                                option.className
                              )}
                            >
                              <Icon />
                            </span>
                            {option.label}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="kb-topk">TopK</Label>
                <Input
                  id="kb-topk"
                  type="number"
                  min={1}
                  value={formValues.topK}
                  onChange={(event) =>
                    updateFormValue("topK", Number(event.target.value))
                  }
                />
              </div>

            </div>

            <KnowledgeBaseTagEditor
              allTags={allTags}
              selectedTagIds={formValues.tagIds}
              disabled={formSubmitting || tagsLoading}
              onChange={(tagIds) => updateFormValue("tagIds", tagIds)}
              onCreateClick={() => {
                setTagError(null);
                setTagDialogOpen(true);
              }}
            />

            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <div className="min-w-0">
                <Label htmlFor="kb-status">启用状态</Label>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  关闭后该知识库不参与检索
                </div>
              </div>
              <Switch
                id="kb-status"
                checked={formValues.status === "active"}
                onCheckedChange={(checked) =>
                  updateFormValue("status", checked ? "active" : "disabled")
                }
              />
            </div>
          </div>

          {formError ? (
            <p className="text-xs text-destructive">{formError}</p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeFormDialog}>
              取消
            </Button>
            <Button type="button" onClick={saveForm} disabled={formSubmitting}>
              {formSubmitting ? "保存中..." : "确认"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateKnowledgeBaseTagDialog
        open={tagDialogOpen}
        submitting={tagSubmitting}
        error={tagError}
        onOpenChange={(open) => {
          setTagDialogOpen(open);
          if (!open) setTagError(null);
        }}
        onSubmit={handleCreateTag}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除知识库</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deleteTarget?.name}」吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              {deleteSubmitting ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {documentsDialogOpen ? (
        <KnowledgeDocumentsDialog
          open={documentsDialogOpen}
          onOpenChange={setDocumentsDialogOpen}
        />
      ) : null}
    </section>
  );
}
