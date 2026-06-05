import { NextRequest, NextResponse } from "next/server";

import { createChatAttachment } from "@/server/services/chat-attachment.service";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "未提供附件文件" },
        },
        { status: 400 }
      );
    }

    const attachment = await createChatAttachment(file);
    return NextResponse.json({ success: true, data: attachment });
  } catch (error) {
    const message = error instanceof Error ? error.message : "附件上传失败";
    return NextResponse.json(
      { success: false, error: { code: "UPLOAD_ERROR", message } },
      { status: 500 }
    );
  }
}
