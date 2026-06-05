# RAG Detail Document Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the RAG detail page document assignment workflow, including selected/available document lists, read-only chunk display, save-by-diff behavior, and the note "knowledge source" status switch.

**Architecture:** Reuse existing RAG management APIs instead of adding a compose route. The detail page loads the RAG tree plus active parsed documents, splits them locally into selected and available lists, computes `toAdd`/`toRemove` on save, and persists through the existing bind/unbind routes. Note source eligibility is controlled from the note page by toggling `DocumentSource.status` between `pending` and `parsed`.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma, SQLite, Zod, shadcn/ui-style components, Tailwind CSS, lucide-react.

---

## File Map

- Modify: `src/features/knowledge-bases/server/mappers.ts`
  - Return `originalName`, `fileType`, `chunkCount`, and full document metadata needed by the detail page.
- Modify: `src/features/knowledge-bases/server/knowledge-base-service.ts`
  - Add server-side validation that bound documents are `status = "parsed"` and `activeStatus = "active"`.
- Modify: `src/features/knowledge-bases/types.ts`
  - Extend `RagDoc` and `RagChunk` to match mapper output.
- Modify: `src/features/knowledge-bases/utils.ts`
  - Normalize richer document and chunk fields for detail-page UI.
- Modify: `src/features/knowledge-bases/api.ts`
  - Add wrappers for source document loading and bind/unbind calls.
- Create: `src/features/knowledge-bases/components/knowledge-base-detail-feature.tsx`
  - Detail page orchestration, data loading, save diff, and error handling.
- Create: `src/features/knowledge-bases/components/document-assignment-panel.tsx`
  - Assignment section container and save button.
- Create: `src/features/knowledge-bases/components/assignment-document-list.tsx`
  - Selected/available list rendering and empty states.
- Create: `src/features/knowledge-bases/components/assignment-document-item.tsx`
  - Document row/card, action button, and selected-document chunk toggle.
- Create: `src/features/knowledge-bases/components/document-chunk-list.tsx`
  - Read-only chunk display.
- Modify: `src/app/knowledge-bases/[id]/page.tsx`
  - Keep `AdminShell`; delegate detail UI to feature component.
- Modify: `src/features/note/server/schemas.ts`
  - Allow note status updates to `pending` or `parsed`.
- Modify: `src/features/note/server/note-service.ts`
  - Persist note source status without generating chunks or binding RAG.
- Modify: `src/features/note/types.ts`
  - Ensure note detail exposes `status`.
- Modify: `src/features/note/api.ts`
  - Support sending `status` in note updates.
- Modify: `src/features/note/components/note-topbar.tsx`
  - Add the "是否成为知识源" switch UI.
- Modify: `src/features/note/index.tsx`
  - Wire the note source switch state and mutation.

---

### Task 1: Backend Document Metadata And Eligibility

**Files:**
- Modify: `src/features/knowledge-bases/server/mappers.ts`
- Modify: `src/features/knowledge-bases/server/knowledge-base-service.ts`
- Modify: `src/features/knowledge-bases/server/schemas.ts`

- [ ] **Step 1: Inspect current mapper output**

Run:

```bash
Get-Content src/features/knowledge-bases/server/mappers.ts
```

Expected: `mapDocumentSourceListItem` and `mapDocumentSourceDetail` exist, but they do not fully expose `originalName`, `fileType`, and stable `chunkCount` for detail assignment UI.

- [ ] **Step 2: Extend document mappers**

In `src/features/knowledge-bases/server/mappers.ts`, update `mapDocumentSourceListItem` to include these fields:

```ts
export function mapDocumentSourceListItem(document: DocumentSourceRecord) {
  const chunkCount = document.chunks?.length ?? document.chunkCount ?? 0;

  return {
    id: document.id,
    title: document.title,
    name: document.title,
    originalName: document.originalName,
    sourceType: document.sourceType,
    fileType: document.fileType,
    fileName: document.fileName,
    fileUrl: document.fileUrl,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    size: document.fileSize ?? 0,
    rawContent: document.rawContent,
    chunkSize: document.chunkSize,
    chunkOverlap: document.chunkOverlap,
    status: document.status,
    activeStatus: document.activeStatus,
    error: document.error,
    chunkCount,
    knowledgeBaseCount: document.knowledgeBases?.length ?? 0,
    uploadedAt: document.createdAt.toISOString(),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}
```

