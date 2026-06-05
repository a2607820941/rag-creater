import {
  deleteNoteService,
  getNoteDetailService,
  updateNoteService,
} from "@/features/note/server/note-service";
import {
  noteIdSchema,
  updateNoteSchema,
} from "@/features/note/server/schemas";
import { handleRouteError, successResponse } from "@/lib/api-response";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function parseId(context: RouteContext) {
  const params = await context.params;
  return noteIdSchema.parse(params).id;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const id = await parseId(context);
    const note = await getNoteDetailService(id);
    return successResponse(note);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const id = await parseId(context);
    const body = await request.json();
    const input = updateNoteSchema.parse(body);
    const note = await updateNoteService(id, input);
    return successResponse(note);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const id = await parseId(context);
    const result = await deleteNoteService(id);
    return successResponse(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
