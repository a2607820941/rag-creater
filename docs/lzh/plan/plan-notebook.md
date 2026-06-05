# 知识笔记 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现后台 `/note` 知识笔记页面的基础编辑闭环，包括目录、详情加载、新建、保存、切换前保存、删除、Markdown 编辑器和空状态。

**Architecture:** 页面路由使用当前真实路径 `/note`，业务代码落在 `src/features/note/`，API 资源集合使用 `/api/notes`。笔记复用 `DocumentSource`，以 `sourceType = "markdown"` 和 `fileType = "note"` 区分；页面草稿状态放在 `NoteFeature` 本地 state 或 reducer，不新增 Zustand 笔记 slice。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Prisma 7、SQLite、Zod、Tailwind CSS、shadcn/ui、lucide-react、@uiw/react-md-editor。

---

## File Structure

Create:

- `src/features/note/types.ts`：定义 `NoteSummary`、`NoteDetail`、创建/更新输入类型。
- `src/features/note/server/schemas.ts`：Zod schema，校验创建、更新和 id 参数。
- `src/features/note/server/note-service.ts`：封装 Prisma 查询、创建、详情、更新、删除逻辑。
- `src/app/api/notes/route.ts`：实现 `GET /api/notes` 和 `POST /api/notes`。
- `src/app/api/notes/[id]/route.ts`：实现 `GET`、`PATCH`、`DELETE` 单笔记接口。
- `src/features/note/api.ts`：前端 fetch 封装。
- `src/features/note/index.tsx`：知识笔记主业务组件，持有本地状态和业务编排。
- `src/features/note/components/note-topbar.tsx`：标题、更新时间、保存/新建/删除按钮。
- `src/features/note/components/note-editor.tsx`：Markdown 编辑器。
- `src/features/note/components/note-directory.tsx`：右侧目录与收缩/展开。
- `src/features/note/components/note-empty-state.tsx`：空状态。
- `src/features/note/components/delete-note-dialog.tsx`：删除确认弹窗。

Modify:

- `src/app/note/page.tsx`：从占位页面改为渲染 `NoteFeature`。
- `prisma/schema.prisma`：确认 `DocumentSource.fileType` 已为 `String @default("file")`。

Do not modify:

- `src/generated/prisma/` manually。
- 全局 store 笔记状态；本阶段草稿和页面交互状态只放在 `NoteFeature` 本地 state / reducer。
- `src/features/note/components/feishu-import.tsx`。

---

## Task 0: Verify Prerequisites

**Files:**

- Inspect: `package.json`
- Inspect: `prisma/schema.prisma`
- Inspect: `src/components/layout/admin-nav.ts`
- Inspect: `src/app/note/page.tsx`

- [ ] **Step 1: Confirm Markdown editor dependency exists**

Run:

```bash
node -e "const p=require('./package.json'); if(!p.dependencies['@uiw/react-md-editor']) process.exit(1); console.log(p.dependencies['@uiw/react-md-editor'])"
```

Expected: prints installed version, for example `^4.1.1`.

- [ ] **Step 2: Confirm Prisma fileType default exists**

Run:

```bash
rg -n 'fileType String @default\("file"\)' prisma/schema.prisma
```

Expected: one match in `DocumentSource`.

- [ ] **Step 3: Confirm Sidebar points to `/note`**

Run:

```bash
rg -n 'activePatterns: \["/knowledge-bases", "/note"\]|href: "/note"' src/components/layout/admin-nav.ts
```

Expected: matches for both parent active pattern and child href.

- [ ] **Step 4: Confirm page route exists**

Run:

```bash
Test-Path src/app/note/page.tsx
```

Expected: `True`.

---

## Task 1: Add Shared Note Types

**Files:**

- Create: `src/features/note/types.ts`

- [ ] **Step 1: Create note API types**

Create `src/features/note/types.ts`:

