/**
 * 单个标签 API，负责标签删除的 HTTP 入参/响应封装。
 */

import { NextRequest, NextResponse } from "next/server";

import { tagIdSchema } from "@/features/knowledge/tag.validation";
import {
  deleteTag,
  isTagServiceError,
} from "@/server/services/knowledge/tag.service";

/** 删除指定知识标签。 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsedId = tagIdSchema.safeParse({ id });
    if (!parsedId.success) {
      return validationError(parsedId.error.issues[0].message);
    }

    const tag = await deleteTag(parsedId.data.id);
    return NextResponse.json({ success: true, data: tag });
  } catch (error) {
    return handleTagError(error, "删除标签失败");
  }
}

/** 将标签模块错误转换为统一 API 响应。 */
function handleTagError(error: unknown, fallbackMessage: string) {
  if (isTagServiceError(error)) {
    return NextResponse.json(
      {
        success: false,
        error: { code: error.code, message: error.message },
      },
      { status: error.status }
    );
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL_ERROR", message } },
    { status: 500 }
  );
}

/** 返回统一的参数校验失败响应。 */
function validationError(message: string) {
  return NextResponse.json(
    { success: false, error: { code: "VALIDATION_ERROR", message } },
    { status: 400 }
  );
}
