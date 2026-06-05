import { prisma } from "@/lib/db";

const DOCUMENT_MAP_LIMIT = 50;
const DOCUMENT_MAP_SUMMARY_LIMIT = 180;
const MAX_RETRIEVE_DOCUMENTS = 3;
const RETRIEVED_CONTENT_CHAR_LIMIT = 18000;

export type KnowledgeDocumentToolInput = {
  documents: string[];
};

export type KnowledgeDocumentMapItem = {
  id: string;
  title: string;
  fileType: string;
  chunkCount: number;
  summary: string;
};

export type RetrievedKnowledgeDocument = {
  id: string;
  title: string;
  fileType: string;
  chunkCount: number;
  content: string;
  originalCharCount: number;
  returnedCharCount: number;
  truncated: boolean;
};

export type KnowledgeDocumentRetrieveResult = {
  files: RetrievedKnowledgeDocument[];
  missing: string[];
  limited: boolean;
};

export type KnowledgeFile = {
  id: string;
  title: string;
  chunkCount: number;
};

export async function buildKnowledgeDocumentMap(): Promise<{
  items: KnowledgeDocumentMapItem[];
  text: string;
}> {
  const documents = await prisma.documentSource.findMany({
    where: { status: "parsed" },
    orderBy: { updatedAt: "desc" },
    take: DOCUMENT_MAP_LIMIT,
    select: {
      id: true,
      originalName: true,
      fileType: true,
      chunkCount: true,
      rawContent: true,
    },
  });

  const items = documents.map((document) => ({
    id: document.id,
    title: document.originalName,
    fileType: document.fileType,
    chunkCount: document.chunkCount,
    summary: summarizeText(document.rawContent ?? "", DOCUMENT_MAP_SUMMARY_LIMIT),
  }));

  return {
    items,
    text: formatKnowledgeDocumentMap(items),
  };
}

export async function retrieveKnowledgeDocuments(
  input: KnowledgeDocumentToolInput
): Promise<KnowledgeDocumentRetrieveResult> {
  const requestedDocuments = normalizeRequestedDocuments(input.documents);
  const limitedRequests = requestedDocuments.slice(0, MAX_RETRIEVE_DOCUMENTS);
  const limited = requestedDocuments.length > MAX_RETRIEVE_DOCUMENTS;

  if (limitedRequests.length === 0) {
    return { files: [], missing: [], limited };
  }

  const candidates = await prisma.documentSource.findMany({
    where: { status: "parsed" },
    select: {
      id: true,
      originalName: true,
      fileType: true,
      chunkCount: true,
    },
  });

  const files: RetrievedKnowledgeDocument[] = [];
  const missing: string[] = [];
  let remainingBudget = RETRIEVED_CONTENT_CHAR_LIMIT;

  for (const request of limitedRequests) {
    const matched = findDocumentMatch(request, candidates);
    if (!matched) {
      missing.push(request);
      continue;
    }

    const document = await prisma.documentSource.findUnique({
      where: { id: matched.id },
      include: {
        chunks: {
          orderBy: { chunkIndex: "asc" },
        },
      },
    });

    if (!document) {
      missing.push(request);
      continue;
    }

    const content = getDocumentContent(document);
    const originalCharCount = content.length;
    const truncatedContent = truncateText(content, Math.max(remainingBudget, 0));
    remainingBudget -= truncatedContent.length;

    files.push({
      id: document.id,
      title: document.originalName,
      fileType: document.fileType,
      chunkCount: document.chunkCount,
      content: truncatedContent,
      originalCharCount,
      returnedCharCount: truncatedContent.length,
      truncated: truncatedContent.length < originalCharCount,
    });

    if (remainingBudget <= 0) break;
  }

  return { files, missing, limited };
}

export function formatKnowledgeDocumentToolResult(
  result: KnowledgeDocumentRetrieveResult
): string {
  const lines = [
    "retrieve_files 工具结果：",
    result.files.length > 0 ? "已读取文档：" : "没有读取到可用文档。",
  ];

  for (const file of result.files) {
    const truncationNotice = file.truncated
      ? `\n注意：该文档原文约 ${file.originalCharCount} 字，本次工具只返回前 ${file.returnedCharCount} 字，未覆盖全文。回答时不要声称已经读取全文。`
      : `\n该文档本次工具结果未截断。`;

    lines.push(
      `\n[document:${file.id}] ${file.title} (${file.fileType}, ${file.chunkCount} 段)${truncationNotice}\n${file.content}`
    );
  }

  if (result.missing.length > 0) {
    lines.push(`\n未找到文档：${result.missing.join("、")}`);
  }

  if (result.limited) {
    lines.push(`\n单次最多读取 ${MAX_RETRIEVE_DOCUMENTS} 个文档，已按顺序截断。`);
  }

  return lines.join("\n");
}

function formatKnowledgeDocumentMap(items: KnowledgeDocumentMapItem[]): string {
  if (items.length === 0) {
    return "当前没有已导入并解析完成的文档。";
  }

  return items
    .map(
      (item, index) =>
        `${index + 1}. documentId=${item.id}\n标题：${item.title}\n类型：${
          item.fileType
        }\n分片数：${item.chunkCount}\n摘要：${item.summary || "暂无摘要"}`
    )
    .join("\n\n");
}

function normalizeRequestedDocuments(documents: string[]) {
  return documents
    .map((document) => document.trim())
    .filter((document, index, array) => document && array.indexOf(document) === index);
}

function findDocumentMatch(
  request: string,
  candidates: Array<{ id: string; originalName: string }>
) {
  const normalizedRequest = normalizeMatchText(request);

  return (
    candidates.find((document) => document.id === request) ??
    candidates.find(
      (document) => normalizeMatchText(document.originalName) === normalizedRequest
    ) ??
    candidates.find((document) =>
      normalizeMatchText(document.originalName).includes(normalizedRequest)
    )
  );
}

function getDocumentContent(document: {
  rawContent: string | null;
  chunks: Array<{ content: string }>;
}) {
  if (document.chunks.length > 0) {
    return document.chunks.map((chunk) => chunk.content).join("\n\n");
  }

  return document.rawContent ?? "";
}

function summarizeText(text: string, limit: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit)}...`;
}

function truncateText(text: string, limit: number) {
  if (limit <= 0) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(limit - 3, 0))}...`;
}

function normalizeMatchText(text: string) {
  return text.trim().toLowerCase();
}
