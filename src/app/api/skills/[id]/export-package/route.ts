import { NextRequest, NextResponse } from "next/server";

import { exportSkillPackage } from "@/server/services/skill/skill.service";
import { skillIdSchema } from "@/features/skill/skill.validation";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const parsed = skillIdSchema.safeParse(await params);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid skill id" },
        },
        { status: 400 }
      );
    }

    const result = await exportSkillPackage(
      parsed.data.id,
      request.nextUrl.origin
    );
    if (!result) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Skill not found" },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to export skill package";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
