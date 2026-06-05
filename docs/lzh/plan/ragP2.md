# RAG 知识文档与分片管理 Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Phase 1 知识库管理页面基础上，实现单个知识库的文档上传 mock、文档列表、删除确认和分片只读查看。

**Architecture:** 继续沿用 Phase 1 的轻量 `items` 模型，主列表只更新 `documentCount` / `chunkCount`，不写入 documents/chunks 明细。文档列表写入 Zustand 的 `selectedDocs`，当前查看分片写入 `selectedChunks`，mock 分片映射保存在文档弹窗本地状态。页面容器只负责打开 `查看知识` 弹窗，文档管理、上传区、分片弹窗拆成独立业务组件。

**Tech Stack:** Next.js App Router、React、TypeScript、Tailwind CSS、shadcn/ui、lucide-react、Zustand。

---

## 文件结构

本次实现涉及以下文件：

- Modify: `src/features/knowledge-bases/types.ts`
- Modify: `src/features/knowledge-bases/utils.ts`
- Modify: `src/features/knowledge-bases/api.ts`
- Modify: `src/features/knowledge-bases/knowledge-base-management.tsx`
- Create: `src/features/knowledge-bases/document-upload-zone.tsx`
- Create: `src/features/knowledge-bases/document-chunks-dialog.tsx`
- Create: `src/features/knowledge-bases/knowledge-documents-dialog.tsx`

不修改：

- `src/generated/prisma/`
- Prisma schema
- 真实 API Route
- 权限、多租户、真实上传、真实解析、真实分片生成

---

### Task 1: 调整 Phase 2 类型和工具函数

**Files:**
- Modify: `src/features/knowledge-bases/types.ts`
- Modify: `src/features/knowledge-bases/utils.ts`
- Modify: `src/features/knowledge-bases/api.ts`

- [ ] **Step 1: 调整 Phase 2 类型**

Update `src/features/knowledge-bases/types.ts`:

```ts
export type RagStatus = "active" | "disabled";

export type RagListItem = {
  id: string;
  name: string;
  description: string;
  icon?: string;
  documentCount: number;
  chunkCount: number;
  topK: number;
  chunkSize: number;
  similarityThreshold: number;
  status: RagStatus;
  updatedAt: string;
};

export type RagDoc = {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
};

export type RagChunk = {
  id: string;
  documentId: string;
  content: string;
  tokenCount?: number;
  charCount?: number;
  createdAt?: string;
};

export type RagDetail = RagListItem;

export type KnowledgeBaseFormValues = {
  name: string;
  description: string;
  topK: number;
  chunkSize: number;
  similarityThreshold: number;
  status: RagStatus;
};

export type SortField = "updatedAt" | "documentCount";
export type SortDirection = "desc" | "asc";
export type StatusFilter = "all" | "active" | "disabled" | null;

export const DEFAULT_KNOWLEDGE_BASE_FORM_VALUES = {
  name: "",
  description: "",
  topK: 5,
  chunkSize: 500,
  similarityThreshold: 0.7,
  status: "active",
} satisfies KnowledgeBaseFormValues;
```

- [ ] **Step 2: 增加上传和分片工具函数**

Append to `src/features/knowledge-bases/utils.ts`:

