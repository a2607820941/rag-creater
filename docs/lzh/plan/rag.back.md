# RAG Backend Services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement real backend API services for RAG knowledge bases, reusable documents, and document chunks, backed by SQLite through Prisma.

**Architecture:** Next.js Route Handlers in `src/app/api/**/route.ts` remain thin HTTP adapters. RAG server logic lives in `src/features/knowledge-bases/server/`, uses Zod schemas for input validation, imports the existing Prisma singleton from `@/lib/db`, and maps Prisma records into API DTOs through mapper functions. The existing frontend request wrapper in `src/features/knowledge-bases/api.ts` is updated to consume the real backend and keep mock fallback behavior safe.

**Tech Stack:** Next.js App Router, TypeScript, Prisma 7, SQLite, `@prisma/adapter-libsql`, Zod, React, Zustand.

---

## File Structure

- Modify: `package.json`
  - Add `zod` dependency through `npm install zod`.
- Modify: `prisma/schema.prisma`
  - Change `KnowledgeBase.icon` default from `"database"` to `"Database"`.
- Reuse: `src/lib/db.ts`
  - Keep current Prisma 7 driver adapter singleton.
- Create: `src/lib/api-response.ts`
  - Shared success/error response helpers and route error conversion.
- Create: `src/features/knowledge-bases/server/schemas.ts`
  - Zod schemas for query params, request bodies, IDs, and shared enum values.
- Create: `src/features/knowledge-bases/server/errors.ts`
  - Typed service error class for 404/409/400 cases.
- Create: `src/features/knowledge-bases/server/mappers.ts`
  - Convert Prisma query results to knowledge base, document, chunk, and tree response DTOs.
- Create: `src/features/knowledge-bases/server/knowledge-base-service.ts`
  - Knowledge base list/tree/create/update/delete/bind/unbind services.
- Create: `src/features/knowledge-bases/server/knowledge-document-service.ts`
  - Document list/detail/create/update/delete/chunks/replace services.
- Create: `src/features/knowledge-bases/server/knowledge-chunk-service.ts`
  - Single chunk delete service.
- Create: `src/app/api/knowledge-bases/route.ts`
- Create: `src/app/api/knowledge-bases/[id]/route.ts`
- Create: `src/app/api/knowledge-bases/[id]/tree/route.ts`
- Create: `src/app/api/knowledge-bases/[id]/documents/route.ts`
- Create: `src/app/api/documents/route.ts`
- Create: `src/app/api/documents/[id]/route.ts`
- Create: `src/app/api/documents/[id]/chunks/route.ts`
- Create: `src/app/api/chunks/[id]/route.ts`
- Modify: `src/features/knowledge-bases/api.ts`
  - Use `/api/knowledge-bases/:id/tree` and `/api/documents/:documentId/chunks`.
- Modify: `src/features/knowledge-bases/types.ts`
  - Remove knowledge-base-level `chunkSize` from `RagListItem` and `KnowledgeBaseFormValues`.
- Modify: `src/features/knowledge-bases/utils.ts`
  - Remove knowledge-base form validation for `chunkSize`; normalize API responses that may be wrapped in `{ success, data }`.
- Modify: `src/features/knowledge-bases/knowledge-base-management.tsx`
  - Remove the `chunkSize` field from knowledge base create/edit form and store writes.
- Modify: `src/features/knowledge-bases/mock-data.ts`
  - Remove knowledge-base-level `chunkSize` from mock items.

---

## Task 1: Dependencies And Database Schema

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `prisma/schema.prisma`
- Verify: `prisma/migrations/`

- [ ] **Step 1: Install Zod**

Run:

```bash
npm install zod
```

Expected:

```text
package.json and package-lock.json include zod.
```

- [ ] **Step 2: Update Prisma icon default**

Modify `prisma/schema.prisma`:

```prisma
model KnowledgeBase {
  id          String  @id @default(cuid())
  name        String  @unique
  description String?

  icon  String @default("Database")
  color String @default("blue")

  similarityThreshold Float @default(0.7)
  topK                Int   @default(5)

  status String @default("active")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  documents KnowledgeBaseDocument[]

  @@index([status])
}
```

Do not change the existing document reuse schema unless current local code differs from the spec.

- [ ] **Step 3: Create migration**

Run:

```bash
npx prisma migrate dev --name knowledge_base_icon_pascal_case
```

Expected:

```text
Prisma creates a new folder under prisma/migrations.
The migration updates the KnowledgeBase icon default to Database.
```

If Prisma reports the database is already in sync and no migration is needed, continue to Step 4.

- [ ] **Step 4: Generate Prisma Client**

Run:

```bash
npm run db:generate
```

Expected:

```text
Prisma Client generated into src/generated/prisma.
```

- [ ] **Step 5: Verify no second Prisma client is added**

Inspect:

```bash
rg -n "new PrismaClient|@prisma/client|@/generated/prisma" src
```

Expected:

```text
Only src/lib/db.ts initializes PrismaClient.
Generated files under src/generated/prisma may contain Prisma internals.
```

---

## Task 2: Shared API Response And Service Errors

**Files:**
- Create: `src/lib/api-response.ts`
- Create: `src/features/knowledge-bases/server/errors.ts`

- [ ] **Step 1: Create API response helpers**

Create `src/lib/api-response.ts`:

