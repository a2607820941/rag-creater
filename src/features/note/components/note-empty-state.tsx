"use client";

import { Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";

type NoteEmptyStateProps = {
  creating: boolean;
  onCreate: () => void;
};

export function NoteEmptyState({ creating, onCreate }: NoteEmptyStateProps) {
  return (
    <div className="flex min-h-[520px] flex-col items-center justify-center rounded-md border border-dashed bg-muted/30 px-6 text-center">
      <p className="text-base font-medium">当前还没有文档哦，来创建一个吧</p>
      <Inbox aria-hidden="true" className="mt-4 size-10 text-muted-foreground" />
      <Button className="mt-5" disabled={creating} onClick={onCreate}>
        创建新文档
      </Button>
    </div>
  );
}
