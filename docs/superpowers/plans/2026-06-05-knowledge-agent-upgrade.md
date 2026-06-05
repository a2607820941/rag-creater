# Knowledge Agent Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing Knowledge Agent into a bounded multi-round, read-only agentic RAG executor for knowledge-base organization, analysis, and review.

**Architecture:** Keep the current chat API and SSE contract, but move Knowledge Agent internals into `src/server/services/knowledge-agent/`. Add a rule-based persisted `DocumentKnowledgeMap`, provider-neutral text tool calls, read-only tools for `files` / `knowledgeBase` / `all` scopes, and a bounded tool loop whose final answer still streams through the existing chat pipeline.

**Tech Stack:** Next.js App Router, TypeScript, Prisma 7, SQLite, Zod, existing `llm-client.ts`, existing RAG retriever, existing chat SSE emitter.

---

## File Structure

- Modify `prisma/schema.prisma`: add `DocumentKnowledgeMap` and `DocumentSource.knowledgeMap`.
- Create `src/server/services/knowledge-agent/types.ts`: Zod schemas, scope/tool/result types, loop constants.
- Create `src/server/services/knowledge-agent/knowledge-map.ts`: rule-based map generation, formatting, and backfill helper.
- Create `src/server/services/knowledge-agent/tools.ts`: read-only `list_knowledge_map`, `retrieve_files`, and `search_chunks`.
- Create `src/server/services/knowledge-agent/prompts.ts`: system prompt, final prompt, tool result formatting.
- Create `src/server/services/knowledge-agent/tool-loop.ts`: parse text actions, validate JSON, run bounded tool rounds.
- Create `src/server/services/knowledge-agent/executor.ts`: public `runKnowledgeAgent` entry point used by chat route.
- Modify `src/server/services/document.service.ts`: generate rule-based document maps after successful chunk replacement/indexing.
- Modify `src/app/api/chat/route.ts`: replace inline Knowledge Agent orchestration with the new executor.
- Modify `src/features/chat/chat.types.ts`: no new event names expected; only adjust if TypeScript requires citation/knowledge file shape alignment.
- Compatibility update `src/server/services/knowledge-agent-document.service.ts`: convert to a thin wrapper or remove after all imports move.

## Validation Strategy

This repository currently has no test script in `package.json`. Do not introduce a test framework for this feature. Use TypeScript/build verification and targeted manual API checks.

Primary verification:

```powershell
npm.cmd run build
```

Expected: Next.js build completes without TypeScript or route errors.

Prisma verification after schema changes:

```powershell
npm.cmd run db:generate
```

Expected: Prisma client generation completes and `src/generated/prisma/` updates as generated output.

---

### Task 1: Add DocumentKnowledgeMap Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add relation field to `DocumentSource`**

In `model DocumentSource`, add this relation near the existing relation fields:

```prisma
  knowledgeMap   DocumentKnowledgeMap?
```

- [ ] **Step 2: Add `DocumentKnowledgeMap` model**

Add this model after `DocumentSource` or after `DocumentChunk`:

```prisma
model DocumentKnowledgeMap {
  id               String @id @default(cuid())
  documentSourceId String @unique

  summary      String
  keywordsJson String @default("[]")
  outlineJson  String @default("[]")
  signalsJson  String @default("{}")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  documentSource DocumentSource @relation(fields: [documentSourceId], references: [id], onDelete: Cascade)

  @@index([updatedAt])
}
```

- [ ] **Step 3: Generate Prisma client**

Run:

```powershell
npm.cmd run db:generate
```

Expected: Prisma generation succeeds.

- [ ] **Step 4: Sync local SQLite schema**

Run:

```powershell
npm.cmd run db:push
```

Expected: Prisma reports the database is in sync or applies the new table.

- [ ] **Step 5: Commit schema change**

Run:

```powershell
git add prisma/schema.prisma src/generated/prisma
git commit -m "feat: add document knowledge map schema"
```

Expected: commit contains only Prisma schema/generated client changes.

---

### Task 2: Add Knowledge Agent Shared Types

**Files:**
- Create: `src/server/services/knowledge-agent/types.ts`

- [ ] **Step 1: Create `types.ts`**

Create `src/server/services/knowledge-agent/types.ts` with:

```ts
import { z } from "zod";
import type { ChatCitation, ChatKnowledgeFile } from "@/features/chat/chat.types";

export const KNOWLEDGE_AGENT_MAX_TOOL_ROUNDS = 5;
export const KNOWLEDGE_AGENT_MAX_INVALID_ACTIONS = 2;
export const KNOWLEDGE_AGENT_ROUND_CHAR_BUDGET = 20_000;
export const KNOWLEDGE_AGENT_TOTAL_CHAR_BUDGET = 60_000;

export const knowledgeAgentScopeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("files"),
    documentIds: z.array(z.string().trim().min(1)).min(1).max(20),
  }),
  z.object({
    type: z.literal("knowledgeBase"),
    knowledgeBaseIds: z.array(z.string().trim().min(1)).min(1).max(10),
  }),
  z.object({
    type: z.literal("all"),
  }).strict(),
]);

export type KnowledgeAgentScope = z.infer<typeof knowledgeAgentScopeSchema>;

export const listKnowledgeMapInputSchema = z.object({
  scope: knowledgeAgentScopeSchema,
  limit: z.number().int().min(1).max(100).default(50),
});

export const retrieveFilesInputSchema = z.object({
  scope: knowledgeAgentScopeSchema,
  mode: z.enum(["summary", "chunks", "full"]),
  query: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(30).optional(),
});

export const searchChunksInputSchema = z.object({
  scope: knowledgeAgentScopeSchema,
  query: z.string().trim().min(1),
  limit: z.number().int().min(1).max(30).default(10),
});

export const toolActionNameSchema = z.enum([
  "list_knowledge_map",
  "retrieve_files",
  "search_chunks",
]);

export type KnowledgeAgentToolName = z.infer<typeof toolActionNameSchema>;
export type ListKnowledgeMapInput = z.infer<typeof listKnowledgeMapInputSchema>;
export type RetrieveFilesInput = z.infer<typeof retrieveFilesInputSchema>;
export type SearchChunksInput = z.infer<typeof searchChunksInputSchema>;

export type KnowledgeAgentToolResult = {
  toolName: KnowledgeAgentToolName;
  ok: boolean;
  content: string;
  returnedCharCount: number;
  remainingRoundBudget: number;
  remainingTotalBudget: number;
  citations?: ChatCitation[];
  knowledgeFiles?: ChatKnowledgeFile[];
};

export type KnowledgeAgentBudgetState = {
  remainingTotalBudget: number;
};

export type ParsedKnowledgeAgentAction =
  | {
      kind: "action";
      name: KnowledgeAgentToolName;
      input: unknown;
    }
  | {
      kind: "final";
      content: string;
    }
  | {
      kind: "message";
      content: string;
    };
```

