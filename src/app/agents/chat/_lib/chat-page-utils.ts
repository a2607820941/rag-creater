import type { ChatMode } from "./chat-types";

export function isSkillPublishCommand(message: string) {
  return /^(publish|publish skill|发布|确认发布)$/i.test(message.trim());
}

export function getFileType(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase().trim();
  return extension || "file";
}

export function isImageFileType(fileType: string) {
  return ["png", "jpg", "jpeg", "webp", "bmp"].includes(fileType);
}

export function getMimeType(fileType: string) {
  if (fileType === "jpg") return "image/jpeg";
  if (isImageFileType(fileType)) return `image/${fileType}`;
  return "application/octet-stream";
}

export function toClientChatMode(
  mode: string,
  agentId: string | null
): ChatMode {
  if (agentId || mode === "agent") return "agent";
  if (mode === "skill-agent") return "skill-agent";
  if (mode === "openai") return "openai";
  if (mode === "rag-openai") return "rag-openai";
  return "knowledge-agent";
}
