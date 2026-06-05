import { searchKnowledgeBaseKeywordsService } from "@/features/knowledge-bases/server/knowledge-search-service";
import {
  idParamsSchema,
  knowledgeBaseKeywordSearchQuerySchema,
} from "@/features/knowledge-bases/server/schemas";
import { handleRouteError, successResponse } from "@/lib/api-response";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// 在指定知识库内执行轻量关键词搜索，不走 RAG/向量检索。
export async function GET(request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const url = new URL(request.url);
    const query = knowledgeBaseKeywordSearchQuerySchema.parse({
      keyword: url.searchParams.get("keyword") ?? "",
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const data = await searchKnowledgeBaseKeywordsService(params.id, query);

    return successResponse({
      keyword: query.keyword,
      total: data.length,
      results: data,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