- [ ] **Step 2: Run build**

Run:

```powershell
npm.cmd run build
```

Expected: build succeeds or fails only because files importing these types do not exist yet. If it fails because this file has syntax errors, fix before continuing.

- [ ] **Step 3: Commit types**

Run:

```powershell
git add src/server/services/knowledge-agent/types.ts
git commit -m "feat: add knowledge agent tool types"
```

Expected: commit contains only `types.ts`.

---

### Task 3: Implement Rule-Based Document Knowledge Maps

**Files:**
- Create: `src/server/services/knowledge-agent/knowledge-map.ts`
- Modify: `src/server/services/document.service.ts`

- [ ] **Step 1: Create `knowledge-map.ts`**

Create `src/server/services/knowledge-agent/knowledge-map.ts` with:

```ts
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { KnowledgeAgentScope } from "@/server/services/knowledge-agent/types";

const DEFAULT_MAP_LIMIT = 50;
const SUMMARY_LIMIT = 360;
const KEYWORD_LIMIT = 12;
const OUTLINE_LIMIT = 12;

type DocumentForMap = {
  id: string;
  title: string;
  originalName: string;
  fileType: string;
  sourceType: string;
  chunkCount: number;
  rawContent: string | null;
  updatedAt: Date;
  knowledgeBases?: Array<{
    knowledgeBaseId: string;
    knowledgeBase: {
      id: string;
      name: string;
      status: string;
    };
  }>;
  chunks?: Array<{
    id: string;
    content: string;
    chunkIndex: number;
    chunkStatus: string;
  }>;
  knowledgeMap?: {
    summary: string;
    keywordsJson: string;
    outlineJson: string;
    signalsJson: string;
  } | null;
};

export type KnowledgeMapItem = {
  documentId: string;
  title: string;
  fileType: string;
  sourceType: string;
  chunkCount: number;
  knowledgeBases: Array<{ id: string; name: string }>;
  summary: string;
  keywords: string[];
  outline: string[];
  signals: Record<string, unknown>;
  updatedAt: string;
};

export function buildRuleBasedKnowledgeMap(input: {
  rawContent: string | null;
  chunks: Array<{ content: string; chunkStatus?: string }>;
}) {
  const text = normalizeText(
    input.rawContent || input.chunks.map((chunk) => chunk.content).join("\n\n")
  );
  const activeChunks = input.chunks.filter(
    (chunk) => chunk.chunkStatus === undefined || chunk.chunkStatus === "active"
  );

  return {
    summary: summarizeText(text, SUMMARY_LIMIT),
    keywordsJson: JSON.stringify(extractKeywords(text)),
    outlineJson: JSON.stringify(extractOutline(text)),
    signalsJson: JSON.stringify({
      chunkCount: input.chunks.length,
      activeChunkCount: activeChunks.length,
      hasEmptyChunks: input.chunks.some((chunk) => !chunk.content.trim()),
      containsNumbers: /\d/.test(text),
      containsDates: /\d{4}[-/.年]\d{1,2}/.test(text),
      parseQuality: getParseQuality(text, input.chunks.length),
      reviewRisk: getReviewRisk(text, input.chunks.length),
    }),
  };
}

export async function upsertDocumentKnowledgeMap(documentSourceId: string) {
  const document = await prisma.documentSource.findUnique({
    where: { id: documentSourceId },
    include: {
      chunks: {
        orderBy: { chunkIndex: "asc" },
        select: {
          content: true,
          chunkStatus: true,
        },
      },
    },
  });

  if (!document || document.status !== "parsed" || document.activeStatus !== "active") {
    return null;
  }

  const map = buildRuleBasedKnowledgeMap({
    rawContent: document.rawContent,
    chunks: document.chunks,
  });

  return prisma.documentKnowledgeMap.upsert({
    where: { documentSourceId },
    create: {
      documentSourceId,
      ...map,
    },
    update: map,
  });
}

export async function backfillDocumentKnowledgeMaps(limit = DEFAULT_MAP_LIMIT) {
  const documents = await prisma.documentSource.findMany({
    where: {
      status: "parsed",
      activeStatus: "active",
      knowledgeMap: null,
    },
    select: { id: true },
    take: limit,
    orderBy: { updatedAt: "desc" },
  });

  const results: Array<{ id: string; success: boolean; error?: string }> = [];
  for (const document of documents) {
    try {
      await upsertDocumentKnowledgeMap(document.id);
      results.push({ id: document.id, success: true });
    } catch (error) {
      results.push({
        id: document.id,
        success: false,
        error: error instanceof Error ? error.message : "map generation failed",
      });
    }
  }

  return {
    total: documents.length,
    succeeded: results.filter((result) => result.success).length,
    results,
  };
}

export async function listKnowledgeMapItems(input: {
  scope: KnowledgeAgentScope;
  limit?: number;
}) {
  const documents = await prisma.documentSource.findMany({
    where: getDocumentWhereForScope(input.scope),
    orderBy: { updatedAt: "desc" },
    take: input.limit ?? DEFAULT_MAP_LIMIT,
    include: {
      knowledgeMap: true,
      knowledgeBases: {
        where: {
          status: "active",
          knowledgeBase: { status: "active" },
        },
        include: {
          knowledgeBase: {
            select: { id: true, name: true, status: true },
          },
        },
      },
      chunks: {
        orderBy: { chunkIndex: "asc" },
        select: {
          id: true,
          content: true,
          chunkIndex: true,
          chunkStatus: true,
        },
      },
    },
  });

  return documents.map(toKnowledgeMapItem);
}

export function formatKnowledgeMapItems(items: KnowledgeMapItem[]) {
  if (items.length === 0) {
    return "No active parsed documents matched this scope.";
  }

  return items
    .map((item, index) => {
      const knowledgeBases =
        item.knowledgeBases.length > 0
          ? item.knowledgeBases.map((kb) => `${kb.name} (${kb.id})`).join(", ")
          : "No active knowledge-base relation";

      return [
        `${index + 1}. documentId=${item.documentId}`,
        `Title: ${item.title}`,
        `Type: ${item.fileType}; sourceType: ${item.sourceType}; chunks: ${item.chunkCount}`,
        `Knowledge bases: ${knowledgeBases}`,
        `Summary: ${item.summary || "No summary available"}`,
        `Keywords: ${item.keywords.length > 0 ? item.keywords.join(", ") : "None"}`,
        `Signals: ${JSON.stringify(item.signals)}`,
        `Updated: ${item.updatedAt}`,
      ].join("\n");
    })
    .join("\n\n");
}

export function getDocumentWhereForScope(
  scope: KnowledgeAgentScope
): Prisma.DocumentSourceWhereInput {
  const base: Prisma.DocumentSourceWhereInput = {
    status: "parsed",
    activeStatus: "active",
  };

  if (scope.type === "files") {
    return { ...base, id: { in: scope.documentIds } };
  }

  if (scope.type === "knowledgeBase") {
    return {
      ...base,
      knowledgeBases: {
        some: {
          knowledgeBaseId: { in: scope.knowledgeBaseIds },
          status: "active",
          knowledgeBase: { status: "active" },
        },
      },
    };
  }

  return base;
}

function toKnowledgeMapItem(document: DocumentForMap): KnowledgeMapItem {
  const fallback = buildRuleBasedKnowledgeMap({
    rawContent: document.rawContent,
    chunks: document.chunks ?? [],
  });
  const map = document.knowledgeMap ?? fallback;

  return {
    documentId: document.id,
    title: document.title || document.originalName,
    fileType: document.fileType,
    sourceType: document.sourceType,
    chunkCount: document.chunkCount,
    knowledgeBases:
      document.knowledgeBases?.map((item) => ({
        id: item.knowledgeBase.id,
        name: item.knowledgeBase.name,
      })) ?? [],
    summary: map.summary,
    keywords: parseJsonArray(map.keywordsJson),
    outline: parseJsonArray(map.outlineJson),
    signals: parseJsonObject(map.signalsJson),
    updatedAt: document.updatedAt.toISOString(),
  };
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function summarizeText(text: string, limit: number) {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

function extractKeywords(text: string) {
  const matches = text.match(/[\p{L}\p{N}_-]{2,}/gu) ?? [];
  const counts = new Map<string, number>();
  for (const raw of matches) {
    const token = raw.toLowerCase();
    if (token.length < 2 || /^\d+$/.test(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, KEYWORD_LIMIT)
    .map(([token]) => token);
}

function extractOutline(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const headings = lines.filter((line) =>
    /^(#{1,6}\s+|第[一二三四五六七八九十\d]+[章节条]|[一二三四五六七八九十\d]+[.、]\s*)/.test(line)
  );

  return (headings.length > 0 ? headings : lines)
    .slice(0, OUTLINE_LIMIT)
    .map((line) => summarizeText(line.replace(/^#{1,6}\s+/, ""), 120));
}

function getParseQuality(text: string, chunkCount: number) {
  if (!text || chunkCount === 0) return "poor";
  if (text.length < 200 || chunkCount < 2) return "limited";
  return "good";
}

function getReviewRisk(text: string, chunkCount: number) {
  if (!text || chunkCount === 0) return "high";
  if (/冲突|错误|失败|异常|风险|待办|修复/i.test(text)) return "medium";
  return "low";
}

function parseJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
```