```ts
import type { RagChunk, RagDoc } from "./types";

export const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;

export const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  ".markdown",
];

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
];

function getFileExtension(fileName: string) {
  const index = fileName.lastIndexOf(".");
  return index >= 0 ? fileName.slice(index).toLowerCase() : "";
}

export function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function validateUploadFile(params: {
  files: FileList | File[];
  selectedDocs: RagDoc[];
}) {
  const files = Array.from(params.files);

  if (files.length === 0) return "请选择要上传的文件";
  if (files.length > 1) return "当前仅支持一次上传 1 个文件";

  const file = files[0];
  const extension = getFileExtension(file.name);
  const validExtension = ALLOWED_EXTENSIONS.includes(extension);
  const validMime =
    !file.type || ALLOWED_MIME_TYPES.includes(file.type) || validExtension;

  if (!validExtension || !validMime) {
    return "仅支持 PDF、DOCX、TXT、Markdown 文件";
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    return "文件大小不能超过 20MB";
  }

  const duplicated = params.selectedDocs.some((doc) => doc.name === file.name);

  if (duplicated) {
    return "当前知识库已存在同名文档";
  }

  return null;
}

export function createMockDocumentFromFile(file: File): RagDoc {
  return {
    id: createClientId(),
    name: file.name,
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };
}

export function createMockChunksForDocument(doc: RagDoc): RagChunk[] {
  const count = 2 + Math.floor(Math.random() * 2);

  return Array.from({ length: count }, (_, index) => {
    const content = `这是从 ${doc.name} 生成的模拟知识分片 ${index + 1}。`;

    return {
      id: createClientId(),
      documentId: doc.id,
      content,
      charCount: content.length,
      tokenCount: Math.ceil(content.length / 2),
      createdAt: new Date().toISOString(),
    };
  });
}

export function getTotalChunkCount(
  chunksByDocumentId: Record<string, RagChunk[]>
) {
  return Object.values(chunksByDocumentId).reduce(
    (sum, chunks) => sum + chunks.length,
    0
  );
}

export function normalizeRagDoc(input: unknown): RagDoc {
  const item =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};

  return {
    id: typeof item.id === "string" ? item.id : createClientId(),
    name:
      typeof item.name === "string" && item.name.trim()
        ? item.name
        : "未命名文档",
    size: typeof item.size === "number" && Number.isFinite(item.size) ? item.size : 0,
    uploadedAt:
      typeof item.uploadedAt === "string" && item.uploadedAt.trim()
        ? item.uploadedAt
        : "--",
  };
}

export function normalizeRagChunk(input: unknown): RagChunk {
  const item =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  const content =
    typeof item.content === "string" && item.content.trim()
      ? item.content
      : "暂无内容";

  return {
    id: typeof item.id === "string" ? item.id : createClientId(),
    documentId: typeof item.documentId === "string" ? item.documentId : "",
    content,
    charCount:
      typeof item.charCount === "number" && Number.isFinite(item.charCount)
        ? item.charCount
        : content.length,
    tokenCount:
      typeof item.tokenCount === "number" && Number.isFinite(item.tokenCount)
        ? item.tokenCount
        : undefined,
    createdAt:
      typeof item.createdAt === "string" && item.createdAt.trim()
        ? item.createdAt
        : "--",
  };
}
```

If duplicate `import type` declarations appear at the top of `utils.ts`, merge them into one import block:

```ts
import type {
  KnowledgeBaseFormValues,
  RagChunk,
  RagDoc,
  RagListItem,
  RagStatus,
  SortDirection,
  SortField,
  StatusFilter,
} from "./types";
```

- [ ] **Step 3: 增加 Phase 2 API 预留函数**

Append to `src/features/knowledge-bases/api.ts`:

```ts
export async function fetchRagDetail(id: string) {
  const response = await fetch(`/api/knowledge-bases/${id}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch knowledge base detail: ${response.status}`
    );
  }

  return response.json();
}

export async function fetchDocumentChunks(params: {
  knowledgeBaseId: string;
  documentId: string;
}) {
  const response = await fetch(
    `/api/knowledge-bases/${params.knowledgeBaseId}/documents/${params.documentId}/chunks`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch document chunks: ${response.status}`);
  }

  return response.json();
}
```

- [ ] **Step 4: 运行 lint**

Run:

```bash
npm run lint
```

Expected: 无 TypeScript 或 ESLint 错误。

- [ ] **Step 5: 提交类型和工具函数**

```bash
git add src/features/knowledge-bases/types.ts src/features/knowledge-bases/utils.ts src/features/knowledge-bases/api.ts
git commit -m "feat: add knowledge document utilities"
```

---

### Task 2: 创建文件上传区域组件

**Files:**
- Create: `src/features/knowledge-bases/document-upload-zone.tsx`

- [ ] **Step 1: 创建上传组件**

Create `src/features/knowledge-bases/document-upload-zone.tsx`:

```tsx
"use client";

import { Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DocumentUploadZoneProps = {
  error: string | null;
  onFilesSelected: (files: FileList | File[]) => void;
};

export function DocumentUploadZone({
  error,
  onFilesSelected,
}: DocumentUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className={cn(
          "flex min-h-32 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-4 text-center transition-colors",
          isDragging && "bg-muted"
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          onFilesSelected(event.dataTransfer.files);
        }}
      >
        <Upload className="text-muted-foreground" />
        <span className="text-sm font-medium">点击或拖拽文件上传</span>
        <span className="text-xs text-muted-foreground">
          支持 PDF、DOCX、TXT、Markdown，单文件不超过 20MB
        </span>
        <Button type="button" variant="outline" size="sm" asChild>
          <span>选择文件</span>
        </Button>
      </button>

      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept=".pdf,.docx,.txt,.md,.markdown"
        onChange={(event) => {
          if (event.target.files) {
            onFilesSelected(event.target.files);
          }
          event.target.value = "";
        }}
      />

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 2: 运行 lint**

Run:

```bash
npm run lint
```

Expected: 上传组件无 lint 错误。

- [ ] **Step 3: 提交上传组件**

```bash
git add src/features/knowledge-bases/document-upload-zone.tsx
git commit -m "feat: add document upload zone"
```

---

### Task 3: 创建分片只读弹窗组件

**Files:**
- Create: `src/features/knowledge-bases/document-chunks-dialog.tsx`

- [ ] **Step 1: 创建分片弹窗**

Create `src/features/knowledge-bases/document-chunks-dialog.tsx`:

```tsx
"use client";

import { FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RagChunk, RagDoc } from "./types";

type DocumentChunksDialogProps = {
  open: boolean;
  document: RagDoc | null;
  chunks: RagChunk[];
  onOpenChange: (open: boolean) => void;
};

function formatDate(value?: string) {
  if (!value || value === "--") return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString();
}

export function DocumentChunksDialog({
  open,
  document,
  chunks,
  onOpenChange,
}: DocumentChunksDialogProps) {
  const safeChunks = Array.isArray(chunks) ? chunks : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>知识分片 - {document?.name ?? "未命名文档"}</DialogTitle>
        </DialogHeader>

        {safeChunks.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              暂无知识分片
            </CardContent>
          </Card>
        ) : (
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
            {safeChunks.map((chunk, index) => (
              <Card key={chunk.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <FileText />
                      分片 {index + 1}
                    </span>
                    <Badge variant="outline">
                      {chunk.charCount ?? chunk.content.length} 字符
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="text-sm leading-6">{chunk.content || "暂无内容"}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>Token：{chunk.tokenCount ?? 0}</span>
                    <span>创建时间：{formatDate(chunk.createdAt)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: 运行 lint**

Run:

```bash
npm run lint
```

Expected: 分片弹窗无 lint 错误。

- [ ] **Step 3: 提交分片弹窗**

```bash
git add src/features/knowledge-bases/document-chunks-dialog.tsx
git commit -m "feat: add document chunks dialog"
```

---

### Task 4: 创建知识文档管理弹窗

**Files:**
- Create: `src/features/knowledge-bases/knowledge-documents-dialog.tsx`

- [ ] **Step 1: 创建文档弹窗组件**

Create `src/features/knowledge-bases/knowledge-documents-dialog.tsx`:

```tsx
"use client";

import { FileText, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

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
import type { RagChunk, RagDoc } from "./types";
import {
  createMockChunksForDocument,
  createMockDocumentFromFile,
  formatFileSize,
  getTotalChunkCount,
  validateUploadFile,
} from "./utils";

type KnowledgeDocumentsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatDate(value: string) {
  if (value === "--") return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString();
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
  const updateItem = useAppStore((state) => state.updateItem);

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteDocTarget, setDeleteDocTarget] = useState<RagDoc | null>(null);
  const [chunksDialogOpen, setChunksDialogOpen] = useState(false);
  const [activeChunkDoc, setActiveChunkDoc] = useState<RagDoc | null>(null);
  const [chunksByDocumentId, setChunksByDocumentId] = useState<
    Record<string, RagChunk[]>
  >({});

  const safeDocs = Array.isArray(selectedDocs) ? selectedDocs : [];
  const totalChunkCount = useMemo(
    () => getTotalChunkCount(chunksByDocumentId),
    [chunksByDocumentId]
  );

  function syncCounts(nextDocs: RagDoc[], nextChunks: Record<string, RagChunk[]>) {
    if (!selectedId) return;

    updateItem(selectedId, {
      documentCount: nextDocs.length,
      chunkCount: getTotalChunkCount(nextChunks),
    });
  }

  function handleFilesSelected(files: FileList | File[]) {
    const validationError = validateUploadFile({
      files,
      selectedDocs: safeDocs,
    });

    if (validationError) {
      setUploadError(validationError);
      return;
    }

    const [file] = Array.from(files);
    const doc = createMockDocumentFromFile(file);
    const chunks = createMockChunksForDocument(doc);
    const nextDocs = [...safeDocs, doc];
    const nextChunks = {
      ...chunksByDocumentId,
      [doc.id]: chunks,
    };

    setUploadError(null);
    setSelectedDocs(nextDocs);
    setChunksByDocumentId(nextChunks);
    syncCounts(nextDocs, nextChunks);
  }

  function openChunksDialog(doc: RagDoc) {
    const chunks = chunksByDocumentId[doc.id] ?? [];

    setActiveChunkDoc(doc);
    setSelectedChunks(chunks);
    setChunksDialogOpen(true);
  }

  function confirmDeleteDocument() {
    if (!deleteDocTarget) return;

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
    setDeleteDocTarget(null);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>查看知识 - {selected?.name ?? "未命名知识库"}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <DocumentUploadZone
              error={uploadError}
              onFilesSelected={handleFilesSelected}
            />

            <Card>
              <CardHeader>
                <CardTitle>知识文档</CardTitle>
                <CardDescription>
                  当前 {safeDocs.length} 个文档，{totalChunkCount} 个模拟分片
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {safeDocs.length === 0 ? (
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
                          <Badge variant="outline">
                            {(chunksByDocumentId[doc.id] ?? []).length} 分片
                          </Badge>
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
                          onClick={() => setDeleteDocTarget(doc)}
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

      <AlertDialog
        open={Boolean(deleteDocTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeleteDocTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除文档</AlertDialogTitle>
            <AlertDialogDescription>
              确定要从「{selected?.name ?? "未命名知识库"}」中删除「
              {deleteDocTarget?.name ?? "未命名文档"}」吗？删除后该文档和关联模拟分片会从当前知识库中移除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmDeleteDocument}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DocumentChunksDialog
        open={chunksDialogOpen}
        document={activeChunkDoc}
        chunks={selectedChunks}
        onOpenChange={setChunksDialogOpen}
      />
    </>
  );
}
```

- [ ] **Step 2: 运行 lint**

Run:

```bash
npm run lint
```

Expected: 文档弹窗组件无 lint 错误。

- [ ] **Step 3: 提交文档弹窗**

```bash
git add src/features/knowledge-bases/knowledge-documents-dialog.tsx
git commit -m "feat: add knowledge documents dialog"
```

---

### Task 5: 在知识库页面接入查看知识能力

**Files:**
- Modify: `src/features/knowledge-bases/knowledge-base-management.tsx`

- [ ] **Step 1: 增加导入和本地状态**

Add imports:

```tsx
import { BookOpen } from "lucide-react";
import { KnowledgeDocumentsDialog } from "./knowledge-documents-dialog";
```

If `lucide-react` import already exists, merge `BookOpen` into the existing import list.

Inside `KnowledgeBaseManagement`, add store selectors:

```tsx
const setSelectedId = useAppStore((state) => state.setSelectedId);
const setSelected = useAppStore((state) => state.setSelected);
const setSelectedDocs = useAppStore((state) => state.setSelectedDocs);
const setSelectedChunks = useAppStore((state) => state.setSelectedChunks);
```

Add local state:

```tsx
const [documentsDialogOpen, setDocumentsDialogOpen] = useState(false);
```

- [ ] **Step 2: 添加打开查看知识函数**

Inside `KnowledgeBaseManagement`, add:

```tsx
function openDocumentsDialog(item: RagListItem) {
  setSelectedId(item.id);
  setSelected(item);
  setSelectedDocs([]);
  setSelectedChunks([]);
  setDocumentsDialogOpen(true);
}
```

This preserves the Phase 2 rule: first open starts with an empty document list.

- [ ] **Step 3: 在卡片底部新增查看知识按钮**

In the card footer action area, change buttons from:

```tsx
<Button
  type="button"
  variant="outline"
  size="sm"
  onClick={() => openEditDialog(item)}
>
  编辑
</Button>
<Button
  type="button"
  variant="destructive"
  size="sm"
  onClick={() => setDeleteTarget(item)}
>
  删除
</Button>
```

to:

```tsx
<Button
  type="button"
  variant="outline"
  size="sm"
  onClick={() => openEditDialog(item)}
>
  编辑
</Button>
<Button
  type="button"
  variant="outline"
  size="sm"
  onClick={() => openDocumentsDialog(item)}
>
  <BookOpen data-icon="inline-start" />
  查看知识
</Button>
<Button
  type="button"
  variant="destructive"
  size="sm"
  onClick={() => setDeleteTarget(item)}
>
  删除
</Button>
```

- [ ] **Step 4: 渲染文档弹窗**

Before the final closing `</section>`, render:

```tsx
<KnowledgeDocumentsDialog
  open={documentsDialogOpen}
  onOpenChange={setDocumentsDialogOpen}
/>
```

Place it near other dialogs, after the knowledge-base delete `AlertDialog` is acceptable.

- [ ] **Step 5: 运行 lint**

Run:

```bash
npm run lint
```

Expected: 页面容器无 lint 错误。

- [ ] **Step 6: 提交页面接入**

```bash
git add src/features/knowledge-bases/knowledge-base-management.tsx
git commit -m "feat: connect knowledge document management"
```

---

### Task 6: 完成构建验证和人工验收

**Files:**
- Verify: `src/features/knowledge-bases/*`
- Verify: `src/store/slices/knowledge-base-slice.ts`

- [ ] **Step 1: 运行 lint**

Run:

```bash
npm run lint
```

Expected: 命令成功退出，无错误。

- [ ] **Step 2: 运行 build**

Run:

```bash
npm run build
```

Expected: Next.js build 成功。

- [ ] **Step 3: 启动或复用开发服务器**

Run:

```bash
npm run dev
```

Expected: 开发服务器启动，通常为 `http://localhost:3000`。如果已有服务监听 3000，复用现有服务或按 Next.js 提示使用其他端口。

- [ ] **Step 4: 人工验收 `/knowledge-bases`**

Check:

- 知识库卡片出现 `查看知识` 按钮。
- 点击 `查看知识` 打开弹窗，标题包含当前知识库名称。
- 初次打开文档列表为空。
- 点击上传区域可以选择文件。
- 拖拽单个合法文件可以上传。
- 一次拖拽多个文件会展示 `当前仅支持一次上传 1 个文件`。
- 不支持的文件类型会展示 `仅支持 PDF、DOCX、TXT、Markdown 文件`。
- 超过 20MB 的文件会展示 `文件大小不能超过 20MB`。
- 同一知识库下上传同名文件会展示 `当前知识库已存在同名文档`。
- 上传成功后文档列表新增 1 条文档。
- 上传成功后当前知识库卡片 `documentCount` 增加 1。
- 上传成功后当前知识库卡片 `chunkCount` 增加 2 或 3。
- 点击文档 `分片` 打开只读分片弹窗。
- 删除文档前出现 `确认删除文档` 确认框。
- 点击 `取消` 不删除文档。
- 点击红色 `确认删除` 后文档列表和卡片统计同步更新。
- 主列表 `items` 没有 documents/chunks 明细字段。

- [ ] **Step 5: 提交验证修正**

If verification required small fixes:

```bash
git add src/features/knowledge-bases
git commit -m "fix: polish knowledge document management"
```

If no fixes were needed, do not create an empty commit.

---

## 自检清单

- [ ] `items` 仍然只保存轻量知识库数据。
- [ ] 没有把 documents/chunks 写入 `items`。
- [ ] 上传成功后更新 `selectedDocs`。
- [ ] 点击文档分片后更新 `selectedChunks`。
- [ ] 上传和删除文档后同步更新 `documentCount` / `chunkCount`。
- [ ] 初次打开某个知识库时文档列表为空。
- [ ] 上传限制覆盖单文件、类型、大小、重名。
- [ ] 文档删除需要确认框。
- [ ] 分片弹窗只读。
- [ ] `npm run lint` 和 `npm run build` 的结果记录在最终回复中。
