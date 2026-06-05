import { getKnowledgeBaseTreeService } from "@/features/knowledge-bases/server/knowledge-base-service";
import { idParamsSchema } from "@/features/knowledge-bases/server/schemas";
import { handleRouteError, successResponse } from "@/lib/api-response";

type RouteContext = {
  params: Promise<{ id: string }>;
};
// 获取知识库详情树，包含知识库基础信息、关联文档和文档分片。
export async function GET(_request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const data = await getKnowledgeBaseTreeService(params.id);

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
