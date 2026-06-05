/**
 * 分类模块 Zod 校验规则，统一约束分类 API 入参和查询参数。
 */

import { z } from "zod";

/** 校验分类名称的长度和空值。 */
const categoryNameSchema = z
  .string()
  .trim()
  .min(1, "分类名称不能为空")
  .max(30, "分类名称不能超过 30 个字符");

/** 校验分类描述并把空字符串归一化为 null。 */
const optionalDescriptionSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z
    .union([z.string().max(200, "分类描述不能超过 200 个字符"), z.null()])
    .optional()
).transform((value) => (value === "" ? null : value));

/** 校验分类颜色并把空字符串归一化为 null。 */
const optionalColorSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmedValue = value.trim();
    return trimmedValue === "" ? null : trimmedValue;
  },
  z
    .union([
      z.string().regex(/^#[0-9a-fA-F]{6}$/, "分类颜色必须是 6 位 hex 色值"),
      z.null(),
    ])
    .optional()
);

/** 校验创建分类请求体。 */
export const categoryCreateSchema = z.object({
  name: categoryNameSchema,
  description: optionalDescriptionSchema,
  color: optionalColorSchema,
  sortOrder: z.coerce.number().int("分类排序必须是整数").default(0),
});

/** 校验更新分类请求体，并要求至少传入一个字段。 */
export const categoryUpdateSchema = z
  .object({
    name: categoryNameSchema.optional(),
    description: optionalDescriptionSchema,
    color: optionalColorSchema,
    sortOrder: z.coerce.number().int("分类排序必须是整数").optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "至少需要提供一个要更新的字段",
  });

/** 校验分类列表查询参数。 */
export const categoryListQuerySchema = z.object({
  keyword: z
    .string()
    .trim()
    .max(50, "搜索关键词不能超过 50 个字符")
    .optional()
    .transform((value) => (value ? value : undefined)),
});

/** 校验分类路径参数 id。 */
export const categoryIdSchema = z.object({
  id: z.string().min(1, "分类 id 不能为空"),
});

/** 创建分类服务层入参类型。 */
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
/** 更新分类服务层入参类型。 */
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
/** 查询分类列表服务层入参类型。 */
export type CategoryListQuery = z.infer<typeof categoryListQuerySchema>;