- [ ] **Step 2: Hook map generation into document parsing**

In `src/server/services/document.service.ts`, add:

```ts
import { upsertDocumentKnowledgeMap } from "@/server/services/knowledge-agent/knowledge-map";
```

After the successful `prisma.$transaction([...])` in `replaceTextChunksAndIndex`, add:

```ts
  await upsertDocumentKnowledgeMap(documentSourceId).catch((error) => {
    console.warn(
      "Failed to update document knowledge map:",
      error instanceof Error ? error.message : error
    );
  });
```

Place it after the transaction that sets `documentSource.status` to `"parsed"`, so the map service can enforce `status: "parsed"` and `activeStatus: "active"`.

- [ ] **Step 3: Run build**

Run:

```powershell
npm.cmd run build
```

Expected: build succeeds. If Prisma types for `documentKnowledgeMap` are missing, rerun `npm.cmd run db:generate`.

- [ ] **Step 4: Commit map service**

Run:

```powershell
git add src/server/services/knowledge-agent/knowledge-map.ts src/server/services/document.service.ts
git commit -m "feat: add rule-based document knowledge maps"
```

Expected: commit contains only map generation and document parse integration.

---

### Task 4: Implement Knowledge Agent Read-Only Tools

**Files:**
- Create: `src/server/services/knowledge-agent/tools.ts`

- [ ] **Step 1: Create `tools.ts`**

Create `src/server/services/knowledge-agent/tools.ts` with:

```ts
import type { ChatCitation, ChatKnowledgeFile } from "@/features/chat/chat.types";
import type { RagRetrieveScope } from "@/features/rag/types";
import { prisma } from "@/lib/db";
import { retrieveRagContexts } from "@/server/services/rag/retriever";
import {
  formatKnowledgeMapItems,
  getDocumentWhereForScope,
  listKnowledgeMapItems,
} from "@/server/services/knowledge-agent/knowledge-map";
import {
  KNOWLEDGE_AGENT_ROUND_CHAR_BUDGET,
  type KnowledgeAgentBudgetState,
  type KnowledgeAgentToolResult,
  type ListKnowledgeMapInput,
  type RetrieveFilesInput,
  type SearchChunksInput,
} from "@/server/services/knowledge-agent/types";

type ToolBudget = {
  roundBudget?: number;
  budgetState: KnowledgeAgentBudgetState;
};

export async function runListKnowledgeMapTool(
  input: ListKnowledgeMapInput,
  budget: ToolBudget
): Promise<KnowledgeAgentToolResult> {
  const items = await listKnowledgeMapItems(input);
  return buildToolResult("list_knowledge_map", formatKnowledgeMapItems(items), budget);
}

export async function runRetrieveFilesTool(
  input: RetrieveFilesInput,
  budget: ToolBudget
): Promise<KnowledgeAgentToolResult> {
  if (input.mode === "summary") {
    const items = await listKnowledgeMapItems({
      scope: input.scope,
      limit: input.limit ?? 10,
    });
    const knowledgeFiles = items.map((item) => ({
      id: item.documentId,
      title: item.title,
      chunkCount: item.chunkCount,
    }));
    return buildToolResult(
      "retrieve_files",
      formatKnowledgeMapItems(items),
      budget,
      { knowledgeFiles }
    );
  }

  const documents = await prisma.documentSource.findMany({
    where: getDocumentWhereForScope(input.scope),
    orderBy: { updatedAt: "desc" },
    take: input.mode === "full" ? 5 : undefined,
    include: {
      chunks: {
        where: input.mode === "chunks" ? { chunkStatus: "active" } : undefined,
        orderBy: { chunkIndex: "asc" },
      },
    },
  });

  const knowledgeFiles: ChatKnowledgeFile[] = documents.map((document) => ({
    id: document.id,
    title: document.title || document.originalName,
    chunkCount: document.chunkCount,
  }));

  if (input.mode === "full") {
    const content = documents
      .slice(0, 5)
      .map((document) =>
        [
          `[document:${document.id}] ${document.title || document.originalName}`,
          document.chunks.length > 0
            ? document.chunks.map((chunk) => chunk.content).join("\n\n")
            : document.rawContent ?? "",
        ].join("\n")
      )
      .join("\n\n");

    return buildToolResult("retrieve_files", content, budget, { knowledgeFiles });
  }

  const limit = input.limit ?? 10;
  const query = input.query?.toLowerCase();
  const chunks = documents
    .flatMap((document) =>
      document.chunks.map((chunk) => ({
        document,
        chunk,
      }))
    )
    .filter((item) =>
      query ? item.chunk.content.toLowerCase().includes(query) : true
    )
    .slice(0, limit);

  const content =
    chunks.length > 0
      ? chunks
          .map((item) =>
            [
              `[document:${item.document.id} chunk:${item.chunk.id}] ${item.document.title || item.document.originalName}`,
              item.chunk.content,
            ].join("\n")
          )
          .join("\n\n")
      : "No active chunks matched this scope and query.";

  return buildToolResult("retrieve_files", content, budget, { knowledgeFiles });
}

export async function runSearchChunksTool(
  input: SearchChunksInput,
  budget: ToolBudget
): Promise<KnowledgeAgentToolResult> {
  const scope = await toRagScope(input);
  if (!scope.ok) {
    return buildToolResult("search_chunks", scope.reason, budget);
  }

  const retrieve = await retrieveRagContexts({
    query: input.query,
    mode: "detailed",
    scope: scope.scope,
  });

  const citations = retrieve.contexts.slice(0, input.limit).map(toCitation);
  const content =
    retrieve.contexts.length > 0
      ? retrieve.contexts
          .slice(0, input.limit)
          .map((context) =>
            [
              `[${context.id}] ${context.title} score=${context.score.toFixed(3)}`,
              context.content,
            ].join("\n")
          )
          .join("\n\n")
      : "No RAG chunks matched this scope and query.";

  return buildToolResult("search_chunks", content, budget, { citations });
}

async function toRagScope(
  input: SearchChunksInput
): Promise<{ ok: true; scope: RagRetrieveScope } | { ok: false; reason: string }> {
  if (input.scope.type === "knowledgeBase") {
    return { ok: true, scope: { knowledgeBaseIds: input.scope.knowledgeBaseIds } };
  }

  if (input.scope.type === "all") {
    const knowledgeBases = await prisma.knowledgeBase.findMany({
      where: { status: "active" },
      select: { id: true },
    });

    if (knowledgeBases.length === 0) {
      return {
        ok: false,
        reason: "No active knowledge bases are available for RAG search.",
      };
    }

    return {
      ok: true,
      scope: { knowledgeBaseIds: knowledgeBases.map((item) => item.id) },
    };
  }

  const relations = await prisma.knowledgeBaseDocument.findMany({
    where: {
      documentId: { in: input.scope.documentIds },
      status: "active",
      knowledgeBase: { status: "active" },
      document: {
        status: "parsed",
        activeStatus: "active",
      },
    },
    select: {
      knowledgeBaseId: true,
    },
  });

  const knowledgeBaseIds = [...new Set(relations.map((item) => item.knowledgeBaseId))];
  if (knowledgeBaseIds.length === 0) {
    return {
      ok: false,
      reason:
        "RAG search is unavailable for these files because they have no active knowledge-base relation. Use retrieve_files for direct document reads.",
    };
  }

  return {
    ok: true,
    scope: {
      knowledgeBaseIds,
      knowledgeIds: input.scope.documentIds,
    },
  };
}

function buildToolResult(
  toolName: KnowledgeAgentToolResult["toolName"],
  content: string,
  budget: ToolBudget,
  extra: {
    citations?: ChatCitation[];
    knowledgeFiles?: ChatKnowledgeFile[];
  } = {}
): KnowledgeAgentToolResult {
  const roundBudget = budget.roundBudget ?? KNOWLEDGE_AGENT_ROUND_CHAR_BUDGET;
  const allowed = Math.max(0, Math.min(roundBudget, budget.budgetState.remainingTotalBudget));
  const truncated =
    content.length > allowed
      ? `${content.slice(0, Math.max(0, allowed - 120))}\n\n[Tool result truncated because the Knowledge Agent context budget was exhausted.]`
      : content;
  const returnedCharCount = truncated.length;
  budget.budgetState.remainingTotalBudget = Math.max(
    0,
    budget.budgetState.remainingTotalBudget - returnedCharCount
  );

  return {
    toolName,
    ok: allowed > 0,
    content: allowed > 0 ? truncated : "Tool budget exhausted before this call could return content.",
    returnedCharCount,
    remainingRoundBudget: Math.max(0, roundBudget - returnedCharCount),
    remainingTotalBudget: budget.budgetState.remainingTotalBudget,
    ...extra,
  };
}

function toCitation(context: Awaited<ReturnType<typeof retrieveRagContexts>>["contexts"][number]): ChatCitation {
  return {
    refId: context.id,
    chunkId: context.chunkId,
    knowledgeId: context.knowledgeId,
    documentId: context.knowledgeId,
    knowledgeBaseId: context.knowledgeBaseId,
    title: context.title,
    content: context.content,
    chunkType: context.chunkType,
    score: context.score,
  };
}
```

