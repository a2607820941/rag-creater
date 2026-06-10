"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { uploadChatAttachment } from "../_lib/chat-page-api";
import type { ChatComposerAttachment } from "../_lib/chat-types";
import {
  getFileType,
  getMimeType,
  isImageFileType,
} from "../_lib/chat-page-utils";

type UseChatAttachmentsOptions = {
  loading: boolean;
  onError: (message: string | null) => void;
};

export function useChatAttachments({
  loading,
  onError,
}: UseChatAttachmentsOptions) {
  const [attachments, setAttachments] = useState<ChatComposerAttachment[]>([]);
  const localUploadIdRef = useRef(0);
  const uploadAbortControllersRef = useRef<Map<string, AbortController>>(
    new Map()
  );

  const abortPendingUploads = useCallback(() => {
    uploadAbortControllersRef.current.forEach((controller) =>
      controller.abort()
    );
    uploadAbortControllersRef.current.clear();
  }, []);

  const removeAttachment = useCallback((localId: string) => {
    uploadAbortControllersRef.current.get(localId)?.abort();
    uploadAbortControllersRef.current.delete(localId);
    setAttachments((prev) => prev.filter((item) => item.localId !== localId));
  }, []);

  const uploadAttachment = useCallback(
    async (file: File) => {
      if (loading) return;

      onError(null);
      localUploadIdRef.current += 1;
      const localId = `upload-${localUploadIdRef.current}`;
      const abortController = new AbortController();
      uploadAbortControllersRef.current.set(localId, abortController);

      const fileType = getFileType(file.name);
      setAttachments((prev) => [
        ...prev,
        {
          localId,
          id: localId,
          fileName: file.name,
          mimeType: file.type || getMimeType(fileType),
          fileSize: file.size,
          fileType,
          kind: isImageFileType(fileType) ? "image" : "file",
          status: "uploading",
          textPreview: "",
          error: null,
        },
      ]);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const { response, json } = await uploadChatAttachment(
          formData,
          abortController.signal
        );

        if (!response.ok || !json?.success || !json.data) {
          throw new Error(json?.error?.message || "Attachment upload failed");
        }

        setAttachments((prev) =>
          prev.map((attachment) =>
            attachment.localId === localId
              ? { ...json.data!, localId }
              : attachment
          )
        );
      } catch (err) {
        if (
          abortController.signal.aborted ||
          (err instanceof Error && err.name === "AbortError")
        ) {
          setAttachments((prev) =>
            prev.filter((attachment) => attachment.localId !== localId)
          );
          return;
        }

        const messageText =
          err instanceof Error ? err.message : "Attachment upload failed";
        onError(messageText);
        setAttachments((prev) =>
          prev.map((attachment) =>
            attachment.localId === localId
              ? { ...attachment, status: "failed", error: messageText }
              : attachment
          )
        );
      } finally {
        uploadAbortControllersRef.current.delete(localId);
      }
    },
    [loading, onError]
  );

  const uploadAttachments = useCallback(
    (files: File[]) => {
      if (loading) return;

      files.forEach((file) => {
        void uploadAttachment(file);
      });
    },
    [loading, uploadAttachment]
  );

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  useEffect(() => {
    return () => {
      abortPendingUploads();
    };
  }, [abortPendingUploads]);

  return {
    attachments,
    hasUploadingAttachments: attachments.some(
      (attachment) => attachment.status === "uploading"
    ),
    uploadAttachments,
    removeAttachment,
    clearAttachments,
    abortPendingUploads,
  };
}
