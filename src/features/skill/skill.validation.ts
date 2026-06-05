import { z } from "zod";

import { agentKnowledgeScopeSchema } from "@/features/agent/agent.validation";
import {
  SKILL_OUTPUT_STYLES,
  SKILL_RUNTIME_MODES,
  SKILL_STATUSES,
  SKILL_TASK_AUDIENCES,
  SKILL_TASK_DOMAINS,
  SKILL_TASK_INTENTS,
  SKILL_TYPES,
} from "@/features/skill/skill.types";

const jsonObjectSchema = z.record(z.string(), z.unknown());
const stringListSchema = z.array(z.string().trim().min(1)).default([]);

export const skillKnowledgeScopeSchema = agentKnowledgeScopeSchema.refine(
  (scope) => scope.knowledgeBaseIds.length > 0,
  "Skill must bind at least one knowledge base"
);

export const skillIdSchema = z.object({
  id: z.string().trim().min(1, "Skill ID cannot be empty"),
});

export const skillSlugSchema = z.object({
  slug: z.string().trim().min(1, "Skill slug cannot be empty"),
});

export const skillListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(SKILL_STATUSES).optional(),
  taskDomain: z.enum(SKILL_TASK_DOMAINS).optional(),
  taskIntent: z.enum(SKILL_TASK_INTENTS).optional(),
  taskAudience: z.enum(SKILL_TASK_AUDIENCES).optional(),
  keyword: z.string().trim().optional(),
});

export const skillCreateSchema = z.object({
  name: z.string().trim().min(1, "Skill name cannot be empty").max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens"),
  description: z.string().trim().max(1000).optional(),
  type: z.enum(SKILL_TYPES).default("rag_agent"),
  status: z.enum(SKILL_STATUSES).default("draft"),
  taskDomain: z.enum(SKILL_TASK_DOMAINS).default("general"),
  taskIntent: z.enum(SKILL_TASK_INTENTS).default("qa"),
  taskAudience: z.enum(SKILL_TASK_AUDIENCES).default("expert_agent"),
  taskDescription: z.string().trim().max(2000).default(""),
  triggerExamples: stringListSchema,
  nonGoals: stringListSchema,
  outputStyle: z.enum(SKILL_OUTPUT_STYLES).default("answer_with_citations"),
  runtimeMode: z.enum(SKILL_RUNTIME_MODES).default("platform_rag"),
  knowledgeScope: skillKnowledgeScopeSchema,
  inputSchema: jsonObjectSchema.default({}),
  outputSchema: jsonObjectSchema.default({}),
  config: jsonObjectSchema.default({}),
  systemPrompt: z.string().trim().max(12000).optional(),
  version: z.string().trim().min(1).max(40).default("0.1.0"),
});

export const skillUpdateSchema = skillCreateSchema
  .partial()
  .extend({
    status: z.enum(SKILL_STATUSES).optional(),
  });

export const skillRunSchema = z.object({
  input: jsonObjectSchema,
  llmInterface: z.enum(["default", "openai", "local"]).optional(),
});

export const skillTestSchema = skillRunSchema;

export type SkillCreateInput = z.infer<typeof skillCreateSchema>;
export type SkillUpdateInput = z.infer<typeof skillUpdateSchema>;
export type SkillListQuery = z.infer<typeof skillListQuerySchema>;
export type SkillRunInput = z.infer<typeof skillRunSchema>;
