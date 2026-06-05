import type { KnowledgeChunkType } from "@/features/rag/types";

export type ChatRole = "user" | "assistant" | "system";

export type ChatCitation = {
  refId: string;
  chunkId: string;
  knowledgeId: string;
  documentId: string;
  knowledgeBaseId: string;
  title: string;
  content: string;
  chunkType: KnowledgeChunkType;
  score: number;
};

export type ChatKnowledgeFile = {
  id: string;
  title: string;
  chunkCount: number;
};

export type ChatStreamStatus =
  | "retrieving"
  | "organizing"
  | "reading-documents"
  | "generating"
  | "stopped"
  | "failed";

export type ChatRagSummary = {
  status: "not-applicable" | "skipped" | "hit" | "miss";
  citationCount: number;
};

export type ChatSkillDraftSaved = {
  id: string;
  name: string;
  slug: string;
  status: "draft";
  publishEndpoint: string;
};

export type ChatAttachmentDTO = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileType: string;
  kind: string;
  status: string;
  fileUrl?: string;
  textPreview: string;
  error?: string | null;
};

export type ChatTraceStep = {
  id: string;
  type:
    | "plan"
    | "skill"
    | "retrieval"
    | "evidence"
    | "generation"
    | "warning";
  title: string;
  detail?: string;
  status: "running" | "completed" | "failed";
  createdAt: string;
};

export type ChatStreamEventPayloadMap = {
  meta: { conversationId: string };
  status: { status: ChatStreamStatus };
  trace: ChatTraceStep;
  token: string;
  citations: ChatCitation[];
  "rag-summary": ChatRagSummary;
  "knowledge-files": ChatKnowledgeFile[];
  "skill-draft-saved": ChatSkillDraftSaved;
  error: { code: string; message: string };
  done: { ok: true };
};

export type ChatStreamEventName = keyof ChatStreamEventPayloadMap;

export type ChatMessageDTO = {
  id: string;
  role: Exclude<ChatRole, "system">;
  content: string;
  citations: ChatCitation[];
  knowledgeFiles?: ChatKnowledgeFile[];
  createdAt: string;
};

export type ChatConversationDTO = {
  id: string;
  title: string;
  mode: string;
  agentId: string | null;
  status: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AgentChatContext = {
  conversationId: string;
  agentId: string;
  agentName: string;
  systemPrompt?: string | null;
  knowledgeScope?: unknown;
  answerStyle?: string;
  showReferences?: boolean;
  allowKnowledgeCapture?: boolean;
  chatMode: string;
};

export type AgentConversationDTO = {
  id: string;
  agentId: string | null;
  title: string;
  memorySummary: string | null;
  memoryCursorMessageId: string | null;
  memoryFailureCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};
