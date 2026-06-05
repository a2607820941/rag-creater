import { NextRequest, NextResponse } from "next/server";

import { runPublishedSkill } from "@/server/services/skill/skill.service";
import {
  skillRunSchema,
  skillSlugSchema,
} from "@/features/skill/skill.validation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const slugParsed = skillSlugSchema.safeParse(await params);
    if (!slugParsed.success) {
      return validationError("Invalid skill slug");
    }

    const body = await request.json();
    const parsed = skillRunSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed.error.issues[0].message);
    }

    const result = await runPublishedSkill(
      slugParsed.data.slug,
      getBearerToken(request),
      parsed.data
    );
    if (!result) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Published skill not found" },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Invalid API key" } },
        { status: 401 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to run skill";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

function getBearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function validationError(message: string) {
  return NextResponse.json(
    { success: false, error: { code: "VALIDATION_ERROR", message } },
    { status: 400 }
  );
}
