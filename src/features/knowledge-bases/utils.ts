import type {
  KnowledgeBaseFormValues,
  RagChunk,
  RagDoc,
  RagIconName,
  RagListItem,
  RagStatus,
  RagTag,
  SortDirection,
  SortField,
  StatusFilter,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toStringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

function toNumberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toStatus(value: unknown): RagStatus {
  return value === "active" || value === "disabled" ? value : "disabled";
}

export const RAG_ICON_OPTIONS = [
  { value: "Database", label: "数据库", className: "text-blue-600 bg-blue-50" },
  {
    value: "BookOpen",
    label: "知识",
    className: "text-emerald-600 bg-emerald-50",
  },
  { value: "FileText", label: "文档", className: "text-cyan-600 bg-cyan-50" },
  { value: "Folder", label: "文件夹", className: "text-yellow-600 bg-yellow-50" },
  { value: "Archive", label: "归档", className: "text-orange-600 bg-orange-50" },
  { value: "Brain", label: "智能", className: "text-purple-600 bg-purple-50" },
  { value: "Bot", label: "Agent", className: "text-indigo-600 bg-indigo-50" },
  {
    value: "GraduationCap",
    label: "学习",
    className: "text-pink-600 bg-pink-50",
  },
  {
    value: "BriefcaseBusiness",
    label: "业务",
    className: "text-slate-600 bg-slate-50",
  },
  { value: "Lightbulb", label: "经验", className: "text-amber-600 bg-amber-50" },
] as const satisfies readonly {
  value: RagIconName;
  label: string;
  className: string;
}[];

export function isRagIconName(value: unknown): value is RagIconName {
  return RAG_ICON_OPTIONS.some((option) => option.value === value);
}

export function normalizeRagIcon(value: unknown): RagIconName {
  return isRagIconName(value) ? value : "Database";
}

export function getRagIconOption(icon: unknown) {
  const normalized = normalizeRagIcon(icon);

  return (
    RAG_ICON_OPTIONS.find((option) => option.value === normalized) ??
    RAG_ICON_OPTIONS[0]
  );
}

export function createClientId() {
  return `kb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeRagTags(value: unknown): RagTag[] {
  if (!Array.isArray(value)) return [];

  return value
    .flatMap((tag): RagTag[] => {
      if (!isRecord(tag)) return [];

      const id = toStringValue(tag.id, "");
      const name = toStringValue(tag.name, "");

      if (!id || !name) return [];

      return [
        {
          id,
          name,
          color: typeof tag.color === "string" ? tag.color : null,
          sortOrder: toNumberValue(tag.sortOrder, 0),
          createdAt:
            typeof tag.createdAt === "string" ? tag.createdAt : undefined,
          updatedAt:
            typeof tag.updatedAt === "string" ? tag.updatedAt : undefined,
        },
      ];
    })
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

export function normalizeRagItem(input: unknown): RagListItem {
  const item = isRecord(input) ? input : {};

  return {
    id: toStringValue(item.id, createClientId()),
    name: toStringValue(item.name, "未命名知识库"),
    description: toStringValue(item.description, "暂无描述"),
    icon: normalizeRagIcon(item.icon),
    documentCount: toNumberValue(item.documentCount, 0),
    chunkCount: toNumberValue(item.chunkCount, 0),
    knowledgeCount: toNumberValue(item.knowledgeCount, 0),
    topK: toNumberValue(item.topK, 0),
    similarityThreshold: toNumberValue(item.similarityThreshold, 0),
    tags: normalizeRagTags(item.tags),
    status: toStatus(item.status),
    updatedAt: toStringValue(item.updatedAt, "--"),
  };
}

export function normalizeRagItems(input: unknown): RagListItem[] {
  const list = Array.isArray(input)
    ? input
    : isRecord(input) && Array.isArray(input.data)
      ? input.data
      : [];

  return list.map(normalizeRagItem);
}

export function getKnowledgeBaseStats(items: RagListItem[]) {
  return {
    total: items.length,
    active: items.filter((item) => item.status === "active").length,
    disabled: items.filter((item) => item.status === "disabled").length,
  };
}

export function filterAndSortRagItems(params: {
  items: RagListItem[];
  keyword: string;
  statusFilter: StatusFilter;
  sortField: SortField;
  sortDirection: SortDirection;
}) {
  const keyword = params.keyword.trim().toLowerCase();

  const filtered = params.items
    .filter((item) => {
      if (!keyword) return true;

      return (
        item.name.toLowerCase().includes(keyword) ||
        item.description.toLowerCase().includes(keyword) ||
        item.tags.some((tag) => tag.name.toLowerCase().includes(keyword))
      );
    })
    .filter((item) => {
      if (!params.statusFilter || params.statusFilter === "all") return true;
      return item.status === params.statusFilter;
    });

  return [...filtered].sort((left, right) => {
    const factor = params.sortDirection === "desc" ? -1 : 1;

    if (params.sortField === "documentCount") {
      return (left.documentCount - right.documentCount) * factor;
    }

    return (
      (new Date(left.updatedAt).getTime() -
        new Date(right.updatedAt).getTime()) *
      factor
    );
  });
}

export function validateKnowledgeBaseForm(params: {
  values: KnowledgeBaseFormValues;
  items: RagListItem[];
  editingId?: string | null;
}) {
  const name = params.values.name.trim();

  if (!name) return "知识库名称不能为空";
  if (!Number.isInteger(params.values.topK) || params.values.topK <= 0) {
    return "TopK 必须为正整数";
  }

  if (params.values.tagIds.length > 10) {
    return "单个知识库最多绑定 10 个标签";
  }

  const duplicated = params.items.some(
    (item) => item.id !== params.editingId && item.name.trim() === name
  );

  if (duplicated) return "知识库名称不能重复";

  return null;
}

export const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;

export const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  ".markdown",
];

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
];

function getFileExtension(fileName: string) {
  const index = fileName.lastIndexOf(".");

  return index >= 0 ? fileName.slice(index).toLowerCase() : "";
}

export function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function validateUploadFile(params: {
  files: FileList | File[];
  selectedDocs: RagDoc[];
}) {
  const files = Array.from(params.files);

  if (files.length === 0) return "请选择要上传的文件";
  if (files.length > 1) return "当前仅支持一次上传 1 个文件";

  const file = files[0];
  const extension = getFileExtension(file.name);
  const validExtension = ALLOWED_EXTENSIONS.includes(extension);
  const validMime =
    !file.type || ALLOWED_MIME_TYPES.includes(file.type) || validExtension;

  if (!validExtension || !validMime) {
    return "仅支持 PDF、DOCX、TXT、Markdown 文件";
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    return "文件大小不能超过 20MB";
  }

  const duplicated = params.selectedDocs.some((doc) => doc.name === file.name);

  if (duplicated) {
    return "当前知识库已存在同名文档";
  }

  return null;
}

export function createMockDocumentFromFile(file: File): RagDoc {
  return {
    id: createClientId(),
    name: file.name,
    size: file.size,
    fileSize: file.size,
    uploadedAt: new Date().toISOString(),
  };
}

export function createMockChunksForDocument(doc: RagDoc): RagChunk[] {
  const count = 2 + Math.floor(Math.random() * 2);

  return Array.from({ length: count }, (_, index) => {
    const content = `这是从 ${doc.name} 生成的模拟知识分片 ${index + 1}。`;

    return {
      id: createClientId(),
      documentId: doc.id,
      content,
      charCount: content.length,
      tokenCount: Math.ceil(content.length / 2),
      chunkIndex: index,
      createdAt: new Date().toISOString(),
    };
  });
}

export function getTotalChunkCount(
  chunksByDocumentId: Record<string, RagChunk[]>
) {
  return Object.values(chunksByDocumentId).reduce(
    (sum, chunks) => sum + chunks.length,
    0
  );
}

export function normalizeRagDoc(input: unknown): RagDoc {
  const item = isRecord(input) ? input : {};
  const fileSize = toNumberValue(item.fileSize, toNumberValue(item.size, 0));
  const name = toStringValue(
    item.name,
    toStringValue(item.title, "未命名文档")
  );

  return {
    id: toStringValue(item.id, createClientId()),
    name,
    title: toStringValue(item.title, name),
    originalName: toStringValue(item.originalName, ""),
    fileName:
      typeof item.fileName === "string" || item.fileName === null
        ? item.fileName
        : null,
    sourceType: toStringValue(item.sourceType, "manual"),
    fileType: toStringValue(item.fileType, "file"),
    rawContent:
      typeof item.rawContent === "string" || item.rawContent === null
        ? item.rawContent
        : undefined,
    status: toStringValue(item.status, "pending"),
    activeStatus: toStringValue(item.activeStatus, "active"),
    chunkCount: toNumberValue(item.chunkCount, 0),
    size: fileSize,
    fileSize,
    uploadedAt: toStringValue(
      item.uploadedAt,
      toStringValue(item.createdAt, "--")
    ),
    createdAt: toStringValue(item.createdAt, "--"),
    updatedAt: toStringValue(item.updatedAt, "--"),
    chunks: Array.isArray(item.chunks)
      ? item.chunks.map(normalizeRagChunk)
      : undefined,
  };
}

export function normalizeRagChunk(input: unknown): RagChunk {
  const item = isRecord(input) ? input : {};
  const content = toStringValue(item.content, "暂无内容");

  return {
    id: toStringValue(item.id, createClientId()),
    documentId: toStringValue(item.documentId, ""),
    content,
    charCount: toNumberValue(item.charCount, content.length),
    tokenCount:
      typeof item.tokenCount === "number" && Number.isFinite(item.tokenCount)
        ? item.tokenCount
        : undefined,
    createdAt: toStringValue(item.createdAt, "--"),
    updatedAt: toStringValue(item.updatedAt, "--"),
    chunkIndex: toNumberValue(item.chunkIndex, 0),
    status: toStringValue(item.status, "active"),
    startIndex: toNumberValue(item.startIndex, 0),
    endIndex: toNumberValue(item.endIndex, content.length),
    chunkType: typeof item.chunkType === "string" ? item.chunkType : undefined,
    title: typeof item.title === "string" ? item.title : undefined,
    suggestedCategory:
      typeof item.suggestedCategory === "string"
        ? item.suggestedCategory
        : undefined,
    suggestedTags:
      typeof item.suggestedTags === "string" ? item.suggestedTags : undefined,
    knowledgeType:
      typeof item.knowledgeType === "string" ? item.knowledgeType : undefined,
    knowledgeBaseId:
      typeof item.knowledgeBaseId === "string" ? item.knowledgeBaseId : undefined,
    reviewStatus:
      typeof item.reviewStatus === "string" ? item.reviewStatus : undefined,
  };
}