Update `mapDocumentSourceDetail` similarly:

```ts
export function mapDocumentSourceDetail(document: DocumentSourceRecord) {
  const chunks = (document.chunks ?? []).map(mapDocumentChunk);

  return {
    id: document.id,
    title: document.title,
    name: document.title,
    originalName: document.originalName,
    sourceType: document.sourceType,
    fileType: document.fileType,
    fileName: document.fileName,
    fileUrl: document.fileUrl,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    size: document.fileSize ?? 0,
    rawContent: document.rawContent,
    chunkSize: document.chunkSize,
    chunkOverlap: document.chunkOverlap,
    status: document.status,
    activeStatus: document.activeStatus,
    error: document.error,
    chunkCount: chunks.length || document.chunkCount || 0,
    uploadedAt: document.createdAt.toISOString(),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    chunks,
    knowledgeBases: (document.knowledgeBases ?? []).map((relation) => ({
      relationId: relation.id,
      id: relation.knowledgeBase.id,
      name: relation.knowledgeBase.name,
      status: relation.knowledgeBase.status,
    })),
  };
}
```

- [ ] **Step 3: Add knowledge-source eligibility helper**

In `src/features/knowledge-bases/server/knowledge-base-service.ts`, add this helper below `assertDocumentIdsExist`:

```ts
async function assertDocumentsCanBeKnowledgeSource(
  tx: Prisma.TransactionClient,
  documentIds: string[]
) {
  const uniqueDocumentIds = [...new Set(documentIds)];

  if (uniqueDocumentIds.length === 0) return uniqueDocumentIds;

  const documents = await tx.documentSource.findMany({
    where: { id: { in: uniqueDocumentIds } },
    select: {
      id: true,
      status: true,
      activeStatus: true,
    },
  });

  if (documents.length !== uniqueDocumentIds.length) {
    const existingIds = new Set(documents.map((document) => document.id));
    const missingIds = uniqueDocumentIds.filter((id) => !existingIds.has(id));

    throw badRequest("some documents do not exist", {
      documentIds: missingIds,
    });
  }

  const unavailableIds = documents
    .filter(
      (document) =>
        document.status !== "parsed" || document.activeStatus !== "active"
    )
    .map((document) => document.id);

  if (unavailableIds.length > 0) {
    throw badRequest("some documents are not available knowledge sources", {
      documentIds: unavailableIds,
    });
  }

  return uniqueDocumentIds;
}
```

- [ ] **Step 4: Use eligibility helper in bind service**

In `bindDocumentsToKnowledgeBaseService`, replace:

```ts
const uniqueDocumentIds = await assertDocumentIdsExist(tx, documentIds);
```

with:

```ts
const uniqueDocumentIds = await assertDocumentsCanBeKnowledgeSource(
  tx,
  documentIds
);
```

Keep `unbindDocumentsFromKnowledgeBaseService` unchanged, because unbinding must not validate current document source status.

- [ ] **Step 5: Run backend-focused validation**

Run:

```bash
npx eslint src/features/knowledge-bases/server src/app/api/rag-management
```

Expected: no new lint errors from edited files. If unrelated existing warnings appear, record them without broad refactors.

---

### Task 2: Knowledge Base Types, Normalizers, And API Wrappers

**Files:**
- Modify: `src/features/knowledge-bases/types.ts`
- Modify: `src/features/knowledge-bases/utils.ts`
- Modify: `src/features/knowledge-bases/api.ts`

- [ ] **Step 1: Extend `RagDoc` and `RagChunk`**

In `src/features/knowledge-bases/types.ts`, update `RagDoc`:

```ts
export type RagDoc = {
  id: string;
  name: string;
  title?: string;
  originalName?: string;
  fileName?: string | null;
  sourceType?: string;
  fileType?: string;
  rawContent?: string | null;
  status?: string;
  activeStatus?: string;
  chunkCount?: number;
  size: number;
  fileSize?: number;
  uploadedAt: string;
  createdAt?: string;
  updatedAt?: string;
  chunks?: RagChunk[];
};
```

Update `RagChunk`:

