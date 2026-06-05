import { NextRequest, NextResponse } from "next/server";

import {
  getSkillById,
  validateSkillForPackage,
} from "@/server/services/skill/skill.service";
import { skillIdSchema } from "@/features/skill/skill.validation";

export async function GET(
  _request: NextRequest,
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

    const skill = await getSkillById(parsed.data.id);
    if (!skill) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Skill not found" },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: validateSkillForPackage(skill),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to validate skill";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
