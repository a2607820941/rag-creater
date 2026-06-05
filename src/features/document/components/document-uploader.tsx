"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  useResumableUpload,
  type FileUploadState,
} from "@/features/document/hooks/use-resumable-upload";

const ALLOWED_EXTENSIONS = ".txt,.md,.csv,.xlsx,.doc,.docx,.pdf,.pptx,.png,.jpg,.jpeg,.webp,.bmp";
const ALLOWED_LIST = ["txt", "md", "csv", "xlsx", "doc", "docx", "pdf", "pptx", "png", "jpg", "jpeg", "webp", "bmp"];
const MAX_SIZE_MB = 100;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadItem({
  upload,
  onCancel,
  onResume,
  onRemove,
}: {
  upload: FileUploadState;
  onCancel: (id: string) => void;
  onResume: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { file, status, progress, uploadedChunks, totalChunks, error, uploadId } = upload;

  const statusText: Record<string, string> = {
    idle: "等待中",
    checking: "检查中...",
    uploading: "上传中...",
    paused: "已暂停",
    merging: "合并中...",
    completed: "完成",
    error: "失败",
  };

  const statusColor: Record<string, string> = {
    idle: "text-zinc-500",
    checking: "text-blue-500",
    uploading: "text-blue-500",
    paused: "text-amber-500",
    merging: "text-blue-500",
    completed: "text-green-600",
    error: "text-red-500",
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-xs font-medium text-zinc-600">
        {file.name.split(".").pop()?.toUpperCase() ?? "FILE"}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-zinc-700" title={file.name}>
            {file.name}
          </p>
          <span className="shrink-0 text-xs text-zinc-400">
            {formatFileSize(file.size)}
          </span>
        </div>

        <div className="mt-1 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                status === "error"
                  ? "bg-red-400"
                  : status === "completed"
                    ? "bg-green-500"
                    : "bg-blue-500"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className={`shrink-0 text-xs ${statusColor[status] ?? "text-zinc-500"}`}>
            {status === "uploading" || status === "merging"
              ? `${progress}% (${uploadedChunks}/${totalChunks})`
              : statusText[status] ?? status}
          </span>
        </div>

        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>

      <div className="shrink-0">
        {status === "uploading" || status === "checking" || status === "merging" ? (
          <button
            onClick={() => uploadId && onCancel(uploadId)}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            title="暂停上传"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : status === "paused" || status === "error" ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => uploadId && onResume(uploadId)}
              className="rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
              title="继续上传"
            >
              继续
            </button>
            <button
              onClick={() => uploadId && onRemove(uploadId)}
              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              title="移除"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : status === "completed" ? (
          <button
            onClick={() => uploadId && onRemove(uploadId)}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            title="移除"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function DocumentUploader({
  onUploaded,
}: {
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragover, setDragover] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const { uploads, uploadFile, resumeUpload, cancelUpload, removeUpload, clearCompleted } =
    useResumableUpload();

  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  const hasActiveUploads = uploads.some(
    (u) => u.status === "uploading" || u.status === "checking" || u.status === "merging"
  );
  const allCompleted = uploads.length > 0 && uploads.every((u) => u.status === "completed");
  const hasErrors = uploads.some((u) => u.status === "error");

  const validateFile = useCallback((file: File): string | null => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !ALLOWED_LIST.includes(ext)) {
      return `${file.name}（类型不支持）`;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return `${file.name}（超过${MAX_SIZE_MB}MB）`;
    }
    return null;
  }, []);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      setValidationErrors([]);

      const errors: string[] = [];
      const validFiles: File[] = [];

      for (const file of fileArray) {
        const error = validateFile(file);
        if (error) {
          errors.push(error);
        } else {
          validFiles.push(file);
        }
      }

      if (errors.length > 0) {
        setValidationErrors(errors);
      }

      // Upload all valid files concurrently
      const results = await Promise.all(validFiles.map((file) => uploadFile(file)));

      // If any upload succeeded, notify parent
      if (results.some((r) => r)) {
        onUploaded();
      }

      // Auto clear completed after 3 seconds
      if (results.some((r) => r)) {
        timerRef.current = window.setTimeout(() => {
          clearCompleted();
          setValidationErrors([]);
        }, 3000);
      }
    },
    [validateFile, uploadFile, onUploaded, clearCompleted]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        uploadFiles(e.target.files);
      }
      e.target.value = "";
    },
    [uploadFiles]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragover(false);
      if (e.dataTransfer.files.length > 0) {
        uploadFiles(e.dataTransfer.files);
      }
    },
    [uploadFiles]
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Drop Zone */}
      <div
        className={`rounded-lg border-2 border-dashed bg-zinc-50 p-8 text-center transition-colors ${
          dragover
            ? "border-blue-500 bg-blue-100"
            : "border-zinc-300 hover:border-zinc-400"
        }`}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragover(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragover(false);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ALLOWED_EXTENSIONS}
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-3">
          <svg
            className="h-10 w-10 text-zinc-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>

          {hasActiveUploads ? (
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              <span className="text-sm text-zinc-600">
                上传中 {uploads.filter((u) => u.status === "completed").length}/{uploads.length}
              </span>
            </div>
          ) : allCompleted ? (
            <div className="flex flex-col items-center gap-1">
              <p className="text-sm text-green-600">
                完成 {uploads.filter((u) => u.status === "completed").length} 个文件
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-zinc-600">
                <button
                  onClick={() => inputRef.current?.click()}
                  className="font-medium text-blue-600 hover:text-blue-700"
                >
                  点击选择文件
                </button>
                &nbsp;或拖拽文件到此区域
              </p>
              <p className="text-xs text-zinc-400">
                支持 {ALLOWED_EXTENSIONS}，最大 {MAX_SIZE_MB}MB，可多选；暂停后可直接继续
              </p>
            </>
          )}
        </div>
      </div>

      {/* Upload List */}
      {uploads.length > 0 && (
        <div className="flex flex-col gap-2">
          {uploads.map((upload) =>
            upload.uploadId ? (
              <UploadItem
                key={upload.uploadId}
                upload={upload}
                onCancel={cancelUpload}
                onResume={(id) => {
                  void resumeUpload(id).then((ok) => {
                    if (ok) onUploaded();
                  });
                }}
                onRemove={removeUpload}
              />
            ) : null
          )}
        </div>
      )}

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="mb-1 text-sm font-medium text-red-700">以下文件无法上传：</p>
          <ul className="list-inside list-disc text-xs text-red-600">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Summary */}
      {hasErrors && (
        <p className="text-center text-xs text-red-500">
          部分文件上传失败，请检查网络后重试
        </p>
      )}
    </div>
  );
}
