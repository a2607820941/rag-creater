# Knowledge Note Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add knowledge enhancement for Markdown notes so inline image and common document references can be converted into persisted text and used for RAG chunks without overwriting the original note.

**Architecture:** Store the user-authored Markdown in `DocumentSource.rawContent` and store generated enhanced Markdown in `DocumentSource.enhancedContent`. `parseDocument()` chooses `enhancedContent` only when `enhancementEnabled` is true; otherwise it uses `rawContent`. The editor always displays the original Markdown.

**Tech Stack:** Next.js App Router route handlers, React, TypeScript, Zod, Prisma 7, SQLite, existing `parseFileContent()` resource parsing, existing document chunk rebuild flow.

---

## File Structure

- Modify `prisma/schema.prisma`: add note enhancement fields to `DocumentSource`.
- Modify `src/features/note/types.ts`: expose enhancement metadata to the frontend.
- Modify `src/features/note/server/schemas.ts`: validate enhancement API input and allow `enhancementEnabled` in note updates.
- Modify `src/features/note/server/note-service.ts`: read/write enhancement fields and preserve original `rawContent`.
- Create `src/features/note/server/note-enhancement-service.ts`: scan Markdown, download inline image/document assets, call `parseFileContent()`, save `enhancedContent`, and optionally reparse chunks.
- Create `src/app/api/notes/[id]/enhance/route.ts`: route handler for enhancement toggling and generation.
- Modify `src/features/note/api.ts`: add `enhanceNote()` client API and update types.
- Modify `src/server/services/document.service.ts`: let note parsing choose enhanced content without writing enhanced content back into `rawContent`.
- Modify `src/features/note/index.tsx`: manage enhancement UI state and save behavior.
- Modify `src/features/note/components/note-topbar.tsx`: add enhancement toggle/button state.

## Implementation Tasks

### Task 1: Extend The Prisma Model

**Files:**
- Modify: `prisma/schema.prisma`
- Generated later: `src/generated/prisma/*`

- [ ] **Step 1: Add enhancement fields to `DocumentSource`**

Add these fields immediately after `rawContent String?`:

```prisma
  enhancedContent    String?
  enhancementEnabled Boolean   @default(false)
  enhancedAt         DateTime?
```

- [ ] **Step 2: Add indexes for enhancement queries**

Add this index near the existing `DocumentSource` indexes:

```prisma
  @@index([enhancementEnabled])
```

- [ ] **Step 3: Generate Prisma client**

Run:

```bash
npm run db:generate
```

Expected: Prisma client generation succeeds and updates `src/generated/prisma/`.

- [ ] **Step 4: Push schema to local SQLite**

Run:

```bash
npm run db:push
```

Expected: schema sync succeeds without dropping existing data.

### Task 2: Extend Note Types And Schemas

**Files:**
- Modify: `src/features/note/types.ts`
- Modify: `src/features/note/server/schemas.ts`

- [ ] **Step 1: Extend frontend note types**

Update `NoteSummary` in `src/features/note/types.ts`:

```ts
export type NoteSummary = {
  id: string;
  title: string;
  fileSize: number;
  sourceType: "markdown";
  fileType: "note";
  status: string;
  activeStatus: string;
  enhancementEnabled: boolean;
  enhancedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

Keep `NoteDetail` as:

```ts
export type NoteDetail = NoteSummary & {
  originalName: string;
  rawContent: string | null;
};
```

Do not add `enhancedContent` to `NoteDetail` for the first version. The editor must not display the enhanced version.

- [ ] **Step 2: Extend update input type**

Update `UpdateNoteInput`:

```ts
export type UpdateNoteInput = {
  title?: string;
  rawContent?: string;
  status?: "pending" | "parsed" | "uploaded";
  activeStatus?: "active" | "disabled";
  enhancementEnabled?: boolean;
};
```

- [ ] **Step 3: Add enhancement result types**

Append to `src/features/note/types.ts`:

```ts
export type NoteEnhancementAsset = {
  source: string;
  type: string;
  status: "success" | "failed";
  insertedText?: string;
  error?: string;
};

