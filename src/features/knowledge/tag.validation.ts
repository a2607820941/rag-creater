/**
 * 标签模块 Zod 校验规则，统一约束标签 API 入参和查询参数。
 */

import { z } from "zod";

/** 校验标签名称的长度和空值。 */
const tagNameSchema = z
  .string()
  .trim()
  .min(1, "标签名称不能为空")
  .max(30, "标签名称不能超过 30 个字符");

/** 校验标签颜色并把空字符串归一化为 null。 */
const optionalColorSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmedValue = value.trim();
    return trimmedValue === "" ? null : trimmedValue;
  },
  z
    .union([
      z.string().regex(/^#[0-9a-fA-F]{6}$/, "标签颜色必须是 6 位 hex 色值"),
      z.null(),
    ])
    .optional()
);

/** 校验创建标签请求体。 */
export const tagCreateSchema = z.object({
  name: tagNameSchema,
  color: optionalColorSchema,
  sortOrder: z.coerce.number().int("标签排序必须是整数").default(0),
});

/** 校验标签列表查询参数。 */
export const tagListQuerySchema = z.object({
  keyword: z
    .string()
    .trim()
    .max(50, "搜索关键词不能超过 50 个字符")
    .optional()
    .transform((value) => (value ? value : undefined)),
});

/** 校验标签路径参数 id。 */
export const tagIdSchema = z.object({
  id: z.string().min(1, "标签 id 不能为空"),
});

/** 创建标签服务层入参类型。 */
export type TagCreateInput = z.infer<typeof tagCreateSchema>;
/** 查询标签列表服务层入参类型。 */
export type TagListQuery = z.infer<typeof tagListQuerySchema>;
