import {
  createKnowledgeBaseService,
  getKnowledgeBaseListService,
} from "@/features/knowledge-bases/server/knowledge-base-service";
import {
  createKnowledgeBaseSchema,
  knowledgeBaseListQuerySchema,
} from "@/features/knowledge-bases/server/schemas";
import { handleRouteError, successResponse } from "@/lib/api-response";
// 获取知识库列表;
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = knowledgeBaseListQuerySchema.parse({
      keyword: url.searchParams.get("keyword") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });

    const data = await getKnowledgeBaseListService(query);
    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
// 创建知识库;
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = createKnowledgeBaseSchema.parse(body);
    const data = await createKnowledgeBaseService(input);

    return successResponse(data, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
