export function getSourceTypeLabel(
  sourceType?: string | null,
  options?: { fileType?: string | null }
) {
  if (options?.fileType === "note" || sourceType === "markdown") {
    return "知识笔记";
  }

  if (sourceType === "file") return "文件导入";
  if (sourceType === "url") return "链接导入";
  if (sourceType === "text") return "文本录入";
  if (sourceType === "image") return "图片解析";
  if (sourceType === "conversation") return "对话沉淀";
  if (sourceType === "manual") return "手动录入";

  return sourceType ?? "手动录入";
}