export type NoteEnhancementSummary = {
  enabled: boolean;
  enhancedAt: string | null;
  assetCount: number;
  successCount: number;
  failedCount: number;
  assets: NoteEnhancementAsset[];
};

export type EnhanceNoteInput = {
  rawContent?: string;
  enabled?: boolean;
  reparse?: boolean;
};

export type EnhanceNoteResponse = {
  note: NoteDetail;
  enhancement: NoteEnhancementSummary;
};
```

- [ ] **Step 4: Extend server schemas**

Update `updateNoteSchema` in `src/features/note/server/schemas.ts`:

```ts
export const updateNoteSchema = z
  .object({
    title: z.string().trim().min(1, "title is required").optional(),
    rawContent: z.string().optional(),
    status: z.enum(["pending", "parsed", "uploaded"]).optional(),
    activeStatus: z.enum(["active", "disabled"]).optional(),
    enhancementEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });
```

- [ ] **Step 5: Add enhance note schema**

Append:

```ts
export const enhanceNoteSchema = z.object({
  rawContent: z.string().optional(),
  enabled: z.boolean().optional(),
  reparse: z.boolean().optional(),
});

export type EnhanceNoteInput = z.infer<typeof enhanceNoteSchema>;
```

### Task 3: Update Note Service Mapping And Updates

**Files:**
- Modify: `src/features/note/server/note-service.ts`

- [ ] **Step 1: Include enhancement fields in summary mapper**

Change `mapNoteSummary()` parameter type and return value to include:

```ts
function mapNoteSummary(note: {
  id: string;
  title: string;
  fileSize: number;
  sourceType: string;
  fileType: string;
  status: string;
  activeStatus: string;
  enhancementEnabled: boolean;
  enhancedAt: Date | null;
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
    enhancementEnabled: note.enhancementEnabled,
    enhancedAt: note.enhancedAt?.toISOString() ?? null,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}
```

- [ ] **Step 2: Include enhancement fields in detail mapper**

Change `mapNoteDetail()` parameter type so it also accepts:

```ts
  enhancementEnabled: boolean;
  enhancedAt: Date | null;
```

The returned object should continue spreading `mapNoteSummary(note)` and should not include `enhancedContent`.

- [ ] **Step 3: Select enhancement fields in list and detail queries**

Add these fields to both `listNotesService()` and `getNoteDetailService()` select blocks:

```ts
enhancementEnabled: true,
enhancedAt: true,
```

- [ ] **Step 4: Initialize enhancement fields on create**

Add to `createNoteService()` create data:

```ts
enhancedContent: null,
enhancementEnabled: false,
enhancedAt: null,
```

- [ ] **Step 5: Allow enhancement switch updates**

Extend the `data` type inside `updateNoteService()`:

```ts
    enhancementEnabled?: boolean;
```

Then add:

```ts
  if (input.enhancementEnabled !== undefined) {
    data.enhancementEnabled = input.enhancementEnabled;
  }
```

Do not modify `enhancedContent` from `updateNoteService()`. Enhancement content is owned by `note-enhancement-service.ts`.

### Task 4: Implement Note Enhancement Service

**Files:**
- Create: `src/features/note/server/note-enhancement-service.ts`

- [ ] **Step 1: Create service file with types and constants**

Create the file with:

```ts
import { parseDocument } from "@/server/services/document.service";
import { ServiceError } from "@/features/knowledge-bases/server/errors";
import { prisma } from "@/lib/db";
import {
  getFileTypeFromName,
  parseFileContent,
  type AllowedFileType,
} from "@/lib/file-parser";
import type { EnhanceNoteInput } from "./schemas";
import { getNoteDetailService } from "./note-service";

const MAX_REMOTE_ASSET_BYTES = 10 * 1024 * 1024;
const REMOTE_ASSET_TIMEOUT_MS = 10_000;
const INLINE_RESOURCE_MARKDOWN_RE =
  /(!?)\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;

type EnhancementAssetResult = {
  source: string;
  type: string;
  status: "success" | "failed";
  insertedText?: string;
  error?: string;
};
```

- [ ] **Step 2: Add supported inline resource type helpers**

Add:

```ts
const ENHANCEABLE_FILE_TYPES = new Set([
  "png", "jpg", "jpeg", "webp", "bmp",
  "pdf", "docx", "txt", "md", "csv", "xlsx",
]);

function isEnhanceableFileType(value: string | null) {
  return ENHANCEABLE_FILE_TYPES.has(value);
}

function fileTypeFromContentType(contentType: string | null) {
  if (!contentType) return null;
  const normalized = contentType.split(";")[0].trim().toLowerCase();
  if (normalized === "image/png") return "png";
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/bmp") return "bmp";
  if (normalized === "application/pdf") return "pdf";
  if (normalized === "text/plain") return "txt";
  if (normalized === "text/markdown" || normalized === "text/x-markdown") return "md";
  if (normalized === "text/csv") return "csv";
  if (normalized === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (normalized === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  return null;
}

function inferRemoteFileType(url: string, contentType: string | null) {
  const fromContentType = fileTypeFromContentType(contentType);
  if (isEnhanceableFileType(fromContentType)) return fromContentType;

  const pathname = new URL(url).pathname;
  const fromName = getFileTypeFromName(pathname);
  return isEnhanceableFileType(fromName) ? fromName : null;
}
```

- [ ] **Step 3: Add remote download helper**

Add:

```ts
async function fetchRemoteAsset(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_ASSET_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_REMOTE_ASSET_BYTES) {
      throw new Error("remote asset is larger than 10MB");
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_REMOTE_ASSET_BYTES) {
      throw new Error("remote asset is larger than 10MB");
    }

    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: response.headers.get("content-type"),
    };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Add text formatting helpers**

Add:

```ts
function formatSuccessBlock(params: {
  source: string;
  type: string;
  parsedText: string;
}) {
  return [
    "",
    "> 知识增强：内联资源解析结果",
    `> 原始资源：${params.source}`,
    `> 文件类型：${params.type}`,
    `> 解析内容：${params.parsedText.replace(/\r?\n/g, " ")}`,
    "",
  ].join("\n");
}

function formatFailureBlock(params: { source: string; error: string }) {
  return [
    "",
    "> 知识增强：资源解析失败",
    `> 原始资源：${params.source}`,
    `> 原因：${params.error}`,
    "",
  ].join("\n");
}
```

- [ ] **Step 5: Add Markdown enhancement function**

Add:

```ts
async function enhanceMarkdown(rawContent: string) {
  const matches = [...rawContent.matchAll(INLINE_RESOURCE_MARKDOWN_RE)];
  if (matches.length === 0) {
    return {
      enhancedContent: rawContent,
      assets: [] as EnhancementAssetResult[],
    };
  }

  let output = "";
  let cursor = 0;
  const assets: EnhancementAssetResult[] = [];

  for (const match of matches) {
    const fullMatch = match[0];
    const source = match[3];
    const index = match.index ?? 0;

    output += rawContent.slice(cursor, index);
    output += fullMatch;

    try {
      const url = new URL(source);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("only http/https resource URLs are supported");
      }

      const remote = await fetchRemoteAsset(source);
      const fileType = inferRemoteFileType(source, remote.contentType);
      if (!fileType) {
        throw new Error("unsupported remote resource type");
      }

      const parsedText = await parseFileContent(remote.buffer, fileType);
      const insertedText = formatSuccessBlock({
        source,
        type: remote.contentType ?? fileType,
        parsedText,
      });

      output += insertedText;
      assets.push({
        source,
        type: remote.contentType ?? fileType,
        status: "success",
        insertedText,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      const insertedText = formatFailureBlock({ source, error: message });
      output += insertedText;
      assets.push({
        source,
        type: "unknown",
        status: "failed",
        insertedText,
        error: message,
      });
    }

    cursor = index + fullMatch.length;
  }

  output += rawContent.slice(cursor);
  return { enhancedContent: output, assets };
}
```

- [ ] **Step 6: Add exported service function**

Add:

```ts
export async function enhanceNoteService(id: string, input: EnhanceNoteInput) {
  const existing = await prisma.documentSource.findFirst({
    where: { id, sourceType: "markdown", fileType: "note" },
    select: { id: true, rawContent: true },
  });

  if (!existing) {
    throw new ServiceError("Note not found", 404);
  }

  const enabled = input.enabled ?? true;
  const rawContent = input.rawContent ?? existing.rawContent ?? "";

  if (!enabled) {
    await prisma.documentSource.update({
      where: { id },
      data: { enhancementEnabled: false },
    });

    if (input.reparse ?? true) {
      await parseDocument(id);
    }

    return {
      note: await getNoteDetailService(id),
      enhancement: {
        enabled: false,
        enhancedAt: null,
        assetCount: 0,
        successCount: 0,
        failedCount: 0,
        assets: [] as EnhancementAssetResult[],
      },
    };
  }

  const { enhancedContent, assets } = await enhanceMarkdown(rawContent);
  const enhancedAt = new Date();

  await prisma.documentSource.update({
    where: { id },
    data: {
      rawContent,
      fileSize: Buffer.byteLength(rawContent, "utf-8"),
      enhancedContent,
      enhancementEnabled: true,
      enhancedAt,
    },
  });

  if (input.reparse ?? true) {
    await parseDocument(id);
  }

  const successCount = assets.filter((asset) => asset.status === "success").length;

  return {
    note: await getNoteDetailService(id),
    enhancement: {
      enabled: true,
      enhancedAt: enhancedAt.toISOString(),
      assetCount: assets.length,
      successCount,
      failedCount: assets.length - successCount,
      assets,
    },
  };
}
```

### Task 5: Add The Enhance API Route

**Files:**
- Create: `src/app/api/notes/[id]/enhance/route.ts`

- [ ] **Step 1: Create route handler**

Create:

```ts
import { enhanceNoteService } from "@/features/note/server/note-enhancement-service";
import {
  enhanceNoteSchema,
  noteIdSchema,
} from "@/features/note/server/schemas";
import { handleRouteError, successResponse } from "@/lib/api-response";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function parseId(context: RouteContext) {
  const params = await context.params;
  return noteIdSchema.parse(params).id;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const id = await parseId(context);
    const body = await request.json();
    const input = enhanceNoteSchema.parse(body);
    const result = await enhanceNoteService(id, input);
    return successResponse(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
```

### Task 6: Update Client API

**Files:**
- Modify: `src/features/note/api.ts`

- [ ] **Step 1: Import enhancement types**

Update the import:

```ts
import type {
  CreateNoteInput,
  EnhanceNoteInput,
  EnhanceNoteResponse,
  NoteDetail,
  NoteSummary,
  UpdateNoteInput,
} from "./types";
```

- [ ] **Step 2: Add client API function**

Append:

```ts
export async function enhanceNote(id: string, input: EnhanceNoteInput) {
  const response = await fetch(`/api/notes/${id}/enhance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return parseResponse<EnhanceNoteResponse>(response);
}
```

### Task 7: Make parseDocument Enhancement-Aware

**Files:**
- Modify: `src/server/services/document.service.ts`

- [ ] **Step 1: Change `replaceTextChunksAndIndex()` options**

Update the signature:

```ts
export async function replaceTextChunksAndIndex(
  documentSourceId: string,
  chunks: TextChunk[],
  options: { rawContent?: string; updateRawContent?: boolean }
) {
```

- [ ] **Step 2: Only write rawContent when requested**

Replace the `documentSource.update()` data block with:

```ts
const updateData: Prisma.DocumentSourceUpdateInput = {
  status: "parsed",
  chunkCount: chunks.length,
  error: null,
};

if (options.updateRawContent !== false) {
  updateData.rawContent = options.rawContent;
}

await tx.documentSource.update({
  where: { id: documentSourceId },
  data: updateData,
});
```

- [ ] **Step 3: Load enhancement fields in parseDocument**

Update the `findUnique()` call in `parseDocument()`:

```ts
const doc = await prisma.documentSource.findUnique({ where: { id } });
```

No select is present today, so Prisma will include new scalar fields after generation. No code change is needed for select.

- [ ] **Step 4: Select enhanced content for note parsing**

Replace the note branch:

```ts
if (isNote) {
  onProgress?.("parse", 30);
  rawContent = doc.rawContent ?? "";
}
```

with:

```ts
if (isNote) {
  onProgress?.("parse", 30);
  rawContent =
    doc.enhancementEnabled && doc.enhancedContent
      ? doc.enhancedContent
      : doc.rawContent ?? "";
}
```

- [ ] **Step 5: Avoid overwriting rawContent for notes**

Change:

```ts
await replaceTextChunksAndIndex(id, chunks, { rawContent });
```

to:

```ts
await replaceTextChunksAndIndex(id, chunks, {
  rawContent,
  updateRawContent: !isNote,
});
```

- [ ] **Step 6: Preserve existing callers**

Find all calls to `replaceTextChunksAndIndex(`. For calls outside `parseDocument()` where parsed file content should update raw content, leave them as:

```ts
await replaceTextChunksAndIndex(id, chunks, { rawContent });
```

Because `updateRawContent` defaults to true unless explicitly set to false.

### Task 8: Wire Enhancement Into Note UI

**Files:**
- Modify: `src/features/note/index.tsx`
- Modify: `src/features/note/components/note-topbar.tsx`

- [ ] **Step 1: Import enhanceNote**

Update import in `src/features/note/index.tsx`:

```ts
import {
  createNote,
  deleteNote,
  enhanceNote,
  getNoteDetail,
  listNotes,
  updateNote,
} from "./api";
```

- [ ] **Step 2: Add enhancement state**

Add state near existing saving state:

```ts
const [enhancing, setEnhancing] = React.useState(false);
const [enhancedAt, setEnhancedAt] = React.useState<string | null>(null);
```

Add `enhancing` to `busy`:

```ts
const busy =
  loading || detailLoading || saving || deleting || sourceToggleSaving || enhancing;
```

- [ ] **Step 3: Apply enhancement metadata when loading notes**

Update `applyActiveNote()`:

```ts
const applyActiveNote = React.useCallback((note: NoteDetail | null) => {
  setActiveNote(note);
  setActiveNoteId(note?.id ?? null);
  setDraftTitle(note?.title ?? "");
  setDraftRawContent(note?.rawContent ?? "");
  setEnhancedAt(note?.enhancedAt ?? null);
}, []);
```

Use `activeNote?.enhancementEnabled ?? false` as the source of truth for enabled state.

- [ ] **Step 4: Add enhancement toggle handler**

Add to `NoteFeature`:

```ts
async function handleEnhancementEnabledChange(enabled: boolean) {
  if (!activeNote || enhancing || saving) return;

  setEnhancing(true);
  setError(null);

  try {
    if (enabled) {
      const saved = await saveCurrentNote();
      if (!saved) return;

      const result = await enhanceNote(activeNote.id, {
        rawContent: draftRawContent,
        enabled: true,
        reparse: true,
      });

      applyActiveNote(result.note);
      await refreshNotes();
      return;
    }

    const result = await enhanceNote(activeNote.id, {
      enabled: false,
      reparse: true,
    });

    applyActiveNote(result.note);
    await refreshNotes();
  } catch (caught) {
    setError(caught instanceof Error ? caught.message : "知识增强操作失败");
  } finally {
    setEnhancing(false);
  }
}
```

- [ ] **Step 5: Re-enhance after save when enabled**

After successful `updateNote()` inside `saveCurrentNote()`, add:

```ts
if (updatedNote.enhancementEnabled) {
  const enhanced = await enhanceNote(updatedNote.id, {
    rawContent: draftRawContent,
    enabled: true,
    reparse: true,
  });
  applyActiveNote(enhanced.note);
} else {
  applyActiveNote(updatedNote);
}
```

Then keep `await refreshNotes();`.

Remove or avoid a duplicate `applyActiveNote(updatedNote)` before this block.

- [ ] **Step 6: Pass enhancement props to NoteTopbar**

Add props:

```tsx
enhancementEnabled={activeNote?.enhancementEnabled ?? false}
enhancementLoading={enhancing}
enhancedAt={enhancedAt}
onEnhancementEnabledChange={(enabled) =>
  void handleEnhancementEnabledChange(enabled)
}
```

- [ ] **Step 7: Extend NoteTopbar props**

In `note-topbar.tsx`, add:

```ts
  enhancementEnabled: boolean;
  enhancementLoading: boolean;
  enhancedAt: string | null;
  onEnhancementEnabledChange: (enabled: boolean) => void;
```

- [ ] **Step 8: Add a compact enhancement button**

In the right action group before Save, add:

```tsx
<button
  type="button"
  title={
    enhancementEnabled
      ? "知识增强已开启，RAG 将使用增强后的内容"
      : "知识增强已关闭，RAG 将使用原始笔记"
  }
  aria-label="知识增强"
  aria-pressed={enhancementEnabled}
  disabled={disabled || enhancementLoading}
  onClick={() => onEnhancementEnabledChange(!enhancementEnabled)}
  className={cn(
    "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
    enhancementEnabled
      ? "border-blue-500 bg-blue-50 text-blue-700"
      : "border-border bg-background text-muted-foreground hover:bg-muted"
  )}
>
  {enhancementLoading ? "增强中..." : enhancementEnabled ? "增强开" : "增强关"}
</button>
```

Optionally show enhanced time under the title:

```tsx
{enhancedAt ? (
  <p className="mt-1 text-xs text-muted-foreground">
    最近增强：{new Date(enhancedAt).toLocaleString()}
  </p>
) : null}
```

### Task 9: Run Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run Prisma generation**

Run:

```bash
npm run db:generate
```

Expected: succeeds.

- [ ] **Step 2: Run Prisma schema push**

Run:

```bash
npm run db:push
```

Expected: succeeds.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: no lint errors introduced by this feature.

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: build completes successfully.

- [ ] **Step 5: Manual browser verification**

Run dev server:

```bash
npm run dev
```

Manual checks:

```text
1. Open /note.
2. Create a note with Markdown containing a remote image:
   ![test](https://example.com/image.png)
3. Save the note.
4. Turn "增强开".
5. Confirm no enhanced text appears in the editor.
6. Confirm note detail reloads and enhancedAt appears.
7. Trigger document parsing for this note if not automatic in UI.
8. Confirm chunks are generated.
9. Turn "增强关".
10. Confirm editor still shows the original Markdown.
11. Reparse and confirm chunks now come from rawContent.
```

### Task 10: Commit The Work

**Files:**
- All modified implementation files.
- `docs/lzh/specs/noteEnhance.md`
- `docs/lzh/tecdoc/enhancenote-tec.md`
- `docs/lzh/plan/noteenhance-plan.md`

- [ ] **Step 1: Review diff**

Run:

```bash
git diff --stat
git diff -- prisma/schema.prisma src/features/note src/server/services/document.service.ts src/app/api/notes docs/lzh
```

Expected: changes are limited to note enhancement and its documentation.

- [ ] **Step 2: Commit**

Run:

```bash
git add prisma/schema.prisma src/features/note src/server/services/document.service.ts src/app/api/notes docs/lzh
git commit -m "feat: add knowledge note enhancement plan"
```

Expected: commit succeeds.

## Self-Review

- Spec coverage: the plan covers schema changes, API, service, frontend UI, parse/chunk closure, compatibility, and verification.
- Placeholder scan: no unresolved placeholders are intentionally left.
- Type consistency: `enhancedContent`, `enhancementEnabled`, `enhancedAt`, `EnhanceNoteInput`, and `EnhanceNoteResponse` are consistently named across schema, service, API, and UI tasks.
- Compatibility check: existing uploaded documents keep writing parsed content to `rawContent`; notes set `updateRawContent: false` during parse so original Markdown is preserved.