```ts
import { ZodError } from "zod";
import { ServiceError } from "@/features/knowledge-bases/server/errors";

export function successResponse<T>(data: T, init?: ResponseInit) {
  return Response.json(
    {
      success: true,
      data,
    },
    init
  );
}

export function errorResponse(
  message: string,
  status = 500,
  details?: unknown
) {
  return Response.json(
    {
      success: false,
      message,
      ...(details === undefined ? {} : { details }),
    },
    { status }
  );
}

export function handleRouteError(error: unknown) {
  if (error instanceof ZodError) {
    return errorResponse("Invalid request parameters", 400, error.flatten());
  }

  if (error instanceof ServiceError) {
    return errorResponse(error.message, error.status, error.details);
  }

  console.error(error);
  return errorResponse("Internal server error", 500);
}
```

- [ ] **Step 2: Create service error class**

Create `src/features/knowledge-bases/server/errors.ts`:

```ts
export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export function notFound(message: string) {
  return new ServiceError(message, 404);
}

export function conflict(message: string, details?: unknown) {
  return new ServiceError(message, 409, details);
}

export function badRequest(message: string, details?: unknown) {
  return new ServiceError(message, 400, details);
}
```

- [ ] **Step 3: Verify TypeScript imports**

Run:

```bash
npm run build
```

Expected:

```text
Build may fail because route/service files do not exist yet, but api-response.ts and errors.ts have no syntax errors.
```

If build fails only because the new files import each other before both exist, re-run after Step 2.

---

## Task 3: Zod Schemas

**Files:**
- Create: `src/features/knowledge-bases/server/schemas.ts`

- [ ] **Step 1: Create shared enum schemas**

Create `src/features/knowledge-bases/server/schemas.ts` with:

```ts
import { z } from "zod";

export const ragIconSchema = z
  .enum([
    "Database",
    "BookOpen",
    "FileText",
    "Folder",
    "Archive",
    "Brain",
    "Bot",
    "GraduationCap",
    "BriefcaseBusiness",
    "Lightbulb",
  ])
  .default("Database");

export const statusSchema = z.enum(["active", "disabled"]);
export const statusWithAllSchema = z.enum(["active", "disabled", "all"]);
export const sourceTypeSchema = z.enum([
  "manual",
  "file",
  "url",
  "text",
  "markdown",
  "image",
]);
export const sourceTypeWithAllSchema = z.enum([
  "manual",
  "file",
  "url",
  "text",
  "markdown",
  "image",
  "all",
]);
export const parseStatusSchema = z.enum([
  "pending",
  "processing",
  "success",
  "failed",
]);
export const parseStatusWithAllSchema = z.enum([
  "pending",
  "processing",
  "success",
  "failed",
  "all",
]);
```

- [ ] **Step 2: Add ID and query schemas**

Append:

```ts
export const idParamsSchema = z.object({
  id: z.string().min(1),
});

export const knowledgeBaseListQuerySchema = z.object({
  keyword: z.string().trim().optional(),
  status: statusWithAllSchema.optional().default("all"),
});

export const documentListQuerySchema = z.object({
  keyword: z.string().trim().optional(),
  sourceType: sourceTypeWithAllSchema.optional().default("all"),
  status: statusWithAllSchema.optional().default("all"),
  parseStatus: parseStatusWithAllSchema.optional().default("all"),
});
```

- [ ] **Step 3: Add chunk schemas**

Append:

```ts
export const createKnowledgeChunkSchema = z
  .object({
    content: z.string().trim().min(1),
    chunkIndex: z.number().int().min(0),
    embedding: z.string().optional(),
    status: statusSchema.optional().default("active"),
    startIndex: z.number().int().min(0).optional(),
    endIndex: z.number().int().min(0).optional(),
  })
  .refine(
    (value) =>
      value.startIndex === undefined ||
      value.endIndex === undefined ||
      value.endIndex >= value.startIndex,
    {
      message: "endIndex 必须大于或等于 startIndex",
      path: ["endIndex"],
    }
  );

export const replaceKnowledgeChunksSchema = z.object({
  chunks: z.array(createKnowledgeChunkSchema),
});
```

- [ ] **Step 4: Add document schemas**

Append:

```ts
const documentBaseSchema = z
  .object({
    title: z.string().trim().min(1),
    sourceType: sourceTypeSchema.optional().default("manual"),
    fileName: z.string().trim().optional(),
    fileUrl: z.string().trim().optional(),
    mimeType: z.string().trim().optional(),
    fileSize: z.number().int().min(0).optional(),
    rawContent: z.string().optional(),
    chunkSize: z.number().int().min(100).max(5000).optional().default(800),
    chunkOverlap: z.number().int().min(0).optional().default(100),
    parseStatus: parseStatusSchema.optional().default("pending"),
    status: statusSchema.optional().default("active"),
    error: z.string().optional(),
  })
  .refine((value) => value.chunkOverlap < value.chunkSize, {
    message: "chunkOverlap 必须小于 chunkSize",
    path: ["chunkOverlap"],
  });

export const createKnowledgeDocumentSchema = documentBaseSchema.extend({
  chunks: z.array(createKnowledgeChunkSchema).optional(),
  knowledgeBaseIds: z.array(z.string().min(1)).optional(),
});

export const updateKnowledgeDocumentSchema = documentBaseSchema.partial();
```

- [ ] **Step 5: Add knowledge base schemas**

Append:

