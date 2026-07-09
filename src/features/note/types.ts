export type NoteSummary = {
  id: string;
  title: string;
  fileSize: number;
  sourceType: "markdown";
  fileType: "note";
  status: string;
  activeStatus: string;
  enhancementEnabled: boolean;
  enhancedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NoteDetail = NoteSummary & {
  originalName: string;
  rawContent: string | null;
};

export type CreateNoteInput = {
  title?: string;
  rawContent?: string;
};

export type UpdateNoteInput = {
  title?: string;
  rawContent?: string;
  status?: "pending" | "parsed" | "uploaded";
  activeStatus?: "active" | "disabled";
  enhancementEnabled?: boolean;
};

export type NoteEnhancementAsset = {
  source: string;
  type: string;
  status: "success" | "failed";
  insertedText?: string;
  error?: string;
};

export type NoteEnhancementSummary = {
  enabled: boolean;
  enhancedAt: string | null;
  assetCount: number;
  successCount: number;
  failedCount: number;
  assets: NoteEnhancementAsset[];
};

export type EnhanceNoteInput = {
  rawContent?: string;
  enabled?: boolean;
  reparse?: boolean;
};

export type EnhanceNoteResponse = {
  note: NoteDetail;
  enhancement: NoteEnhancementSummary;
};

export type NotePageState = {
  notes: NoteSummary[];
  activeNoteId: string | null;
  activeNote: NoteDetail | null;
  draftTitle: string;
  draftRawContent: string;
  titleEditing: boolean;
  directoryOpen: boolean;
  loading: boolean;
  detailLoading: boolean;
  saving: boolean;
  deleting: boolean;
  deleteDialogOpen: boolean;
  error: string | null;
};
