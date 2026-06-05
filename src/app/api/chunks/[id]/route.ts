import {
  deleteChunkService,
  updateChunkService,
} from "@/features/knowledge-bases/server/knowledge-chunk-service";
import { idParamsSchema } from "@/features/knowledge-bases/server/schemas";
import { handleRouteError, successResponse } from "@/lib/api-response";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// 更新单个分片内容
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const body = await request.json();
    const data = await updateChunkService(params.id, {
      content: body.content,
    });

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

// 删除单个知识分片。
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const data = await deleteChunkService(params.id);

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
