"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { KnowledgeTagFormValues } from "@/features/knowledge/types";
import { cn } from "@/lib/utils";

const TAG_COLOR_OPTIONS = [
  "#93C5FD",
  "#86EFAC",
  "#C4B5FD",
  "#FDBA74",
  "#FCA5A5",
  "#67E8F9",
  "#CBD5E1",
  "#F9A8D4",
];

type CreateKnowledgeBaseTagDialogProps = {
  open: boolean;
  submitting?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: KnowledgeTagFormValues) => void | Promise<void>;
};

export function CreateKnowledgeBaseTagDialog({
  open,
  submitting = false,
  error,
  onOpenChange,
  onSubmit,
}: CreateKnowledgeBaseTagDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(TAG_COLOR_OPTIONS[0]);

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 8) return;

    await onSubmit({
      name: trimmedName,
      color,
      sortOrder: 0,
    });

    setName("");
    setColor(TAG_COLOR_OPTIONS[0]);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>新增标签</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-kb-tag-name">标签名称</Label>
            <Input
              id="new-kb-tag-name"
              value={name}
              maxLength={8}
              disabled={submitting}
              placeholder="最多 4 个中文字符"
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>标签颜色</Label>
            <div className="grid grid-cols-8 gap-2">
              {TAG_COLOR_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={submitting}
                  onClick={() => setColor(option)}
                  className={cn(
                    "h-7 w-7 rounded-md border transition",
                    color === option
                      ? "border-foreground ring-2 ring-ring"
                      : "border-border"
                  )}
                  style={{ backgroundColor: option }}
                  aria-label={`选择颜色 ${option}`}
                />
              ))}
            </div>
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={submitting || !name.trim() || name.trim().length > 8}
            onClick={() => void handleSubmit()}
          >
            {submitting ? "创建中..." : "确认"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
