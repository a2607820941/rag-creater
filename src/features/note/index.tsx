"use client";

import * as React from "react";

import {
  createNote,
  deleteNote,
  getNoteDetail,
  listNotes,
  updateNote,
} from "./api";
import { DeleteNoteDialog } from "./components/delete-note-dialog";
import { NoteDirectory } from "./components/note-directory";
import { NoteEditor } from "./components/note-editor";
import { NoteEmptyState } from "./components/note-empty-state";
import { NoteTopbar } from "./components/note-topbar";
import type { NoteDetail, NoteSummary } from "./types";

function sortNotes(notes: NoteSummary[]) {
  return [...notes].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function NoteFeature() {
  const [notes, setNotes] = React.useState<NoteSummary[]>([]);
  const [activeNoteId, setActiveNoteId] = React.useState<string | null>(null);
  const [activeNote, setActiveNote] = React.useState<NoteDetail | null>(null);
  const [draftTitle, setDraftTitle] = React.useState("");
  const [draftRawContent, setDraftRawContent] = React.useState("");
  const [titleEditing, setTitleEditing] = React.useState(false);
  const [directoryOpen, setDirectoryOpen] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [sourceToggleSaving, setSourceToggleSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const busy =
    loading || detailLoading || saving || deleting || sourceToggleSaving;
  const sourceEnabled = activeNote?.activeStatus === "active";

  const applyActiveNote = React.useCallback((note: NoteDetail | null) => {
    setActiveNote(note);
    setActiveNoteId(note?.id ?? null);
    setDraftTitle(note?.title ?? "");
    setDraftRawContent(note?.rawContent ?? "");
  }, []);

  const refreshNotes = React.useCallback(async () => {
    const nextNotes = sortNotes(await listNotes());
    setNotes(nextNotes);
    return nextNotes;
  }, []);

  const loadNoteDetail = React.useCallback(
    async (id: string) => {
      setDetailLoading(true);
      try {
        const note = await getNoteDetail(id);
        applyActiveNote(note);
      } finally {
        setDetailLoading(false);
      }
    },
    [applyActiveNote]
  );

  React.useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);

      try {
        const initialNotes = sortNotes(await listNotes());
        if (cancelled) return;

        setNotes(initialNotes);

        if (initialNotes.length === 0) {
          applyActiveNote(null);
          return;
        }

        await loadNoteDetail(initialNotes[0].id);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "加载笔记失败");
          setNotes([]);
          applyActiveNote(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [applyActiveNote, loadNoteDetail]);

  async function saveCurrentNote() {
    if (saving) return false;
    if (!activeNote) return true;

    const normalizedTitle = draftTitle.trim() || "未命名文档";
    const hasUnsavedChanges =
      normalizedTitle !== activeNote.title ||
      draftRawContent !== (activeNote.rawContent ?? "");

    if (!hasUnsavedChanges) return true;

    setSaving(true);
    setError(null);

    try {
      const updatedNote = await updateNote(activeNote.id, {
        title: normalizedTitle,
        rawContent: draftRawContent,
      });

      applyActiveNote(updatedNote);
      await refreshNotes();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSelectNote(id: string) {
    if (busy || id === activeNoteId) return;

    const saved = await saveCurrentNote();
    if (!saved) return;

    try {
      await loadNoteDetail(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载文档失败");
      await refreshNotes();
    }
  }

  async function handleCreateNote() {
    if (busy) return;

    const saved = await saveCurrentNote();
    if (!saved) return;

    setSaving(true);
    setError(null);

    try {
      const createdNote = await createNote({
        title: "未命名文档",
        rawContent: "",
      });
      await refreshNotes();
      applyActiveNote(createdNote);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteNote() {
    if (!activeNoteId || deleting) return;

    setDeleting(true);
    setError(null);

    try {
      await deleteNote(activeNoteId);
      setDeleteDialogOpen(false);
      const nextNotes = await refreshNotes();

      if (nextNotes.length === 0) {
        applyActiveNote(null);
        return;
      }

      await loadNoteDetail(nextNotes[0].id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  }

  async function handleTitleSave() {
    if (!activeNote || saving) return;

    const saved = await saveCurrentNote();
    if (saved) {
      setTitleEditing(false);
    }
  }

  async function handleSourceEnabledChange(enabled: boolean) {
    if (!activeNote || sourceToggleSaving || saving) return;

    setSourceToggleSaving(true);
    setError(null);

    try {
      const updatedNote = await updateNote(activeNote.id, {
        status: enabled ? "uploaded" : "pending",
        activeStatus: enabled ? "active" : "disabled",
      });

      applyActiveNote(updatedNote);
      await refreshNotes();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "知识源状态更新失败"
      );
    } finally {
      setSourceToggleSaving(false);
    }
  }

  const showEmpty = !loading && notes.length === 0;

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] bg-background">
      <main className="min-w-0 flex-1">
        <NoteTopbar
          deletingDisabled={!activeNote || busy}
          disabled={!activeNote || busy}
          onCreate={handleCreateNote}
          onDelete={() => setDeleteDialogOpen(true)}
          onSave={() => void saveCurrentNote()}
          onSourceEnabledChange={(enabled) =>
            void handleSourceEnabledChange(enabled)
          }
          onTitleChange={setDraftTitle}
          onTitleClick={() => setTitleEditing(true)}
          onTitleSave={() => void handleTitleSave()}
          sourceEnabled={sourceEnabled}
          sourceToggleDisabled={!activeNote || busy}
          sourceToggleLoading={sourceToggleSaving}
          title={draftTitle}
          titleEditing={titleEditing}
          updatedAt={activeNote?.updatedAt}
        />
        {error ? (
          <div className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <div className="p-4">
          {loading ? (
            <div className="min-h-[520px] rounded-md border bg-muted/30 p-6 text-sm text-muted-foreground">
              加载中...
            </div>
          ) : showEmpty ? (
            <NoteEmptyState creating={saving} onCreate={handleCreateNote} />
          ) : (
            <NoteEditor
              onChange={setDraftRawContent}
              saving={saving}
              value={draftRawContent}
            />
          )}
        </div>
      </main>
      <NoteDirectory
        activeNoteId={activeNoteId}
        disabled={busy}
        notes={notes}
        onOpenChange={setDirectoryOpen}
        onSelect={(id) => void handleSelectNote(id)}
        open={directoryOpen}
      />
      <DeleteNoteDialog
        deleting={deleting}
        onConfirm={() => void handleDeleteNote()}
        onOpenChange={setDeleteDialogOpen}
        open={deleteDialogOpen}
        title={activeNote?.title ?? ""}
      />
    </div>
  );
}
