export type RagStatus = "active" | "disabled";

export type RagIconName =
  | "Database"
  | "BookOpen"
  | "FileText"
  | "Folder"
  | "Archive"
  | "Brain"
  | "Bot"
  | "GraduationCap"
  | "BriefcaseBusiness"
  | "Lightbulb";

export type RagListItem = {
  id: string;
  name: string;
  description: string;
  icon: RagIconName;
  documentCount: number;
  chunkCount: number;
  knowledgeCount?: number;
  topK: number;
  similarityThreshold: number;
  status: RagStatus;
  updatedAt: string;
};

export type RagDoc = {
  id: string;
  name: string;
  title?: string;
  originalName?: string;
  fileName?: string | null;
  sourceType?: string;
  fileType?: string;
  rawContent?: string | null;
  status?: string;
  activeStatus?: string;
  chunkCount?: number;
  size: number;
  fileSize?: number;
  uploadedAt: string;
  createdAt?: string;
  updatedAt?: string;
  chunks?: RagChunk[];
};

export type RagChunk = {
  id: string;
  documentId: string;
  content: string;
  tokenCount?: number;
  charCount?: number;
  createdAt?: string;
  updatedAt?: string;
  chunkIndex?: number;
  status?: string;
  startIndex?: number;
  endIndex?: number;
  chunkType?: string;
  title?: string | null;
  suggestedCategory?: string | null;
  suggestedTags?: string | null;
  knowledgeType?: string | null;
  knowledgeBaseId?: string | null;
  reviewStatus?: string | null;
};

export type RagDetail = RagListItem;

export type KnowledgeBaseFormValues = {
  name: string;
  description: string;
  icon: RagIconName;
  topK: number;
  similarityThreshold: number;
  status: RagStatus;
};

export type SortField = "updatedAt" | "documentCount";
export type SortDirection = "desc" | "asc";
export type StatusFilter = "all" | "active" | "disabled" | null;

export const DEFAULT_KNOWLEDGE_BASE_FORM_VALUES = {
  name: "",
  description: "",
  icon: "Database",
  topK: 5,
  similarityThreshold: 0.7,
  status: "active",
} satisfies KnowledgeBaseFormValues;
