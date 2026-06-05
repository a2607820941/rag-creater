import { NextRequest, NextResponse } from "next/server";

import {
  createSkill,
  listSkills,
} from "@/server/services/skill/skill.service";
import {
  skillCreateSchema,
  skillListQuerySchema,
} from "@/features/skill/skill.validation";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = skillListQuerySchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      taskDomain: searchParams.get("taskDomain") ?? undefined,
      taskIntent: searchParams.get("taskIntent") ?? undefined,
      taskAudience: searchParams.get("taskAudience") ?? undefined,
      keyword: searchParams.get("keyword") ?? undefined,
    });

    if (!parsed.success) {
      return validationError(parsed.error.issues[0].message);
    }

    const result = await listSkills(parsed.data);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return internalError(error, "Failed to list skills");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = skillCreateSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error.issues[0].message);
    }

    const skill = await createSkill(parsed.data);
    return NextResponse.json({ success: true, data: skill }, { status: 201 });
  } catch (error) {
    return internalError(error, "Failed to create skill");
  }
}

function validationError(message: string) {
  return NextResponse.json(
    { success: false, error: { code: "VALIDATION_ERROR", message } },
    { status: 400 }
  );
}

function internalError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL_ERROR", message } },
    { status: 500 }
  );
}
