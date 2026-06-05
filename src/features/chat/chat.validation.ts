import { z } from "zod";

export const llmInterfaceSchema = z
  .enum(["default", "openai", "local"])
  .default("default");

export const chatModeSchema = z
  .enum(["openai", "agent", "knowledge-agent", "skill-agent", "rag-openai"])
  .default("openai");

export const directChatRequestSchema = z.object({
  message: z.string().trim().min(1, "请输入消息内容").max(8000),
  conversationId: z.string().trim().min(1).optional(),
  agentId: z.string().trim().min(1).optional(),
  chatMode: chatModeSchema,
  llmInterface: llmInterfaceSchema.optional(),
  attachmentIds: z.array(z.string().trim().min(1)).max(10).optional(),
});

export const agentChatRequestSchema = directChatRequestSchema;

export const agentConversationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const conversationIdSchema = z.object({
  id: z.string().trim().min(1, "会话 ID 不能为空"),
});

export type LlmInterfaceKey = z.infer<typeof llmInterfaceSchema>;
export type ChatMode = z.infer<typeof chatModeSchema>;
export type DirectChatRequest = z.infer<typeof directChatRequestSchema>;
export type AgentChatRequest = z.infer<typeof agentChatRequestSchema>;
export type AgentConversationListQuery = z.infer<typeof agentConversationListQuerySchema>;
