/**
 * 单个分类 API，负责分类更新和删除的 HTTP 入参/响应封装。
 */

import { NextRequest, NextResponse } from "next/server";

import {
  categoryIdSchema,
  categoryUpdateSchema,
} from "@/features/knowledge/category.validation";
import {
  deleteCategory,
  isCategoryServiceError,
  updateCategory,
} from "@/server/services/knowledge/category.service";

/** 更新指定知识分类。 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsedId = categoryIdSchema.safeParse({ id });
    if (!parsedId.success) {
      return validationError(parsedId.error.issues[0].message);
    }

    const body: unknown = await request.json();
    const parsedBody = categoryUpdateSchema.safeParse(body);
    if (!parsedBody.success) {
      return validationError(parsedBody.error.issues[0].message);
    }

    const category = await updateCategory(parsedId.data.id, parsedBody.data);
    return NextResponse.json({ success: true, data: category });
  } catch (error) {
    return handleCategoryError(error, "更新分类失败");
  }
}

/** 删除指定知识分类。 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsedId = categoryIdSchema.safeParse({ id });
    if (!parsedId.success) {
      return validationError(parsedId.error.issues[0].message);
    }

    const category = await deleteCategory(parsedId.data.id);
    return NextResponse.json({ success: true, data: category });
  } catch (error) {
    return handleCategoryError(error, "删除分类失败");
  }
}

/** 将分类模块错误转换为统一 API 响应。 */
function handleCategoryError(error: unknown, fallbackMessage: string) {
  if (isCategoryServiceError(error)) {
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
