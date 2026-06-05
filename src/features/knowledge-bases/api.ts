// 兼容直接返回数据和统一响应格式 { success, data } 的接口响应。
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

// 获取知识库列表，用于 RAG 管理页初始化和刷新列表。
export async function fetchRagItems() {
  const response = await fetch("/api/rag-management/knowledge-bases", {
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

// 创建知识库，payload 由调用方按后端 schema 组装。
export async function createKnowledgeBase(payload: unknown) {
  const response = await fetch("/api/rag-management/knowledge-bases", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to create knowledge base: ${response.status}`);
  }

  return readApiData<unknown>(response);
}

// 获取单个知识库详情树，包含关联文档和知识分片。
export async function fetchRagDetail(id: string) {
  const response = await fetch(`/api/knowledge-bases/${id}/tree?_t=${Date.now()}`, {
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

// 更新指定知识库的基础信息、检索参数或启用状态。
export async function updateKnowledgeBase(id: string, payload: unknown) {
  const response = await fetch(`/api/rag-management/knowledge-bases/${id}`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to update knowledge base: ${response.status}`);
  }

  return readApiData<unknown>(response);
}

// 删除指定知识库，并返回后端删除操作结果。
export async function deleteKnowledgeBase(id: string) {
  const response = await fetch(`/api/rag-management/knowledge-bases/${id}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to delete knowledge base: ${response.status}`);
  }

  return readApiData<unknown>(response);
}

// 创建知识文档，并可同时提交解析后的文本分片。
export async function createKnowledgeDocument(payload: unknown) {
  const response = await fetch("/api/rag-management/documents", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to create document: ${response.status}`);
  }

  return readApiData<unknown>(response);
}

// 删除指定知识文档，后端负责清理关联关系和分片。
// mode: "cascade" = 软删除文档和所有分片（可恢复），"reference-only" = 仅解除引用保留知识条目
export async function deleteKnowledgeDocument(
  id: string,
  options?: { mode?: "cascade" | "reference-only"; knowledgeBaseId?: string }
) {
  const response = await fetch(`/api/rag-management/documents/${id}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: options?.mode ?? "cascade",
      knowledgeBaseId: options?.knowledgeBaseId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to delete document: ${response.status}`);
  }

  return readApiData<unknown>(response);
}

// 恢复已软删除的知识文档及其关联分片。
export async function restoreKnowledgeDocument(id: string) {
  const response = await fetch(
    `/api/rag-management/documents/${id}/restore`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to restore document: ${response.status}`);
  }

  return readApiData<unknown>(response);
}

// 获取已删除的文档列表
export async function fetchDeletedDocuments() {
  const response = await fetch(
    "/api/rag-management/documents?includeDeleted=true&activeStatus=all&status=all",
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch deleted documents: ${response.status}`);
  }

  return readApiData<unknown>(response);
}

// 获取指定文档下的知识分片列表。
export async function fetchDocumentChunks(params: { documentId: string }) {
  const response = await fetch(
    `/api/rag-management/documents/${params.documentId}/chunks`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch document chunks: ${response.status}`);
  }

  return readApiData<unknown>(response);
}

export async function fetchKnowledgeSourceDocuments() {
  const response = await fetch(
    "/api/rag-management/documents?status=parsed&activeStatus=active",
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch source documents: ${response.status}`);
  }

  return readApiData<unknown>(response);
}

export async function bindKnowledgeBaseDocuments(
  knowledgeBaseId: string,
  documentIds: string[]
) {
  const response = await fetch(
    `/api/rag-management/knowledge-bases/${knowledgeBaseId}/documents`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ documentIds }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to bind documents: ${response.status}`);
  }

  return readApiData<unknown>(response);
}

export async function unbindKnowledgeBaseDocuments(
  knowledgeBaseId: string,
  documentIds: string[]
) {
  const response = await fetch(
    `/api/rag-management/knowledge-bases/${knowledgeBaseId}/documents`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ documentIds }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to unbind documents: ${response.status}`);
  }

  return readApiData<unknown>(response);
}
