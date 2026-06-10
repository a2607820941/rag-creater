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

export type RagTag = {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

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
  tags: RagTag[];
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
  tagIds: string[];
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
  tagIds: [],
  status: "active",
} satisfies KnowledgeBaseFormValues;

export type RagDebugMode = "fast" | "balanced" | "detailed";

export type RagDebugRequest = {
  query: string;
  mode: RagDebugMode;
  topK: number;
  similarityThreshold: number;
  queryRewriteEnabled: boolean;
};

export type RagDebugDiagnostic = {
  level: "info" | "warning" | "success";
  title: string;
  message: string;
};

export type RagDebugHit = {
  rank: number;
  chunkId: string;
  knowledgeId: string;
  knowledgeBaseId: string;
  title: string;
  content: string;
  chunkType: string;
  score: number;
  refId?: string;
  includedInPrompt: boolean;
};

export type RagDebugViewResult = {
  query: string;
  results: RagDebugHit[];
  llmContext: string;
  references: Array<{
    refId: string;
    knowledgeBaseId: string;
    knowledgeId: string;
    chunkId: string;
    title: string;
    chunkType: string;
  }>;
  diagnostics: RagDebugDiagnostic[];
  summary: {
    returnedCount: number;
    promptContextCount: number;
    topScore: number | null;
    noHit: boolean;
  };
};
