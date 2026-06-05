import { NextRequest, NextResponse } from "next/server";

import { generateAgentSystemPrompt } from "@/server/services/agent/agent.service";
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

    const agent = await generateAgentSystemPrompt(parsed.data.id);
    if (!agent) {
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
      data: {
        id: agent.id,
        systemPrompt: agent.systemPrompt,
        agent,
      },
      message: "Agent System Prompt 生成成功",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to generate agent system prompt";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
