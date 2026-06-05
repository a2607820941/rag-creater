import fs from "node:fs/promises";
import path from "node:path";

import type { ChatAttachmentDTO } from "@/features/chat/chat.types";
import { prisma } from "@/lib/db";
import {
  getFileTypeFromName,
  MAX_FILE_SIZE,
  parseFileContent,
  validateFileType,
} from "@/lib/file-parser";
import type { LlmContentPart } from "@/server/services/agent/llm-client";

const CHAT_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "chat");
const ATTACHMENT_CONTEXT_CHAR_LIMIT = 12000;
const ATTACHMENT_PREVIEW_CHAR_LIMIT = 240;
const CHAT_IMAGE_MAX_SIZE = 20 * 1024 * 1024;

const IMAGE_FILE_TYPES = new Set(["png", "jpg", "jpeg", "webp", "bmp"]);

async function ensureChatUploadDir(): Promise<void> {
  await fs.mkdir(CHAT_UPLOAD_DIR, { recursive: true });
}

export async function createChatAttachment(
  file: File
): Promise<ChatAttachmentDTO> {
  const fileType = getFileTypeFromName(file.name);
  if (!fileType || !validateFileType(fileType)) {
    throw new Error("不支持的附件类型");
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    throw new Error("附件大小必须在 1B 到 100MB 之间");
  }

  const kind = IMAGE_FILE_TYPES.has(fileType) ? "image" : "file";
  if (kind === "image" && file.size > CHAT_IMAGE_MAX_SIZE) {
    throw new Error("聊天图片大小不能超过 20MB");
  }

  const attachment = await prisma.chatAttachment.create({
    data: {
      fileName: file.name,
      mimeType: file.type || inferMimeType(fileType),
      fileSize: file.size,
      fileType,
      kind,
      filePath: "",
      status: "parsing",
    },
  });

  const storedName = `${attachment.id}.${fileType}`;
  const filePath = path.join(CHAT_UPLOAD_DIR, storedName);
  const publicPath = `/uploads/chat/${storedName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await ensureChatUploadDir();
    await fs.writeFile(filePath, buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "附件保存失败";
    await prisma.chatAttachment.update({
      where: { id: attachment.id },
      data: {
        filePath: publicPath,
        status: "failed",
        error: message,
      },
    });
    throw new Error(`附件保存失败：${message}`);
  }

  if (kind === "image") {
    let parsedText: string;
    try {
      parsedText = await parseFileContent(buffer, fileType);
    } catch {
      parsedText = "[图片已上传，但暂时无法识别图片内容]";
    }

    const updated = await prisma.chatAttachment.update({
      where: { id: attachment.id },
      data: {
        filePath: publicPath,
        parsedText,
        status: "ready",
        error: null,
      },
    });

    return toChatAttachmentDTO(updated);
  }

  try {
    const parsedText = await parseFileContent(buffer, fileType);
    const updated = await prisma.chatAttachment.update({
      where: { id: attachment.id },
      data: {
        filePath: publicPath,
        parsedText,
        status: "ready",
        error: null,
      },
    });

    return toChatAttachmentDTO(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "附件解析失败";
    await prisma.chatAttachment.update({
      where: { id: attachment.id },
      data: {
        filePath: publicPath,
        status: "failed",
        error: message,
      },
    });
    throw new Error(`附件解析失败：${message}`);
  }
}

export async function buildAttachmentPromptContext(
  attachmentIds: string[] | undefined
): Promise<string> {
  const ids = Array.from(new Set(attachmentIds ?? [])).filter(Boolean);
  if (ids.length === 0) return "";

  const attachments = await prisma.chatAttachment.findMany({
    where: {
      id: { in: ids },
      status: "ready",
      parsedText: { not: null },
    },
    orderBy: { createdAt: "asc" },
  });

  if (attachments.length === 0) return "";

  const sections = attachments.map((attachment, index) => {
    const content = truncateText(
      attachment.parsedText ?? "",
      ATTACHMENT_CONTEXT_CHAR_LIMIT
    );
    const label = attachment.kind === "image" ? "图片理解/OCR" : "文件内容";

    return `[附件 ${index + 1}: ${attachment.fileName}]
类型：${attachment.kind}
${label}：
${content}`;
  });

  return `本轮用户上传的附件内容：

${sections.join("\n\n")}`;
}

export async function buildAttachmentImageParts(
  attachmentIds: string[] | undefined
): Promise<LlmContentPart[]> {
  if (process.env.CHAT_MULTIMODAL_ENABLED !== "true") return [];

  const ids = Array.from(new Set(attachmentIds ?? [])).filter(Boolean);
  if (ids.length === 0) return [];

  const attachments = await prisma.chatAttachment.findMany({
    where: {
      id: { in: ids },
      kind: "image",
      status: "ready",
    },
    orderBy: { createdAt: "asc" },
  });

  const parts: LlmContentPart[] = [];
  for (const attachment of attachments) {
    if (attachment.fileSize > CHAT_IMAGE_MAX_SIZE) continue;

    const storedName = path.basename(attachment.filePath);
    if (!storedName) continue;

    try {
      const buffer = await fs.readFile(path.join(CHAT_UPLOAD_DIR, storedName));
      parts.push({
        type: "image_url",
        image_url: {
          url: `data:${attachment.mimeType};base64,${buffer.toString("base64")}`,
        },
      });
    } catch {
      // Ignore missing image files while preserving other attachments.
    }
  }

  return parts;
}

function toChatAttachmentDTO(attachment: {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileType: string;
  kind: string;
  filePath: string;
  status: string;
  parsedText: string | null;
  error: string | null;
}): ChatAttachmentDTO {
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    fileType: attachment.fileType,
    kind: attachment.kind,
    status: attachment.status,
    fileUrl: attachment.filePath || undefined,
    textPreview: truncateText(
      attachment.parsedText || attachment.error || "",
      ATTACHMENT_PREVIEW_CHAR_LIMIT
    ),
    error: attachment.error,
  };
}

function truncateText(value: string, limit: number): string {
  const normalized = value.trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit)}...`;
}

function inferMimeType(fileType: string): string {
  if (fileType === "jpg") return "image/jpeg";
  if (fileType === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (fileType === "xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (fileType === "pdf") return "application/pdf";
  if (fileType === "md") return "text/markdown";
  if (fileType === "csv") return "text/csv";
  if (IMAGE_FILE_TYPES.has(fileType)) return `image/${fileType}`;
  return "text/plain";
}
