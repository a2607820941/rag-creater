import { NextRequest, NextResponse } from "next/server";

import {
  deleteAgent,
  getAgentById,
  updateAgent,
} from "@/server/services/agent/agent.service";
import {
  agentIdSchema,
  agentUpdateSchema,
} from "@/features/agent/agent.validation";

export async function GET(
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

    const agent = await getAgentById(parsed.data.id);
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
      data: agent,
      message: "Agent 详情获取成功",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get agent";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const idParsed = agentIdSchema.safeParse({ id });

    if (!idParsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid agent id" },
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = agentUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0].message,
          },
        },
        { status: 400 }
      );
    }

    const agent = await updateAgent(idParsed.data.id, parsed.data);
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
      data: agent,
      message: "Agent 更新成功",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update agent";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const agent = await deleteAgent(parsed.data.id);
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
      data: { id: parsed.data.id },
      message: "Agent 删除成功",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete agent";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
