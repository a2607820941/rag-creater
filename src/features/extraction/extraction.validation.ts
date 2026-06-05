import { z } from "zod";

/** AI 提炼输出的单条候选知识结构 */
export const CandidateKnowledgeItemSchema = z.object({
  title: z.string().min(1, "标题不能为空").max(200, "标题不超过200字"),
  content: z.string().min(1, "内容不能为空"),
  suggestedCategory: z.string().optional(),
  suggestedTags: z.array(z.string()).optional(),
  type: z.enum(["faq", "concept", "procedure", "note", "summary"]),
});

/** AI 必须返回 CandidateKnowledgeItem 的数组 */
export const CandidateKnowledgeSchema = z.array(CandidateKnowledgeItemSchema);

export type CandidateKnowledgeItem = z.infer<
  typeof CandidateKnowledgeItemSchema
>;

/** POST /api/ai/extract/from-text 请求体 */
export const ExtractRequestSchema = z.object({
  text: z.string().min(1, "文本不能为空").max(50000, "文本不超过50000字"),
  source: z.enum(["document", "text"]).default("text"),
});

/** POST /api/ai/extract/from-document 请求体 */
export const FromDocumentRequestSchema = z.object({
  documentId: z.string().min(1, "文档 ID 不能为空"),
});

/** POST /api/ai/extract/retry 请求体 */
export const RetryRequestSchema = z.object({
  documentId: z.string().min(1, "文档 ID 不能为空"),
});

/** PATCH /api/knowledge/candidates/[id] 请求体 */
export const UpdateCandidateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  suggestedCategory: z.string().nullable().optional(),
  suggestedTags: z.union([z.array(z.string()), z.string()]).optional(),
  type: z.enum(["faq", "concept", "procedure", "note", "summary"]).optional(),
});

/** POST /api/knowledge/candidates/confirm 请求体 */
export const ConfirmRequestSchema = z.object({
  ids: z.array(z.string()).min(1, "至少选择一条"),
  knowledgeBaseIds: z.array(z.string()).min(1, "至少选择一个知识库"),
});
