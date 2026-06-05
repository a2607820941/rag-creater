import {
  getDocumentChunksService,
  replaceDocumentChunksService,
} from "@/server/services/document.service";
import {
  idParamsSchema,
  replaceDocumentChunksSchema,
} from "@/features/knowledge-bases/server/schemas";
import { handleRouteError, successResponse } from "@/lib/api-response";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const data = await getDocumentChunksService(params.id);

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const body = replaceDocumentChunksSchema.parse(await request.json());
    const data = await replaceDocumentChunksService(params.id, body.chunks);

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