```ts
export type NoteSummary = {
  id: string;
  title: string;
  fileSize: number;
  sourceType: "markdown";
  fileType: "note";
  status: string;
  activeStatus: string;
  createdAt: string;
  updatedAt: string;
};

export type NoteDetail = NoteSummary & {
  originalName: string;
  rawContent: string | null;
};

export type CreateNoteInput = {
  title?: string;
  rawContent?: string;
};

export type UpdateNoteInput = {
  title?: string;
  rawContent?: string;
};

export type NotePageState = {
  notes: NoteSummary[];
  activeNoteId: string | null;
  activeNote: NoteDetail | null;
  draftTitle: string;
  draftRawContent: string;
  titleEditing: boolean;
  directoryOpen: boolean;
  loading: boolean;
  detailLoading: boolean;
  saving: boolean;
  deleting: boolean;
  deleteDialogOpen: boolean;
  error: string | null;
};
```

- [ ] **Step 2: Run TypeScript check through build**

Run:

```bash
npm run build
```

Expected: build passes or fails only on unrelated pre-existing issues. If it fails due to `src/features/note/types.ts`, fix the type file before continuing.

---

## Task 2: Add Zod Schemas

**Files:**

- Create: `src/features/note/server/schemas.ts`

- [ ] **Step 1: Create server schema file**

Create `src/features/note/server/schemas.ts`:

```ts
import { z } from "zod";

export const noteIdSchema = z.object({
  id: z.string().trim().min(1, "note id is required"),
});

export const createNoteSchema = z.object({
  title: z.string().trim().min(1, "title is required").optional(),
  rawContent: z.string().optional(),
});

export const updateNoteSchema = z
  .object({
    title: z.string().trim().min(1, "title is required").optional(),
    rawContent: z.string().optional(),
  })
  .refine((value) => value.title !== undefined || value.rawContent !== undefined, {
    message: "title or rawContent is required",
  });

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
```

- [ ] **Step 2: Verify schema compiles**

Run:

```bash
npm run build
```

Expected: build passes or schema-related errors are fixed before continuing.

---

## Task 3: Add Note Service

**Files:**

- Create: `src/features/note/server/note-service.ts`

- [ ] **Step 1: Implement service helpers and queries**

Create `src/features/note/server/note-service.ts`:

```ts
import { prisma } from "@/lib/db";
import { ServiceError } from "@/features/knowledge-bases/server/errors";

import type { CreateNoteInput, UpdateNoteInput } from "./schemas";

const NOTE_WHERE = {
  sourceType: "markdown",
  fileType: "note",
} as const;

function normalizeTitle(title?: string) {
  const normalized = title?.trim();
  return normalized && normalized.length > 0 ? normalized : "未命名文档";
}

function byteLength(content: string) {
  return Buffer.byteLength(content, "utf-8");
}

function mapNoteSummary(note: {
  id: string;
  title: string;
  fileSize: number;
  sourceType: string;
  fileType: string;
  status: string;
  activeStatus: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: note.id,
    title: note.title,
    fileSize: note.fileSize,
    sourceType: note.sourceType as "markdown",
    fileType: note.fileType as "note",
    status: note.status,
    activeStatus: note.activeStatus,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

function mapNoteDetail(note: {
  id: string;
  originalName: string;
  title: string;
  rawContent: string | null;
  fileSize: number;
  sourceType: string;
  fileType: string;
  status: string;
  activeStatus: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...mapNoteSummary(note),
    originalName: note.originalName,
    rawContent: note.rawContent,
  };
}

export async function listNotesService() {
  const notes = await prisma.documentSource.findMany({
    where: NOTE_WHERE,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      fileSize: true,
      sourceType: true,
      fileType: true,
      status: true,
      activeStatus: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return notes.map(mapNoteSummary);
}

export async function getNoteDetailService(id: string) {
  const note = await prisma.documentSource.findFirst({
    where: { id, ...NOTE_WHERE },
    select: {
      id: true,
      originalName: true,
      title: true,
      rawContent: true,
      fileSize: true,
      sourceType: true,
      fileType: true,
      status: true,
      activeStatus: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!note) {
    throw new ServiceError("Note not found", 404);
  }

  return mapNoteDetail(note);
}

export async function createNoteService(input: CreateNoteInput) {
  const title = normalizeTitle(input.title);
  const rawContent = input.rawContent ?? "";

  const note = await prisma.documentSource.create({
    data: {
      originalName: title,
      title,
      fileType: "note",
      fileName: `${title}.md`,
      fileUrl: null,
      mimeType: "text/markdown",
      fileSize: byteLength(rawContent),
      sourceType: "markdown",
      rawContent,
      status: "pending",
      activeStatus: "active",
      chunkCount: 0,
    },
  });

  return mapNoteDetail(note);
}

export async function updateNoteService(id: string, input: UpdateNoteInput) {
  await getNoteDetailService(id);

  const data: {
    title?: string;
    originalName?: string;
    fileName?: string;
    rawContent?: string;
    fileSize?: number;
  } = {};

  if (input.title !== undefined) {
    const title = normalizeTitle(input.title);
    data.title = title;
    data.originalName = title;
    data.fileName = `${title}.md`;
  }

  if (input.rawContent !== undefined) {
    data.rawContent = input.rawContent;
    data.fileSize = byteLength(input.rawContent);
  }

  const note = await prisma.documentSource.update({
    where: { id },
    data,
  });

  return mapNoteDetail(note);
}

export async function deleteNoteService(id: string) {
  await getNoteDetailService(id);

  const note = await prisma.documentSource.delete({
    where: { id },
    select: { id: true },
  });

  return note;
}
```

