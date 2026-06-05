import { z } from "zod";

import { agentChunkTypeSchema, ragRetrieveScopeSchema } from "@/features/agent/agent.validation";

// Mirrors RagReference from B's POST /api/rag/retrieve contract.
export const ragReferenceSchema = z.object({
  knowledgeBaseId: z.string().trim().min(1),
  knowledgeId: z.string().trim().min(1),
  chunkId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  chunkType: agentChunkTypeSchema,
});

// Mirrors RagContext from B's POST /api/rag/retrieve contract.
export const ragContextSchema = z.object({
  id: z.string().trim().min(1),
  knowledgeBaseId: z.string().trim().min(1),
  knowledgeId: z.string().trim().min(1),
  chunkId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  content: z.string(),
  chunkType: agentChunkTypeSchema,
  score: z.number(),
  categoryId: z.string().trim().min(1).optional(),
  tagIds: z.array(z.string().trim().min(1)).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Usage logs are created after a RAG retrieve call so analytics can aggregate
// hot knowledge and no-hit questions without changing B's retrieve endpoint.
export const usageLogCreateSchema = z.object({
  query: z.string().trim().min(1, "检索问题不能为空"),
  scope: ragRetrieveScopeSchema,
  mode: z.enum(["fast", "balanced", "detailed"]).default("balanced"),
  contexts: z.array(ragContextSchema).default([]),
  references: z.array(ragReferenceSchema).default([]),
});

export type UsageLogCreateInput = z.infer<typeof usageLogCreateSchema>;
