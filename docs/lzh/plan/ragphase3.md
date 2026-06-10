# RAG Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add knowledge-base-level tags to the RAG management UI, remove similarity-threshold editing from RAG cards/forms, and keep RAG retrieval behavior unchanged.

**Architecture:** Reuse the existing global `KnowledgeTag` model and `/api/tags` API, add a `KnowledgeBaseTag` join table, and extend knowledge-base list/detail responses with `tags`. The RAG management page keeps tag selection as form-local state (`tagIds`) and persists it through existing create/update knowledge-base APIs.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma 7 with SQLite/libsql adapter, Zod, Tailwind CSS, shadcn/ui, lucide-react.

---

## File Map

- Modify `prisma/schema.prisma`: add `KnowledgeBaseTag` and relation fields.
- Modify `src/features/knowledge/tag.validation.ts`: shorten global tag name limit to 8 characters.
- Modify `src/features/knowledge/components/tag-form.tsx`: align existing tag form `maxLength` with backend limit.
- Modify `src/features/knowledge-bases/server/schemas.ts`: add optional `tagIds` to create/update schemas.
- Modify `src/features/knowledge-bases/server/knowledge-base-service.ts`: validate tags, create/replace join rows, include tags in list/detail responses.
- Modify `src/features/knowledge-bases/server/mappers.ts`: map join records to frontend `tags`.
- Modify `src/features/knowledge-bases/types.ts`: add `RagTag`, add `tags` and `tagIds`.
- Modify `src/features/knowledge-bases/utils.ts`: normalize tags, stop validating hidden threshold, validate max 10 selected tags.
- Modify `src/features/knowledge-bases/mock-data.ts`: add `tags: []`.
- Create `src/features/knowledge-bases/components/knowledge-base-tag-badge.tsx`: shared tag badge with optional remove affordance.
- Create `src/features/knowledge-bases/components/knowledge-base-tag-editor.tsx`: selected/available tag editor.
- Create `src/features/knowledge-bases/components/create-knowledge-base-tag-dialog.tsx`: fixed-palette tag creation dialog.
- Modify `src/features/knowledge-bases/index.tsx`: load tags, remove threshold UI, render tag area, wire tag editor/dialog.

---

## Task 1: Add KnowledgeBaseTag Database Model

**Files:**
- Modify: `prisma/schema.prisma`
- Verify: `npm run db:generate`
- Verify: `npm run db:push`

- [ ] **Step 1: Add relation fields to existing models**

In `model KnowledgeBase`, add:

```prisma
  tags KnowledgeBaseTag[]
```

In `model KnowledgeTag`, add:

```prisma
  knowledgeBases KnowledgeBaseTag[]
```

- [ ] **Step 2: Add the join model**

Place this model after `KnowledgeTag` or near the knowledge organization models:

```prisma
model KnowledgeBaseTag {
  id              String @id @default(cuid())
  knowledgeBaseId String
  tagId           String

  createdAt DateTime @default(now())

  knowledgeBase KnowledgeBase @relation(fields: [knowledgeBaseId], references: [id], onDelete: Cascade)
  tag           KnowledgeTag  @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@unique([knowledgeBaseId, tagId])
  @@index([knowledgeBaseId])
  @@index([tagId])
}
```

- [ ] **Step 3: Regenerate Prisma client**

Run:

```bash
npm run db:generate
```

Expected: command exits with code `0` and updates generated Prisma types.

- [ ] **Step 4: Sync SQLite schema**

Run:

```bash
npm run db:push
```

Expected: command exits with code `0`, local SQLite schema includes `KnowledgeBaseTag`.

---

## Task 2: Tighten Global Tag Validation

**Files:**
- Modify: `src/features/knowledge/tag.validation.ts`
- Modify: `src/features/knowledge/components/tag-form.tsx`
- Verify: `npm run lint -- src/features/knowledge/tag.validation.ts src/features/knowledge/components/tag-form.tsx`

- [ ] **Step 1: Update backend tag name limit**

In `src/features/knowledge/tag.validation.ts`, change the tag name schema from max 30 to max 8:

```ts
const tagNameSchema = z
  .string()
  .trim()
  .min(1, "标签名称不能为空")
  .max(8, "标签名称不能超过 8 个字符");
```

- [ ] **Step 2: Update existing TagForm input maxLength**

In `src/features/knowledge/components/tag-form.tsx`, change:

```tsx
maxLength={30}
```

to:

```tsx
maxLength={8}
```

- [ ] **Step 3: Run focused lint**

Run:

```bash
npm run lint -- src/features/knowledge/tag.validation.ts src/features/knowledge/components/tag-form.tsx
```

Expected: no new errors in these two files.

---

## Task 3: Extend Backend Schemas and Service

**Files:**
- Modify: `src/features/knowledge-bases/server/schemas.ts`
- Modify: `src/features/knowledge-bases/server/knowledge-base-service.ts`
- Verify: `npm run lint -- src/features/knowledge-bases/server/schemas.ts src/features/knowledge-bases/server/knowledge-base-service.ts`

- [ ] **Step 1: Add tagIds schema**

In `src/features/knowledge-bases/server/schemas.ts`, near the knowledge-base schemas, add:

```ts
const tagIdsSchema = z.array(z.string().min(1)).max(10).optional();
```

Extend `createKnowledgeBaseSchema`:

```ts
export const createKnowledgeBaseSchema = z.object({
  name: z.string().trim().min(1).max(50),
  description: z.string().trim().max(500).optional(),
  icon: ragIconSchema.optional().default("Database"),
  similarityThreshold: z.number().min(0).max(1).optional().default(0.7),
  topK: z.number().int().min(1).max(20).optional().default(5),
  status: statusSchema.optional().default("active"),
  tagIds: tagIdsSchema,
  documentIds: z.array(z.string().min(1)).optional(),
  documents: z.array(createDocumentSourceSchema).optional(),
});
```

Extend `updateKnowledgeBaseSchema`:

```ts
export const updateKnowledgeBaseSchema = z
  .object({
    name: z.string().trim().min(1).max(50).optional(),
    description: z.string().trim().max(500).optional(),
    icon: ragIconSchema.optional(),
    similarityThreshold: z.number().min(0).max(1).optional(),
    topK: z.number().int().min(1).max(20).optional(),
    status: statusSchema.optional(),
    tagIds: tagIdsSchema,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });
```

- [ ] **Step 2: Add tag id validation helper**

In `src/features/knowledge-bases/server/knowledge-base-service.ts`, add this helper near `assertDocumentIdsExist`:

```ts
async function assertTagIdsExist(
  tx: Prisma.TransactionClient,
  tagIds: string[] | undefined
) {
  const uniqueTagIds = [...new Set(tagIds ?? [])];

  if (uniqueTagIds.length === 0) return uniqueTagIds;

  const tags = await tx.knowledgeTag.findMany({
    where: { id: { in: uniqueTagIds } },
    select: { id: true },
  });

  if (tags.length !== uniqueTagIds.length) {
    const existingIds = new Set(tags.map((tag) => tag.id));
    const missingIds = uniqueTagIds.filter((id) => !existingIds.has(id));

    throw badRequest("some tags do not exist", {
      tagIds: missingIds,
    });
  }

  return uniqueTagIds;
}
```

- [ ] **Step 3: Include tags in list service**

In `getKnowledgeBaseListService`, extend `include`:

```ts
include: {
  tags: {
    include: {
      tag: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  },
  documents: {
    include: {
      document: {
        include: {
          chunks: {
            where: { chunkStatus: "active" },
            select: { id: true },
          },
        },
      },
    },
  },
},
```

- [ ] **Step 4: Include tags in detail service**

In `getKnowledgeBaseTreeService`, extend `include`:

```ts
include: {
  tags: {
    include: {
      tag: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  },
  documents: {
    orderBy: { sortOrder: "asc" },
    include: {
      document: {
        include: {
          chunks: {
            where: {
              OR: [
                { chunkType: "text" },
                { chunkType: "knowledge", knowledgeBaseId: id, reviewStatus: "confirmed" },
                { chunkType: "knowledge", reviewStatus: "pending" },
              ],
            },
            orderBy: { chunkIndex: "asc" },
          },
        },
      },
    },
  },
},
```