```ts
export const createKnowledgeBaseSchema = z.object({
  name: z.string().trim().min(1).max(50),
  description: z.string().trim().max(500).optional(),
  icon: ragIconSchema.optional().default("Database"),
  similarityThreshold: z.number().min(0).max(1).optional().default(0.7),
  topK: z.number().int().min(1).max(20).optional().default(5),
  status: statusSchema.optional().default("active"),
  documentIds: z.array(z.string().min(1)).optional(),
  documents: z.array(createKnowledgeDocumentSchema).optional(),
});

export const updateKnowledgeBaseSchema = z
  .object({
    name: z.string().trim().min(1).max(50).optional(),
    description: z.string().trim().max(500).optional(),
    icon: ragIconSchema.optional(),
    similarityThreshold: z.number().min(0).max(1).optional(),
    topK: z.number().int().min(1).max(20).optional(),
    status: statusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "至少提供一个更新字段",
  });

export const documentIdsBodySchema = z.object({
  documentIds: z.array(z.string().min(1)).min(1),
});

export type CreateKnowledgeBaseInput = z.infer<
  typeof createKnowledgeBaseSchema
>;
export type UpdateKnowledgeBaseInput = z.infer<
  typeof updateKnowledgeBaseSchema
>;
export type CreateKnowledgeDocumentInput = z.infer<
  typeof createKnowledgeDocumentSchema
>;
export type UpdateKnowledgeDocumentInput = z.infer<
  typeof updateKnowledgeDocumentSchema
>;
export type CreateKnowledgeChunkInput = z.infer<
  typeof createKnowledgeChunkSchema
>;
```

- [ ] **Step 6: Verify schema module**

Run:

```bash
npm run build
```

Expected:

```text
Build passes or only fails on route/service files not yet created later in this plan.
```

---

## Task 4: Response Mappers

**Files:**
- Create: `src/features/knowledge-bases/server/mappers.ts`

- [ ] **Step 1: Create mapper types and helpers**

Create `src/features/knowledge-bases/server/mappers.ts`:

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
  documents: {
    document: {
      chunks: { id: string }[];
    };
  }[];
};

