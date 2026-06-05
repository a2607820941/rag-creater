import { NextRequest, NextResponse } from "next/server";

import { testSkill } from "@/server/services/skill/skill.service";
import {
  skillIdSchema,
  skillTestSchema,
} from "@/features/skill/skill.validation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const idParsed = skillIdSchema.safeParse(await params);
    if (!idParsed.success) {
      return validationError("Invalid skill id");
    }

    const body = await request.json();
    const parsed = skillTestSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed.error.issues[0].message);
    }

    const result = await testSkill(idParsed.data.id, parsed.data);
    if (!result) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Skill not found" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to test skill";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

function validationError(message: string) {
  return NextResponse.json(
    { success: false, error: { code: "VALIDATION_ERROR", message } },
    { status: 400 }
  );
}
