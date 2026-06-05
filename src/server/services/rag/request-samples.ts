import type { RagRetrieveRequest } from "@/features/rag/types";

// 每次调整检索逻辑后，优先用这条请求做最小冒烟验证。
export const smokeTestRetrieveRequest: RagRetrieveRequest = {
  query: "如何给成员配置管理员权限？",
  scope: {
    knowledgeBaseIds: ["kb_001"],
  },
  mode: "balanced",
};
