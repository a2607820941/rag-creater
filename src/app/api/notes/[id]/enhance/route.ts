import { enhanceNoteService } from "@/features/note/server/note-enhancement-service";
import {
  enhanceNoteSchema,
  noteIdSchema,
} from "@/features/note/server/schemas";
import { handleRouteError, successResponse } from "@/lib/api-response";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function parseId(context: RouteContext) {
  const params = await context.params;
  return noteIdSchema.parse(params).id;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const id = await parseId(context);
    const body = await request.json();
    const input = enhanceNoteSchema.parse(body);
    const result = await enhanceNoteService(id, input);
    return successResponse(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
