import { NextRequest, NextResponse } from "next/server";

import {
  SkillValidationError,
  publishSkill,
} from "@/server/services/skill/skill.service";
import { skillIdSchema } from "@/features/skill/skill.validation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const parsed = skillIdSchema.safeParse(await params);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Invalid skill id" } },
        { status: 400 }
      );
    }

    const result = await publishSkill(parsed.data.id, request.nextUrl.origin);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof SkillValidationError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: error.validation.summary.message,
          },
          data: error.validation,
        },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to publish skill";
    const status = message === "Skill not found" ? 404 : 500;
    return NextResponse.json(
      {
        success: false,
        error: {
          code: status === 404 ? "NOT_FOUND" : "INTERNAL_ERROR",
          message,
        },
      },
      { status }
    );
  }
}
