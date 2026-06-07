import type { AppSlice } from "./slices/note";
import type { ChatConversationsSlice } from "./slices/chat-conversations-slice";
import type { DocumentSlice } from "./slices/document-slice";
import type { KnowledgeBaseSlice } from "./slices/knowledge-base-slice";
import type { ExtractionSlice } from "./slices/extraction-slice";

export type StoreState = AppSlice &
  ChatConversationsSlice &
  DocumentSlice &
  KnowledgeBaseSlice &
  ExtractionSlice;
