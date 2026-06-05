import type { AppSlice } from "./slices/note";
import type { DocumentSlice } from "./slices/document-slice";
import type { KnowledgeBaseSlice } from "./slices/knowledge-base-slice";
import type { ExtractionSlice } from "./slices/extraction-slice";

export type StoreState = AppSlice &
  DocumentSlice &
  KnowledgeBaseSlice &
  ExtractionSlice;
