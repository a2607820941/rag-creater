import {
  createNoteService,
  listNotesService,
} from "@/features/note/server/note-service";
import { createNoteSchema } from "@/features/note/server/schemas";
import { handleRouteError, successResponse } from "@/lib/api-response";

export async function GET() {
  try {
    const notes = await listNotesService();
    return successResponse(notes);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = createNoteSchema.parse(body);
    const note = await createNoteService(input);
    return successResponse(note, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
