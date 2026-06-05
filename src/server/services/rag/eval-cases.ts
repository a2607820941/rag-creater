import type { RagRetrieveRequest } from "@/features/rag/types";

export type RetrievalEvalCase = RagRetrieveRequest & {
  id: string;
  expectedChunkIds?: string[];
  expectedKnowledgeIds?: string[];
};

export const ragEvalCases: RetrievalEvalCase[] = [
  {
    id: "permission_admin_role",
    query: "如何给成员配置管理员权限？",
    scope: {
      knowledgeBaseIds: ["kb_001"],
    },
    mode: "balanced",
    expectedChunkIds: ["chunk_wiki_001", "chunk_doc_001"],
  },
  {
    id: "permission_admin_only_actions",
    query: "普通成员可以删除知识库吗？",
    scope: {
      knowledgeBaseIds: ["kb_001"],
    },
    mode: "balanced",
    expectedChunkIds: ["chunk_doc_002"],
  },
  {
    id: "rag_development_route",
    query: "RAG 初版应该怎么开发？",
    scope: {
      knowledgeBaseIds: ["kb_rag"],
    },
    mode: "balanced",
    expectedChunkIds: ["chunk_rag_001"],
  },
  {
    id: "permission_category_filter",
    query: "权限管理在哪里设置？",
    scope: {
      knowledgeBaseIds: ["kb_001"],
      categoryIds: ["cat_permission"],
    },
    mode: "balanced",
    expectedKnowledgeIds: ["wiki_001", "doc_001"],
  },
  {
    id: "wiki_chunk_type_filter",
    query: "账号权限配置说明",
    scope: {
      knowledgeBaseIds: ["kb_001"],
      chunkTypes: ["wiki"],
    },
    mode: "balanced",
    expectedChunkIds: ["chunk_wiki_001"],
  },
];