```ts
export type RagChunk = {
  id: string;
  documentId: string;
  content: string;
  tokenCount?: number;
  charCount?: number;
  createdAt?: string;
  updatedAt?: string;
  chunkIndex?: number;
  status?: string;
  startIndex?: number;
  endIndex?: number;
  chunkType?: string;
  title?: string | null;
  suggestedCategory?: string | null;
  suggestedTags?: string | null;
  knowledgeType?: string | null;
  reviewStatus?: string | null;
};
```

- [ ] **Step 2: Ensure document normalizer preserves new fields**

In `src/features/knowledge-bases/utils.ts`, update `normalizeRagDoc` to preserve the richer fields. Use this shape:

```ts
export function normalizeRagDoc(input: unknown): RagDoc {
  const item = isRecord(input) ? input : {};
  const fileSize = toNumberValue(item.fileSize, toNumberValue(item.size, 0));

  return {
    id: toStringValue(item.id, createClientId()),
    name: toStringValue(item.name, toStringValue(item.title, "未命名文档")),
    title: toStringValue(item.title, toStringValue(item.name, "未命名文档")),
    originalName: toStringValue(item.originalName, ""),
    fileName:
      typeof item.fileName === "string" || item.fileName === null
        ? item.fileName
        : null,
    sourceType: toStringValue(item.sourceType, "manual"),
    fileType: toStringValue(item.fileType, "file"),
    rawContent:
      typeof item.rawContent === "string" || item.rawContent === null
        ? item.rawContent
        : undefined,
    status: toStringValue(item.status, "pending"),
    activeStatus: toStringValue(item.activeStatus, "active"),
    chunkCount: toNumberValue(item.chunkCount, 0),
    size: fileSize,
    fileSize,
    uploadedAt: toStringValue(
      item.uploadedAt,
      toStringValue(item.createdAt, "--")
    ),
    createdAt: toStringValue(item.createdAt, "--"),
    updatedAt: toStringValue(item.updatedAt, "--"),
    chunks: Array.isArray(item.chunks)
      ? item.chunks.map(normalizeRagChunk)
      : undefined,
  };
}
```

If `normalizeRagChunk` does not preserve `chunkIndex`, `status`, `startIndex`, `endIndex`, and `updatedAt`, update it to preserve them.

- [ ] **Step 3: Add API wrappers**

In `src/features/knowledge-bases/api.ts`, append:

```ts
export async function fetchKnowledgeSourceDocuments() {
  const response = await fetch(
    "/api/rag-management/documents?status=parsed&activeStatus=active",
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch source documents: ${response.status}`);
  }

  return readApiData<unknown>(response);
}

export async function bindKnowledgeBaseDocuments(
  knowledgeBaseId: string,
  documentIds: string[]
) {
  const response = await fetch(
    `/api/rag-management/knowledge-bases/${knowledgeBaseId}/documents`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ documentIds }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to bind documents: ${response.status}`);
  }

  return readApiData<unknown>(response);
}

export async function unbindKnowledgeBaseDocuments(
  knowledgeBaseId: string,
  documentIds: string[]
) {
  const response = await fetch(
    `/api/rag-management/knowledge-bases/${knowledgeBaseId}/documents`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ documentIds }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to unbind documents: ${response.status}`);
  }

  return readApiData<unknown>(response);
}
```

- [ ] **Step 4: Run targeted validation**

Run:

```bash
npx eslint src/features/knowledge-bases/types.ts src/features/knowledge-bases/utils.ts src/features/knowledge-bases/api.ts
```

Expected: no errors in touched files.

---

### Task 3: Note Knowledge Source Toggle Backend

**Files:**
- Modify: `src/features/note/server/schemas.ts`
- Modify: `src/features/note/server/note-service.ts`
- Modify: `src/features/note/types.ts`
- Modify: `src/features/note/api.ts`

- [ ] **Step 1: Extend note update schema**

In `src/features/note/server/schemas.ts`, update the note update schema to accept `status`:

```ts
export const updateNoteSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    rawContent: z.string().optional(),
    status: z.enum(["pending", "parsed"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });
```

Keep existing route param schema and create schema behavior unchanged.

- [ ] **Step 2: Persist status in note service**

In `src/features/note/server/note-service.ts`, update the input type and update data construction so `status` can be changed:

```ts
type UpdateNoteInput = {
  title?: string;
  rawContent?: string;
  status?: "pending" | "parsed";
};
```

When building Prisma update data, include:

```ts
...(input.status ? { status: input.status } : {}),
```

Do not add chunk generation, RAG binding, or embedding logic.

- [ ] **Step 3: Ensure note types expose status**

In `src/features/note/types.ts`, ensure both summary and detail include:

```ts
status: string;
activeStatus: string;
```

Expected: the UI can derive source-switch state from `activeNote.status === "parsed"`.

- [ ] **Step 4: Extend note API update payload**

In `src/features/note/api.ts`, update the note update input type:

```ts
type UpdateNoteInput = {
  title?: string;
  rawContent?: string;
  status?: "pending" | "parsed";
};
```

Ensure `updateNote(id, input)` sends `status` through unchanged.

- [ ] **Step 5: Run note backend validation**

Run:

```bash
npx eslint src/features/note/server src/features/note/api.ts src/features/note/types.ts src/app/api/notes
```

Expected: no errors in touched note backend/API files.

---

### Task 4: Note Knowledge Source Toggle UI

**Files:**
- Modify: `src/features/note/components/note-topbar.tsx`
- Modify: `src/features/note/index.tsx`

- [ ] **Step 1: Extend `NoteTopbar` props**

In `src/features/note/components/note-topbar.tsx`, add props:

```ts
type NoteTopbarProps = {
  // existing props...
  sourceEnabled: boolean;
  sourceToggleDisabled: boolean;
  sourceToggleLoading: boolean;
  onSourceEnabledChange: (enabled: boolean) => void;
};
```

- [ ] **Step 2: Render source switch**

In `NoteTopbar`, render the switch in the right action area before Save/New/Delete:

```tsx
<button
  type="button"
  title="是否成为知识源"
  aria-label="是否成为知识源"
  aria-pressed={sourceEnabled}
  disabled={sourceToggleDisabled || sourceToggleLoading}
  onClick={() => onSourceEnabledChange(!sourceEnabled)}
  className={cn(
    "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60",
    sourceEnabled
      ? "border-emerald-500 bg-emerald-500"
      : "border-red-500 bg-red-500"
  )}
>
  <span
    className={cn(
      "inline-block size-6 rounded-full bg-white shadow transition-transform",
      sourceEnabled ? "translate-x-6" : "translate-x-1"
    )}
  />
</button>
```

If `cn` is not imported in the file, add:

```ts
import { cn } from "@/lib/utils";
```

- [ ] **Step 3: Add toggle state in `NoteFeature`**

In `src/features/note/index.tsx`, add local state:

```ts
const [sourceToggleSaving, setSourceToggleSaving] = React.useState(false);
```

Compute:

```ts
const sourceEnabled = activeNote?.status === "parsed";
```

- [ ] **Step 4: Implement source toggle handler**

In `NoteFeature`, add:

```ts
async function handleSourceEnabledChange(enabled: boolean) {
  if (!activeNote || sourceToggleSaving || saving) return;

  setSourceToggleSaving(true);
  setError(null);

  try {
    const updatedNote = await updateNote(activeNote.id, {
      status: enabled ? "parsed" : "pending",
    });

    applyActiveNote(updatedNote);
    await refreshNotes();
  } catch (caught) {
    setError(caught instanceof Error ? caught.message : "知识源状态更新失败");
  } finally {
    setSourceToggleSaving(false);
  }
}
```

This handler must not generate chunks or bind RAG.

- [ ] **Step 5: Pass props to `NoteTopbar`**

In the `NoteTopbar` usage, pass:

```tsx
sourceEnabled={sourceEnabled}
sourceToggleDisabled={!activeNote || busy}
sourceToggleLoading={sourceToggleSaving}
onSourceEnabledChange={(enabled) => void handleSourceEnabledChange(enabled)}
```

Update `busy` if needed:

```ts
const busy = loading || detailLoading || saving || deleting || sourceToggleSaving;
```

- [ ] **Step 6: Run note UI validation**

Run:

```bash
npx eslint src/features/note src/app/note src/app/api/notes
```

Expected: no errors in note-related files.

---

### Task 5: Detail Page Feature Component And Data Loading

**Files:**
- Create: `src/features/knowledge-bases/components/knowledge-base-detail-feature.tsx`
- Modify: `src/app/knowledge-bases/[id]/page.tsx`

- [ ] **Step 1: Create detail feature component skeleton**

Create `src/features/knowledge-bases/components/knowledge-base-detail-feature.tsx`:

```tsx
"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  bindKnowledgeBaseDocuments,
  fetchKnowledgeSourceDocuments,
  fetchRagDetail,
  unbindKnowledgeBaseDocuments,
} from "@/features/knowledge-bases/api";
import type { RagDoc } from "@/features/knowledge-bases/types";
import { normalizeRagDoc } from "@/features/knowledge-bases/utils";

