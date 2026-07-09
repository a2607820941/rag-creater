import { ServiceError } from "@/features/knowledge-bases/server/errors";
import {
  getFileTypeFromName,
  parseFileContent,
  type AllowedFileType,
} from "@/lib/file-parser";
import { prisma } from "@/lib/db";
import { parseDocument } from "@/server/services/document.service";

import { getNoteDetailService } from "./note-service";
import type { EnhanceNoteInput } from "./schemas";

const MAX_REMOTE_ASSET_BYTES = 10 * 1024 * 1024;
const REMOTE_ASSET_TIMEOUT_MS = 10_000;
const INLINE_RESOURCE_MARKDOWN_RE =
  /(!?)\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;

type EnhanceableFileType = Extract<
  AllowedFileType,
  | "png"
  | "jpg"
  | "jpeg"
  | "webp"
  | "bmp"
  | "pdf"
  | "docx"
  | "txt"
  | "md"
  | "csv"
  | "xlsx"
>;

const ENHANCEABLE_FILE_TYPES = new Set<EnhanceableFileType>([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "bmp",
  "pdf",
  "docx",
  "txt",
  "md",
  "csv",
  "xlsx",
]);

type EnhancementAssetResult = {
  source: string;
  type: string;
  status: "success" | "failed";
  insertedText?: string;
  error?: string;
};

function isEnhanceableFileType(
  value: string | null
): value is EnhanceableFileType {
  return ENHANCEABLE_FILE_TYPES.has(value as EnhanceableFileType);
}

function fileTypeFromContentType(contentType: string | null) {
  if (!contentType) return null;

  const normalized = contentType.split(";")[0].trim().toLowerCase();
  if (normalized === "image/png") return "png";
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/bmp") return "bmp";
  if (normalized === "application/pdf") return "pdf";
  if (normalized === "text/plain") return "txt";
  if (normalized === "text/markdown" || normalized === "text/x-markdown") {
    return "md";
  }
  if (normalized === "text/csv") return "csv";
  if (
    normalized ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (
    normalized ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return "xlsx";
  }
  return null;
}

function inferRemoteFileType(url: string, contentType: string | null) {
  const fromContentType = fileTypeFromContentType(contentType);
  if (isEnhanceableFileType(fromContentType)) return fromContentType;

  const pathname = new URL(url).pathname;
  const fromName = getFileTypeFromName(pathname);
  return isEnhanceableFileType(fromName) ? fromName : null;
}

function hasEnhanceableFileName(url: string) {
  try {
    return isEnhanceableFileType(getFileTypeFromName(new URL(url).pathname));
  } catch {
    return false;
  }
}

async function fetchRemoteAsset(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_ASSET_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_REMOTE_ASSET_BYTES) {
      throw new Error("remote asset is larger than 10MB");
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_REMOTE_ASSET_BYTES) {
      throw new Error("remote asset is larger than 10MB");
    }

    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: response.headers.get("content-type"),
    };
  } finally {
    clearTimeout(timer);
  }
}

function formatSuccessBlock(params: {
  source: string;
  type: string;
  parsedText: string;
}) {
  return [
    "",
    "> 知识增强：内联资源解析结果",
    `> 原始资源：${params.source}`,
    `> 文件类型：${params.type}`,
    `> 解析内容：${params.parsedText.replace(/\r?\n/g, " ")}`,
    "",
  ].join("\n");
}

function formatFailureBlock(params: { source: string; error: string }) {
  return [
    "",
    "> 知识增强：资源解析失败",
    `> 原始资源：${params.source}`,
    `> 原因：${params.error}`,
    "",
  ].join("\n");
}

async function enhanceMarkdown(rawContent: string) {
  const matches = [...rawContent.matchAll(INLINE_RESOURCE_MARKDOWN_RE)];
  if (matches.length === 0) {
    return {
      enhancedContent: rawContent,
      assets: [] as EnhancementAssetResult[],
    };
  }

  let output = "";
  let cursor = 0;
  const assets: EnhancementAssetResult[] = [];

  for (const match of matches) {
    const fullMatch = match[0];
    const source = match[3];
    const index = match.index ?? 0;

    output += rawContent.slice(cursor, index);
    output += fullMatch;

    try {
      const url = new URL(source);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("only http/https resource URLs are supported");
      }

      if (!hasEnhanceableFileName(source)) {
        cursor = index + fullMatch.length;
        continue;
      }

      const remote = await fetchRemoteAsset(source);
      const fileType = inferRemoteFileType(source, remote.contentType);
      if (!fileType) {
        throw new Error("unsupported remote resource type");
      }

      const parsedText = await parseFileContent(remote.buffer, fileType);
      const insertedText = formatSuccessBlock({
        source,
        type: remote.contentType ?? fileType,
        parsedText,
      });

      output += insertedText;
      assets.push({
        source,
        type: remote.contentType ?? fileType,
        status: "success",
        insertedText,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      const insertedText = formatFailureBlock({ source, error: message });
      output += insertedText;
      assets.push({
        source,
        type: "unknown",
        status: "failed",
        insertedText,
        error: message,
      });
    }

    cursor = index + fullMatch.length;
  }

  output += rawContent.slice(cursor);
  return { enhancedContent: output, assets };
}

export async function enhanceNoteService(id: string, input: EnhanceNoteInput) {
  const existing = await prisma.documentSource.findFirst({
    where: { id, sourceType: "markdown", fileType: "note" },
    select: { id: true, rawContent: true },
  });

  if (!existing) {
    throw new ServiceError("Note not found", 404);
  }

  const enabled = input.enabled ?? true;
  const rawContent = input.rawContent ?? existing.rawContent ?? "";

  if (!enabled) {
    await prisma.documentSource.update({
      where: { id },
      data: {
        rawContent,
        fileSize: Buffer.byteLength(rawContent, "utf-8"),
        enhancementEnabled: false,
      },
    });

    if (input.reparse ?? true) {
      await parseDocument(id);
    }

    return {
      note: await getNoteDetailService(id),
      enhancement: {
        enabled: false,
        enhancedAt: null,
        assetCount: 0,
        successCount: 0,
        failedCount: 0,
        assets: [] as EnhancementAssetResult[],
      },
    };
  }

  const { enhancedContent, assets } = await enhanceMarkdown(rawContent);
  const enhancedAt = new Date();

  await prisma.documentSource.update({
    where: { id },
    data: {
      rawContent,
      fileSize: Buffer.byteLength(rawContent, "utf-8"),
      enhancedContent,
      enhancementEnabled: true,
      enhancedAt,
    },
  });

  if (input.reparse ?? true) {
    await parseDocument(id);
  }

  const successCount = assets.filter(
    (asset) => asset.status === "success"
  ).length;

  return {
    note: await getNoteDetailService(id),
    enhancement: {
      enabled: true,
      enhancedAt: enhancedAt.toISOString(),
      assetCount: assets.length,
      successCount,
      failedCount: assets.length - successCount,
      assets,
    },
  };
}
