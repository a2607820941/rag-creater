import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fetchFeishuDocContent } from "@/lib/feishu";
import {
  createDocument,
  parseDocument,
  updateDocumentStatus,
} from "@/server/services/document.service";

const importSchema = z.object({
  url: z.string().min(1, "请输入飞书文档链接"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = importSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { title, content } = await fetchFeishuDocContent(parsed.data.url);

    if (!content.trim()) {
      return NextResponse.json(
        { success: false, error: { code: "EMPTY_CONTENT", message: "文档内容为空" } },
        { status: 422 }
      );
    }

    // 创建文档记录（rawContent 已就位，无磁盘文件）
    const doc = await createDocument({
      originalName: title,
      fileType: "md",
      fileSize: content.length,
      sourceType: "url",
    });

    // 写入 rawContent，标记 uploaded，走和普通文件统一的解析路径
    await updateDocumentStatus(doc.id, "uploaded", { rawContent: content });

    // parseDocument 内部: rawContent 已存在 → 跳过读盘 → 语义分段先试 → 失败退机械
    const { chunkCount } = await parseDocument(doc.id);

    return NextResponse.json({
      success: true,
      data: {
        id: doc.id,
        title: doc.originalName,
        contentLength: content.length,
        chunkCount,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "导入失败";
    return NextResponse.json(
      { success: false, error: { code: "FEISHU_IMPORT_ERROR", message } },
      { status: 500 }
    );
  }
}