- [ ] **Step 5: Bind tags on create**

Inside the `prisma.$transaction` callback in `createKnowledgeBaseService`, after resolving document ids, add:

```ts
const tagIds = await assertTagIdsExist(tx, input.tagIds);
```

Add nested tag creation inside `tx.knowledgeBase.create({ data })`:

```ts
tags:
  tagIds.length > 0
    ? {
        create: tagIds.map((tagId) => ({
          tagId,
        })),
      }
    : undefined,
```

Also include tags in the `include` object returned by create:

```ts
tags: {
  include: {
    tag: true,
  },
  orderBy: {
    createdAt: "asc",
  },
},
```

- [ ] **Step 6: Replace tags on update**

Change `updateKnowledgeBaseService` to use a transaction. Keep existing error handling.

Use this structure:

```ts
export async function updateKnowledgeBaseService(
  id: string,
  input: UpdateKnowledgeBaseInput
) {
  try {
    const item = await prisma.$transaction(async (tx) => {
      const tagIds =
        input.tagIds === undefined
          ? undefined
          : await assertTagIdsExist(tx, input.tagIds);

      await tx.knowledgeBase.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description,
          icon: input.icon,
          similarityThreshold: input.similarityThreshold,
          topK: input.topK,
          status: input.status,
        },
      });

      if (tagIds !== undefined) {
        await tx.knowledgeBaseTag.deleteMany({
          where: { knowledgeBaseId: id },
        });

        if (tagIds.length > 0) {
          await tx.knowledgeBaseTag.createMany({
            data: tagIds.map((tagId) => ({
              knowledgeBaseId: id,
              tagId,
            })),
            skipDuplicates: true,
          });
        }
      }

      return tx.knowledgeBase.findUniqueOrThrow({
        where: { id },
        include: {
          tags: {
            include: {
              tag: true,
            },
            orderBy: {
              createdAt: "asc",
            },
          },
          documents: {
            orderBy: { sortOrder: "asc" },
            include: {
              document: {
                include: {
                  chunks: {
                    where: {
                      OR: [
                        { chunkType: "text" },
                        { chunkType: "knowledge", knowledgeBaseId: id, reviewStatus: "confirmed" },
                        { chunkType: "knowledge", reviewStatus: "pending" },
                      ],
                    },
                    orderBy: { chunkIndex: "asc" },
                  },
                },
              },
            },
          },
        },
      });
    });

    return mapKnowledgeBaseTree(item);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw notFound("knowledge base not found");
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw conflict("knowledge base name already exists");
    }

    throw error;
  }
}
```

- [ ] **Step 7: Run focused lint**

Run:

```bash
npm run lint -- src/features/knowledge-bases/server/schemas.ts src/features/knowledge-bases/server/knowledge-base-service.ts
```

Expected: no new errors in these files.

---

## Task 4: Map Tags Through Knowledge-Base DTOs

**Files:**
- Modify: `src/features/knowledge-bases/server/mappers.ts`
- Verify: `npm run lint -- src/features/knowledge-bases/server/mappers.ts`

- [ ] **Step 1: Add tag record type**

In `src/features/knowledge-bases/server/mappers.ts`, add:

```ts
type KnowledgeBaseTagRecord = {
  tag: {
    id: string;
    name: string;
    color: string | null;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  };
};
```

- [ ] **Step 2: Extend list and tree record types**

Add `tags?: KnowledgeBaseTagRecord[];` to `KnowledgeBaseListRecord`:

```ts
type KnowledgeBaseListRecord = {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  similarityThreshold: number;
  topK: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  tags?: KnowledgeBaseTagRecord[];
  documents: {
    document: {
      chunks: { id: string }[];
    } | null;
  }[];
};
```

`KnowledgeBaseTreeRecord` extends this type, so no separate `tags` field is needed if it remains based on `KnowledgeBaseListRecord`.

- [ ] **Step 3: Add tag mapper**

Add before `mapKnowledgeBaseListItem`:

```ts
function mapKnowledgeBaseTags(tags: KnowledgeBaseTagRecord[] = []) {
  return tags
    .map((relation) => relation.tag)
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.createdAt.getTime() - right.createdAt.getTime();
    })
    .map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      sortOrder: tag.sortOrder,
      createdAt: tag.createdAt.toISOString(),
      updatedAt: tag.updatedAt.toISOString(),
    }));
}
```

- [ ] **Step 4: Add tags to list mapper**

In `mapKnowledgeBaseListItem`, add:

```ts
tags: mapKnowledgeBaseTags(item.tags),
```

Return object should include:

```ts
return {
  id: item.id,
  name: item.name,
  description: item.description ?? "",
  icon: item.icon,
  color: item.color,
  similarityThreshold: item.similarityThreshold,
  topK: item.topK,
  status: item.status,
  tags: mapKnowledgeBaseTags(item.tags),
  documentCount: validDocuments.length,
  chunkCount: validDocuments.reduce(
    (sum, relation) => sum + relation.document.chunks.length,
    0
  ),
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
};
```

- [ ] **Step 5: Add tags to tree mapper**

In `mapKnowledgeBaseTree`, add:

```ts
tags: mapKnowledgeBaseTags(item.tags),
```

Return object should include:

```ts
return {
  id: item.id,
  name: item.name,
  description: item.description ?? "",
  icon: item.icon,
  color: item.color,
  similarityThreshold: item.similarityThreshold,
  topK: item.topK,
  status: item.status,
  tags: mapKnowledgeBaseTags(item.tags),
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
  documents: validDocuments.map((relation) => ({
    relationId: relation.id,
    relationStatus: relation.status,
    sortOrder: relation.sortOrder,
    ...mapDocumentSourceDetail(relation.document),
  })),
};
```

- [ ] **Step 6: Run focused lint**

Run:

```bash
npm run lint -- src/features/knowledge-bases/server/mappers.ts
```

Expected: no new errors.

---

## Task 5: Extend Frontend Types and Normalizers

**Files:**
- Modify: `src/features/knowledge-bases/types.ts`
- Modify: `src/features/knowledge-bases/utils.ts`
- Modify: `src/features/knowledge-bases/mock-data.ts`
- Verify: `npm run lint -- src/features/knowledge-bases/types.ts src/features/knowledge-bases/utils.ts src/features/knowledge-bases/mock-data.ts`

- [ ] **Step 1: Add RagTag type**

In `src/features/knowledge-bases/types.ts`, add before `RagListItem`:

```ts
export type RagTag = {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};
```

- [ ] **Step 2: Add tags to RagListItem**

Add:

```ts
tags: RagTag[];
```

to `RagListItem`:

```ts
export type RagListItem = {
  id: string;
  name: string;
  description: string;
  icon: RagIconName;
  documentCount: number;
  chunkCount: number;
  knowledgeCount?: number;
  topK: number;
  similarityThreshold: number;
  tags: RagTag[];
  status: RagStatus;
  updatedAt: string;
};
```

- [ ] **Step 3: Add tagIds to form values**

In `KnowledgeBaseFormValues`, add:

```ts
tagIds: string[];
```

Update default values:

```ts
export const DEFAULT_KNOWLEDGE_BASE_FORM_VALUES = {
  name: "",
  description: "",
  icon: "Database",
  topK: 5,
  similarityThreshold: 0.7,
  tagIds: [],
  status: "active",
} satisfies KnowledgeBaseFormValues;
```

- [ ] **Step 4: Normalize tags**

In `src/features/knowledge-bases/utils.ts`, import `RagTag`:

```ts
import type {
  KnowledgeBaseFormValues,
  RagChunk,
  RagDoc,
  RagIconName,
  RagListItem,
  RagStatus,
  RagTag,
  SortDirection,
  SortField,
  StatusFilter,
} from "./types";
```

Add this helper before `normalizeRagItem`:

