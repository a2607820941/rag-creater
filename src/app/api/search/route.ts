import { NextRequest, NextResponse } from "next/server";

import { semanticSearch } from "@/lib/vector-search";
import { searchQuerySchema } from "@/features/rag/rag.validation";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = searchQuerySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0].message,
          },
        },
        { status: 400 },
      );
    }

    const { query, topK } = parsed.data;
    const results = await semanticSearch(query, topK);

    return NextResponse.json({
      success: true,
      data: {
        query,
        total: results.length,
        results,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Search failed";
    return NextResponse.json(
      {
        success: false,
        error: { code: "SEARCH_ERROR", message },
      },
      { status: 500 },
    );
  }
}
