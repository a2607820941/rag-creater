/**
 * 分类集合 API，负责分类列表查询和分类创建的 HTTP 入参/响应封装。
 */

import { NextRequest, NextResponse } from "next/server";

import {
  categoryCreateSchema,
  categoryListQuerySchema,
} from "@/features/knowledge/category.validation";
import {
  createCategory,
  isCategoryServiceError,
  listCategories,
} from "@/server/services/knowledge/category.service";

/** 获取知识分类列表。 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = categoryListQuerySchema.safeParse({
      keyword: searchParams.get("keyword") ?? undefined,
    });

    if (!parsed.success) {
      return validationError(parsed.error.issues[0].message);
    }

    const categories = await listCategories(parsed.data);
    return NextResponse.json({ success: true, data: categories });
  } catch (error) {
    return handleCategoryError(error, "获取分类列表失败");
  }
}

/** 创建知识分类。 */
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const parsed = categoryCreateSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error.issues[0].message);
    }

    const category = await createCategory(parsed.data);
    return NextResponse.json({ success: true, data: category }, { status: 201 });
  } catch (error) {
    return handleCategoryError(error, "创建分类失败");
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