```ts
function normalizeRagTags(value: unknown): RagTag[] {
  if (!Array.isArray(value)) return [];

  return value
    .flatMap((tag): RagTag[] => {
      if (!isRecord(tag)) return [];

      const id = toStringValue(tag.id, "");
      const name = toStringValue(tag.name, "");

      if (!id || !name) return [];

      return [
        {
          id,
          name,
          color: typeof tag.color === "string" ? tag.color : null,
          sortOrder: toNumberValue(tag.sortOrder, 0),
          createdAt:
            typeof tag.createdAt === "string" ? tag.createdAt : undefined,
          updatedAt:
            typeof tag.updatedAt === "string" ? tag.updatedAt : undefined,
        },
      ];
    })
    .sort((left, right) => left.sortOrder - right.sortOrder);
}
```

Add to `normalizeRagItem`:

```ts
tags: normalizeRagTags(item.tags),
```

- [ ] **Step 5: Update form validation**

In `validateKnowledgeBaseForm`, remove the `similarityThreshold` range check block.

Add tag count check after TopK validation:

```ts
if (params.values.tagIds.length > 10) {
  return "单个知识库最多绑定 10 个标签";
}
```

- [ ] **Step 6: Update mock data**

In every item in `src/features/knowledge-bases/mock-data.ts`, add:

```ts
tags: [],
```

- [ ] **Step 7: Run focused lint**

Run:

```bash
npm run lint -- src/features/knowledge-bases/types.ts src/features/knowledge-bases/utils.ts src/features/knowledge-bases/mock-data.ts
```

Expected: no new errors.

---

## Task 6: Create Tag UI Components

**Files:**
- Create: `src/features/knowledge-bases/components/knowledge-base-tag-badge.tsx`
- Create: `src/features/knowledge-bases/components/knowledge-base-tag-editor.tsx`
- Create: `src/features/knowledge-bases/components/create-knowledge-base-tag-dialog.tsx`
- Verify: `npm run lint -- src/features/knowledge-bases/components/knowledge-base-tag-badge.tsx src/features/knowledge-bases/components/knowledge-base-tag-editor.tsx src/features/knowledge-bases/components/create-knowledge-base-tag-dialog.tsx`

- [ ] **Step 1: Create KnowledgeBaseTagBadge**

Create `src/features/knowledge-bases/components/knowledge-base-tag-badge.tsx`:

```tsx
"use client";

import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { RagTag } from "@/features/knowledge-bases/types";

type KnowledgeBaseTagBadgeProps = {
  tag: Pick<RagTag, "id" | "name" | "color">;
  removable?: boolean;
  onRemove?: (tagId: string) => void;
  className?: string;
};

function isDarkColor(color: string | null) {
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return false;

  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;

  return brightness < 145;
}

export function KnowledgeBaseTagBadge({
  tag,
  removable = false,
  onRemove,
  className,
}: KnowledgeBaseTagBadgeProps) {
  const color = tag.color && /^#[0-9a-fA-F]{6}$/.test(tag.color)
    ? tag.color
    : "#64748B";
  const dark = isDarkColor(color);

  return (
    <span
      className={cn(
        "group inline-flex h-6 max-w-20 items-center gap-1 rounded-full border px-2 text-xs font-medium leading-none",
        dark ? "text-white" : "text-slate-900",
        className
      )}
      style={{
        backgroundColor: `${color}22`,
        borderColor: `${color}66`,
      }}
      title={tag.name}
    >
      <span className="truncate">{tag.name}</span>
      {removable ? (
        <button
          type="button"
          className="hidden rounded-full p-0.5 hover:bg-black/10 group-hover:inline-flex"
          onClick={(event) => {
            event.stopPropagation();
            onRemove?.(tag.id);
          }}
          aria-label={`移除标签 ${tag.name}`}
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}
```

- [ ] **Step 2: Create KnowledgeBaseTagEditor**

Create `src/features/knowledge-bases/components/knowledge-base-tag-editor.tsx`:

