import {
  createDocumentSourceService,
  getDocumentListService,
} from "@/server/services/document.service";
import {
  createDocumentSourceSchema,
  documentListQuerySchema,
} from "@/features/knowledge-bases/server/schemas";
import { handleRouteError, successResponse } from "@/lib/api-response";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = documentListQuerySchema.parse({
      keyword: url.searchParams.get("keyword") ?? undefined,
      sourceType: url.searchParams.get("sourceType") ?? undefined,
      activeStatus: url.searchParams.get("activeStatus") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      includeDeleted: url.searchParams.get("includeDeleted") ?? undefined,
    });

    const data = await getDocumentListService(query);
    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = createDocumentSourceSchema.parse(await request.json());
    const data = await createDocumentSourceService(input);

    return successResponse(data, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