type DetailRecord = {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  similarityThreshold: number;
  topK: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  documents?: unknown[];
};

export function KnowledgeBaseDetailFeature() {
  const router = useRouter();
  const params = useParams();
  const knowledgeBaseId = String(params.id ?? "");

  const [detail, setDetail] = React.useState<DetailRecord | null>(null);
  const [selectedDocuments, setSelectedDocuments] = React.useState<RagDoc[]>([]);
  const [availableDocuments, setAvailableDocuments] = React.useState<RagDoc[]>([]);
  const [initialSelectedDocumentIds, setInitialSelectedDocumentIds] =
    React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selectedIds = React.useMemo(
    () => selectedDocuments.map((document) => document.id),
    [selectedDocuments]
  );
  const dirty = React.useMemo(
    () => selectedIds.join("|") !== initialSelectedDocumentIds.join("|"),
    [initialSelectedDocumentIds, selectedIds]
  );

  const loadData = React.useCallback(async () => {
    if (!knowledgeBaseId) return;

    setLoading(true);
    setError(null);

    try {
      const [detailInput, sourceInput] = await Promise.all([
        fetchRagDetail(knowledgeBaseId),
        fetchKnowledgeSourceDocuments(),
      ]);
      const detailRecord = detailInput as DetailRecord;
      const selected = Array.isArray(detailRecord.documents)
        ? detailRecord.documents.map(normalizeRagDoc)
        : [];
      const selectedIdSet = new Set(selected.map((document) => document.id));
      const sourceDocuments = Array.isArray(sourceInput)
        ? sourceInput.map(normalizeRagDoc)
        : [];
      const available = sourceDocuments.filter(
        (document) =>
          document.status === "parsed" &&
          document.activeStatus === "active" &&
          !selectedIdSet.has(document.id)
      );

      setDetail(detailRecord);
      setSelectedDocuments(selected);
      setAvailableDocuments(available);
      setInitialSelectedDocumentIds(selected.map((document) => document.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "知识库详情加载失败");
    } finally {
      setLoading(false);
    }
  }, [knowledgeBaseId]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <Button
        type="button"
        variant="ghost"
        className="px-0 text-muted-foreground"
        onClick={() => router.push("/knowledge-bases")}
      >
        <ArrowLeft data-icon="inline-start" />
        返回知识库列表
      </Button>

      {error ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
          <AlertCircle className="size-4" />
          {error}
        </div>
      ) : null}

      <div>{loading ? "加载中..." : detail?.name ?? "知识库详情"}</div>
    </section>
  );
}
```

This skeleton will be completed in later tasks.

- [ ] **Step 2: Replace page body with feature component**

Modify `src/app/knowledge-bases/[id]/page.tsx` to:

```tsx
import { AdminShell } from "@/components/layout/admin-shell";
import { KnowledgeBaseDetailFeature } from "@/features/knowledge-bases/components/knowledge-base-detail-feature";

export default function KnowledgeBaseDetailPage() {
  return (
    <AdminShell>
      <KnowledgeBaseDetailFeature />
    </AdminShell>
  );
}
```

The old inline detail implementation should be removed from this file after the feature component takes over.

- [ ] **Step 3: Run route build check**

Run:

```bash
npm run build
```

Expected: build succeeds or fails only on unrelated existing issues. If it fails due to missing imports or types from this task, fix those before continuing.

---

### Task 6: Detail Base Info And Assignment Panel Components

**Files:**
- Modify: `src/features/knowledge-bases/components/knowledge-base-detail-feature.tsx`
- Create: `src/features/knowledge-bases/components/document-assignment-panel.tsx`
- Create: `src/features/knowledge-bases/components/assignment-document-list.tsx`

- [ ] **Step 1: Create assignment panel**

Create `src/features/knowledge-bases/components/document-assignment-panel.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { RagDoc } from "@/features/knowledge-bases/types";
import { AssignmentDocumentList } from "./assignment-document-list";

