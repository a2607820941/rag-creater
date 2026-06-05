/**
 * 分类服务层，封装 KnowledgeCategory 的数据库访问和业务错误转换。
 */

import { prisma } from "@/lib/db";
import type {
  CategoryCreateInput,
  CategoryListQuery,
  CategoryUpdateInput,
} from "@/features/knowledge/category.validation";
import type { KnowledgeCategoryDto } from "@/features/knowledge/types";
import type { Prisma } from "@/generated/prisma/client";

/** 分类服务层可抛出的业务错误码。 */
export type CategoryServiceErrorCode =
  | "CATEGORY_NOT_FOUND"
  | "CATEGORY_DUPLICATE_NAME";

/** 表示分类服务层业务异常，供 API Route 转换 HTTP 状态码。 */
export class CategoryServiceError extends Error {
  constructor(
    public readonly code: CategoryServiceErrorCode,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "CategoryServiceError";
  }
}

/** 判断错误是否来自分类服务，方便 API Route 映射 HTTP 响应。 */
export function isCategoryServiceError(
  error: unknown
): error is CategoryServiceError {
  return error instanceof CategoryServiceError;
}

/** 创建全局知识分类。 */
export async function createCategory(
  input: CategoryCreateInput
): Promise<KnowledgeCategoryDto> {
  try {
    const category = await prisma.knowledgeCategory.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        color: input.color ?? null,
        sortOrder: input.sortOrder,
      },
    });

    return toKnowledgeCategoryDto(category);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new CategoryServiceError(
        "CATEGORY_DUPLICATE_NAME",
        "分类名称已存在",
        409
      );
    }
    throw error;
  }
}

/** 查询全局知识分类列表，支持按名称和描述做轻量关键词搜索。 */
export async function listCategories(
  query: Partial<CategoryListQuery> = {}
): Promise<KnowledgeCategoryDto[]> {
  const where: Prisma.KnowledgeCategoryWhereInput = {};

  if (query.keyword) {
    where.OR = [
      { name: { contains: query.keyword } },
      { description: { contains: query.keyword } },
    ];
  }

  const categories = await prisma.knowledgeCategory.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return categories.map(toKnowledgeCategoryDto);
}

/** 更新指定知识分类。 */
export async function updateCategory(
  id: string,
  input: CategoryUpdateInput
): Promise<KnowledgeCategoryDto> {
  await ensureCategoryExists(id);

  const data: Prisma.KnowledgeCategoryUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.color !== undefined) data.color = input.color;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

  try {
    const category = await prisma.knowledgeCategory.update({
      where: { id },
      data,
    });

    return toKnowledgeCategoryDto(category);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new CategoryServiceError(
        "CATEGORY_DUPLICATE_NAME",
        "分类名称已存在",
        409
      );
    }
    throw error;
  }
}

/** 删除指定知识分类。 */
export async function deleteCategory(id: string): Promise<KnowledgeCategoryDto> {
  await ensureCategoryExists(id);
  const category = await prisma.knowledgeCategory.delete({ where: { id } });
  return toKnowledgeCategoryDto(category);
}

/** 确认分类存在，不存在时抛出业务错误。 */
async function ensureCategoryExists(id: string): Promise<void> {
  const category = await prisma.knowledgeCategory.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!category) {
    throw new CategoryServiceError(
      "CATEGORY_NOT_FOUND",
      "分类不存在",
      404
    );
  }
}

/** 将 Prisma 记录转换为前后端共享的分类 DTO。 */
function toKnowledgeCategoryDto(category: {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): KnowledgeCategoryDto {
  return {
    id: category.id,
    name: category.name,
    description: category.description,
    color: category.color,
    sortOrder: category.sortOrder,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

/** 判断 Prisma 错误是否为唯一约束冲突。 */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
