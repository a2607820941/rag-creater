import { NextRequest, NextResponse } from "next/server";

import { agentIdSchema } from "@/features/agent/agent.validation";
import { agentConversationListQuerySchema } from "@/features/agent/agent-chat.validation";
import { listAgentConversations } from "@/server/services/agent/agent-chat.service";

export async function GET(
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

    const { searchParams } = new URL(request.url);
    const queryParsed = agentConversationListQuerySchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });

    if (!queryParsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: queryParsed.error.issues[0].message,
          },
        },
        { status: 400 }
      );
    }

    const result = await listAgentConversations(
      idParsed.data.id,
      queryParsed.data
    );

    return NextResponse.json({
      success: true,
      data: result,
      message: "会话列表获取成功",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list conversations";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
