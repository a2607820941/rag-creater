import { ServiceError } from "@/features/knowledge-bases/server/errors";
import { prisma } from "@/lib/db";

import type { CreateNoteInput, UpdateNoteInput } from "./schemas";

const NOTE_WHERE = {
  sourceType: "markdown",
  fileType: "note",
} as const;

function normalizeTitle(title?: string) {
  const normalized = title?.trim();
  return normalized && normalized.length > 0 ? normalized : "未命名文档";
}

function byteLength(content: string) {
  return Buffer.byteLength(content, "utf-8");
}

function mapNoteSummary(note: {
  id: string;
  title: string;
  fileSize: number;
  sourceType: string;
  fileType: string;
  status: string;
  activeStatus: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: note.id,
    title: note.title,
    fileSize: note.fileSize,
    sourceType: note.sourceType as "markdown",
    fileType: note.fileType as "note",
    status: note.status,
    activeStatus: note.activeStatus,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

function mapNoteDetail(note: {
  id: string;
  originalName: string;
  title: string;
  rawContent: string | null;
  fileSize: number;
  sourceType: string;
  fileType: string;
  status: string;
  activeStatus: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...mapNoteSummary(note),
    originalName: note.originalName,
    rawContent: note.rawContent,
  };
}

export async function listNotesService() {
  const notes = await prisma.documentSource.findMany({
    where: NOTE_WHERE,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      fileSize: true,
      sourceType: true,
      fileType: true,
      status: true,
      activeStatus: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return notes.map(mapNoteSummary);
}

export async function getNoteDetailService(id: string) {
  const note = await prisma.documentSource.findFirst({
    where: { id, ...NOTE_WHERE },
    select: {
      id: true,
      originalName: true,
      title: true,
      rawContent: true,
      fileSize: true,
      sourceType: true,
      fileType: true,
      status: true,
      activeStatus: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!note) {
    throw new ServiceError("Note not found", 404);
  }

  return mapNoteDetail(note);
}

export async function createNoteService(input: CreateNoteInput) {
  const title = normalizeTitle(input.title);
  const rawContent = input.rawContent ?? "";

  const note = await prisma.documentSource.create({
    data: {
      originalName: title,
      title,
      fileType: "note",
      fileName: `${title}.md`,
      fileUrl: null,
      mimeType: "text/markdown",
      fileSize: byteLength(rawContent),
      sourceType: "markdown",
      rawContent,
      status: "pending",
      activeStatus: "disabled",
      chunkCount: 0,
    },
  });

  return mapNoteDetail(note);
}

export async function updateNoteService(id: string, input: UpdateNoteInput) {
  await getNoteDetailService(id);

  const data: {
    title?: string;
    originalName?: string;
    fileName?: string;
    rawContent?: string;
    fileSize?: number;
    status?: "pending" | "parsed" | "uploaded";
    activeStatus?: "active" | "disabled";
  } = {};

  if (input.title !== undefined) {
    const title = normalizeTitle(input.title);
    data.title = title;
    data.originalName = title;
    data.fileName = `${title}.md`;
  }

  if (input.rawContent !== undefined) {
    data.rawContent = input.rawContent;
    data.fileSize = byteLength(input.rawContent);
  }

  if (input.status !== undefined) {
    data.status = input.status;
  }

  if (input.activeStatus !== undefined) {
    data.activeStatus = input.activeStatus;
  }

  const note = await prisma.documentSource.update({
    where: { id },
    data,
  });

  if (input.activeStatus === "disabled") {
    await prisma.documentChunk.updateMany({
      where: { documentSourceId: id },
      data: { chunkStatus: "disabled" },
    });
  } else if (input.activeStatus === "active") {
    await prisma.documentChunk.updateMany({
      where: { documentSourceId: id },
      data: { chunkStatus: "active" },
    });
  }

  return mapNoteDetail(note);
}

export async function deleteNoteService(id: string) {
  await getNoteDetailService(id);

  return prisma.documentSource.delete({
    where: { id },
    select: { id: true },
  });
}
