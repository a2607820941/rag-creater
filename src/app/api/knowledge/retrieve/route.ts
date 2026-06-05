import { NextRequest, NextResponse } from "next/server";

import { ragRetrieveRequestSchema } from "@/features/rag/rag.validation";
import { retrieveRagContexts } from "@/server/services/rag/retriever";

/**
 * 知识候选召回 API，作为业务侧入口薄封装现有 RAG 检索链路。
 */
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
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
      error instanceof Error
        ? error.message
        : "Failed to retrieve knowledge contexts";

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
