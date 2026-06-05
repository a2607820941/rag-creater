import { z } from "zod";

import {
  AGENT_CHUNK_TYPES,
  AGENT_KNOWLEDGE_SCOPE_MODES,
  type AgentKnowledgeScope,
  type RagRetrieveScope,
} from "./agent.types";

const idListSchema = z
  .array(z.string().trim().min(1))
  .default([])
  .transform((values) => Array.from(new Set(values)));

export const agentChunkTypeSchema = z.enum(AGENT_CHUNK_TYPES);

export const agentKnowledgeScopeSchema = z.object({
  mode: z.enum(AGENT_KNOWLEDGE_SCOPE_MODES).default("all"),
  knowledgeBaseIds: idListSchema,
  categoryIds: idListSchema,
  tagIds: idListSchema,
  knowledgeIds: idListSchema,
  chunkTypes: z
    .array(agentChunkTypeSchema)
    .default([])
    .transform((values) => Array.from(new Set(values))),
});

export const ragRetrieveScopeSchema = z.object({
  knowledgeBaseIds: z.array(z.string().trim().min(1)).min(1),
  knowledgeIds: z.array(z.string().trim().min(1)).optional(),
  categoryIds: z.array(z.string().trim().min(1)).optional(),
  tagIds: z.array(z.string().trim().min(1)).optional(),
  chunkTypes: z.array(agentChunkTypeSchema).optional(),
});

export const agentIdSchema = z.object({
  id: z.string().trim().min(1, "Agent ID 不能为空"),
});

export const agentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["draft", "active", "disabled"]).optional(),
  keyword: z.string().trim().optional(),
});

export const agentCreateSchema = z.object({
  name: z.string().trim().min(1, "Agent 名称不能为空").max(80),
  description: z.string().trim().max(500).optional(),
  answerStyle: z.string().trim().min(1).max(40).default("strict"),
  knowledgeScope: agentKnowledgeScopeSchema.default({
    mode: "all",
    knowledgeBaseIds: [],
    categoryIds: [],
    tagIds: [],
    knowledgeIds: [],
    chunkTypes: [],
  }),
  showReferences: z.boolean().default(true),
  allowKnowledgeCapture: z.boolean().default(false),
  status: z.enum(["draft", "active", "disabled"]).default("draft"),
  systemPrompt: z.string().trim().max(8000).optional(),
});

export const agentUpdateSchema = z.object({
  name: z.string().trim().min(1, "Agent 名称不能为空").max(80).optional(),
  description: z.string().trim().max(500).optional(),
  answerStyle: z.string().trim().min(1).max(40).optional(),
  knowledgeScope: agentKnowledgeScopeSchema.optional(),
  showReferences: z.boolean().optional(),
  allowKnowledgeCapture: z.boolean().optional(),
  status: z.enum(["draft", "active", "disabled"]).optional(),
  systemPrompt: z.string().trim().max(8000).optional(),
});

export type AgentCreateInput = z.infer<typeof agentCreateSchema>;
export type AgentUpdateInput = z.infer<typeof agentUpdateSchema>;
export type AgentListQuery = z.infer<typeof agentListQuerySchema>;

export const DEFAULT_AGENT_KNOWLEDGE_SCOPE: AgentKnowledgeScope = {
  mode: "all",
  knowledgeBaseIds: [],
  categoryIds: [],
  tagIds: [],
  knowledgeIds: [],
  chunkTypes: [],
};

export function parseAgentKnowledgeScope(
  value: unknown
): AgentKnowledgeScope {
  const rawValue =
    typeof value === "string" && value.trim().length > 0
      ? safeJsonParse(value)
      : value;

  const parsed = agentKnowledgeScopeSchema.safeParse(rawValue);
  return parsed.success ? parsed.data : DEFAULT_AGENT_KNOWLEDGE_SCOPE;
}

export function stringifyAgentKnowledgeScope(
  scope: AgentKnowledgeScope
): string {
  return JSON.stringify(agentKnowledgeScopeSchema.parse(scope));
}

export function toRagRetrieveScope(
  scope: AgentKnowledgeScope
): RagRetrieveScope {
  const normalized = agentKnowledgeScopeSchema.parse(scope);
  const ragScope: RagRetrieveScope = {
    knowledgeBaseIds: normalized.knowledgeBaseIds,
  };

  if (normalized.knowledgeIds.length > 0) {
    ragScope.knowledgeIds = normalized.knowledgeIds;
  }
  if (normalized.categoryIds.length > 0) {
    ragScope.categoryIds = normalized.categoryIds;
  }
  if (normalized.tagIds.length > 0) {
    ragScope.tagIds = normalized.tagIds;
  }
  if (normalized.chunkTypes.length > 0) {
    ragScope.chunkTypes = normalized.chunkTypes;
  }

  return ragRetrieveScopeSchema.parse(ragScope);
}

export function canConvertToRagRetrieveScope(
  scope: AgentKnowledgeScope
): boolean {
  return ragRetrieveScopeSchema.safeParse(toOptionalRagRetrieveScope(scope))
    .success;
}

function toOptionalRagRetrieveScope(
  scope: AgentKnowledgeScope
): Partial<RagRetrieveScope> {
  const normalized = agentKnowledgeScopeSchema.parse(scope);
  const ragScope: Partial<RagRetrieveScope> = {
    knowledgeBaseIds: normalized.knowledgeBaseIds,
  };

  if (normalized.knowledgeIds.length > 0) {
    ragScope.knowledgeIds = normalized.knowledgeIds;
  }
  if (normalized.categoryIds.length > 0) {
    ragScope.categoryIds = normalized.categoryIds;
  }
  if (normalized.tagIds.length > 0) {
    ragScope.tagIds = normalized.tagIds;
  }
  if (normalized.chunkTypes.length > 0) {
    ragScope.chunkTypes = normalized.chunkTypes;
  }

  return ragScope;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
