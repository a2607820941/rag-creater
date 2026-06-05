import { NextRequest, NextResponse } from "next/server";

import { getPublishedSkillManifest } from "@/server/services/skill/skill.service";
import { skillSlugSchema } from "@/features/skill/skill.validation";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const parsed = skillSlugSchema.safeParse(await params);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Invalid skill slug" } },
        { status: 400 }
      );
    }

    const manifest = await getPublishedSkillManifest(
      parsed.data.slug,
      request.nextUrl.origin
    );
    if (!manifest) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Published skill not found" },
        },
        { status: 404 }
      );
    }

    return NextResponse.json(manifest);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get skill manifest";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
