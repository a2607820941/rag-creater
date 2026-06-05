/**
 * 标签集合 API，负责标签列表查询和标签创建的 HTTP 入参/响应封装。
 */

import { NextRequest, NextResponse } from "next/server";

import {
  tagCreateSchema,
  tagListQuerySchema,
} from "@/features/knowledge/tag.validation";
import {
  createTag,
  isTagServiceError,
  listTags,
} from "@/server/services/knowledge/tag.service";

/** 获取知识标签列表。 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = tagListQuerySchema.safeParse({
      keyword: searchParams.get("keyword") ?? undefined,
    });

    if (!parsed.success) {
      return validationError(parsed.error.issues[0].message);
    }

    const tags = await listTags(parsed.data);
    return NextResponse.json({ success: true, data: tags });
  } catch (error) {
    return handleTagError(error, "获取标签列表失败");
  }
}

/** 创建知识标签。 */
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const parsed = tagCreateSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error.issues[0].message);
    }

    const tag = await createTag(parsed.data);
    return NextResponse.json({ success: true, data: tag }, { status: 201 });
  } catch (error) {
    return handleTagError(error, "创建标签失败");
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
