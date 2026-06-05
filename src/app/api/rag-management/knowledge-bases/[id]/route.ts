import {
  deleteKnowledgeBaseService,
  updateKnowledgeBaseService,
} from "@/features/knowledge-bases/server/knowledge-base-service";
import {
  idParamsSchema,
  updateKnowledgeBaseSchema,
} from "@/features/knowledge-bases/server/schemas";
import { handleRouteError, successResponse } from "@/lib/api-response";

type RouteContext = {
  params: Promise<{ id: string }>;
};
// 更新指定知识库;
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const body = await request.json();
    const input = updateKnowledgeBaseSchema.parse(body);
    const data = await updateKnowledgeBaseService(params.id, input);

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
// 删除指定知识库;
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const data = await deleteKnowledgeBaseService(params.id);

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
