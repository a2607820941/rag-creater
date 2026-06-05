"use client";

import { FileText, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppStore } from "@/store";
import { DocumentChunksDialog } from "./document-chunks-dialog";
import { DocumentUploadZone } from "./document-upload-zone";
import {
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  fetchDeletedDocuments,
  fetchRagDetail,
  restoreKnowledgeDocument,
} from "@/features/knowledge-bases/api";
import type { RagChunk, RagDoc } from "@/features/knowledge-bases/types";
import {
  formatFileSize,
  getTotalChunkCount,
  normalizeRagChunk,
  normalizeRagDoc,
  normalizeRagItem,
  validateUploadFile,
} from "@/features/knowledge-bases/utils";

// ===== 分片统计辅助 =====

interface ChunkStats {
  textCount: number;
  knowledgePending: number;
  knowledgeConfirmed: number;
}

function getChunkStats(chunks: RagChunk[]): ChunkStats {
  let textCount = 0;
  let knowledgePending = 0;
  let knowledgeConfirmed = 0;

  for (const chunk of chunks) {
    if (chunk.chunkType !== "knowledge") {
      textCount++;
    } else if (chunk.reviewStatus === "confirmed") {
      knowledgeConfirmed++;
    } else if (chunk.reviewStatus === "pending") {
      knowledgePending++;
    }
  }

  return { textCount, knowledgePending, knowledgeConfirmed };
}

function getTotalKnowledgeCount(stats: ChunkStats): number {
  return stats.knowledgePending + stats.knowledgeConfirmed;
}

type KnowledgeDocumentsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatDate(value: string) {
  if (value === "--") return "--";

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString();
}

function getFileExtension(fileName: string) {
  const index = fileName.lastIndexOf(".");

  return index >= 0 ? fileName.slice(index).toLowerCase() : "";
}

function getSourceTypeFromFile(file: File) {
  const extension = getFileExtension(file.name);

  if (extension === ".md" || extension === ".markdown") return "markdown";
  if (extension === ".txt" || file.type.startsWith("text/")) return "text";

  return "file";
}

async function readFileAsKnowledgeText(file: File) {
  const sourceType = getSourceTypeFromFile(file);

  if (sourceType !== "text" && sourceType !== "markdown") return "";

  return file.text();
}

function createChunksFromText(rawContent: string) {
  const content = rawContent.trim();

  if (!content) return [];

  const chunkSize = 800;
  const chunkOverlap = 100;
  const step = chunkSize - chunkOverlap;
  const chunks: Array<{
    content: string;
    chunkIndex: number;
    startIndex: number;
    endIndex: number;
  }> = [];

  for (let startIndex = 0; startIndex < content.length; startIndex += step) {
    const endIndex = Math.min(startIndex + chunkSize, content.length);

    chunks.push({
      content: content.slice(startIndex, endIndex),
      chunkIndex: chunks.length,
      startIndex,
      endIndex,
    });

    if (endIndex >= content.length) break;
  }

  return chunks;
}

