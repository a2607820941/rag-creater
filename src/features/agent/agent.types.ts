export const AGENT_KNOWLEDGE_SCOPE_MODES = [
  "all",
  "knowledgeBases",
  "categories",
  "tags",
  "knowledgeItems",
] as const;

export const AGENT_CHUNK_TYPES = ["text", "wiki", "summary", "qa"] as const;

export type AgentKnowledgeScopeMode =
  (typeof AGENT_KNOWLEDGE_SCOPE_MODES)[number];

export type AgentChunkType = (typeof AGENT_CHUNK_TYPES)[number];

export type AgentKnowledgeScope = {
  mode: AgentKnowledgeScopeMode;
  knowledgeBaseIds: string[];
  categoryIds: string[];
  tagIds: string[];
  knowledgeIds: string[];
  chunkTypes: AgentChunkType[];
};

export type RagRetrieveScope = {
  knowledgeBaseIds: string[];
  knowledgeIds?: string[];
  categoryIds?: string[];
  tagIds?: string[];
  chunkTypes?: AgentChunkType[];
};

export type RagRetrieveMode = "fast" | "balanced" | "detailed";

export type RagRetrieveRequest = {
  query: string;
  scope: RagRetrieveScope;
  mode?: RagRetrieveMode;
};
