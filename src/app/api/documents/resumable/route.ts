import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import {
  resumableUploadChunkSchema,
  resumableUploadCompleteSchema,
  resumableUploadQuerySchema,
  uploadFileSchema,
} from "@/features/document/components/document.validation";
import {
  createDocument,
  getFileTypeFromName,
  saveDocumentFile,
  updateDocumentStatus,
} from "@/server/services/document.service";

const CHUNK_ROOT = path.join(process.cwd(), "public", "uploads", ".chunks");
const CHUNK_SIZE = 2 * 1024 * 1024;

type UploadManifest = {
  uploadId: string;
  fingerprint: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  chunkSize: number;
  totalChunks: number;
  uploadedChunks: number[];
  createdAt: string;
  updatedAt: string;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json(
    { success: false, error: { code: "VALIDATION_ERROR", message } },
    { status }
  );
}

function getUploadId(fingerprint: string, fileName: string, fileSize: number) {
  return crypto
    .createHash("sha256")
    .update(`${fingerprint}:${fileName}:${fileSize}`)
    .digest("hex");
}

function getUploadDir(uploadId: string) {
  return path.join(CHUNK_ROOT, uploadId);
}


function getManifestPath(uploadId: string) {
  return path.join(getUploadDir(uploadId), "manifest.json");
}

function getChunkPath(uploadId: string, chunkIndex: number) {
  return path.join(getUploadDir(uploadId), `${chunkIndex}.part`);
}

async function ensureUploadDir(uploadId: string) {
  await fs.mkdir(getUploadDir(uploadId), { recursive: true });
}

async function readManifest(uploadId: string): Promise<UploadManifest | null> {
  try {
    const content = await fs.readFile(getManifestPath(uploadId), "utf8");
    return JSON.parse(content) as UploadManifest;
  } catch {
    return null;
  }
}

async function writeManifest(manifest: UploadManifest) {
  await ensureUploadDir(manifest.uploadId);
  await fs.writeFile(
    getManifestPath(manifest.uploadId),
    JSON.stringify({ ...manifest, updatedAt: new Date().toISOString() }, null, 2)
  );
}

async function getOrCreateManifest(input: {
  fingerprint: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  chunkSize: number;
  totalChunks: number;
}) {
  const uploadId = getUploadId(input.fingerprint, input.fileName, input.fileSize);
  const existing = await readManifest(uploadId);
  if (existing) {
    if (
      existing.fingerprint !== input.fingerprint ||
      existing.fileName !== input.fileName ||
      existing.fileSize !== input.fileSize ||
      existing.fileType !== input.fileType ||
      existing.chunkSize !== input.chunkSize ||
      existing.totalChunks !== input.totalChunks
    ) {
      throw new Error("上传会话元数据不一致，请重新选择文件");
    }

    return existing;
  }

  const now = new Date().toISOString();
  const manifest: UploadManifest = {
    uploadId,
    fingerprint: input.fingerprint,
    fileName: input.fileName,
    fileSize: input.fileSize,
    fileType: input.fileType,
    chunkSize: input.chunkSize,
    totalChunks: input.totalChunks,
    uploadedChunks: [],
    createdAt: now,
    updatedAt: now,
  };

  await writeManifest(manifest);
  return manifest;
}