type DocumentAssignmentPanelProps = {
  selectedDocuments: RagDoc[];
  availableDocuments: RagDoc[];
  dirty: boolean;
  saving: boolean;
  onEnable: (documentId: string) => void;
  onRemove: (documentId: string) => void;
  onSave: () => void;
};

export function DocumentAssignmentPanel({
  selectedDocuments,
  availableDocuments,
  dirty,
  saving,
  onEnable,
  onRemove,
  onSave,
}: DocumentAssignmentPanelProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>文档归属管理</CardTitle>
          <CardDescription>
            调整当前 RAG 引用哪些知识源，保存后才会写入后端。
          </CardDescription>
        </div>
        <Button type="button" disabled={!dirty || saving} onClick={onSave}>
          {saving ? "保存中..." : "保存文档配置"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <AssignmentDocumentList
          description="当前 RAG 会基于以下文档进行知识增强。"
          documents={selectedDocuments}
          emptyText="当前 RAG 暂未引用文档，可从待选文档中启用。"
          kind="selected"
          onMove={onRemove}
          title={`已引用文档（${selectedDocuments.length}）`}
        />
        <AssignmentDocumentList
          description="以下文档尚未被当前 RAG 引用，可以添加为知识来源。"
          documents={availableDocuments}
          emptyText="暂无可选文档。"
          kind="available"
          onMove={onEnable}
          title={`待选文档（${availableDocuments.length}）`}
        />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create document list component**

Create `src/features/knowledge-bases/components/assignment-document-list.tsx`:

```tsx
"use client";

import type { RagDoc } from "@/features/knowledge-bases/types";
import { AssignmentDocumentItem } from "./assignment-document-item";

type AssignmentDocumentListProps = {
  title: string;
  description: string;
  emptyText: string;
  documents: RagDoc[];
  kind: "selected" | "available";
  onMove: (documentId: string) => void;
};

export function AssignmentDocumentList({
  title,
  description,
  emptyText,
  documents,
  kind,
  onMove,
}: AssignmentDocumentListProps) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {documents.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((document) => (
            <AssignmentDocumentItem
              key={document.id}
              document={document}
              kind={kind}
              onMove={onMove}
            />
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Wire assignment panel into feature skeleton**

In `KnowledgeBaseDetailFeature`, import:

```ts
import { DocumentAssignmentPanel } from "./document-assignment-panel";
```

Add handlers:

```ts
function difference(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((id) => !rightSet.has(id));
}

function handleEnableDocument(documentId: string) {
  const document = availableDocuments.find((item) => item.id === documentId);
  if (!document || saving) return;

  setAvailableDocuments((current) =>
    current.filter((item) => item.id !== documentId)
  );
  setSelectedDocuments((current) => [...current, document]);
}

function handleRemoveDocument(documentId: string) {
  const document = selectedDocuments.find((item) => item.id === documentId);
  if (!document || saving) return;

  setSelectedDocuments((current) =>
    current.filter((item) => item.id !== documentId)
  );
  setAvailableDocuments((current) => [document, ...current]);
}

async function handleSaveAssignments() {
  if (!dirty || saving || !knowledgeBaseId) return;

  const currentIds = selectedDocuments.map((document) => document.id);
  const toAdd = difference(currentIds, initialSelectedDocumentIds);
  const toRemove = difference(initialSelectedDocumentIds, currentIds);

  if (toAdd.length === 0 && toRemove.length === 0) return;

  setSaving(true);
  setError(null);

  try {
    if (toAdd.length > 0) {
      await bindKnowledgeBaseDocuments(knowledgeBaseId, toAdd);
    }

    if (toRemove.length > 0) {
      await unbindKnowledgeBaseDocuments(knowledgeBaseId, toRemove);
    }

    await loadData();
  } catch (caught) {
    setError(caught instanceof Error ? caught.message : "文档配置保存失败");
  } finally {
    setSaving(false);
  }
}
```

Render:

```tsx
<DocumentAssignmentPanel
  availableDocuments={availableDocuments}
  dirty={dirty}
  onEnable={handleEnableDocument}
  onRemove={handleRemoveDocument}
  onSave={() => void handleSaveAssignments()}
  saving={saving}
  selectedDocuments={selectedDocuments}
/>
```

Expected behavior: failed save keeps current local selected/available state and leaves `dirty = true`.

- [ ] **Step 4: Run component lint**

Run:

```bash
npx eslint src/features/knowledge-bases/components/document-assignment-panel.tsx src/features/knowledge-bases/components/assignment-document-list.tsx src/features/knowledge-bases/components/knowledge-base-detail-feature.tsx
```

Expected: no errors from the new components.

---

### Task 7: Document Item And Read-Only Chunk Display

**Files:**
- Create: `src/features/knowledge-bases/components/assignment-document-item.tsx`
- Create: `src/features/knowledge-bases/components/document-chunk-list.tsx`

- [ ] **Step 1: Create chunk list component**

Create `src/features/knowledge-bases/components/document-chunk-list.tsx`:

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import type { RagChunk } from "@/features/knowledge-bases/types";

function parseTags(value?: string | null) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

type DocumentChunkListProps = {
  chunks: RagChunk[];
};

export function DocumentChunkList({ chunks }: DocumentChunkListProps) {
  if (chunks.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
        暂无分片数据
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {chunks.map((chunk) => {
        const tags = parseTags(chunk.suggestedTags);
        const charCount =
          typeof chunk.startIndex === "number" && typeof chunk.endIndex === "number"
            ? Math.max(chunk.endIndex - chunk.startIndex, 0)
            : chunk.charCount;

        return (
          <article key={chunk.id} className="rounded-md border bg-muted/20 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline">#{chunk.chunkIndex ?? 0}</Badge>
              {chunk.chunkType ? <Badge variant="secondary">{chunk.chunkType}</Badge> : null}
              {chunk.reviewStatus ? <Badge variant="outline">{chunk.reviewStatus}</Badge> : null}
              {typeof charCount === "number" ? (
                <span className="text-xs text-muted-foreground">{charCount} 字符</span>
              ) : null}
            </div>
            {chunk.title ? (
              <div className="mb-1 text-sm font-medium">{chunk.title}</div>
            ) : null}
            <p className="max-h-48 overflow-auto whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {chunk.content || "暂无内容"}
            </p>
            {(chunk.suggestedCategory || tags.length > 0) ? (
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {chunk.suggestedCategory ? <span>{chunk.suggestedCategory}</span> : null}
                {tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create assignment document item**

Create `src/features/knowledge-bases/components/assignment-document-item.tsx`:

```tsx
"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RagDoc } from "@/features/knowledge-bases/types";
import { formatFileSize } from "@/features/knowledge-bases/utils";
import { DocumentChunkList } from "./document-chunk-list";

function formatDate(value?: string) {
  if (!value || value === "--") return "--";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString();
}

type AssignmentDocumentItemProps = {
  document: RagDoc;
  kind: "selected" | "available";
  onMove: (documentId: string) => void;
};

export function AssignmentDocumentItem({
  document,
  kind,
  onMove,
}: AssignmentDocumentItemProps) {
  const [expanded, setExpanded] = React.useState(false);
  const chunks = document.chunks ?? [];
  const canShowChunks = kind === "selected";

  return (
    <article className="rounded-md border bg-background p-3">
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-2">
              <div>
                <div className="truncate text-sm font-medium">
                  {document.title ?? document.name}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {document.originalName || document.fileName || "无原始文件名"}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{document.fileType ?? "file"}</Badge>
                <Badge variant="outline">{document.sourceType ?? "manual"}</Badge>
                <Badge variant="secondary">{document.status ?? "pending"}</Badge>
                <Badge variant="secondary">{document.activeStatus ?? "active"}</Badge>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>Chunks: {document.chunkCount ?? chunks.length}</span>
                <span>大小: {formatFileSize(document.fileSize ?? document.size)}</span>
                <span>更新: {formatDate(document.updatedAt ?? document.uploadedAt)}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          {canShowChunks ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? (
                <ChevronDown data-icon="inline-start" />
              ) : (
                <ChevronRight data-icon="inline-start" />
              )}
              分片
            </Button>
          ) : null}
          <Button
            type="button"
            variant={kind === "selected" ? "outline" : "default"}
            size="sm"
            onClick={() => onMove(document.id)}
          >
            {kind === "selected" ? "撤下" : "启用"}
          </Button>
        </div>
      </div>
      {canShowChunks && expanded ? (
        <div className="mt-3 border-t pt-3">
          <DocumentChunkList chunks={chunks} />
        </div>
      ) : null}
    </article>
  );
}
```

- [ ] **Step 3: Run chunk component lint**

Run:

```bash
npx eslint src/features/knowledge-bases/components/assignment-document-item.tsx src/features/knowledge-bases/components/document-chunk-list.tsx
```

Expected: no errors in new components.

---

### Task 8: Detail Page Completion

**Files:**
- Modify: `src/features/knowledge-bases/components/knowledge-base-detail-feature.tsx`

- [ ] **Step 1: Render basic RAG info card**

In `KnowledgeBaseDetailFeature`, replace the temporary detail name block with a simple card:

```tsx
{detail && !loading ? (
  <Card>
    <CardHeader>
      <CardTitle>{detail.name}</CardTitle>
      <CardDescription>{detail.description || "暂无描述"}</CardDescription>
    </CardHeader>
    <CardContent className="grid gap-3 text-sm md:grid-cols-4">
      <div>状态：{detail.status}</div>
      <div>TopK：{detail.topK}</div>
      <div>相似度阈值：{detail.similarityThreshold}</div>
      <div>更新时间：{new Date(detail.updatedAt).toLocaleString()}</div>
    </CardContent>
  </Card>
) : null}
```

Add imports:

```ts
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
```

- [ ] **Step 2: Render loading state and assignment panel**

In the return body, render:

```tsx
{loading ? (
  <div className="rounded-md border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
    正在加载知识库详情...
  </div>
) : detail ? (
  <DocumentAssignmentPanel
    availableDocuments={availableDocuments}
    dirty={dirty}
    onEnable={handleEnableDocument}
    onRemove={handleRemoveDocument}
    onSave={() => void handleSaveAssignments()}
    saving={saving}
    selectedDocuments={selectedDocuments}
  />
) : null}
```

- [ ] **Step 3: Run detail feature lint**

Run:

```bash
npx eslint src/features/knowledge-bases/components/knowledge-base-detail-feature.tsx src/app/knowledge-bases/[id]/page.tsx
```

Expected: no errors in detail feature and page entry.

---

### Task 9: Full Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run targeted lint for changed feature areas**

Run:

```bash
npx eslint src/features/knowledge-bases src/app/knowledge-bases src/features/note src/app/note src/app/api/notes src/app/api/rag-management
```

Expected: no new errors from changed files. If existing unrelated lint errors appear, record file and rule in the final report.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: build completes successfully.

- [ ] **Step 3: Manual browser verification**

Start dev server if needed:

```bash
npm run dev
```

Manual checks:

- Visit `/knowledge-bases`.
- Click a RAG card and confirm `/knowledge-bases/[id]` opens inside the admin layout.
- Confirm the page has no upload zone.
- Confirm selected documents show chunk detail toggle.
- Confirm available documents include only `status = parsed` and `activeStatus = active`.
- In `/note`, toggle “是否成为知识源” on a note and confirm it becomes available in the detail page after reload.
- Move one available document to selected and confirm the save button enables.
- Refresh before saving and confirm the relationship did not persist.
- Move again, save, reload, and confirm the relationship persists.
- Remove a selected document, save, reload, and confirm the relationship is removed.

- [ ] **Step 4: Document residual risks**

Record any remaining known issues:

```txt
- Existing lint warnings/errors not caused by this plan:
- Dev server port conflicts:
- Manual verification gaps:
```

Do not fix unrelated lint failures unless they block build or the changed feature.

---

## Self-Review

- Spec coverage: The plan covers backend mapper fields, server-side eligibility validation, API reuse, frontend selected/available assignment, save diff, read-only chunk detail, note source status switch, and verification.
- Conflict check: The plan does not add a compose API, does not implement drag-and-drop, does not add upload on the detail page, and does not modify document/chunk content.
- Type consistency: `RagDoc`, `RagChunk`, `normalizeRagDoc`, and the assignment components use the same field names from mapper output.