export function KnowledgeDocumentsDialog({
  open,
  onOpenChange,
}: KnowledgeDocumentsDialogProps) {
  const selectedId = useAppStore((state) => state.selectedId);
  const selected = useAppStore((state) => state.selected);
  const selectedDocs = useAppStore((state) => state.selectedDocs);
  const selectedChunks = useAppStore((state) => state.selectedChunks);
  const setSelectedDocs = useAppStore((state) => state.setSelectedDocs);
  const setSelectedChunks = useAppStore((state) => state.setSelectedChunks);
  const setSelected = useAppStore((state) => state.setSelected);
  const updateItem = useAppStore((state) => state.updateItem);

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteDocTarget, setDeleteDocTarget] = useState<RagDoc | null>(null);
  const [deleteChoiceOpen, setDeleteChoiceOpen] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [chunksDialogOpen, setChunksDialogOpen] = useState(false);
  const [activeChunkDoc, setActiveChunkDoc] = useState<RagDoc | null>(null);
  const [chunksByDocumentId, setChunksByDocumentId] = useState<
    Record<string, RagChunk[]>
  >({});
  const [deletedDocs, setDeletedDocs] = useState<RagDoc[]>([]);
  const [deletedDocsLoading, setDeletedDocsLoading] = useState(false);
  const [deletedDocsError, setDeletedDocsError] = useState<string | null>(null);

  const safeDocs = Array.isArray(selectedDocs) ? selectedDocs : [];
  const allChunksStats = useMemo(() => {
    const allChunks = Object.values(chunksByDocumentId).flat();
    return getChunkStats(allChunks);
  }, [chunksByDocumentId]);
  const totalKnowledgeCount = getTotalKnowledgeCount(allChunksStats);

  const syncCounts = useCallback(
    (nextDocs: RagDoc[], nextChunks: Record<string, RagChunk[]>) => {
      if (!selectedId) return;

      const allChunks = Object.values(nextChunks).flat();
      const stats = getChunkStats(allChunks);
      const totalChunks = allChunks.length;
      updateItem(selectedId, {
        documentCount: nextDocs.length,
        chunkCount: totalChunks,
        knowledgeCount: getTotalKnowledgeCount(stats),
      });
    },
    [selectedId, updateItem]
  );

  useEffect(() => {
    if (!open || !selectedId) return;

    let ignore = false;

    async function loadDocuments() {
      if (!selectedId) return;

      setDocumentsLoading(true);
      setDocumentsError(null);

      try {
        const detail = await fetchRagDetail(selectedId);
        const detailRecord =
          detail && typeof detail === "object"
            ? (detail as Record<string, unknown>)
            : {};
        const docsInput = Array.isArray(detailRecord.documents)
          ? detailRecord.documents
          : [];
        const docs = docsInput.map(normalizeRagDoc);
        const nextChunks = docsInput.reduce<Record<string, RagChunk[]>>(
          (acc, docInput) => {
            const doc = normalizeRagDoc(docInput);
            const record =
              docInput && typeof docInput === "object"
                ? (docInput as Record<string, unknown>)
                : {};
            const chunks = Array.isArray(record.chunks)
              ? record.chunks.map(normalizeRagChunk)
              : [];

            acc[doc.id] = chunks;
            return acc;
          },
          {}
        );

        if (ignore) return;

        setSelected(normalizeRagItem(detail));
        setSelectedDocs(docs);
        setChunksByDocumentId(nextChunks);
        syncCounts(docs, nextChunks);
      } catch (error) {
        console.error("Failed to load knowledge base documents.", error);

        if (!ignore) {
          setDocumentsError("知识文档加载失败，请稍后重试");
        }
      } finally {
        if (!ignore) {
          setDocumentsLoading(false);
        }
      }
    }

    async function loadDeletedDocuments() {
      setDeletedDocsLoading(true);
      setDeletedDocsError(null);

      try {
        const raw = await fetchDeletedDocuments();
        const list = Array.isArray(raw) ? raw : [];
        // Only show documents that have a deletedAt timestamp
        const deleted = list
          .filter(
            (item: unknown) =>
              item && typeof item === "object" && (item as Record<string, unknown>).deletedAt
          )
          .map(normalizeRagDoc);

        if (!ignore) {
          setDeletedDocs(deleted);
        }
      } catch (error) {
        console.error("Failed to load deleted documents.", error);
        if (!ignore) {
          setDeletedDocsError("已删除文档加载失败");
        }
      } finally {
        if (!ignore) {
          setDeletedDocsLoading(false);
        }
      }
    }

    loadDocuments();
    loadDeletedDocuments();

    return () => {
      ignore = true;
    };
  }, [open, selectedId, setSelected, setSelectedDocs, syncCounts]);

  async function handleFilesSelected(files: FileList | File[]) {
    if (!selectedId) return;

    const validationError = validateUploadFile({
      files,
      selectedDocs: safeDocs,
    });

    if (validationError) {
      setUploadError(validationError);
      return;
    }

    const [file] = Array.from(files);
    setUploading(true);
    setUploadError(null);

    try {
      const rawContent = await readFileAsKnowledgeText(file);
      const chunks = createChunksFromText(rawContent);
      const document = await createKnowledgeDocument({
        title: file.name,
        sourceType: getSourceTypeFromFile(file),
        fileName: file.name,
        mimeType: file.type || undefined,
        fileSize: file.size,
        rawContent,
        status: rawContent ? "parsed" : "pending",
        activeStatus: "active",
        knowledgeBaseIds: [selectedId],
        chunks,
      });
      const doc = normalizeRagDoc(document);
      const normalizedChunks =
        document && typeof document === "object"
          ? Array.isArray((document as Record<string, unknown>).chunks)
            ? ((document as Record<string, unknown>).chunks as unknown[]).map(
                normalizeRagChunk
              )
            : []
          : [];
      const nextDocs = [...safeDocs, doc];
      const nextChunks = {
        ...chunksByDocumentId,
        [doc.id]: normalizedChunks,
      };

      setSelectedDocs(nextDocs);
      setChunksByDocumentId(nextChunks);
      syncCounts(nextDocs, nextChunks);
    } catch (error) {
      console.error("Failed to upload document.", error);
      setUploadError("文档上传失败，请稍后重试");
    } finally {
      setUploading(false);
    }
  }

  function openChunksDialog(doc: RagDoc) {
    const chunks = chunksByDocumentId[doc.id] ?? [];

    setActiveChunkDoc(doc);
    setSelectedChunks(chunks);
    setChunksDialogOpen(true);
  }

  // When user clicks delete, show the choice dialog instead of directly deleting
  function handleDeleteClick(doc: RagDoc) {
    setDeleteDocTarget(doc);
    setDeleteChoiceOpen(true);
  }

  async function confirmDeleteDocument(mode: "cascade" | "reference-only") {
    if (!deleteDocTarget) return;

    setDeleteSubmitting(true);
    setDeleteChoiceOpen(false);

    try {
      await deleteKnowledgeDocument(deleteDocTarget.id, {
        mode,
        knowledgeBaseId: selectedId ?? undefined,
      });

      const nextDocs = safeDocs.filter((doc) => doc.id !== deleteDocTarget.id);
      const nextChunks = { ...chunksByDocumentId };

      delete nextChunks[deleteDocTarget.id];

      const currentChunksBelongToDeletedDoc = selectedChunks.some(
        (chunk) => chunk.documentId === deleteDocTarget.id
      );

      setSelectedDocs(nextDocs);
      setChunksByDocumentId(nextChunks);

      if (currentChunksBelongToDeletedDoc) {
        setSelectedChunks([]);
        setActiveChunkDoc(null);
        setChunksDialogOpen(false);
      }

      syncCounts(nextDocs, nextChunks);

      // If cascade mode was used, add to deleted docs list for potential restore
      if (mode === "cascade") {
        setDeletedDocs((prev) => [...prev, { ...deleteDocTarget }]);
      }

      setDeleteDocTarget(null);
    } catch (error) {
      console.error("Failed to delete document.", error);
      setDocumentsError("文档删除失败，请稍后重试");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  async function handleRestoreDocument(docId: string) {
    setRestoringId(docId);

    try {
      const restoredRaw = await restoreKnowledgeDocument(docId);
      const restored =
        restoredRaw && typeof restoredRaw === "object"
          ? (restoredRaw as Record<string, unknown>)
          : {};

      // Determine which KBs the restored document belongs to
      const kbList = Array.isArray(restored.knowledgeBases)
        ? restored.knowledgeBases
        : [];
      const belongsToCurrentKb = kbList.some(
        (kb: unknown) =>
          kb &&
          typeof kb === "object" &&
          (kb as Record<string, unknown>).id === selectedId
      );

      // Remove from deleted docs list
      setDeletedDocs((prev) => prev.filter((d) => d.id !== docId));

      // Reload documents to get fresh state
      if (selectedId) {
        const detail = await fetchRagDetail(selectedId);
        const detailRecord =
          detail && typeof detail === "object"
            ? (detail as Record<string, unknown>)
            : {};
        const docsInput = Array.isArray(detailRecord.documents)
          ? detailRecord.documents
          : [];
        const docs = docsInput.map(normalizeRagDoc);
        const nextChunks = docsInput.reduce<Record<string, RagChunk[]>>(
          (acc, docInput) => {
            const doc = normalizeRagDoc(docInput);
            const record =
              docInput && typeof docInput === "object"
                ? (docInput as Record<string, unknown>)
                : {};
            const chunks = Array.isArray(record.chunks)
              ? record.chunks.map(normalizeRagChunk)
              : [];

            acc[doc.id] = chunks;
            return acc;
          },
          {}
        );

        setSelected(normalizeRagItem(detail));
        setSelectedDocs(docs);
        setChunksByDocumentId(nextChunks);
        syncCounts(docs, nextChunks);
      }
    } catch (error) {
      console.error("Failed to restore document.", error);
      setDocumentsError("文档恢复失败，请稍后重试");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              查看知识 - {selected?.name ?? "未命名知识库"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <DocumentUploadZone
              error={uploadError}
              uploading={uploading}
              onFilesSelected={handleFilesSelected}
            />

            {documentsError ? (
              <div className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                {documentsError}
              </div>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>知识文档</CardTitle>
                <CardDescription>
                  当前 {safeDocs.length} 个文档，{allChunksStats.textCount} 个文本分片
                  {totalKnowledgeCount > 0 && (
                    <span>
                      ，{totalKnowledgeCount} 条知识条目
                      （{allChunksStats.knowledgeConfirmed} 已入库
                      {allChunksStats.knowledgePending > 0 && (
                        <span>，{allChunksStats.knowledgePending} 待审核</span>
                      )}
                      ）
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {documentsLoading ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    正在加载知识文档...
                  </div>
                ) : safeDocs.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    暂无知识文档，上传文件后将在这里展示文档
                  </div>
                ) : (
                  safeDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[1fr_auto]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <FileText />
                          <span className="truncate text-sm font-medium">
                            {doc.name || "未命名文档"}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>大小：{formatFileSize(doc.size)}</span>
                          <span>上传时间：{formatDate(doc.uploadedAt)}</span>
                          {(() => {
                            const docChunks = chunksByDocumentId[doc.id] ?? [];
                            const stats = getChunkStats(docChunks);
                            return (
                              <>
                                {stats.textCount > 0 && (
                                  <Badge variant="outline">
                                    {stats.textCount} 文本分片
                                  </Badge>
                                )}
                                {getTotalKnowledgeCount(stats) > 0 && (
                                  <Badge
                                    variant="outline"
                                    className={
                                      stats.knowledgePending > 0
                                        ? "border-amber-300 bg-amber-50 text-amber-700"
                                        : "border-green-300 bg-green-50 text-green-700"
                                    }
                                  >
                                    {getTotalKnowledgeCount(stats)} 知识条目
                                    {stats.knowledgeConfirmed > 0 &&
                                      `（${stats.knowledgeConfirmed} 已入库）`}
                                    {stats.knowledgePending > 0 &&
                                      `（${stats.knowledgePending} 待审核）`}
                                  </Badge>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openChunksDialog(doc)}
                        >
                          分片
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteClick(doc)}
                        >
                          <Trash2 data-icon="inline-start" />
                          删除
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除选择对话框 */}
      <AlertDialog
        open={deleteChoiceOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeleteChoiceOpen(false);
            setDeleteDocTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>选择删除方式</AlertDialogTitle>
            <AlertDialogDescription>
              确定要从「{selected?.name ?? "未命名知识库"}」中删除「
              {deleteDocTarget?.name ?? "未命名文档"}
              」吗？请选择删除方式：
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <button
              type="button"
              disabled={deleteSubmitting}
              onClick={() => confirmDeleteDocument("cascade")}
              className="flex flex-col gap-1 rounded-md border border-red-200 bg-red-50 p-4 text-left transition-colors hover:bg-red-100 disabled:opacity-50"
            >
              <span className="text-sm font-semibold text-red-700">
                删除文档及所有知识条目
              </span>
              <span className="text-xs text-red-600">
                软删除文档和该文档产生的所有知识条目（AI 提炼内容），删除后可从已删除列表恢复。
              </span>
            </button>
            <button
              type="button"
              disabled={deleteSubmitting}
              onClick={() => confirmDeleteDocument("reference-only")}
              className="flex flex-col gap-1 rounded-md border border-amber-200 bg-amber-50 p-4 text-left transition-colors hover:bg-amber-100 disabled:opacity-50"
            >
              <span className="text-sm font-semibold text-amber-700">
                仅删除引用文档
              </span>
              <span className="text-xs text-amber-600">
                仅从当前知识库移除该文档引用，保留文档及其知识条目。文档之后仍可重新添加到此知识库。
              </span>
            </button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSubmitting}>取消</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 已删除文档区域 */}
      {deletedDocs.length > 0 ? (
        <Card className="border-dashed border-muted-foreground/30">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              已删除的文档
            </CardTitle>
            <CardDescription>
              以下文档已被软删除，可以恢复。恢复后关联的知识条目也会一并恢复。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {deletedDocsLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                正在加载已删除文档...
              </div>
            ) : deletedDocsError ? (
              <div className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                {deletedDocsError}
              </div>
            ) : (
              deletedDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="grid gap-3 rounded-md border border-border bg-muted/30 p-3 md:grid-cols-[1fr_auto]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 text-muted-foreground" />
                      <span className="truncate text-sm font-medium text-muted-foreground">
                        {doc.name || "未命名文档"}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      大小：{formatFileSize(doc.size)}
                    </div>
                  </div>
                  <div className="flex items-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={restoringId === doc.id}
                      onClick={() => handleRestoreDocument(doc.id)}
                    >
                      <RefreshCw
                        data-icon="inline-start"
                        className={
                          restoringId === doc.id ? "animate-spin" : ""
                        }
                      />
                      {restoringId === doc.id ? "恢复中..." : "恢复"}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      <DocumentChunksDialog
        open={chunksDialogOpen}
        document={activeChunkDoc}
        chunks={selectedChunks}
        onOpenChange={setChunksDialogOpen}
      />
    </>
  );
}
