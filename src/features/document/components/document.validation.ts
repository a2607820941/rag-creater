import { z } from "zod";

const ALLOWED_TYPES = ["txt", "md", "csv", "xlsx", "doc", "docx", "pdf", "pptx", "png", "jpg", "jpeg", "webp", "bmp"] as const;

export const documentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["uploading", "uploaded", "parsing", "parsed", "failed"]).optional(),
  hasCandidates: z.coerce.boolean().optional(),
});

export const documentIdSchema = z.object({
  id: z.string().min(1),
});

export const uploadFileSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().int().positive().max(100 * 1024 * 1024, "文件不能超过100MB"),
  fileType: z.enum(ALLOWED_TYPES, {
    message: "不支持的文件类型",
  }),
});

export const resumableUploadQuerySchema = z.object({
  fingerprint: z.string().min(8),
  fileName: z.string().min(1),
  fileSize: z.coerce.number().int().positive().max(100 * 1024 * 1024, "文件不能超过100MB"),
  fileType: z.enum(ALLOWED_TYPES),
  chunkSize: z.coerce.number().int().positive().max(10 * 1024 * 1024),
  totalChunks: z.coerce.number().int().min(1).max(10000),
});

export const resumableUploadChunkSchema = z.object({
  uploadId: z.string().regex(/^[a-f0-9]{64}$/),
  chunkIndex: z.coerce.number().int().min(0),
});

export const resumableUploadCompleteSchema = z.object({
  uploadId: z.string().regex(/^[a-f0-9]{64}$/),
});

export const updateDocumentSchema = z.object({
  content: z.string().min(1, "内容不能为空"),
});

export const ALLOWED_FILE_EXTENSIONS = ALLOWED_TYPES.map((t) => `.${t}`).join(",");