- [ ] **Step 2: Run build**

Run:

```powershell
npm.cmd run build
```

Expected: build succeeds after import and type fixes.

- [ ] **Step 3: Commit tools**

Run:

```powershell
git add src/server/services/knowledge-agent/tools.ts
git commit -m "feat: add knowledge agent read tools"
```

Expected: commit contains only the tools file.

---

### Task 5: Implement Prompts and Text Action Parsing

**Files:**
- Create: `src/server/services/knowledge-agent/prompts.ts`
- Create: `src/server/services/knowledge-agent/tool-loop.ts`

- [ ] **Step 1: Create `prompts.ts`**

Create `src/server/services/knowledge-agent/prompts.ts` with:

```ts
import type { KnowledgeAgentToolResult } from "@/server/services/knowledge-agent/types";

export function buildKnowledgeAgentSystemPrompt(input: {
  knowledgeMap: string;
  attachmentContext: string;
}) {
  return `You are Knowledge Agent, a read-only assistant for knowledge-base organization, analysis, and review.

Scope rules:
- You can inspect only files, knowledgeBase, and all scopes.
- Directory, folder, and path-based reads are unavailable.
- You cannot approve, reject, edit, delete, or persist knowledge. You can only analyze and recommend.

Use tools when the user asks for evidence, comparison, exclusion, aggregation, review suggestions, quality checks, conflict detection, or multi-document analysis.

Available tools:

1. list_knowledge_map
Input: {"scope":{"type":"files","documentIds":["documentSourceId"]},"limit":50}
Input: {"scope":{"type":"knowledgeBase","knowledgeBaseIds":["knowledgeBaseId"]},"limit":50}
Input: {"scope":{"type":"all"},"limit":50}

2. retrieve_files
Input: {"scope":{"type":"files","documentIds":["documentSourceId"]},"mode":"summary","limit":10}
Input: {"scope":{"type":"knowledgeBase","knowledgeBaseIds":["knowledgeBaseId"]},"mode":"chunks","query":"term","limit":10}
Input: {"scope":{"type":"all"},"mode":"full","limit":5}

3. search_chunks
Input: {"scope":{"type":"knowledgeBase","knowledgeBaseIds":["knowledgeBaseId"]},"query":"term","limit":10}
Input: {"scope":{"type":"files","documentIds":["documentSourceId"]},"query":"term","limit":10}
Input: {"scope":{"type":"all"},"query":"term","limit":10}

When you need a tool, output only:
<|Action|> tool_name
<|Action Input|> valid JSON

When you are ready to answer, output:
<|Final|>
Markdown answer

Final answer format:
- Conclusion
- Evidence used
- Findings
- Review or organization suggestions
- Limitations

Global knowledge map:
${input.knowledgeMap}

Attachment context:
${input.attachmentContext || "No attachments in this turn."}`;
}

export function formatToolResultForModel(result: KnowledgeAgentToolResult) {
  return [
    `<|Tool Result|> ${result.toolName}`,
    `ok: ${result.ok}`,
    `returnedCharCount: ${result.returnedCharCount}`,
    `remainingRoundBudget: ${result.remainingRoundBudget}`,
    `remainingTotalBudget: ${result.remainingTotalBudget}`,
    "",
    result.content,
  ].join("\n");
}

export function buildFinalizationPrompt(reason: string) {
  return `The tool loop is ending because: ${reason}

Use only the evidence already provided in the conversation. Produce the final answer now with:
- Conclusion
- Evidence used
- Findings
- Review or organization suggestions
- Limitations`;
}
```

- [ ] **Step 2: Create `tool-loop.ts`**

Create `src/server/services/knowledge-agent/tool-loop.ts` with:

