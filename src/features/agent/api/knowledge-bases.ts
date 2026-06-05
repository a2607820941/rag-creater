export type AgentKnowledgeBaseOption = {
  id: string;
  name: string;
  description: string;
  documentCount: number;
  chunkCount: number;
  status: "active" | "disabled";
};

type KnowledgeBaseListResponse = {
  success: boolean;
  data?: unknown;
  error?: {
    message?: string;
  };
  message?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toStringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function toNumberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toStatus(value: unknown): AgentKnowledgeBaseOption["status"] {
  return value === "disabled" ? "disabled" : "active";
}

function normalizeKnowledgeBaseOption(
  input: unknown
): AgentKnowledgeBaseOption {
  const item = isRecord(input) ? input : {};

  return {
    id: toStringValue(item.id),
    name: toStringValue(item.name, "未命名知识库"),
    description: toStringValue(item.description, "暂无描述"),
    documentCount: toNumberValue(item.documentCount),
    chunkCount: toNumberValue(item.chunkCount),
    status: toStatus(item.status),
  };
}

export async function fetchActiveKnowledgeBaseOptions(
  signal?: AbortSignal
): Promise<AgentKnowledgeBaseOption[]> {
  const response = await fetch(
    "/api/rag-management/knowledge-bases?status=active",
    {
      headers: { Accept: "application/json" },
      signal,
    }
  );
  const json = (await response.json()) as KnowledgeBaseListResponse;

  if (!response.ok || !json.success || !Array.isArray(json.data)) {
    throw new Error(
      json.error?.message || json.message || "知识库列表加载失败"
    );
  }

  return json.data
    .map(normalizeKnowledgeBaseOption)
    .filter((item) => item.id);
}
