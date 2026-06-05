"use client";

import { Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DocumentUploadZoneProps = {
  error: string | null;
  uploading?: boolean;
  onFilesSelected: (files: FileList | File[]) => void;
};

export function DocumentUploadZone({
  error,
  uploading = false,
  onFilesSelected,
}: DocumentUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className={cn(
          "flex min-h-32 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-4 text-center transition-colors",
          isDragging && "bg-muted"
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (uploading) return;
          onFilesSelected(event.dataTransfer.files);
        }}
        disabled={uploading}
      >
        <Upload className="text-muted-foreground" />
        <span className="text-sm font-medium">点击或拖拽文件上传</span>
        <span className="text-xs text-muted-foreground">
          支持 PDF、DOCX、TXT、Markdown，单文件不超过 20MB
        </span>
        <Button type="button" variant="outline" size="sm" asChild>
          <span>{uploading ? "上传中..." : "选择文件"}</span>
        </Button>
      </button>

      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept=".pdf,.docx,.txt,.md,.markdown"
        onChange={(event) => {
          if (event.target.files) {
            onFilesSelected(event.target.files);
          }
          event.target.value = "";
        }}
      />

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