```ts
import type { ChatCitation, ChatKnowledgeFile } from "@/features/chat/chat.types";
import type { LlmInterfaceKey } from "@/features/chat/chat.validation";
import type { LlmMessage } from "@/server/services/agent/llm-client";
import { createChatCompletion } from "@/server/services/agent/llm-client";
import { formatToolResultForModel, buildFinalizationPrompt } from "@/server/services/knowledge-agent/prompts";
import {
  KNOWLEDGE_AGENT_MAX_INVALID_ACTIONS,
  KNOWLEDGE_AGENT_MAX_TOOL_ROUNDS,
  KNOWLEDGE_AGENT_TOTAL_CHAR_BUDGET,
  listKnowledgeMapInputSchema,
  retrieveFilesInputSchema,
  searchChunksInputSchema,
  toolActionNameSchema,
  type KnowledgeAgentBudgetState,
  type ParsedKnowledgeAgentAction,
} from "@/server/services/knowledge-agent/types";
import {
  runListKnowledgeMapTool,
  runRetrieveFilesTool,
  runSearchChunksTool,
} from "@/server/services/knowledge-agent/tools";
import { emitTrace, type ChatStreamEmitter } from "@/server/services/chat/chat-stream";

export async function runKnowledgeAgentToolLoop(input: {
  messages: LlmMessage[];
  llmInterface: LlmInterfaceKey;
  emit: ChatStreamEmitter;
  signal?: AbortSignal;
}) {
  const messages = [...input.messages];
  const budgetState: KnowledgeAgentBudgetState = {
    remainingTotalBudget: KNOWLEDGE_AGENT_TOTAL_CHAR_BUDGET,
  };
  const citations: ChatCitation[] = [];
  const knowledgeFiles: ChatKnowledgeFile[] = [];
  let invalidActions = 0;

  for (let round = 1; round <= KNOWLEDGE_AGENT_MAX_TOOL_ROUNDS; round += 1) {
    emitTrace(input.emit, {
      type: "plan",
      title: `Knowledge Agent round ${round}`,
      detail: "Ask the model whether it needs a read-only tool.",
      status: "running",
    });

    const response = await createChatCompletion(messages, input.llmInterface, {
      signal: input.signal,
    });
    const parsed = parseKnowledgeAgentAction(response);

    if (parsed.kind === "final" || parsed.kind === "message") {
      messages.push({ role: "assistant", content: response });
      messages.push({
        role: "user",
        content: buildFinalizationPrompt("the model indicated it has enough evidence"),
      });
      return {
        messages,
        citations,
        knowledgeFiles,
      };
    }

    const result = await executeAction(parsed, budgetState);
    messages.push({ role: "assistant", content: response });
    messages.push({ role: "user", content: formatToolResultForModel(result) });
    citations.push(...(result.citations ?? []));
    knowledgeFiles.push(...(result.knowledgeFiles ?? []));

    if (!result.ok) {
      invalidActions += 1;
    } else {
      invalidActions = 0;
    }

    if (result.citations?.length || result.knowledgeFiles?.length) {
      emitTrace(input.emit, {
        type: "evidence",
        title: `Tool result: ${result.toolName}`,
        detail: `${result.returnedCharCount} characters returned.`,
        status: "completed",
      });
    }

    if (budgetState.remainingTotalBudget <= 0) {
      messages.push({
        role: "user",
        content: buildFinalizationPrompt("tool context budget exhausted"),
      });
      return {
        messages,
        citations,
        knowledgeFiles,
      };
    }

    if (invalidActions >= KNOWLEDGE_AGENT_MAX_INVALID_ACTIONS) {
      messages.push({
        role: "user",
        content: buildFinalizationPrompt("too many invalid or unavailable tool calls"),
      });
      return {
        messages,
        citations,
        knowledgeFiles,
      };
    }
  }

  messages.push({
    role: "user",
    content: buildFinalizationPrompt("maximum tool rounds reached"),
  });
  return {
    messages,
    citations,
    knowledgeFiles,
  };
}

export function parseKnowledgeAgentAction(text: string): ParsedKnowledgeAgentAction {
  const finalMatch = text.match(/<\|Final\|>\s*([\s\S]*)$/i);
  if (finalMatch) {
    return { kind: "final", content: finalMatch[1].trim() };
  }

  const actionMatch = text.match(/<\|Action\|>\s*([a-zA-Z0-9_-]+)/i);
  if (!actionMatch) {
    return { kind: "message", content: text.trim() };
  }

  const nameResult = toolActionNameSchema.safeParse(actionMatch[1]);
  if (!nameResult.success) {
    return { kind: "message", content: text.trim() };
  }

  const inputMatch = text.match(/<\|Action Input\|>\s*([\s\S]*?)(?:\n\s*<\||$)/i);
  if (!inputMatch) {
    return { kind: "action", name: nameResult.data, input: {} };
  }

  try {
    return {
      kind: "action",
      name: nameResult.data,
      input: JSON.parse(inputMatch[1].trim()) as unknown,
    };
  } catch {
    return { kind: "action", name: nameResult.data, input: inputMatch[1].trim() };
  }
}

async function executeAction(
  action: Extract<ParsedKnowledgeAgentAction, { kind: "action" }>,
  budgetState: KnowledgeAgentBudgetState
) {
  const budget = { budgetState };

  if (action.name === "list_knowledge_map") {
    const parsed = listKnowledgeMapInputSchema.safeParse(action.input);
    if (!parsed.success) {
      return invalidToolResult(action.name, parsed.error.issues[0].message, budgetState);
    }
    return runListKnowledgeMapTool(parsed.data, budget);
  }

  if (action.name === "retrieve_files") {
    const parsed = retrieveFilesInputSchema.safeParse(action.input);
    if (!parsed.success) {
      return invalidToolResult(action.name, parsed.error.issues[0].message, budgetState);
    }
    return runRetrieveFilesTool(parsed.data, budget);
  }

  const parsed = searchChunksInputSchema.safeParse(action.input);
  if (!parsed.success) {
    return invalidToolResult(action.name, parsed.error.issues[0].message, budgetState);
  }
  return runSearchChunksTool(parsed.data, budget);
}

function invalidToolResult(
  toolName: Extract<ParsedKnowledgeAgentAction, { kind: "action" }>["name"],
  message: string,
  budgetState: KnowledgeAgentBudgetState
) {
  return {
    toolName,
    ok: false,
    content: `Invalid tool input: ${message}`,
    returnedCharCount: 0,
    remainingRoundBudget: 0,
    remainingTotalBudget: budgetState.remainingTotalBudget,
  };
}
```

- [ ] **Step 3: Run build**

Run:

```powershell
npm.cmd run build
```

Expected: build succeeds after imports and type issues are corrected.

- [ ] **Step 4: Commit loop and prompts**

Run:

```powershell
git add src/server/services/knowledge-agent/prompts.ts src/server/services/knowledge-agent/tool-loop.ts
git commit -m "feat: add knowledge agent tool loop"
```