```tsx
"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { KnowledgeTagDto } from "@/features/knowledge/types";

import { KnowledgeBaseTagBadge } from "./knowledge-base-tag-badge";

type KnowledgeBaseTagEditorProps = {
  allTags: KnowledgeTagDto[];
  selectedTagIds: string[];
  disabled?: boolean;
  onChange: (tagIds: string[]) => void;
  onCreateClick: () => void;
};

const MAX_SELECTED_TAGS = 10;

export function KnowledgeBaseTagEditor({
  allTags,
  selectedTagIds,
  disabled = false,
  onChange,
  onCreateClick,
}: KnowledgeBaseTagEditorProps) {
  const selectedIdSet = new Set(selectedTagIds);
  const selectedTags = allTags.filter((tag) => selectedIdSet.has(tag.id));
  const availableTags = allTags.filter((tag) => !selectedIdSet.has(tag.id));
  const reachedLimit = selectedTagIds.length >= MAX_SELECTED_TAGS;

  function addTag(tagId: string) {
    if (disabled || reachedLimit || selectedIdSet.has(tagId)) return;
    onChange([...selectedTagIds, tagId]);
  }

  function removeTag(tagId: string) {
    if (disabled) return;
    onChange(selectedTagIds.filter((id) => id !== tagId));
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">标签</div>
          <div className="text-xs text-muted-foreground">
            最多绑定 10 个，卡片展示前 5 个
          </div>
        </div>
        <Button
          type="button"
          size="icon"
          className="h-8 w-8 bg-blue-600 hover:bg-blue-700"
          disabled={disabled}
          onClick={onCreateClick}
          aria-label="新增标签"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex min-h-8 flex-wrap gap-1.5">
        {selectedTags.length > 0 ? (
          selectedTags.map((tag) => (
            <KnowledgeBaseTagBadge
              key={tag.id}
              tag={tag}
              removable
              onRemove={removeTag}
            />
          ))
        ) : (
          <span className="text-xs text-muted-foreground">暂无已选标签</span>
        )}
      </div>

      <div className="border-t border-border pt-3">
        <div className="mb-2 text-xs font-medium text-muted-foreground">
          可选标签
        </div>
        <div className="flex flex-wrap gap-1.5">
          {availableTags.length > 0 ? (
            availableTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                disabled={disabled || reachedLimit}
                onClick={() => addTag(tag.id)}
                className="disabled:cursor-not-allowed disabled:opacity-50"
              >
                <KnowledgeBaseTagBadge tag={tag} />
              </button>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">
              暂无可选标签
            </span>
          )}
        </div>
        {reachedLimit ? (
          <div className="mt-2 text-xs text-destructive">
            单个知识库最多绑定 10 个标签
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create tag creation dialog**

Create `src/features/knowledge-bases/components/create-knowledge-base-tag-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { KnowledgeTagFormValues } from "@/features/knowledge/types";

const TAG_COLOR_OPTIONS = [
  "#2563EB",
  "#16A34A",
  "#7C3AED",
  "#EA580C",
  "#DC2626",
  "#0891B2",
  "#64748B",
  "#DB2777",
];

type CreateKnowledgeBaseTagDialogProps = {
  open: boolean;
  submitting?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: KnowledgeTagFormValues) => void | Promise<void>;
};

