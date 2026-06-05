import { NextRequest, NextResponse } from "next/server";

import { validateAgentAvailability } from "@/server/services/agent/agent.service";
import { agentIdSchema } from "@/features/agent/agent.validation";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsed = agentIdSchema.safeParse({ id });

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid agent id" },
        },
        { status: 400 }
      );
    }

    const result = await validateAgentAvailability(parsed.data.id);
    if (!result) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Agent not found" },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: result.valid ? "Agent 可用性检查通过" : "Agent 可用性检查未通过",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to validate agent";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
