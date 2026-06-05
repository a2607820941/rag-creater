"use client";

import { useCallback, useRef, useState } from "react";

const CHUNK_SIZE = 2 * 1024 * 1024;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

export type UploadStatus =
  | "idle"
  | "checking"
  | "uploading"
  | "paused"
  | "merging"
  | "completed"
  | "error";

export type FileUploadState = {
  file: File;
  status: UploadStatus;
  progress: number;
  uploadedChunks: number;
  totalChunks: number;
  error?: string;
  uploadId?: string;
};

type UploadManifest = {
  uploadId: string;
  uploadedChunks: number[];
  uploadedCount: number;
  totalChunks: number;
  completed: boolean;
};

function getFingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function getFileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function createChunks(file: File, chunkSize: number): Blob[] {
  const chunks: Blob[] = [];
  let offset = 0;
  while (offset < file.size) {
    chunks.push(file.slice(offset, offset + chunkSize));
    offset += chunkSize;
  }
  return chunks;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getResponseError(json: unknown, fallback: string) {
  if (json && typeof json === "object" && "error" in json) {
    const error = (json as { error?: { message?: string } }).error;
    if (error?.message) return error.message;
  }

  return fallback;
}

async function readJsonData<T>(response: Response, fallback: string): Promise<T> {
  const json = await response.json();
  if (!response.ok || !(json as { success?: boolean }).success) {
    throw new Error(getResponseError(json, fallback));
  }

  return (json as { data: T }).data;
}

export function useResumableUpload() {
  const [uploads, setUploads] = useState<FileUploadState[]>([]);
  const abortRefs = useRef<Map<string, AbortController>>(new Map());

  const updateUpload = useCallback(
    (uploadId: string, updater: (prev: FileUploadState) => FileUploadState) => {
      setUploads((prev) =>
        prev.map((upload) =>
          upload.uploadId === uploadId ? updater(upload) : upload
        )
      );
    },
    []
  );

  const upsertUpload = useCallback((file: File, next: Partial<FileUploadState>) => {
    const fileKey = getFileKey(file);
    setUploads((prev) => {
      const index = prev.findIndex(
        (upload) =>
          getFileKey(upload.file) === fileKey ||
          (next.uploadId && upload.uploadId === next.uploadId)
      );
      const base: FileUploadState = {
        file,
        status: "checking",
        progress: 0,
        uploadedChunks: 0,
        totalChunks: Math.ceil(file.size / CHUNK_SIZE),
      };

      if (index === -1) return [...prev, { ...base, ...next }];

      return prev.map((upload, uploadIndex) =>
        uploadIndex === index ? { ...upload, ...next } : upload
      );
    });
  }, []);

  const getUploadSession = useCallback(async (file: File) => {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const checkUrl = new URL("/api/documents/resumable", window.location.origin);
    checkUrl.searchParams.set("fingerprint", getFingerprint(file));
    checkUrl.searchParams.set("fileName", file.name);
    checkUrl.searchParams.set("fileSize", String(file.size));
    checkUrl.searchParams.set("totalChunks", String(totalChunks));
    checkUrl.searchParams.set("chunkSize", String(CHUNK_SIZE));

    const response = await fetch(checkUrl.toString());
    return readJsonData<UploadManifest>(response, "创建上传会话失败");
  }, []);

  const uploadMissingChunks = useCallback(
    async (file: File, manifest: UploadManifest, abortController: AbortController) => {
      const uploadedSet = new Set<number>(manifest.uploadedChunks || []);
      const chunks = createChunks(file, CHUNK_SIZE);

      for (let index = 0; index < chunks.length; index += 1) {
        if (uploadedSet.has(index)) continue;

        let retries = 0;
        let success = false;

        while (retries < MAX_RETRIES && !success) {
          try {
            const formData = new FormData();
            formData.append("chunk", chunks[index], `${index}.part`);
            formData.append("uploadId", manifest.uploadId);
            formData.append("chunkIndex", String(index));

            const response = await fetch("/api/documents/resumable", {
              method: "PUT",
              body: formData,
              signal: abortController.signal,
            });
            const nextManifest = await readJsonData<UploadManifest>(
              response,
              `分片 ${index} 上传失败`
            );

            success = true;
            uploadedSet.clear();
            nextManifest.uploadedChunks.forEach((chunkIndex) =>
              uploadedSet.add(chunkIndex)
            );

            updateUpload(manifest.uploadId, (prev) => ({
              ...prev,
              uploadedChunks: uploadedSet.size,
              progress: Math.round((uploadedSet.size / nextManifest.totalChunks) * 100),
              error: undefined,
            }));
          } catch (error) {
            if ((error as Error).name === "AbortError") {
              updateUpload(manifest.uploadId, (prev) => ({
                ...prev,
                status: "paused",
                error: "上传已暂停，可继续上传",
              }));
              return false;
            }

            retries += 1;
            if (retries >= MAX_RETRIES) {
              throw new Error(
                `分片 ${index} 上传失败，已重试 ${MAX_RETRIES} 次: ${(error as Error).message}`
              );
            }
            await sleep(RETRY_DELAY * retries);
          }
        }
      }

      return true;
    },
    [updateUpload]
  );

  const completeUpload = useCallback(
    async (uploadId: string, abortController: AbortController) => {
      updateUpload(uploadId, (prev) => ({
        ...prev,
        status: "merging",
        error: undefined,
      }));

      const response = await fetch("/api/documents/resumable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId }),
        signal: abortController.signal,
      });

      await readJsonData(response, "合并文件失败");
    },
    [updateUpload]
  );

  const startUpload = useCallback(
    async (file: File): Promise<boolean> => {
      upsertUpload(file, {
        status: "checking",
        error: undefined,
      });

      try {
        const manifest = await getUploadSession(file);
        const uploadedCount = manifest.uploadedCount || manifest.uploadedChunks.length;

        upsertUpload(file, {
          uploadId: manifest.uploadId,
          status: manifest.completed ? "completed" : "uploading",
          uploadedChunks: uploadedCount,
          totalChunks: manifest.totalChunks,
          progress: manifest.completed
            ? 100
            : Math.round((uploadedCount / manifest.totalChunks) * 100),
          error: undefined,
        });

        if (manifest.completed) return true;

        const abortController = new AbortController();
        abortRefs.current.set(manifest.uploadId, abortController);

        const uploaded = await uploadMissingChunks(file, manifest, abortController);
        if (!uploaded) return false;

        await completeUpload(manifest.uploadId, abortController);
        updateUpload(manifest.uploadId, (prev) => ({
          ...prev,
          status: "completed",
          progress: 100,
          uploadedChunks: manifest.totalChunks,
          error: undefined,
        }));

        abortRefs.current.delete(manifest.uploadId);
        return true;
      } catch (error) {
        const errorMsg = (error as Error).message || "上传失败";
        setUploads((prev) =>
          prev.map((upload) =>
            getFileKey(upload.file) === getFileKey(file)
              ? { ...upload, status: "error", error: errorMsg }
              : upload
          )
        );
        return false;
      }
    },
    [completeUpload, getUploadSession, updateUpload, uploadMissingChunks, upsertUpload]
  );

  const uploadFile = useCallback(
    async (file: File): Promise<boolean> => startUpload(file),
    [startUpload]
  );

  const resumeUpload = useCallback(
    async (uploadId: string): Promise<boolean> => {
      const upload = uploads.find((item) => item.uploadId === uploadId);
      if (!upload) return false;
      return startUpload(upload.file);
    },
    [startUpload, uploads]
  );

  const cancelUpload = useCallback((uploadId: string) => {
    const controller = abortRefs.current.get(uploadId);
    if (controller) {
      controller.abort();
      abortRefs.current.delete(uploadId);
    }

    setUploads((prev) =>
      prev.map((upload) =>
        upload.uploadId === uploadId
          ? { ...upload, status: "paused", error: "上传已暂停，可继续上传" }
          : upload
      )
    );
  }, []);

  const removeUpload = useCallback((uploadId: string) => {
    const controller = abortRefs.current.get(uploadId);
    controller?.abort();
    abortRefs.current.delete(uploadId);
    setUploads((prev) => prev.filter((upload) => upload.uploadId !== uploadId));
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads((prev) => prev.filter((upload) => upload.status !== "completed"));
  }, []);

  return {
    uploads,
    uploadFile,
    resumeUpload,
    cancelUpload,
    removeUpload,
    clearCompleted,
  };
}