export function CreateKnowledgeBaseTagDialog({
  open,
  submitting = false,
  error,
  onOpenChange,
  onSubmit,
}: CreateKnowledgeBaseTagDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(TAG_COLOR_OPTIONS[0]);

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 8) return;

    await onSubmit({
      name: trimmedName,
      color,
      sortOrder: 0,
    });

    setName("");
    setColor(TAG_COLOR_OPTIONS[0]);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>新增标签</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-kb-tag-name">标签名称</Label>
            <Input
              id="new-kb-tag-name"
              value={name}
              maxLength={8}
              disabled={submitting}
              placeholder="最多 4 个中文字符"
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>标签颜色</Label>
            <div className="grid grid-cols-8 gap-2">
              {TAG_COLOR_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={submitting}
                  onClick={() => setColor(option)}
                  className={cn(
                    "h-7 w-7 rounded-md border transition",
                    color === option
                      ? "border-foreground ring-2 ring-ring"
                      : "border-border"
                  )}
                  style={{ backgroundColor: option }}
                  aria-label={`选择颜色 ${option}`}
                />
              ))}
            </div>
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={submitting || !name.trim() || name.trim().length > 8}
            onClick={() => void handleSubmit()}
          >
            {submitting ? "创建中..." : "确认"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run focused lint**

Run:

```bash
npm run lint -- src/features/knowledge-bases/components/knowledge-base-tag-badge.tsx src/features/knowledge-bases/components/knowledge-base-tag-editor.tsx src/features/knowledge-bases/components/create-knowledge-base-tag-dialog.tsx
```

Expected: no new errors.

---

## Task 7: Wire Tags Into RAG Management Page

**Files:**
- Modify: `src/features/knowledge-bases/index.tsx`
- Verify: `npm run lint -- src/features/knowledge-bases/index.tsx`

- [ ] **Step 1: Add imports**

In `src/features/knowledge-bases/index.tsx`, add:

```ts
import { createTag, fetchTags } from "@/features/knowledge/api/tags";
import type { KnowledgeTagDto, KnowledgeTagFormValues } from "@/features/knowledge/types";
import { CreateKnowledgeBaseTagDialog } from "@/features/knowledge-bases/components/create-knowledge-base-tag-dialog";
import { KnowledgeBaseTagBadge } from "@/features/knowledge-bases/components/knowledge-base-tag-badge";
import { KnowledgeBaseTagEditor } from "@/features/knowledge-bases/components/knowledge-base-tag-editor";
```

- [ ] **Step 2: Add tag state**

Inside `RagManage`, add:

```ts
const [allTags, setAllTags] = useState<KnowledgeTagDto[]>([]);
const [tagsLoading, setTagsLoading] = useState(false);
const [tagDialogOpen, setTagDialogOpen] = useState(false);
const [tagSubmitting, setTagSubmitting] = useState(false);
const [tagError, setTagError] = useState<string | null>(null);
```

- [ ] **Step 3: Load global tags**

In the existing `useEffect`, after `loadRagItems();`, add a local function and call:

```ts
async function loadTags() {
  setTagsLoading(true);

  try {
    const data = await fetchTags();
    if (!ignore) setAllTags(data);
  } catch (loadError) {
    console.warn("Failed to load knowledge tags.", loadError);
    if (!ignore) setTagError("标签数据加载失败");
  } finally {
    if (!ignore) setTagsLoading(false);
  }
}

loadTags();
```

Keep `ignore` guard shared with the effect.

- [ ] **Step 4: Initialize tagIds in create/edit forms**

In `openCreateDialog`, keep:

```ts
setFormValues(DEFAULT_KNOWLEDGE_BASE_FORM_VALUES);
```

because defaults now include `tagIds: []`.

In `openEditDialog`, add:

```ts
tagIds: item.tags.map((tag) => tag.id),
```

Full form value object:

```ts
setFormValues({
  name: item.name,
  description: item.description,
  icon: normalizeRagIcon(item.icon),
  topK: item.topK,
  similarityThreshold: item.similarityThreshold,
  tagIds: item.tags.map((tag) => tag.id),
  status: item.status,
});
```

- [ ] **Step 5: Stop submitting similarityThreshold**

In `saveForm`, change payload to:

```ts
const payload = {
  name: formValues.name.trim(),
  description: formValues.description.trim() || undefined,
  icon: formValues.icon,
  topK: formValues.topK,
  status: formValues.status,
  tagIds: formValues.tagIds,
};
```

- [ ] **Step 6: Add create tag handler**

Add inside `RagManage`:

```ts
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
```

- [ ] **Step 7: Remove threshold from card stats and add tags**

Replace the card stats block:

```tsx
<div className="grid grid-cols-2 gap-2 text-sm">
  <div>文档：{item.documentCount}</div>
  <div>Chunks：{item.chunkCount}</div>
  <div>TopK：{item.topK}</div>
  <div>阈值：{item.similarityThreshold}</div>
</div>
```

with:

```tsx
<div className="grid grid-cols-2 gap-2 text-sm">
  <div>文档：{item.documentCount}</div>
  <div>Chunks：{item.chunkCount}</div>
  <div>TopK：{item.topK}</div>
</div>
<div className="flex h-[52px] flex-wrap content-start gap-1.5 overflow-hidden">
  {item.tags.length > 0 ? (
    item.tags.slice(0, 5).map((tag) => (
      <KnowledgeBaseTagBadge key={tag.id} tag={tag} />
    ))
  ) : (
    <span className="text-xs text-muted-foreground">暂无标签</span>
  )}
</div>
```

- [ ] **Step 8: Remove threshold input from form**

Delete the form block with:

```tsx
<Label htmlFor="kb-threshold">相似度阈值</Label>
```

Keep only TopK in that area. If the surrounding layout is `md:grid-cols-2`, change it to a single field or keep `grid` with one child:

```tsx
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
```

- [ ] **Step 9: Add tag editor to form**

Add after TopK and before enable status:

```tsx
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
```

- [ ] **Step 10: Compact enable status**

Replace the large bordered enable status block with:

```tsx
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
```

- [ ] **Step 11: Render create tag dialog**

Render near the existing form dialog:

```tsx
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
```

- [ ] **Step 12: Run focused lint**

Run:

```bash
npm run lint -- src/features/knowledge-bases/index.tsx
```

Expected: no new errors. Existing warnings in unrelated files are not part of this task.

---

## Task 8: End-to-End Build Verification

**Files:**
- Verify all changed files

- [ ] **Step 1: Run focused lint for all touched files**

Run:

```bash
npm run lint -- src/features/knowledge/tag.validation.ts src/features/knowledge/components/tag-form.tsx src/features/knowledge-bases/types.ts src/features/knowledge-bases/utils.ts src/features/knowledge-bases/mock-data.ts src/features/knowledge-bases/index.tsx src/features/knowledge-bases/server/schemas.ts src/features/knowledge-bases/server/knowledge-base-service.ts src/features/knowledge-bases/server/mappers.ts src/features/knowledge-bases/components/knowledge-base-tag-badge.tsx src/features/knowledge-bases/components/knowledge-base-tag-editor.tsx src/features/knowledge-bases/components/create-knowledge-base-tag-dialog.tsx
```

Expected: no new errors in touched files.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: build exits with code `0`.

- [ ] **Step 3: Check full lint separately**

Run:

```bash
npm run lint
```

Expected: it may still fail due to existing unrelated React hook lint errors in document/extraction modules. If it fails, record the exact pre-existing files and confirm no new errors were introduced in RAG Phase 3 files.

- [ ] **Step 4: Start or reuse dev server**

If no server is running:

```bash
npm run dev
```

If `http://localhost:3000` is already served by this project, reuse it.

Expected: `http://localhost:3000/knowledge-bases` loads.

- [ ] **Step 5: Manual smoke test**

In the browser:

1. Open `/knowledge-bases`.
2. Confirm RAG cards no longer show threshold.
3. Confirm cards show “暂无标签” for untagged knowledge bases.
4. Open create or edit knowledge-base dialog.
5. Confirm threshold input is not present.
6. Confirm enable status is compact.
7. Click the blue plus button in the tag editor.
8. Create a tag with a valid name such as `业务` and a color.
9. Confirm the tag appears in selected tags.
10. Save the knowledge base.
11. Confirm the card shows the tag.
12. Add more than 5 tags through the editor and confirm the card still renders only first 5 across two lines without `+N`.
13. Refresh the page and confirm tags persist.
14. Open Debug or agent chat and confirm RAG retrieval behavior still works.

---

## Self-Review Checklist

- [ ] Spec coverage: database model, backend APIs, frontend card, editor, create tag dialog, validation, compatibility, verification are all mapped to tasks.
- [ ] Placeholder scan: no unfinished placeholder markers or unspecified error handling steps remain.
- [ ] Type consistency: `RagTag`, `tags`, `tagIds`, `KnowledgeBaseTag`, and `KnowledgeTagDto` names are used consistently.
- [ ] Compatibility: `similarityThreshold` is not deleted and RAG retrieval files are not modified.
- [ ] Validation: both `npm run build` and focused lint are included.
