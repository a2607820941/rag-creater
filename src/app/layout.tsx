import type { Metadata } from "next";
import "./globals.css";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";
import { Noto_Sans } from "next/font/google";
import { cn } from "@/lib/utils";

const notoSans = Noto_Sans({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "RAG Creater",
  description: "一个用于 RAG 生成、管理与 Agent 消费的全栈应用。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={cn("font-sans", notoSans.variable)}>
      <body>{children}</body>
    </html>
  );
}
