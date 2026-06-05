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
  z
    .object({
      type: z.literal("all"),
    })
    .strict(),
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
