/**
 * 标签服务层，封装 KnowledgeTag 的数据库访问和业务错误转换。
 */

import { prisma } from "@/lib/db";
import type {
  TagCreateInput,
  TagListQuery,
} from "@/features/knowledge/tag.validation";
import type { KnowledgeTagDto } from "@/features/knowledge/types";
import type { Prisma } from "@/generated/prisma/client";

/** 标签服务层可抛出的业务错误码。 */
export type TagServiceErrorCode = "TAG_NOT_FOUND" | "TAG_DUPLICATE_NAME";

/** 表示标签服务层业务异常，供 API Route 转换 HTTP 状态码。 */
export class TagServiceError extends Error {
  constructor(
    public readonly code: TagServiceErrorCode,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "TagServiceError";
  }
}

/** 判断错误是否来自标签服务，方便 API Route 映射 HTTP 响应。 */
export function isTagServiceError(error: unknown): error is TagServiceError {
  return error instanceof TagServiceError;
}

/** 创建全局知识标签。 */
export async function createTag(
  input: TagCreateInput
): Promise<KnowledgeTagDto> {
  try {
    const tag = await prisma.knowledgeTag.create({
      data: {
        name: input.name,
        color: input.color ?? null,
        sortOrder: input.sortOrder,
      },
    });

    return toKnowledgeTagDto(tag);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new TagServiceError("TAG_DUPLICATE_NAME", "标签名称已存在", 409);
    }
    throw error;
  }
}

/** 查询全局知识标签列表，支持按名称做轻量关键词搜索。 */
export async function listTags(
  query: Partial<TagListQuery> = {}
): Promise<KnowledgeTagDto[]> {
  const where: Prisma.KnowledgeTagWhereInput = {};

  if (query.keyword) {
    where.name = { contains: query.keyword };
  }

  if (query.scope === "rag") {
    await prisma.knowledgeTag.deleteMany({
      where: {
        knowledgeBases: { none: {} },
      },
    });

    where.knowledgeBases = { some: {} };
  }

  const tags = await prisma.knowledgeTag.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return tags.map(toKnowledgeTagDto);
}

/** 删除指定知识标签。 */
export async function deleteTag(id: string): Promise<KnowledgeTagDto> {
  await ensureTagExists(id);
  const tag = await prisma.knowledgeTag.delete({ where: { id } });
  return toKnowledgeTagDto(tag);
}

/** 确认标签存在，不存在时抛出业务错误。 */
async function ensureTagExists(id: string): Promise<void> {
  const tag = await prisma.knowledgeTag.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!tag) {
    throw new TagServiceError("TAG_NOT_FOUND", "标签不存在", 404);
  }
}

/** 将 Prisma 记录转换为前后端共享的标签 DTO。 */
function toKnowledgeTagDto(tag: {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): KnowledgeTagDto {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    sortOrder: tag.sortOrder,
    createdAt: tag.createdAt.toISOString(),
    updatedAt: tag.updatedAt.toISOString(),
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
