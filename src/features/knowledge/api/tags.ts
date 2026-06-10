/**
 * 标签前端请求封装，向组件提供稳定的标签 CRUD 调用方法。
 */

import type {
  KnowledgeTagDto,
  KnowledgeTagFormValues,
} from "@/features/knowledge/types";

/** API 成功响应的通用结构。 */
type ApiSuccess<T> = {
  success: true;
  data: T;
};

/** API 失败响应的通用结构。 */
type ApiFailure = {
  success: false;
  error?: {
    code?: string;
    message?: string;
  };
};

/** API 响应的联合类型，用于请求封装做成功/失败收窄。 */
type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** 标签列表查询参数。 */
export type TagListParams = {
  keyword?: string;
  scope?: "all" | "rag";
};

/** 拉取标签列表。 */
export async function fetchTags(
  params: TagListParams = {}
): Promise<KnowledgeTagDto[]> {
  const searchParams = new URLSearchParams();
  if (params.keyword) searchParams.set("keyword", params.keyword);
  if (params.scope) searchParams.set("scope", params.scope);

  const queryString = searchParams.toString();
  return requestJson<KnowledgeTagDto[]>(
    `/api/tags${queryString ? `?${queryString}` : ""}`
  );
}

/** 创建标签。 */
export async function createTag(
  input: KnowledgeTagFormValues
): Promise<KnowledgeTagDto> {
  return requestJson<KnowledgeTagDto>("/api/tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** 删除标签。 */
export async function deleteTag(id: string): Promise<KnowledgeTagDto> {
  return requestJson<KnowledgeTagDto>(`/api/tags/${id}`, {
    method: "DELETE",
  });
}

/** 统一处理标签 API 的成功和错误响应。 */
async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, init);
  const json = (await response.json()) as ApiResponse<T>;

  if (!json.success) {
    throw new Error(json.error?.message ?? "标签请求失败");
  }

  if (!response.ok) {
    throw new Error("标签请求失败");
  }

  return json.data;
}