function serializeManifest(manifest: UploadManifest) {
  return {
    uploadId: manifest.uploadId,
    fileName: manifest.fileName,
    fileSize: manifest.fileSize,
    fileType: manifest.fileType,
    chunkSize: manifest.chunkSize,
    totalChunks: manifest.totalChunks,
    uploadedChunks: manifest.uploadedChunks.sort((a, b) => a - b),
    uploadedCount: manifest.uploadedChunks.length,
    completed: manifest.uploadedChunks.length === manifest.totalChunks,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get("fileName") ?? "";
    const fileType = getFileTypeFromName(fileName);
    const parsed = resumableUploadQuerySchema.safeParse({
      fingerprint: searchParams.get("fingerprint") ?? undefined,
      fileName,
      fileSize: searchParams.get("fileSize") ?? undefined,
      fileType,
      totalChunks: searchParams.get("totalChunks") ?? undefined,
      chunkSize: searchParams.get("chunkSize") ?? undefined,
    });

    if (!parsed.success) {
      return jsonError(parsed.error.issues[0].message);
    }

    if (parsed.data.chunkSize !== CHUNK_SIZE) {
      return jsonError("上传分片大小不匹配，请刷新页面后重试");
    }

    const uploadValidation = uploadFileSchema.safeParse({
      fileName: parsed.data.fileName,
      fileSize: parsed.data.fileSize,
      fileType: parsed.data.fileType,
    });

    if (!uploadValidation.success) {
      return jsonError(uploadValidation.error.issues[0].message);
    }

    const manifest = await getOrCreateManifest(parsed.data);
    return NextResponse.json({ success: true, data: serializeManifest(manifest) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建上传会话失败";
    return NextResponse.json(
      { success: false, error: { code: "UPLOAD_SESSION_ERROR", message } },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const formData = await request.formData();
    const chunk = formData.get("chunk") as File | null;
    const parsed = resumableUploadChunkSchema.safeParse({
      uploadId: formData.get("uploadId"),
      chunkIndex: formData.get("chunkIndex"),
    });

    if (!chunk) return jsonError("缺少上传分片");
    if (!parsed.success) return jsonError(parsed.error.issues[0].message);

    const manifest = await readManifest(parsed.data.uploadId);
    if (!manifest) return jsonError("上传会话不存在", 404);
    if (parsed.data.chunkIndex >= manifest.totalChunks) {
      return jsonError("分片序号超出范围");
    }

    await ensureUploadDir(manifest.uploadId);
    const buffer = Buffer.from(await chunk.arrayBuffer());
    const expectedSize =
      parsed.data.chunkIndex === manifest.totalChunks - 1
        ? manifest.fileSize - manifest.chunkSize * (manifest.totalChunks - 1)
        : manifest.chunkSize;

    if (buffer.byteLength !== expectedSize) {
      return jsonError("分片大小不匹配");
    }

    await fs.writeFile(getChunkPath(manifest.uploadId, parsed.data.chunkIndex), buffer);

    const uploadedChunks = new Set(manifest.uploadedChunks);
    uploadedChunks.add(parsed.data.chunkIndex);
    const nextManifest = {
      ...manifest,
      uploadedChunks: [...uploadedChunks].sort((a, b) => a - b),
    };
    await writeManifest(nextManifest);

    return NextResponse.json({ success: true, data: serializeManifest(nextManifest) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "分片上传失败";
    return NextResponse.json(
      { success: false, error: { code: "UPLOAD_ERROR", message } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = resumableUploadCompleteSchema.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error.issues[0].message);

    const manifest = await readManifest(parsed.data.uploadId);
    if (!manifest) return jsonError("上传会话不存在", 404);

    const uploadedChunks = new Set(manifest.uploadedChunks);
    const missingChunks = Array.from({ length: manifest.totalChunks }, (_, index) => index).filter(
      (index) => !uploadedChunks.has(index)
    );

    if (missingChunks.length > 0) {
      return jsonError(`还有 ${missingChunks.length} 个分片未上传`);
    }

    const buffers = await Promise.all(
      Array.from({ length: manifest.totalChunks }, (_, index) => fs.readFile(getChunkPath(manifest.uploadId, index)))
    );
    for (let index = 0; index < buffers.length; index += 1) {
      const expectedSize =
        index === manifest.totalChunks - 1
          ? manifest.fileSize - manifest.chunkSize * (manifest.totalChunks - 1)
          : manifest.chunkSize;

      if (buffers[index].byteLength !== expectedSize) {
        return jsonError(`第 ${index + 1} 个分片大小不匹配`);
      }
    }

    const fileBuffer = Buffer.concat(buffers);

    if (fileBuffer.byteLength !== manifest.fileSize) {
      return jsonError("合并后的文件大小不匹配");
    }

    const doc = await createDocument({
      originalName: manifest.fileName,
      fileType: manifest.fileType,
      fileSize: manifest.fileSize,
    });

    await saveDocumentFile(doc.id, fileBuffer);
    await updateDocumentStatus(doc.id, "uploaded");
    await fs.rm(getUploadDir(manifest.uploadId), { recursive: true, force: true });

    return NextResponse.json({
      success: true,
      data: {
        id: doc.id,
        originalName: doc.originalName,
        fileType: doc.fileType,
        fileSize: doc.fileSize,
        status: "uploaded",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传合并失败";
    return NextResponse.json(
      { success: false, error: { code: "UPLOAD_ERROR", message } },
      { status: 500 }
    );
  }
}