Expected: commit contains prompt and loop files.

---

### Task 6: Add Knowledge Agent Executor

**Files:**
- Create: `src/server/services/knowledge-agent/executor.ts`

- [ ] **Step 1: Create `executor.ts`**

Create `src/server/services/knowledge-agent/executor.ts` with:

```ts
import type { ChatCitation, ChatKnowledgeFile } from "@/features/chat/chat.types";
import type { LlmInterfaceKey } from "@/features/chat/chat.validation";
import type { LlmContentPart, LlmMessage } from "@/server/services/agent/llm-client";
import { streamChatCompletion } from "@/server/services/agent/llm-client";
import {
  buildAttachmentImageParts,
  buildAttachmentPromptContext,
} from "@/server/services/chat-attachment.service";
import { mergeRecentMessages } from "@/server/services/chat-conversation.service";
import { emitTrace, type ChatStreamEmitter } from "@/server/services/chat/chat-stream";
import { listKnowledgeMapItems, formatKnowledgeMapItems } from "@/server/services/knowledge-agent/knowledge-map";
import { buildKnowledgeAgentSystemPrompt } from "@/server/services/knowledge-agent/prompts";
import { runKnowledgeAgentToolLoop } from "@/server/services/knowledge-agent/tool-loop";

export type RunKnowledgeAgentInput = {
  userMessage: string;
  attachmentIds?: string[];
  llmInterface?: LlmInterfaceKey;
  recentMessages: LlmMessage[];
  memorySummary: string | null;
  signal?: AbortSignal;
  emit: ChatStreamEmitter;
};

export type RunKnowledgeAgentResult = {
  answer: string;
  knowledgeFiles: ChatKnowledgeFile[];
  citations: ChatCitation[];
};

export async function runKnowledgeAgent(
  input: RunKnowledgeAgentInput
): Promise<RunKnowledgeAgentResult> {
  const [attachmentContext, imageParts, mapItems] = await Promise.all([
    buildAttachmentPromptContext(input.attachmentIds),
    buildAttachmentImageParts(input.attachmentIds),
    listKnowledgeMapItems({ scope: { type: "all" }, limit: 50 }),
  ]);

  emitTrace(input.emit, {
    type: "plan",
    title: "Build knowledge map",
    detail: `${mapItems.length} active parsed document(s) mapped.`,
    status: "completed",
  });

  const baseMessages = attachImagesToCurrentUserMessage(
    mergeRecentMessages(
      [
        {
          role: "system",
          content: buildKnowledgeAgentSystemPrompt({
            knowledgeMap: formatKnowledgeMapItems(mapItems),
            attachmentContext,
          }),
        },
        {
          role: "user",
          content: input.userMessage,
        },
      ],
      input.recentMessages,
      input.memorySummary
    ),
    imageParts
  );

  input.emit("rag-summary", { status: "not-applicable", citationCount: 0 });
  input.emit("citations", []);
  input.emit("status", { status: "organizing" });

  const loopResult = await runKnowledgeAgentToolLoop({
    messages: baseMessages,
    llmInterface: input.llmInterface ?? "openai",
    emit: input.emit,
    signal: input.signal,
  });

  input.emit("status", { status: "generating" });
  emitTrace(input.emit, {
    type: "generation",
    title: "Generate Knowledge Agent answer",
    detail: "Stream the final answer after bounded tool use.",
    status: "running",
  });

  const answer = await streamChatCompletion(
    loopResult.messages,
    (token) => input.emit("token", token),
    input.llmInterface ?? "openai",
    { signal: input.signal }
  );

  const citations = loopResult.citations;
  const knowledgeFiles = dedupeKnowledgeFiles(loopResult.knowledgeFiles);
  input.emit("citations", citations);
  input.emit("knowledge-files", knowledgeFiles);

  return {
    answer,
    citations,
    knowledgeFiles,
  };
}

function attachImagesToCurrentUserMessage(
  messages: LlmMessage[],
  imageParts: LlmContentPart[]
): LlmMessage[] {
  if (imageParts.length === 0) return messages;

  const index = messages.findLastIndex((message) => message.role === "user");
  if (index < 0) return messages;

  return messages.map((message, messageIndex) => {
    if (messageIndex !== index) return message;
    const text = getTextMessageContent(message.content);
    return {
      ...message,
      content: [{ type: "text", text }, ...imageParts],
    };
  });
}

function getTextMessageContent(content: LlmMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter(
      (part): part is Extract<LlmContentPart, { type: "text" }> =>
        part.type === "text"
    )
    .map((part) => part.text)
    .join("\n");
}

function dedupeKnowledgeFiles(files: ChatKnowledgeFile[]) {
  const seen = new Set<string>();
  return files.filter((file) => {
    if (seen.has(file.id)) return false;
    seen.add(file.id);
    return true;
  });
}
```

- [ ] **Step 2: Run build**

Run:

```powershell
npm.cmd run build
```

Expected: build succeeds after any type adjustments.

- [ ] **Step 3: Commit executor**

Run:

```powershell
git add src/server/services/knowledge-agent/executor.ts
git commit -m "feat: add knowledge agent executor"
```

Expected: commit contains only executor file.

---

### Task 7: Migrate Chat Route to New Executor

**Files:**
- Modify: `src/app/api/chat/route.ts`
- Modify or delete: `src/server/services/knowledge-agent-document.service.ts`

- [ ] **Step 1: Import new executor**

In `src/app/api/chat/route.ts`, add:

```ts
import { runKnowledgeAgent } from "@/server/services/knowledge-agent/executor";
```

- [ ] **Step 2: Replace `streamKnowledgeAgentChat` handler body**

Change `runKnowledgeAgent: () => streamKnowledgeAgentChat(...)` to:

```ts
            runKnowledgeAgent: () =>
              runKnowledgeAgent({
                userMessage: parsed.data.message,
                attachmentIds: parsed.data.attachmentIds,
                llmInterface: parsed.data.llmInterface,
                recentMessages,
                memorySummary,
                signal: request.signal,
                emit,
              }),
```

