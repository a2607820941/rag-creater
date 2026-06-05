export type NoteSummary = {
  id: string;
  title: string;
  fileSize: number;
  sourceType: "markdown";
  fileType: "note";
  status: string;
  activeStatus: string;
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
