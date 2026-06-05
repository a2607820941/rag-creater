import {
  deleteDocumentSourceService,
  type DeleteDocumentMode,
  getDocumentDetailService,
  updateDocumentSourceService,
} from "@/server/services/document.service";
import {
  idParamsSchema,
  updateDocumentSourceSchema,
} from "@/features/knowledge-bases/server/schemas";
import { handleRouteError, successResponse } from "@/lib/api-response";
import { z } from "zod";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const deleteDocumentBodySchema = z.object({
  mode: z.enum(["cascade", "reference-only"]).optional().default("cascade"),
  knowledgeBaseId: z.string().optional(),
});

export async function GET(_request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const data = await getDocumentDetailService(params.id);

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const input = updateDocumentSourceSchema.parse(await request.json());
    const data = await updateDocumentSourceService(params.id, input);

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const body = deleteDocumentBodySchema.parse(await request.json().catch(() => ({})));
    const data = await deleteDocumentSourceService(params.id, {
      mode: body.mode as DeleteDocumentMode,
      knowledgeBaseId: body.knowledgeBaseId,
    });

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
