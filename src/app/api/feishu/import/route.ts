import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fetchFeishuDocContent } from "@/lib/feishu";
import {
  createDocument,
  replaceTextChunksAndIndex,
  updateDocumentStatus,
} from "@/server/services/document.service";
import { splitTextIntoChunks } from "@/lib/text-splitter";

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

    // 创建文档记录
    const doc = await createDocument({
      originalName: title,
      fileType: "md",
      fileSize: content.length,
      sourceType: "url",
    });

    // 1. 标记解析中
    await updateDocumentStatus(doc.id, "parsing");

    // 2. 机械切分（飞书文档为纯文本，无需语义分段）
    const chunks = splitTextIntoChunks(content);

    // 3. 保存 chunks 并建立本地向量索引
    await replaceTextChunksAndIndex(doc.id, chunks, { rawContent: content });

    return NextResponse.json({
      success: true,
      data: {
        id: doc.id,
        title: doc.originalName,
        contentLength: content.length,
        chunkCount: chunks.length,
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
