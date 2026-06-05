/**
 * RAG 模块对外字段契约。
 *
 * 这里的类型要尽量和 docs/知识入库字段建议以及请求检索接口对接文档.md 保持一致。
 * 检索算法、向量库、rerank 等内部实现可以替换，但不要随意改这些对接字段。
 */
export type KnowledgeChunkStatus = "pending" | "available" | "disabled";

export type KnowledgeSourceType = "manual" | "file" | "wiki" | "import";

export type KnowledgeChunkType = "text" | "wiki" | "summary" | "qa";

export type RetrievalMode = "fast" | "balanced" | "detailed";

/** 入库侧提供给 RAG 检索模块消费的最小知识片段。 */
export type KnowledgeChunk = {
  id: string;
  knowledgeBaseId: string;
  knowledgeId: string;
  title: string;
  content: string;
  summary?: string;
  categoryId?: string;
  tagIds?: string[];
  status: KnowledgeChunkStatus;
  sourceType: KnowledgeSourceType;
  chunkType: KnowledgeChunkType;
  chunkIndex: number;
  parentChunkId?: string;
  prevChunkId?: string;
  nextChunkId?: string;
  sourceChunkIds?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

/** Agent 或问答模块传入的检索范围。 */
export type RagRetrieveScope = {
  knowledgeBaseIds: string[];
  knowledgeIds?: string[];
  categoryIds?: string[];
  tagIds?: string[];
  chunkTypes?: KnowledgeChunkType[];
};

/** /api/rag/retrieve 的请求体。 */
export type RagRetrieveRequest = {
  query: string;
  scope: RagRetrieveScope;
  mode?: RetrievalMode;
};

/** 单条可交给 LLM 参考的结构化上下文。 */
export type RagContext = {
  id: string;
  knowledgeBaseId: string;
  knowledgeId: string;
  chunkId: string;
  title: string;
  content: string;
  chunkType: KnowledgeChunkType;
  score: number;
  categoryId?: string;
  tagIds?: string[];
  metadata?: Record<string, unknown>;
};

/** 引用来源，refId 必须能对应 llmContext 中的 [ref_n]。 */
export type RagReference = {
  refId: string;
  knowledgeBaseId: string;
  knowledgeId: string;
  chunkId: string;
  title: string;
  chunkType: KnowledgeChunkType;
};

export type RagRetrieveMetrics = {
  fallback: boolean;
  fallbackReason?: "below_min_score_but_keep_top1" | "no_relevant_context";
  minScore: number;
  fallbackTop1Score: number;
  beforeMinScoreCount: number;
  afterMinScoreCount: number;
  topScore?: number;
};

/** /api/rag/retrieve 的响应体。 */
export type RagRetrieveResponse = {
  query: string;
  contexts: RagContext[];
  llmContext: string;
  references: RagReference[];
  metrics?: RagRetrieveMetrics;
};