- [ ] **Step 2: Verify service compiles**

Run:

```bash
npm run build
```

Expected: build passes or service-related errors are fixed before continuing.

---

## Task 4: Add Notes API Routes

**Files:**

- Create: `src/app/api/notes/route.ts`
- Create: `src/app/api/notes/[id]/route.ts`

- [ ] **Step 1: Create collection route**

Create `src/app/api/notes/route.ts`:

```ts
import {
  createNoteService,
  listNotesService,
} from "@/features/note/server/note-service";
import { createNoteSchema } from "@/features/note/server/schemas";
import { handleRouteError, successResponse } from "@/lib/api-response";

export async function GET() {
  try {
    const notes = await listNotesService();
    return successResponse(notes);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = createNoteSchema.parse(body);
    const note = await createNoteService(input);
    return successResponse(note, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 2: Create item route**

Create `src/app/api/notes/[id]/route.ts`:

```ts
import {
  deleteNoteService,
  getNoteDetailService,
  updateNoteService,
} from "@/features/note/server/note-service";
import {
  noteIdSchema,
  updateNoteSchema,
} from "@/features/note/server/schemas";
import { handleRouteError, successResponse } from "@/lib/api-response";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function parseId(context: RouteContext) {
  const params = await context.params;
  return noteIdSchema.parse(params).id;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const id = await parseId(context);
    const note = await getNoteDetailService(id);
    return successResponse(note);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const id = await parseId(context);
    const body = await request.json();
    const input = updateNoteSchema.parse(body);
    const note = await updateNoteService(id, input);
    return successResponse(note);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const id = await parseId(context);
    const result = await deleteNoteService(id);
    return successResponse(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 3: Verify API routes compile**

Run:

```bash
npm run build
```

Expected: build passes and route list includes `/api/notes` and `/api/notes/[id]`.

---

## Task 5: Add Frontend API Client

**Files:**

- Create: `src/features/note/api.ts`

- [ ] **Step 1: Create fetch wrapper**

Create `src/features/note/api.ts`:

```ts
import type {
  CreateNoteInput,
  NoteDetail,
  NoteSummary,
  UpdateNoteInput,
} from "./types";

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

async function parseResponse<T>(response: Response): Promise<T> {
  const json = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !json.success || json.data === undefined) {
    throw new Error(json.error?.message ?? json.message ?? "请求失败");
  }

  return json.data;
}

export async function listNotes() {
  const response = await fetch("/api/notes");
  return parseResponse<NoteSummary[]>(response);
}

export async function getNoteDetail(id: string) {
  const response = await fetch(`/api/notes/${id}`);
  return parseResponse<NoteDetail>(response);
}

export async function createNote(input: CreateNoteInput = {}) {
  const response = await fetch("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return parseResponse<NoteDetail>(response);
}

export async function updateNote(id: string, input: UpdateNoteInput) {
  const response = await fetch(`/api/notes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return parseResponse<NoteDetail>(response);
}

export async function deleteNote(id: string) {
  const response = await fetch(`/api/notes/${id}`, {
    method: "DELETE",
  });

  return parseResponse<{ id: string }>(response);
}
```

- [ ] **Step 2: Verify client compiles**

Run:

```bash
npm run build
```

Expected: build passes or frontend API type errors are fixed before continuing.

---

## Task 6: Add Presentational Components

**Files:**

- Create: `src/features/note/components/note-editor.tsx`
- Create: `src/features/note/components/note-empty-state.tsx`
- Create: `src/features/note/components/delete-note-dialog.tsx`
- Create: `src/features/note/components/note-directory.tsx`
- Create: `src/features/note/components/note-topbar.tsx`

- [ ] **Step 1: Create Markdown editor**

Create `src/features/note/components/note-editor.tsx`:

```tsx
"use client";

import MDEditor from "@uiw/react-md-editor";

type NoteEditorProps = {
  value: string;
  saving: boolean;
  onChange: (value: string) => void;
};

export function NoteEditor({ value, saving, onChange }: NoteEditorProps) {
  return (
    <div className="h-full min-h-[520px]" data-color-mode="light">
      <MDEditor
        height="100%"
        onChange={(nextValue) => onChange(nextValue ?? "")}
        preview="live"
        textareaProps={{
          disabled: saving,
          placeholder: "开始编写 Markdown 知识笔记...",
        }}
        value={value}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create empty state**

Create `src/features/note/components/note-empty-state.tsx`:

```tsx
"use client";

import { Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";

type NoteEmptyStateProps = {
  creating: boolean;
  onCreate: () => void;
};

export function NoteEmptyState({ creating, onCreate }: NoteEmptyStateProps) {
  return (
    <div className="flex min-h-[520px] flex-col items-center justify-center rounded-md border border-dashed bg-muted/30 px-6 text-center">
      <p className="text-base font-medium">当前还没有文档哦，来创建一个吧</p>
      <Inbox aria-hidden="true" className="mt-4 size-10 text-muted-foreground" />
      <Button className="mt-5" disabled={creating} onClick={onCreate}>
        创建新文档
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Create delete dialog**

Create `src/features/note/components/delete-note-dialog.tsx`:

```tsx
"use client";

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

type DeleteNoteDialogProps = {
  open: boolean;
  deleting: boolean;
  title: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function DeleteNoteDialog({
  open,
  deleting,
  title,
  onOpenChange,
  onConfirm,
}: DeleteNoteDialogProps) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除文档？</AlertDialogTitle>
          <AlertDialogDescription>
            删除后无法恢复。当前文档：{title || "未命名文档"}。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={deleting} onClick={onConfirm}>
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 4: Create directory component**

Create `src/features/note/components/note-directory.tsx`:

```tsx
"use client";

import { IndentDecrease, IndentIncrease } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { NoteSummary } from "../types";

type NoteDirectoryProps = {
  notes: NoteSummary[];
  activeNoteId: string | null;
  open: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
};

export function NoteDirectory({
  notes,
  activeNoteId,
  open,
  disabled,
  onOpenChange,
  onSelect,
}: NoteDirectoryProps) {
  if (!open) {
    return (
      <Button
        aria-label="展开文档目录"
        className="fixed right-0 top-24 z-20 rounded-r-none"
        onClick={() => onOpenChange(true)}
        size="icon"
        variant="outline"
      >
        <IndentDecrease aria-hidden="true" className="size-4" />
      </Button>
    );
  }

  return (
    <aside className="w-72 shrink-0 border-l bg-background">
      <div className="flex h-12 items-center justify-between border-b px-3">
        <h2 className="text-sm font-semibold">文档目录</h2>
        <Button
          aria-label="收起文档目录"
          onClick={() => onOpenChange(false)}
          size="icon"
          variant="ghost"
        >
          <IndentIncrease aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <ScrollArea className="h-[calc(100vh-9rem)]">
        <div className="space-y-1 p-2">
          {notes.map((note) => {
            const active = note.id === activeNoteId;

            return (
              <button
                className={cn(
                  "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                )}
                disabled={disabled}
                key={note.id}
                onClick={() => onSelect(note.id)}
                type="button"
              >
                <span className="block truncate font-medium">{note.title}</span>
                <span className="mt-1 block truncate text-xs opacity-75">
                  {new Date(note.updatedAt).toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </aside>
  );
}
```

- [ ] **Step 5: Create topbar component**

Create `src/features/note/components/note-topbar.tsx`:

```tsx
"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import type { KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type NoteTopbarProps = {
  title: string;
  updatedAt?: string;
  titleEditing: boolean;
  disabled: boolean;
  deletingDisabled: boolean;
  onTitleClick: () => void;
  onTitleChange: (title: string) => void;
  onTitleSave: () => void;
  onSave: () => void;
  onCreate: () => void;
  onDelete: () => void;
};

export function NoteTopbar({
  title,
  updatedAt,
  titleEditing,
  disabled,
  deletingDisabled,
  onTitleClick,
  onTitleChange,
  onTitleSave,
  onSave,
  onCreate,
  onDelete,
}: NoteTopbarProps) {
  function handleTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      onTitleSave();
    }
  }

  return (
    <div className="flex min-h-16 items-center justify-between gap-4 border-b bg-background px-4 py-3">
      <div className="min-w-0 flex-1">
        {titleEditing ? (
          <Input
            autoFocus
            className="h-8 max-w-md"
            onBlur={onTitleSave}
            onChange={(event) => onTitleChange(event.target.value)}
            onKeyDown={handleTitleKeyDown}
            value={title}
          />
        ) : (
          <button
            className="block max-w-md truncate text-left text-lg font-semibold"
            disabled={disabled}
            onClick={onTitleClick}
            type="button"
          >
            {title || "未命名文档"}
          </button>
        )}
        {updatedAt ? (
          <p className="mt-1 text-xs text-muted-foreground">
            最后更新：{new Date(updatedAt).toLocaleString()}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Button disabled={disabled} onClick={onSave} variant="outline">
          <Save aria-hidden="true" className="mr-2 size-4" />
          保存
        </Button>
        <Button disabled={disabled} onClick={onCreate} variant="outline">
          <Plus aria-hidden="true" className="mr-2 size-4" />
          新建
        </Button>
        <Button
          disabled={deletingDisabled}
          onClick={onDelete}
          variant="destructive"
        >
          <Trash2 aria-hidden="true" className="mr-2 size-4" />
          删除
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify components compile**

Run:

```bash
npm run build
```

Expected: build passes or component import/type errors are fixed before continuing.

---

## Task 7: Add NoteFeature with Local State

**Files:**

- Create: `src/features/note/index.tsx`

- [ ] **Step 1: Create main feature component**

Create `src/features/note/index.tsx`:

```tsx
"use client";

import * as React from "react";

import {
  createNote,
  deleteNote,
  getNoteDetail,
  listNotes,
  updateNote,
} from "./api";
import { DeleteNoteDialog } from "./components/delete-note-dialog";
import { NoteDirectory } from "./components/note-directory";
import { NoteEditor } from "./components/note-editor";
import { NoteEmptyState } from "./components/note-empty-state";
import { NoteTopbar } from "./components/note-topbar";
import type { NoteDetail, NoteSummary } from "./types";

function sortNotes(notes: NoteSummary[]) {
  return [...notes].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function NoteFeature() {
  const [notes, setNotes] = React.useState<NoteSummary[]>([]);
  const [activeNoteId, setActiveNoteId] = React.useState<string | null>(null);
  const [activeNote, setActiveNote] = React.useState<NoteDetail | null>(null);
  const [draftTitle, setDraftTitle] = React.useState("");
  const [draftRawContent, setDraftRawContent] = React.useState("");
  const [titleEditing, setTitleEditing] = React.useState(false);
  const [directoryOpen, setDirectoryOpen] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const busy = loading || detailLoading || saving || deleting;

  const applyActiveNote = React.useCallback((note: NoteDetail | null) => {
    setActiveNote(note);
    setActiveNoteId(note?.id ?? null);
    setDraftTitle(note?.title ?? "");
    setDraftRawContent(note?.rawContent ?? "");
  }, []);

  const refreshNotes = React.useCallback(async () => {
    const nextNotes = sortNotes(await listNotes());
    setNotes(nextNotes);
    return nextNotes;
  }, []);

  const loadNoteDetail = React.useCallback(
    async (id: string) => {
      setDetailLoading(true);
      try {
        const note = await getNoteDetail(id);
        applyActiveNote(note);
      } finally {
        setDetailLoading(false);
      }
    },
    [applyActiveNote]
  );

  React.useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);

      try {
        const initialNotes = sortNotes(await listNotes());
        if (cancelled) return;

        setNotes(initialNotes);

        if (initialNotes.length === 0) {
          applyActiveNote(null);
          return;
        }

        await loadNoteDetail(initialNotes[0].id);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "加载笔记失败");
          setNotes([]);
          applyActiveNote(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [applyActiveNote, loadNoteDetail]);

  async function saveCurrentNote() {
    if (saving) return false;
    if (!activeNote) return true;

    const normalizedTitle = draftTitle.trim() || "未命名文档";
    const hasUnsavedChanges =
      normalizedTitle !== activeNote.title ||
      draftRawContent !== (activeNote.rawContent ?? "");

    if (!hasUnsavedChanges) return true;

    setSaving(true);
    setError(null);

    try {
      const updatedNote = await updateNote(activeNote.id, {
        title: normalizedTitle,
        rawContent: draftRawContent,
      });

      applyActiveNote(updatedNote);
      await refreshNotes();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSelectNote(id: string) {
    if (busy || id === activeNoteId) return;

    const saved = await saveCurrentNote();
    if (!saved) return;

    try {
      await loadNoteDetail(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载文档失败");
      await refreshNotes();
    }
  }

  async function handleCreateNote() {
    if (busy) return;

    const saved = await saveCurrentNote();
    if (!saved) return;

    setSaving(true);
    setError(null);

    try {
      const createdNote = await createNote({
        title: "未命名文档",
        rawContent: "",
      });
      await refreshNotes();
      applyActiveNote(createdNote);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteNote() {
    if (!activeNoteId || deleting) return;

    setDeleting(true);
    setError(null);

    try {
      await deleteNote(activeNoteId);
      setDeleteDialogOpen(false);
      const nextNotes = await refreshNotes();

      if (nextNotes.length === 0) {
        applyActiveNote(null);
        return;
      }

      await loadNoteDetail(nextNotes[0].id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  }

  async function handleTitleSave() {
    if (!activeNote || saving) return;

    const saved = await saveCurrentNote();
    if (saved) {
      setTitleEditing(false);
    }
  }

  const showEmpty = !loading && notes.length === 0;

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] bg-background">
      <main className="min-w-0 flex-1">
        <NoteTopbar
          deletingDisabled={!activeNote || busy}
          disabled={!activeNote || busy}
          onCreate={handleCreateNote}
          onDelete={() => setDeleteDialogOpen(true)}
          onSave={() => void saveCurrentNote()}
          onTitleChange={setDraftTitle}
          onTitleClick={() => setTitleEditing(true)}
          onTitleSave={() => void handleTitleSave()}
          title={draftTitle}
          titleEditing={titleEditing}
          updatedAt={activeNote?.updatedAt}
        />
        {error ? (
          <div className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <div className="p-4">
          {loading ? (
            <div className="min-h-[520px] rounded-md border bg-muted/30 p-6 text-sm text-muted-foreground">
              加载中...
            </div>
          ) : showEmpty ? (
            <NoteEmptyState creating={saving} onCreate={handleCreateNote} />
          ) : (
            <NoteEditor
              onChange={setDraftRawContent}
              saving={saving}
              value={draftRawContent}
            />
          )}
        </div>
      </main>
      <NoteDirectory
        activeNoteId={activeNoteId}
        disabled={busy}
        notes={notes}
        onOpenChange={setDirectoryOpen}
        onSelect={(id) => void handleSelectNote(id)}
        open={directoryOpen}
      />
      <DeleteNoteDialog
        deleting={deleting}
        onConfirm={() => void handleDeleteNote()}
        onOpenChange={setDeleteDialogOpen}
        open={deleteDialogOpen}
        title={activeNote?.title ?? ""}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify feature compiles**

Run:

```bash
npm run build
```

Expected: build passes or `src/features/note/index.tsx` errors are fixed before continuing.

---

## Task 8: Wire `/note` Page

**Files:**

- Modify: `src/app/note/page.tsx`

- [ ] **Step 1: Replace placeholder page**

Replace `src/app/note/page.tsx` with:

```tsx
import { AdminShell } from "@/components/layout/admin-shell";
import { NoteFeature } from "@/features/note";

export default function NotePage() {
  return (
    <AdminShell>
      <NoteFeature />
    </AdminShell>
  );
}
```

- [ ] **Step 2: Verify route builds**

Run:

```bash
npm run build
```

Expected: build passes and route list includes `/note`, `/api/notes`, and `/api/notes/[id]`.

---

## Task 9: Manual Verification

**Files:**

- No source edits expected.

- [ ] **Step 1: Start dev server**

Run:

```bash
npm run dev
```

Expected: Next.js dev server starts and prints a local URL.

- [ ] **Step 2: Verify empty state**

In browser:

```txt
Open /note
If there are no note records, confirm:
- page stays inside AdminShell
- text shows 当前还没有文档哦，来创建一个吧
- Inbox icon is visible
- 创建新文档 button is visible
```

- [ ] **Step 3: Verify create and save**

In browser:

```txt
Click 创建新文档
Type Markdown content
Click 保存
Refresh page
Confirm the same note is selected and content loads again
```

- [ ] **Step 4: Verify title editing**

In browser:

```txt
Click title
Change title
Press Enter
Confirm title exits edit mode
Click title again
Change title
Click outside input
Confirm title saves on blur
```

- [ ] **Step 5: Verify switching saves first**

In browser:

```txt
Create a second note
Edit the first note without pressing 保存
Click second note in right directory
Confirm first note saves before switching
Click first note again
Confirm unsaved edit was preserved
```

- [ ] **Step 6: Verify delete**

In browser:

```txt
Click 删除
Confirm dialog appears
Confirm deletion
Confirm the next newest note is selected, or empty state appears if no notes remain
```

- [ ] **Step 7: Verify directory collapse**

In browser:

```txt
Click right directory collapse button
Confirm panel hides and right-edge button appears
Click right-edge button
Confirm directory opens again
```

---

## Task 10: Final Validation

**Files:**

- No source edits expected unless validation finds task-related failures.

- [ ] **Step 1: Run build**

Run:

```bash
npm run build
```

Expected: exit code 0.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: exit code 0, or only documented pre-existing lint failures unrelated to `src/features/note`, `src/app/note`, and `src/app/api/notes`.

- [ ] **Step 3: Check final git status**

Run:

```bash
git status --short
```

Expected: changed files are limited to this feature, generated Prisma files from `npm run db:generate`, and local DB files only if intentionally synced.
