import type {
  CreateNoteInput,
  NoteDetail,
  NoteSummary,
  UpdateNoteInput,
} from "./types";

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

async function parseResponse<T>(response: Response): Promise<T> {
  const json = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !json.success || json.data === undefined) {
    throw new Error(json.error?.message ?? json.message ?? "请求失败");
  }

  return json.data;
}

export async function listNotes() {
  const response = await fetch("/api/notes");
  return parseResponse<NoteSummary[]>(response);
}

export async function getNoteDetail(id: string) {
  const response = await fetch(`/api/notes/${id}`);
  return parseResponse<NoteDetail>(response);
}

export async function createNote(input: CreateNoteInput = {}) {
  const response = await fetch("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return parseResponse<NoteDetail>(response);
}

export async function updateNote(id: string, input: UpdateNoteInput) {
  const response = await fetch(`/api/notes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return parseResponse<NoteDetail>(response);
}

export async function deleteNote(id: string) {
  const response = await fetch(`/api/notes/${id}`, {
    method: "DELETE",
  });

  return parseResponse<{ id: string }>(response);
}