type KnowledgeChunkRecord = {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  embedding: string | null;
  status: string;
  startIndex: number | null;
  endIndex: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type KnowledgeDocumentRecord = {
  id: string;
  title: string;
  sourceType: string;
  fileName: string | null;
  fileUrl: string | null;
  mimeType: string | null;
  fileSize: number | null;
  rawContent: string | null;
  chunkSize: number;
  chunkOverlap: number;
  parseStatus: string;
  status: string;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  chunks?: KnowledgeChunkRecord[];
  knowledgeBases?: {
    id: string;
    knowledgeBase: {
      id: string;
      name: string;
      status: string;
    };
  }[];
};

export function mapKnowledgeChunk(chunk: KnowledgeChunkRecord) {
  return {
    id: chunk.id,
    documentId: chunk.documentId,
    content: chunk.content,
    chunkIndex: chunk.chunkIndex,
    embedding: chunk.embedding,
    status: chunk.status,
    startIndex: chunk.startIndex,
    endIndex: chunk.endIndex,
    createdAt: chunk.createdAt.toISOString(),
    updatedAt: chunk.updatedAt.toISOString(),
  };
}
```

- [ ] **Step 2: Add knowledge base list mapper**

Append:

```ts
export function mapKnowledgeBaseListItem(item: KnowledgeBaseListRecord) {
  return {
    id: item.id,
    name: item.name,
    description: item.description ?? "",
    icon: item.icon,
    color: item.color,
    similarityThreshold: item.similarityThreshold,
    topK: item.topK,
    status: item.status,
    documentCount: item.documents.length,
    chunkCount: item.documents.reduce(
      (sum, relation) => sum + relation.document.chunks.length,
      0
    ),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
```

- [ ] **Step 3: Add document mapper**

Append:

```ts
export function mapKnowledgeDocumentListItem(document: KnowledgeDocumentRecord) {
  return {
    id: document.id,
    title: document.title,
    sourceType: document.sourceType,
    fileName: document.fileName,
    fileUrl: document.fileUrl,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    rawContent: document.rawContent,
    chunkSize: document.chunkSize,
    chunkOverlap: document.chunkOverlap,
    parseStatus: document.parseStatus,
    status: document.status,
    error: document.error,
    chunkCount: document.chunks?.length ?? 0,
    knowledgeBaseCount: document.knowledgeBases?.length ?? 0,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export function mapKnowledgeDocumentDetail(document: KnowledgeDocumentRecord) {
  return {
    id: document.id,
    title: document.title,
    sourceType: document.sourceType,
    fileName: document.fileName,
    fileUrl: document.fileUrl,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    rawContent: document.rawContent,
    chunkSize: document.chunkSize,
    chunkOverlap: document.chunkOverlap,
    parseStatus: document.parseStatus,
    status: document.status,
    error: document.error,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    chunks: (document.chunks ?? []).map(mapKnowledgeChunk),
    knowledgeBases: (document.knowledgeBases ?? []).map((relation) => ({
      relationId: relation.id,
      id: relation.knowledgeBase.id,
      name: relation.knowledgeBase.name,
      status: relation.knowledgeBase.status,
    })),
  };
}
```

- [ ] **Step 4: Add knowledge base tree mapper**

Append:

```ts
type KnowledgeBaseTreeRecord = Omit<KnowledgeBaseListRecord, "documents"> & {
  documents: {
    id: string;
    status: string;
    sortOrder: number;
    document: KnowledgeDocumentRecord & {
      chunks: KnowledgeChunkRecord[];
    };
  }[];
};

export function mapKnowledgeBaseTree(item: KnowledgeBaseTreeRecord) {
  return {
    id: item.id,
    name: item.name,
    description: item.description ?? "",
    icon: item.icon,
    color: item.color,
    similarityThreshold: item.similarityThreshold,
    topK: item.topK,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    documents: item.documents.map((relation) => ({
      relationId: relation.id,
      relationStatus: relation.status,
      sortOrder: relation.sortOrder,
      ...mapKnowledgeDocumentDetail(relation.document),
    })),
  };
}
```

- [ ] **Step 5: Verify mapper module**

Run:

```bash
npm run build
```

Expected:

```text
No TypeScript errors from mappers.ts.
```

---

## Task 5: Knowledge Base Service

**Files:**
- Create: `src/features/knowledge-bases/server/knowledge-base-service.ts`

- [ ] **Step 1: Create service imports and list/tree functions**

Create `src/features/knowledge-bases/server/knowledge-base-service.ts`:

```ts
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { conflict, notFound } from "./errors";
import {
  mapKnowledgeBaseListItem,
  mapKnowledgeBaseTree,
} from "./mappers";
import type {
  CreateKnowledgeBaseInput,
  CreateKnowledgeDocumentInput,
  UpdateKnowledgeBaseInput,
} from "./schemas";

export async function getKnowledgeBaseListService(params: {
  keyword?: string;
  status?: "active" | "disabled" | "all";
}) {
  const where: Prisma.KnowledgeBaseWhereInput = {
    ...(params.keyword
      ? {
          OR: [
            { name: { contains: params.keyword } },
            { description: { contains: params.keyword } },
          ],
        }
      : {}),
    ...(params.status && params.status !== "all"
      ? { status: params.status }
      : {}),
  };

  const items = await prisma.knowledgeBase.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      documents: {
        include: {
          document: {
            include: {
              chunks: {
                where: { status: "active" },
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });

  return items.map(mapKnowledgeBaseListItem);
}

export async function getKnowledgeBaseTreeService(id: string) {
  const item = await prisma.knowledgeBase.findUnique({
    where: { id },
    include: {
      documents: {
        orderBy: { sortOrder: "asc" },
        include: {
          document: {
            include: {
              chunks: {
                orderBy: { chunkIndex: "asc" },
              },
              knowledgeBases: {
                include: {
                  knowledgeBase: {
                    select: {
                      id: true,
                      name: true,
                      status: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!item) throw notFound("知识库不存在");

  return mapKnowledgeBaseTree(item);
}
```

- [ ] **Step 2: Add document creation helper**

Append:

```ts
async function createDocumentWithChunks(
  tx: Prisma.TransactionClient,
  input: CreateKnowledgeDocumentInput
) {
  return tx.knowledgeDocument.create({
    data: {
      title: input.title,
      sourceType: input.sourceType,
      fileName: input.fileName,
      fileUrl: input.fileUrl,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      rawContent: input.rawContent,
      chunkSize: input.chunkSize,
      chunkOverlap: input.chunkOverlap,
      parseStatus: input.parseStatus,
      status: input.status,
      error: input.error,
      chunks: input.chunks?.length
        ? {
            create: input.chunks.map((chunk) => ({
              content: chunk.content,
              chunkIndex: chunk.chunkIndex,
              embedding: chunk.embedding,
              status: chunk.status,
              startIndex: chunk.startIndex,
              endIndex: chunk.endIndex,
            })),
          }
        : undefined,
    },
  });
}
```

- [ ] **Step 3: Add create service**

Append:

```ts
export async function createKnowledgeBaseService(
  input: CreateKnowledgeBaseInput
) {
  const duplicated = await prisma.knowledgeBase.findUnique({
    where: { name: input.name },
    select: { id: true },
  });

  if (duplicated) throw conflict("知识库名称重复");

  const created = await prisma.$transaction(async (tx) => {
    const knowledgeBase = await tx.knowledgeBase.create({
      data: {
        name: input.name,
        description: input.description,
        icon: input.icon,
        similarityThreshold: input.similarityThreshold,
        topK: input.topK,
        status: input.status,
        color: "blue",
      },
    });

    if (input.documentIds?.length) {
      const docs = await tx.knowledgeDocument.findMany({
        where: { id: { in: input.documentIds } },
        select: { id: true },
      });
      const existingIds = new Set(docs.map((doc) => doc.id));

      await tx.knowledgeBaseDocument.createMany({
        data: input.documentIds
          .filter((documentId) => existingIds.has(documentId))
          .map((documentId, index) => ({
            knowledgeBaseId: knowledgeBase.id,
            documentId,
            sortOrder: index,
          })),
        skipDuplicates: true,
      });
    }

    if (input.documents?.length) {
      for (const [index, documentInput] of input.documents.entries()) {
        const document = await createDocumentWithChunks(tx, documentInput);
        await tx.knowledgeBaseDocument.create({
          data: {
            knowledgeBaseId: knowledgeBase.id,
            documentId: document.id,
            sortOrder: (input.documentIds?.length ?? 0) + index,
          },
        });
      }
    }

    return knowledgeBase.id;
  });

  return getKnowledgeBaseTreeService(created);
}
```

- [ ] **Step 4: Add update and delete services**

Append:

```ts
export async function updateKnowledgeBaseService(
  id: string,
  input: UpdateKnowledgeBaseInput
) {
  const current = await prisma.knowledgeBase.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!current) throw notFound("知识库不存在");

  if (input.name) {
    const duplicated = await prisma.knowledgeBase.findFirst({
      where: {
        name: input.name,
        id: { not: id },
      },
      select: { id: true },
    });

    if (duplicated) throw conflict("知识库名称重复");
  }

  const updated = await prisma.knowledgeBase.update({
    where: { id },
    data: input,
  });

  return {
    id: updated.id,
    name: updated.name,
    description: updated.description ?? "",
    icon: updated.icon,
    color: updated.color,
    similarityThreshold: updated.similarityThreshold,
    topK: updated.topK,
    status: updated.status,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };
}

export async function deleteKnowledgeBaseService(id: string) {
  const current = await prisma.knowledgeBase.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!current) throw notFound("知识库不存在");

  await prisma.knowledgeBase.delete({ where: { id } });

  return { id };
}
```

- [ ] **Step 5: Add bind/unbind services**

Append:

```ts
export async function bindDocumentsToKnowledgeBaseService(
  id: string,
  documentIds: string[]
) {
  const current = await prisma.knowledgeBase.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!current) throw notFound("知识库不存在");

  const docs = await prisma.knowledgeDocument.findMany({
    where: { id: { in: documentIds } },
    select: { id: true },
  });
  const existingIds = new Set(docs.map((doc) => doc.id));

  await prisma.knowledgeBaseDocument.createMany({
    data: documentIds
      .filter((documentId) => existingIds.has(documentId))
      .map((documentId, index) => ({
        knowledgeBaseId: id,
        documentId,
        sortOrder: index,
      })),
    skipDuplicates: true,
  });

  return getKnowledgeBaseTreeService(id);
}

export async function unbindDocumentsFromKnowledgeBaseService(
  id: string,
  documentIds: string[]
) {
  const current = await prisma.knowledgeBase.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!current) throw notFound("知识库不存在");

  await prisma.knowledgeBaseDocument.deleteMany({
    where: {
      knowledgeBaseId: id,
      documentId: { in: documentIds },
    },
  });

  return getKnowledgeBaseTreeService(id);
}
```

- [ ] **Step 6: Build check**

Run:

```bash
npm run build
```

Expected:

```text
No TypeScript errors from knowledge-base-service.ts.
```

---

## Task 6: Knowledge Document Service

**Files:**
- Create: `src/features/knowledge-bases/server/knowledge-document-service.ts`

- [ ] **Step 1: Create imports and list service**

Create `src/features/knowledge-bases/server/knowledge-document-service.ts`:

```ts
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { notFound } from "./errors";
import {
  mapKnowledgeChunk,
  mapKnowledgeDocumentDetail,
  mapKnowledgeDocumentListItem,
} from "./mappers";
import type {
  CreateKnowledgeChunkInput,
  CreateKnowledgeDocumentInput,
  UpdateKnowledgeDocumentInput,
} from "./schemas";

export async function getDocumentListService(params: {
  keyword?: string;
  sourceType?: string;
  status?: string;
  parseStatus?: string;
}) {
  const where: Prisma.KnowledgeDocumentWhereInput = {
    ...(params.keyword
      ? {
          OR: [
            { title: { contains: params.keyword } },
            { fileName: { contains: params.keyword } },
            { rawContent: { contains: params.keyword } },
          ],
        }
      : {}),
    ...(params.sourceType && params.sourceType !== "all"
      ? { sourceType: params.sourceType }
      : {}),
    ...(params.status && params.status !== "all"
      ? { status: params.status }
      : {}),
    ...(params.parseStatus && params.parseStatus !== "all"
      ? { parseStatus: params.parseStatus }
      : {}),
  };

  const documents = await prisma.knowledgeDocument.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      chunks: { select: { id: true } },
      knowledgeBases: {
        include: {
          knowledgeBase: {
            select: { id: true, name: true, status: true },
          },
        },
      },
    },
  });

  return documents.map(mapKnowledgeDocumentListItem);
}
```

- [ ] **Step 2: Add detail service**

Append:

```ts
export async function getDocumentDetailService(id: string) {
  const document = await prisma.knowledgeDocument.findUnique({
    where: { id },
    include: {
      chunks: { orderBy: { chunkIndex: "asc" } },
      knowledgeBases: {
        include: {
          knowledgeBase: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!document) throw notFound("文档不存在");

  return mapKnowledgeDocumentDetail(document);
}
```

- [ ] **Step 3: Add create/update/delete services**

Append:

```ts
export async function createDocumentService(input: CreateKnowledgeDocumentInput) {
  const document = await prisma.$transaction(async (tx) =>
    tx.knowledgeDocument.create({
      data: {
        title: input.title,
        sourceType: input.sourceType,
        fileName: input.fileName,
        fileUrl: input.fileUrl,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        rawContent: input.rawContent,
        chunkSize: input.chunkSize,
        chunkOverlap: input.chunkOverlap,
        parseStatus: input.parseStatus,
        status: input.status,
        error: input.error,
        chunks: input.chunks?.length
          ? {
              create: input.chunks.map((chunk) => ({
                content: chunk.content,
                chunkIndex: chunk.chunkIndex,
                embedding: chunk.embedding,
                status: chunk.status,
                startIndex: chunk.startIndex,
                endIndex: chunk.endIndex,
              })),
            }
          : undefined,
        knowledgeBases: input.knowledgeBaseIds?.length
          ? {
              create: input.knowledgeBaseIds.map((knowledgeBaseId) => ({
                knowledgeBaseId,
              })),
            }
          : undefined,
      },
    })
  );

  return getDocumentDetailService(document.id);
}

export async function updateDocumentService(
  id: string,
  input: UpdateKnowledgeDocumentInput
) {
  const current = await prisma.knowledgeDocument.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!current) throw notFound("文档不存在");

  await prisma.knowledgeDocument.update({
    where: { id },
    data: input,
  });

  return getDocumentDetailService(id);
}

export async function deleteDocumentService(id: string) {
  const current = await prisma.knowledgeDocument.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!current) throw notFound("文档不存在");

  await prisma.knowledgeDocument.delete({ where: { id } });

  return { id };
}
```

- [ ] **Step 4: Add chunk read/replace services**

Append:

```ts
export async function getDocumentChunksService(id: string) {
  const current = await prisma.knowledgeDocument.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!current) throw notFound("文档不存在");

  const chunks = await prisma.knowledgeChunk.findMany({
    where: { documentId: id },
    orderBy: { chunkIndex: "asc" },
  });

  return chunks.map(mapKnowledgeChunk);
}

export async function replaceDocumentChunksService(
  id: string,
  chunks: CreateKnowledgeChunkInput[]
) {
  const current = await prisma.knowledgeDocument.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!current) throw notFound("文档不存在");

  await prisma.$transaction(async (tx) => {
    await tx.knowledgeChunk.deleteMany({
      where: { documentId: id },
    });

    if (chunks.length > 0) {
      await tx.knowledgeChunk.createMany({
        data: chunks.map((chunk) => ({
          documentId: id,
          content: chunk.content,
          chunkIndex: chunk.chunkIndex,
          embedding: chunk.embedding,
          status: chunk.status,
          startIndex: chunk.startIndex,
          endIndex: chunk.endIndex,
        })),
      });
    }
  });

  return getDocumentChunksService(id);
}
```

- [ ] **Step 5: Build check**

Run:

```bash
npm run build
```

Expected:

```text
No TypeScript errors from knowledge-document-service.ts.
```

---

## Task 7: Knowledge Chunk Service

**Files:**
- Create: `src/features/knowledge-bases/server/knowledge-chunk-service.ts`

- [ ] **Step 1: Create delete chunk service**

Create `src/features/knowledge-bases/server/knowledge-chunk-service.ts`:

```ts
import { prisma } from "@/lib/db";
import { notFound } from "./errors";

export async function deleteChunkService(id: string) {
  const current = await prisma.knowledgeChunk.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!current) throw notFound("chunk 不存在");

  await prisma.knowledgeChunk.delete({ where: { id } });

  return { id };
}
```

- [ ] **Step 2: Build check**

Run:

```bash
npm run build
```

Expected:

```text
No TypeScript errors from knowledge-chunk-service.ts.
```

---

## Task 8: Knowledge Base Route Handlers

**Files:**
- Create: `src/app/api/knowledge-bases/route.ts`
- Create: `src/app/api/knowledge-bases/[id]/route.ts`
- Create: `src/app/api/knowledge-bases/[id]/tree/route.ts`
- Create: `src/app/api/knowledge-bases/[id]/documents/route.ts`

- [ ] **Step 1: Implement collection route**

Create `src/app/api/knowledge-bases/route.ts`:

```ts
import { handleRouteError, successResponse } from "@/lib/api-response";
import {
  createKnowledgeBaseService,
  getKnowledgeBaseListService,
} from "@/features/knowledge-bases/server/knowledge-base-service";
import {
  createKnowledgeBaseSchema,
  knowledgeBaseListQuerySchema,
} from "@/features/knowledge-bases/server/schemas";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = knowledgeBaseListQuerySchema.parse({
      keyword: url.searchParams.get("keyword") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });

    const data = await getKnowledgeBaseListService(query);
    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = createKnowledgeBaseSchema.parse(body);
    const data = await createKnowledgeBaseService(input);

    return successResponse(data, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 2: Implement item route**

Create `src/app/api/knowledge-bases/[id]/route.ts`:

```ts
import { handleRouteError, successResponse } from "@/lib/api-response";
import {
  deleteKnowledgeBaseService,
  updateKnowledgeBaseService,
} from "@/features/knowledge-bases/server/knowledge-base-service";
import {
  idParamsSchema,
  updateKnowledgeBaseSchema,
} from "@/features/knowledge-bases/server/schemas";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const body = await request.json();
    const input = updateKnowledgeBaseSchema.parse(body);
    const data = await updateKnowledgeBaseService(params.id, input);

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const data = await deleteKnowledgeBaseService(params.id);

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 3: Implement tree route**

Create `src/app/api/knowledge-bases/[id]/tree/route.ts`:

```ts
import { handleRouteError, successResponse } from "@/lib/api-response";
import { getKnowledgeBaseTreeService } from "@/features/knowledge-bases/server/knowledge-base-service";
import { idParamsSchema } from "@/features/knowledge-bases/server/schemas";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const data = await getKnowledgeBaseTreeService(params.id);

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 4: Implement documents binding route**

Create `src/app/api/knowledge-bases/[id]/documents/route.ts`:

```ts
import { handleRouteError, successResponse } from "@/lib/api-response";
import {
  bindDocumentsToKnowledgeBaseService,
  unbindDocumentsFromKnowledgeBaseService,
} from "@/features/knowledge-bases/server/knowledge-base-service";
import {
  documentIdsBodySchema,
  idParamsSchema,
} from "@/features/knowledge-bases/server/schemas";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const body = documentIdsBodySchema.parse(await request.json());
    const data = await bindDocumentsToKnowledgeBaseService(
      params.id,
      body.documentIds
    );

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const body = documentIdsBodySchema.parse(await request.json());
    const data = await unbindDocumentsFromKnowledgeBaseService(
      params.id,
      body.documentIds
    );

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 5: Route build check**

Run:

```bash
npm run build
```

Expected:

```text
Next.js route type checking passes for knowledge-bases routes.
```

---

## Task 9: Document And Chunk Route Handlers

**Files:**
- Create: `src/app/api/documents/route.ts`
- Create: `src/app/api/documents/[id]/route.ts`
- Create: `src/app/api/documents/[id]/chunks/route.ts`
- Create: `src/app/api/chunks/[id]/route.ts`

- [ ] **Step 1: Implement documents collection route**

Create `src/app/api/documents/route.ts`:

```ts
import { handleRouteError, successResponse } from "@/lib/api-response";
import {
  createDocumentService,
  getDocumentListService,
} from "@/features/knowledge-bases/server/knowledge-document-service";
import {
  createKnowledgeDocumentSchema,
  documentListQuerySchema,
} from "@/features/knowledge-bases/server/schemas";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = documentListQuerySchema.parse({
      keyword: url.searchParams.get("keyword") ?? undefined,
      sourceType: url.searchParams.get("sourceType") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      parseStatus: url.searchParams.get("parseStatus") ?? undefined,
    });

    const data = await getDocumentListService(query);
    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = createKnowledgeDocumentSchema.parse(await request.json());
    const data = await createDocumentService(input);

    return successResponse(data, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 2: Implement document item route**

Create `src/app/api/documents/[id]/route.ts`:

```ts
import { handleRouteError, successResponse } from "@/lib/api-response";
import {
  deleteDocumentService,
  getDocumentDetailService,
  updateDocumentService,
} from "@/features/knowledge-bases/server/knowledge-document-service";
import {
  idParamsSchema,
  updateKnowledgeDocumentSchema,
} from "@/features/knowledge-bases/server/schemas";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const data = await getDocumentDetailService(params.id);

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const input = updateKnowledgeDocumentSchema.parse(await request.json());
    const data = await updateDocumentService(params.id, input);

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const data = await deleteDocumentService(params.id);

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 3: Implement document chunks route**

Create `src/app/api/documents/[id]/chunks/route.ts`:

```ts
import { handleRouteError, successResponse } from "@/lib/api-response";
import {
  getDocumentChunksService,
  replaceDocumentChunksService,
} from "@/features/knowledge-bases/server/knowledge-document-service";
import {
  idParamsSchema,
  replaceKnowledgeChunksSchema,
} from "@/features/knowledge-bases/server/schemas";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const data = await getDocumentChunksService(params.id);

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const body = replaceKnowledgeChunksSchema.parse(await request.json());
    const data = await replaceDocumentChunksService(params.id, body.chunks);

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 4: Implement chunk item route**

Create `src/app/api/chunks/[id]/route.ts`:

```ts
import { handleRouteError, successResponse } from "@/lib/api-response";
import { deleteChunkService } from "@/features/knowledge-bases/server/knowledge-chunk-service";
import { idParamsSchema } from "@/features/knowledge-bases/server/schemas";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const data = await deleteChunkService(params.id);

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 5: Route build check**

Run:

```bash
npm run build
```

Expected:

```text
Next.js route type checking passes for document and chunk routes.
```

---

## Task 10: Frontend Request And Type Compatibility

**Files:**
- Modify: `src/features/knowledge-bases/api.ts`
- Modify: `src/features/knowledge-bases/types.ts`
- Modify: `src/features/knowledge-bases/utils.ts`
- Modify: `src/features/knowledge-bases/mock-data.ts`
- Modify: `src/features/knowledge-bases/knowledge-base-management.tsx`

- [ ] **Step 1: Update frontend request wrapper**

Modify `src/features/knowledge-bases/api.ts`:

```ts
async function readApiData<T>(response: Response): Promise<T> {
  const payload = await response.json();

  if (
    payload &&
    typeof payload === "object" &&
    "success" in payload &&
    "data" in payload
  ) {
    return payload.data as T;
  }

  return payload as T;
}

export async function fetchRagItems() {
  const response = await fetch("/api/knowledge-bases", {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch knowledge bases: ${response.status}`);
  }

  return readApiData<unknown>(response);
}

export async function fetchRagDetail(id: string) {
  const response = await fetch(`/api/knowledge-bases/${id}/tree`, {
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

  return readApiData<unknown>(response);
}

export async function fetchDocumentChunks(params: { documentId: string }) {
  const response = await fetch(`/api/documents/${params.documentId}/chunks`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch document chunks: ${response.status}`);
  }

  return readApiData<unknown>(response);
}
```

- [ ] **Step 2: Remove knowledge-base-level chunkSize type**

Modify `src/features/knowledge-bases/types.ts`:

```ts
export type RagListItem = {
  id: string;
  name: string;
  description: string;
  icon: RagIconName;
  documentCount: number;
  chunkCount: number;
  topK: number;
  similarityThreshold: number;
  status: RagStatus;
  updatedAt: string;
};

export type KnowledgeBaseFormValues = {
  name: string;
  description: string;
  icon: RagIconName;
  topK: number;
  similarityThreshold: number;
  status: RagStatus;
};

export const DEFAULT_KNOWLEDGE_BASE_FORM_VALUES = {
  name: "",
  description: "",
  icon: "Database",
  topK: 5,
  similarityThreshold: 0.7,
  status: "active",
} satisfies KnowledgeBaseFormValues;
```

- [ ] **Step 3: Remove chunkSize normalization and validation**

Modify `src/features/knowledge-bases/utils.ts`:

```ts
export function normalizeRagItem(input: unknown): RagListItem {
  const item = isRecord(input) ? input : {};

  return {
    id: toStringValue(item.id, createClientId()),
    name: toStringValue(item.name, "未命名知识库"),
    description: toStringValue(item.description, "暂无描述"),
    icon: normalizeRagIcon(item.icon),
    documentCount: toNumberValue(item.documentCount, 0),
    chunkCount: toNumberValue(item.chunkCount, 0),
    topK: toNumberValue(item.topK, 0),
    similarityThreshold: toNumberValue(item.similarityThreshold, 0),
    status: toStatus(item.status),
    updatedAt: toStringValue(item.updatedAt, "--"),
  };
}
```

Remove this validation block:

```ts
if (
  !Number.isInteger(params.values.chunkSize) ||
  params.values.chunkSize <= 0
) {
  return "分片大小必须为正整数";
}
```

- [ ] **Step 4: Remove chunkSize from mock data**

Modify each item in `src/features/knowledge-bases/mock-data.ts` so it no longer contains:

```ts
chunkSize: 500,
```

- [ ] **Step 5: Remove chunkSize form control and store writes**

Modify `src/features/knowledge-bases/knowledge-base-management.tsx`:

Remove `chunkSize` from `openEditDialog` form values:

```ts
setFormValues({
  name: item.name,
  description: item.description,
  icon: normalizeRagIcon(item.icon),
  topK: item.topK,
  similarityThreshold: item.similarityThreshold,
  status: item.status,
});
```

Remove `chunkSize` from `addItem` and `updateItem` payloads.

Replace the three-column numeric form grid with two fields:

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
  <div className="flex flex-col gap-1.5">
    <Label htmlFor="kb-threshold">相似度阈值</Label>
    <Input
      id="kb-threshold"
      type="number"
      min={0}
      max={1}
      step={0.01}
      value={formValues.similarityThreshold}
      onChange={(event) =>
        updateFormValue("similarityThreshold", Number(event.target.value))
      }
    />
  </div>
</div>
```

- [ ] **Step 6: Frontend compatibility build**

Run:

```bash
npm run build
```

Expected:

```text
No TypeScript errors after removing knowledge-base-level chunkSize.
```

---

## Task 11: API Smoke Tests

**Files:**
- Verify only.

- [ ] **Step 1: Start dev server**

Run:

```bash
npm run dev
```

Expected:

```text
Next.js dev server starts.
```

If port 3000 is already in use by the same project, use the existing server.

- [ ] **Step 2: Test knowledge base list**

Run:

```bash
curl http://localhost:3000/api/knowledge-bases
```

Expected response shape:

```json
{
  "success": true,
  "data": []
}
```

The `data` array may contain records if the database already has seeded data.

- [ ] **Step 3: Create a document, bind it to a knowledge base, and read nested data**

Run in PowerShell:

```powershell
$documentPayload = @{
  title = "Smoke Test Document"
  sourceType = "markdown"
  rawContent = "First paragraph. Second paragraph."
  parseStatus = "success"
  chunks = @(
    @{ content = "First paragraph."; chunkIndex = 0 },
    @{ content = "Second paragraph."; chunkIndex = 1 }
  )
} | ConvertTo-Json -Depth 10

$document = Invoke-RestMethod `
  -Uri "http://localhost:3000/api/documents" `
  -Method Post `
  -ContentType "application/json" `
  -Body $documentPayload

$knowledgeBasePayload = @{
  name = "Smoke Test Knowledge Base"
  description = "API smoke test"
  icon = "Database"
  topK = 5
  similarityThreshold = 0.7
  documentIds = @($document.data.id)
} | ConvertTo-Json -Depth 10

$knowledgeBase = Invoke-RestMethod `
  -Uri "http://localhost:3000/api/knowledge-bases" `
  -Method Post `
  -ContentType "application/json" `
  -Body $knowledgeBasePayload

$tree = Invoke-RestMethod "http://localhost:3000/api/knowledge-bases/$($knowledgeBase.data.id)/tree"
$chunks = Invoke-RestMethod "http://localhost:3000/api/documents/$($document.data.id)/chunks"

$tree
$chunks
```

Expected:

```json
{
  "success": true,
  "data": [
    {
      "chunkIndex": 0
    }
  ]
}
```

The tree response should contain the newly bound document, and the chunks response should include records with `chunkIndex` values `0` and `1`.

---

## Task 12: Final Verification

**Files:**
- Verify only.

- [ ] **Step 1: Generate Prisma Client**

Run:

```bash
npm run db:generate
```

Expected:

```text
Prisma Client generated successfully.
```

- [ ] **Step 2: Sync local SQLite schema**

Run:

```bash
npm run db:push
```

Expected:

```text
Database schema is in sync with Prisma schema.
```

- [ ] **Step 3: Lint**

Run:

```bash
npm run lint
```

Expected:

```text
eslint exits with code 0.
```

- [ ] **Step 4: Production build**

Run:

```bash
npm run build
```

Expected:

```text
Next.js production build succeeds.
```

- [ ] **Step 5: Manual page check**

Open:

```text
http://localhost:3000/knowledge-bases
```

Expected:

```text
The page renders without crashing.
The knowledge base list loads from the backend when available.
If the backend returns an error, the existing mock fallback still keeps the page usable.
The create/edit knowledge base dialog no longer contains chunkSize.
```

---

## Self-Review

- Spec coverage: This plan covers Prisma compatibility, Zod dependency, unified response format, Zod schemas, service layer, all required route handlers, frontend request path fixes, removal of knowledge-base-level `chunkSize`, and verification commands.
- Placeholder scan: The plan does not contain unresolved placeholders. Smoke-test commands pass created IDs through PowerShell variables.
- Type consistency: `CreateKnowledgeBaseInput`, `UpdateKnowledgeBaseInput`, `CreateKnowledgeDocumentInput`, `UpdateKnowledgeDocumentInput`, and `CreateKnowledgeChunkInput` are defined in `schemas.ts` before services import them.
