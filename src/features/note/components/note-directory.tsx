"use client";

import { IndentDecrease, IndentIncrease } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { NoteSummary } from "../types";

type NoteDirectoryProps = {
  notes: NoteSummary[];
  activeNoteId: string | null;
  open: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
};

export function NoteDirectory({
  notes,
  activeNoteId,
  open,
  disabled,
  onOpenChange,
  onSelect,
}: NoteDirectoryProps) {
  if (!open) {
    return (
      <Button
        aria-label="展开文档目录"
        className="fixed right-0 top-24 rounded-r-none"
        onClick={() => onOpenChange(true)}
        size="icon"
        variant="outline"
      >
        <IndentDecrease aria-hidden="true" />
      </Button>
    );
  }

  return (
    <aside className="w-72 shrink-0 border-l bg-background">
      <div className="flex h-12 items-center justify-between border-b px-3">
        <h2 className="text-sm font-semibold">文档目录</h2>
        <Button
          aria-label="收起文档目录"
          onClick={() => onOpenChange(false)}
          size="icon"
          variant="ghost"
        >
          <IndentIncrease aria-hidden="true" />
        </Button>
      </div>
      <div className="h-[calc(100vh-9rem)] overflow-y-auto">
        <div className="flex flex-col gap-1 p-2">
          {notes.map((note) => {
            const active = note.id === activeNoteId;

            return (
              <button
                className={cn(
                  "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                )}
                disabled={disabled}
                key={note.id}
                onClick={() => onSelect(note.id)}
                type="button"
              >
                <span className="block truncate font-medium">{note.title}</span>
                <span className="mt-1 block truncate text-xs opacity-75">
                  {new Date(note.updatedAt).toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
