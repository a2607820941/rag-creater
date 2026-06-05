import { z } from "zod";

export const ragIconSchema = z
  .enum([
    "Database",
    "BookOpen",
    "FileText",
    "Folder",
    "Archive",
    "Brain",
    "Bot",
    "GraduationCap",
    "BriefcaseBusiness",
    "Lightbulb",
  ])
  .default("Database");

export const statusSchema = z.enum(["active", "disabled"]);
export const statusWithAllSchema = z.enum(["active", "disabled", "all"]);

export const sourceTypeSchema = z.enum([
  "manual",
  "file",
  "url",
  "text",
  "markdown",
  "image",
  "conversation",
]);

export const sourceTypeWithAllSchema = z.enum([
  "manual",
  "file",
  "url",
  "text",
  "markdown",
  "image",
  "conversation",
  "all",
]);

export const pipelineStatusSchema = z.enum([
  "uploading",
  "uploaded",
  "pending",
  "parsing",
  "parsed",
  "failed",
]);

export const pipelineStatusWithAllSchema = z.enum([
  "uploading",
  "uploaded",
  "pending",
  "parsing",
  "parsed",
  "failed",
  "all",
]);

export const idParamsSchema = z.object({
  id: z.string().min(1),
});

export const knowledgeBaseListQuerySchema = z.object({
  keyword: z.string().trim().optional(),
  status: statusWithAllSchema.optional().default("all"),
});

export const knowledgeBaseKeywordSearchQuerySchema = z.object({
  keyword: z.string().trim().min(1).max(50),
  limit: z.coerce.number().int().min(1).max(30).optional().default(10),
});

export const documentListQuerySchema = z.object({
  keyword: z.string().trim().optional(),
  sourceType: sourceTypeWithAllSchema.optional().default("all"),
  activeStatus: statusWithAllSchema.optional().default("all"),
  status: pipelineStatusWithAllSchema.optional().default("all"),
  includeDeleted: z.coerce.boolean().optional().default(false),
});

export const createDocumentChunkSchema = z
  .object({
    content: z.string().trim().min(1),
    chunkIndex: z.number().int().min(0),
    embedding: z.string().optional(),
    chunkStatus: statusSchema.optional().default("active"),
    startIndex: z.number().int().min(0).optional(),
    endIndex: z.number().int().min(0).optional(),
  })
  .refine(
    (value) =>
      value.startIndex === undefined ||
      value.endIndex === undefined ||
      value.endIndex >= value.startIndex,
    {
      message: "endIndex must be greater than or equal to startIndex",
      path: ["endIndex"],
    }
  );

export const replaceDocumentChunksSchema = z.object({
  chunks: z.array(createDocumentChunkSchema),
});

const documentBaseObjectSchema = z.object({
  title: z.string().trim().min(1),
  sourceType: sourceTypeSchema.optional().default("manual"),
  fileName: z.string().trim().optional(),
  fileUrl: z.string().trim().optional(),
  mimeType: z.string().trim().optional(),
  fileSize: z.number().int().min(0).optional(),
  rawContent: z.string().optional(),
  chunkSize: z.number().int().min(100).max(5000).optional().default(800),
  chunkOverlap: z.number().int().min(0).optional().default(100),
  status: pipelineStatusSchema.optional().default("pending"),
  activeStatus: statusSchema.optional().default("active"),
  error: z.string().optional(),
});

const documentBaseSchema = documentBaseObjectSchema.refine(
  (value) => value.chunkOverlap < value.chunkSize,
  {
    message: "chunkOverlap must be smaller than chunkSize",
    path: ["chunkOverlap"],
  }
);

export const createDocumentSourceSchema = documentBaseSchema.extend({
  chunks: z.array(createDocumentChunkSchema).optional(),
  knowledgeBaseIds: z.array(z.string().min(1)).optional(),
});

export const updateDocumentSourceSchema = documentBaseObjectSchema
  .partial()
  .refine(
    (value) =>
      value.chunkSize === undefined ||
      value.chunkOverlap === undefined ||
      value.chunkOverlap < value.chunkSize,
    {
      message: "chunkOverlap must be smaller than chunkSize",
      path: ["chunkOverlap"],
    }
  );

export const createKnowledgeBaseSchema = z.object({
  name: z.string().trim().min(1).max(50),
  description: z.string().trim().max(500).optional(),
  icon: ragIconSchema.optional().default("Database"),
  similarityThreshold: z.number().min(0).max(1).optional().default(0.7),
  topK: z.number().int().min(1).max(20).optional().default(5),
  status: statusSchema.optional().default("active"),
  documentIds: z.array(z.string().min(1)).optional(),
  documents: z.array(createDocumentSourceSchema).optional(),
});

export const updateKnowledgeBaseSchema = z
  .object({
    name: z.string().trim().min(1).max(50).optional(),
    description: z.string().trim().max(500).optional(),
    icon: ragIconSchema.optional(),
    similarityThreshold: z.number().min(0).max(1).optional(),
    topK: z.number().int().min(1).max(20).optional(),
    status: statusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export const documentIdsBodySchema = z.object({
  documentIds: z.array(z.string().min(1)).min(1),
});

export type CreateKnowledgeBaseInput = z.infer<
  typeof createKnowledgeBaseSchema
>;
export type UpdateKnowledgeBaseInput = z.infer<
  typeof updateKnowledgeBaseSchema
>;
export type KnowledgeBaseKeywordSearchQuery = z.infer<
  typeof knowledgeBaseKeywordSearchQuerySchema
>;
export type CreateDocumentSourceInput = z.infer<
  typeof createDocumentSourceSchema
>;
export type UpdateDocumentSourceInput = z.infer<
  typeof updateDocumentSourceSchema
>;
export type CreateDocumentChunkInput = z.infer<
  typeof createDocumentChunkSchema
>;
