import { NextRequest, NextResponse } from "next/server";

import {
  createAgent,
  listAgents,
} from "@/server/services/agent/agent.service";
import {
  agentCreateSchema,
  agentListQuerySchema,
} from "@/features/agent/agent.validation";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = agentListQuerySchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      keyword: searchParams.get("keyword") ?? undefined,
    });

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

    const result = await listAgents(parsed.data);
    return NextResponse.json({
      success: true,
      data: result,
      message: "Agent 列表获取成功",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list agents";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = agentCreateSchema.safeParse(body);

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

    const agent = await createAgent(parsed.data);
    return NextResponse.json(
      {
        success: true,
        data: agent,
        message: "Agent 创建成功",
      },
      { status: 201 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create agent";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
