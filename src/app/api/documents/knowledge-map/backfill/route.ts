import { NextResponse } from "next/server";

import { backfillDocumentKnowledgeMaps } from "@/server/services/knowledge-agent/knowledge-map";

export async function POST() {
  const result = await backfillDocumentKnowledgeMaps(50);
  return NextResponse.json({ success: true, data: result });
}
