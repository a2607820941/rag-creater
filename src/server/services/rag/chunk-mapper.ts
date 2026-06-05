import type {
  KnowledgeChunk,
  KnowledgeChunkType,
  KnowledgeSourceType,
} from "@/features/rag/types";

type KnowledgeBaseRelationRecord = {
  knowledgeBaseId: string;
  knowledgeBase?: {
    id: string;
    name: string;
    status: string;
  } | null;
};

type DocumentSourceRecord = {
  id: string;
  title: string;
  originalName: string;
  sourceType: string;
  fileName: string | null;
  fileUrl: string | null;
  mimeType: string | null;
  fileSize: number;
  status: string;
  activeStatus: string;
  knowledgeBaseId?: string | null;
  knowledgeBases?: KnowledgeBaseRelationRecord[];
};

export type DocumentChunkRecordForRag = {
  id: string;
  documentSourceId: string | null;
  content: string;
  chunkIndex: number;
  charStart: number;
  charEnd: number;
  chunkType: string;
  title: string | null;
  suggestedCategory: string | null;
  suggestedTags: string | null;
  knowledgeType: string | null;
  knowledgeBaseId: string | null;
  reviewStatus: string | null;
  chunkStatus: string;
  createdAt: Date;
  updatedAt: Date;
  documentSource?: DocumentSourceRecord | null;
};

type MapChunkOptions = {
  knowledgeBaseId?: string;
  knowledgeBaseName?: string;
};

export function mapDocumentChunkToKnowledgeChunk(
  chunk: DocumentChunkRecordForRag,
  options: MapChunkOptions = {}
): KnowledgeChunk {
  const document = chunk.documentSource;
  const relation = document?.knowledgeBases?.[0];
  const knowledgeBaseId =
    options.knowledgeBaseId ??
    relation?.knowledgeBaseId ??
    document?.knowledgeBaseId ??
    "";
  const knowledgeBaseName =
    options.knowledgeBaseName ?? relation?.knowledgeBase?.name;
  const tagIds = parseSuggestedTags(chunk.suggestedTags);

  return {
    id: chunk.id,
    knowledgeBaseId,
    knowledgeId: document?.id ?? chunk.documentSourceId ?? chunk.id,
    title: chunk.title ?? document?.title ?? document?.originalName ?? "",
    content: chunk.content,
    summary: chunk.title ?? undefined,
    categoryId: chunk.suggestedCategory ?? undefined,
    tagIds,
    status: chunk.chunkStatus === "active" ? "available" : "disabled",
    sourceType: normalizeSourceType(document?.sourceType),
    chunkType: normalizeChunkType(chunk.chunkType, chunk.knowledgeType),
    chunkIndex: chunk.chunkIndex,
    metadata: {
      documentId: document?.id ?? chunk.documentSourceId,
      documentTitle: document?.title,
      knowledgeBaseId,
      knowledgeBaseName,
      fileName: document?.fileName,
      fileUrl: document?.fileUrl,
      mimeType: document?.mimeType,
      fileSize: document?.fileSize,
      sourceType: document?.sourceType,
      documentStatus: document?.status,
      documentActiveStatus: document?.activeStatus,
      startIndex: chunk.charStart,
      endIndex: chunk.charEnd,
      suggestedCategory: chunk.suggestedCategory,
      suggestedTags: tagIds,
      knowledgeType: chunk.knowledgeType,
      confirmedKnowledgeBaseId: chunk.knowledgeBaseId,
      reviewStatus: chunk.reviewStatus,
    },
    createdAt: chunk.createdAt.toISOString(),
    updatedAt: chunk.updatedAt.toISOString(),
  };
}

export function isRetrievableDocumentChunk(chunk: {
  chunkType: string;
  reviewStatus: string | null;
}) {
  if (chunk.chunkType === "text") return true;
  return chunk.chunkType === "knowledge" && chunk.reviewStatus === "confirmed";
}

export function getRetrievableChunkWhere() {
  return {
    OR: [
      { chunkType: "text" },
      { chunkType: "knowledge", reviewStatus: "confirmed" },
    ],
  };
}

/** 将入库侧 sourceType 适配成 RAG 对接文档约定的来源类型。 */
function normalizeSourceType(sourceType: string | undefined): KnowledgeSourceType {
  if (sourceType === "manual") return "manual";
  if (sourceType === "file") return "file";
  if (sourceType === "wiki") return "wiki";
  return "import";
}

/** 将统一 DocumentChunk 的 chunkType/knowledgeType 映射为 RAG 检索契约类型。 */
function normalizeChunkType(
  chunkType: string,
  knowledgeType: string | null
): KnowledgeChunkType {
  if (chunkType === "text") return "text";
  if (chunkType === "wiki") return "wiki";
  if (chunkType === "summary") return "summary";
  if (chunkType === "qa") return "qa";

  if (chunkType === "knowledge") {
    if (knowledgeType === "faq") return "qa";
    return "summary";
  }

  return "text";
}

/** suggestedTags 当前以 JSON 字符串保存，兼容逗号分隔的旧输入。 */
function parseSuggestedTags(value: string | null): string[] | undefined {
  if (!value) return undefined;

  try {
    const parsedValue: unknown = JSON.parse(value);
    if (Array.isArray(parsedValue)) {
      const tags = parsedValue.filter(
        (item): item is string => typeof item === "string" && item.trim() !== ""
      );
      return tags.length > 0 ? tags : undefined;
    }
  } catch {
    const tags = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return tags.length > 0 ? tags : undefined;
  }

  return undefined;
}
