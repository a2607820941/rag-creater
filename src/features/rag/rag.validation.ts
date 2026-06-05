import { z } from "zod";

// API Route 层不信任前端类型，所有外部入参都先经过这里校验。
export const knowledgeChunkTypeSchema = z.enum(["text", "wiki", "summary", "qa"]);

export const ragRetrieveRequestSchema = z.object({
  query: z.string().trim().min(1, "问题不能为空"),
  scope: z.object({
    knowledgeBaseIds: z.array(z.string().min(1)).min(1, "至少需要选择一个知识库"),
    knowledgeIds: z.array(z.string().min(1)).optional(),
    categoryIds: z.array(z.string().min(1)).optional(),
    tagIds: z.array(z.string().min(1)).optional(),
    chunkTypes: z.array(knowledgeChunkTypeSchema).optional(),
  }),
  mode: z.enum(["fast", "balanced", "detailed"]).default("balanced"),
});

export type RagRetrieveRequestInput = z.infer<typeof ragRetrieveRequestSchema>;

export const searchQuerySchema = z.object({
  query: z.string().trim().min(1, "搜索内容不能为空"),
  topK: z.number().int().min(1).max(50).optional().default(5),
});