Because the handler property and imported function share a name, alias the import if needed:

```ts
import { runKnowledgeAgent as runKnowledgeAgentExecutor } from "@/server/services/knowledge-agent/executor";
```

Then call `runKnowledgeAgentExecutor(...)`.

- [ ] **Step 3: Remove old inline Knowledge Agent helpers**

Remove the old `streamKnowledgeAgentChat` function from `src/app/api/chat/route.ts`.

Remove these imports if no longer used:

```ts
import {
  buildKnowledgeDocumentMap,
  formatKnowledgeDocumentToolResult,
  retrieveKnowledgeDocuments,
  type KnowledgeFile,
  type KnowledgeDocumentToolInput,
} from "@/server/services/knowledge-agent-document.service";
```

Remove `parseRetrieveFilesAction` if it is no longer used.

- [ ] **Step 4: Keep usage logging compatible**

`reportKnowledgeAgentUsage` currently uses `KnowledgeFile[]`. If the old type import is removed, define local input using existing chat type:

```ts
import type { ChatKnowledgeFile } from "@/features/chat/chat.types";
```

Then change:

```ts
knowledgeFiles: KnowledgeFile[];
```

to:

```ts
knowledgeFiles: ChatKnowledgeFile[];
```

- [ ] **Step 5: Convert old service to compatibility wrapper**

If no imports remain, delete `src/server/services/knowledge-agent-document.service.ts`.

If imports remain during transition, replace the file with:

```ts
export {
  formatKnowledgeMapItems as formatKnowledgeDocumentToolResult,
  listKnowledgeMapItems as buildKnowledgeDocumentMap,
} from "@/server/services/knowledge-agent/knowledge-map";
```

Prefer deletion if `rg "knowledge-agent-document.service"` returns no references.

- [ ] **Step 6: Run reference search**

Run:

```powershell
rg "knowledge-agent-document.service|parseRetrieveFilesAction|streamKnowledgeAgentChat" src
```

Expected: no results for removed symbols.

- [ ] **Step 7: Run build**

Run:

```powershell
npm.cmd run build
```

Expected: build succeeds.

- [ ] **Step 8: Commit route migration**

Run:

```powershell
git add src/app/api/chat/route.ts src/server/services/knowledge-agent-document.service.ts
git commit -m "feat: migrate knowledge agent chat executor"
```

If the old service file was deleted, use:

```powershell
git add src/app/api/chat/route.ts
git add -u src/server/services/knowledge-agent-document.service.ts
git commit -m "feat: migrate knowledge agent chat executor"
```

Expected: commit contains chat route migration and old-service cleanup only.

---

### Task 8: Add Manual Backfill Verification Path

**Files:**
- Create: `src/app/api/documents/knowledge-map/backfill/route.ts`

- [ ] **Step 1: Create backfill route**

Create `src/app/api/documents/knowledge-map/backfill/route.ts`:

```ts
import { NextResponse } from "next/server";
import { backfillDocumentKnowledgeMaps } from "@/server/services/knowledge-agent/knowledge-map";

export async function POST() {
  const result = await backfillDocumentKnowledgeMaps(50);
  return NextResponse.json({ success: true, data: result });
}
```

- [ ] **Step 2: Run build**

Run:

```powershell
npm.cmd run build
```

Expected: build succeeds.

- [ ] **Step 3: Manually verify backfill route**

Run the dev server:

```powershell
npm.cmd run dev
```

In a second terminal:

```powershell
curl.exe --noproxy "*" -X POST http://127.0.0.1:3000/api/documents/knowledge-map/backfill
```

Expected JSON:

```json
{
  "success": true,
  "data": {
    "total": 0,
    "succeeded": 0,
    "results": []
  }
}
```

`total` and `succeeded` may be greater than zero if parsed documents exist.

- [ ] **Step 4: Commit verification route**

Run:

```powershell
git add src/app/api/documents/knowledge-map/backfill/route.ts
git commit -m "feat: add knowledge map backfill endpoint"
```

Expected: commit contains only the backfill route.

---

### Task 9: Final Validation

**Files:**
- No planned file changes.

- [ ] **Step 1: Run build**

Run:

```powershell
npm.cmd run build
```

Expected: build succeeds.

- [ ] **Step 2: Run lint**

Run:

```powershell
npm.cmd run lint
```

Expected: lint succeeds. If existing unrelated lint failures appear, record them and do not broaden this feature's scope.

- [ ] **Step 3: Start dev server**

Run:

```powershell
npm.cmd run dev
```

Expected output includes:

```text
Ready
```

- [ ] **Step 4: Manual Knowledge Agent API smoke test**

Use an existing conversation request shape and `chatMode: "knowledge-agent"`:

```powershell
curl.exe --noproxy "*" -N -X POST http://127.0.0.1:3000/api/chat `
  -H "Content-Type: application/json" `
  -d "{\"message\":\"请盘点当前知识库有哪些文档可以用于审核，并指出明显风险。\",\"chatMode\":\"knowledge-agent\",\"llmInterface\":\"openai\"}"
```

Expected SSE events:

```text
event: meta
event: status
event: trace
event: token
event: done
```

If LLM environment variables are not configured, expected failure is an SSE `error` event describing the missing key/model. That validates routing but not generation.

- [ ] **Step 5: Inspect final git status**

Run:

```powershell
git status --short
```

Expected: no unstaged implementation changes. The user-provided review file may remain untracked if intentionally excluded:

```text
?? docs/superpowers/specs/2026-06-05-knowledge-agent-upgrade-design-review.md
```

---

## Self-Review Notes

- Spec coverage: tasks cover schema, rule-based maps, active/parsed filtering, files/knowledgeBase/all scopes, `search_chunks` knowledge-base relation resolution, budgeted tool loop, streaming final answer, route migration, and validation.
- Scope boundary: directory/path retrieval and write operations are explicitly absent from the plan.
- Provider boundary: native tool calling is not required; the plan uses provider-neutral text actions.
- Testing boundary: no new test framework is introduced because this repository has no test script.
