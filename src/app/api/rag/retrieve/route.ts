import { NextRequest, NextResponse } from "next/server";

import { ragRetrieveRequestSchema } from "@/features/rag/rag.validation";
import { retrieveRagContexts } from "@/server/services/rag/retriever";

// App Router Route Handler：这里只负责 HTTP 入参校验和响应包装，检索逻辑放在 server/services/rag。
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ragRetrieveRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0].message,
          },
        },
        { status: 400 }
      );
    }

    const result = await retrieveRagContexts(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to retrieve RAG contexts";

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message,
        },
      },
      { status: 500 }
    );
  }
}
