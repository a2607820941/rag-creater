import { NextRequest, NextResponse } from "next/server";

import {
  deleteSkill,
  getSkillById,
  updateSkill,
} from "@/server/services/skill/skill.service";
import {
  skillIdSchema,
  skillUpdateSchema,
} from "@/features/skill/skill.validation";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const parsed = skillIdSchema.safeParse(await params);
    if (!parsed.success) return invalidId();

    const skill = await getSkillById(parsed.data.id);
    if (!skill) return notFound();

    return NextResponse.json({ success: true, data: skill });
  } catch (error) {
    return internalError(error, "Failed to get skill");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const idParsed = skillIdSchema.safeParse(await params);
    if (!idParsed.success) return invalidId();

    const body = await request.json();
    const parsed = skillUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed.error.issues[0].message);
    }

    const skill = await updateSkill(idParsed.data.id, parsed.data);
    if (!skill) return notFound();

    return NextResponse.json({ success: true, data: skill });
  } catch (error) {
    return internalError(error, "Failed to update skill");
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const parsed = skillIdSchema.safeParse(await params);
    if (!parsed.success) return invalidId();

    const deleted = await deleteSkill(parsed.data.id);
    if (!deleted) return notFound();

    return NextResponse.json({
      success: true,
      data: { id: parsed.data.id },
    });
  } catch (error) {
    return internalError(error, "Failed to delete skill");
  }
}

function invalidId() {
  return validationError("Invalid skill id");
}

function validationError(message: string) {
  return NextResponse.json(
    { success: false, error: { code: "VALIDATION_ERROR", message } },
    { status: 400 }
  );
}

function notFound() {
  return NextResponse.json(
    { success: false, error: { code: "NOT_FOUND", message: "Skill not found" } },
    { status: 404 }
  );
}

function internalError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL_ERROR", message } },
    { status: 500 }
  );
}
