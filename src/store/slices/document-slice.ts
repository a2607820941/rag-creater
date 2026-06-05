import type { StateCreator } from "zustand";

import type { StoreState } from "../types";

export type DocumentSummary = {
  id: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type DocumentDetail = DocumentSummary & {
  content: string | null;
  errorMessage: string | null;
};

export type DocumentSlice = {
  documents: DocumentSummary[];
  currentDocument: DocumentDetail | null;
  isDocumentListLoading: boolean;
  isDocumentUploading: boolean;
  isDocumentParsing: boolean;
  documentError: string | null;
  setDocuments: (documents: DocumentSummary[]) => void;
  setCurrentDocument: (document: DocumentDetail | null) => void;
  setDocumentListLoading: (loading: boolean) => void;
  setDocumentUploading: (uploading: boolean) => void;
  setDocumentParsing: (parsing: boolean) => void;
  setDocumentError: (error: string | null) => void;
};

export const createDocumentSlice: StateCreator<
  StoreState,
  [],
  [],
  DocumentSlice
> = (set) => ({
  documents: [],
  currentDocument: null,
  isDocumentListLoading: false,
  isDocumentUploading: false,
  isDocumentParsing: false,
  documentError: null,
  setDocuments: (documents) => set({ documents }),
  setCurrentDocument: (document) => set({ currentDocument: document }),
  setDocumentListLoading: (loading) => set({ isDocumentListLoading: loading }),
  setDocumentUploading: (uploading) =>
    set({ isDocumentUploading: uploading }),
  setDocumentParsing: (parsing) => set({ isDocumentParsing: parsing }),
  setDocumentError: (error) => set({ documentError: error }),
});
