"use client";
import { create } from "zustand";
import { createAppSlice } from "./slices/note";
import { createDocumentSlice } from "./slices/document-slice";
import { createKnowledgeBaseSlice } from "./slices/knowledge-base-slice";
import { createExtractionSlice } from "./slices/extraction-slice";
import type { StoreState } from "./types";

export const useAppStore = create<StoreState>()((...args) => ({
  ...createAppSlice(...args),
  ...createDocumentSlice(...args),
  ...createKnowledgeBaseSlice(...args),
  ...createExtractionSlice(...args),
}));
