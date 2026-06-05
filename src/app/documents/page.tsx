"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminShell } from "@/components/layout/admin-shell";
import { DocumentUploader } from "@/features/document/components/document-uploader";
import { DocumentList } from "@/features/document/components/document-list";
import { DocumentPreview } from "@/features/document/components/document-preview";
import { FeishuImport } from "@/features/feishu/components/feishu-import";

export default function DocumentsPage() {
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [parseLoading, setParseLoading] = useState(false);
  const [parseCount, setParseCount] = useState(0);
  const [parsingIds, setParsingIds] = useState<string[]>([]);

  const handleUploaded = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // 当页面重新可见时刷新文档列表（从审核台返回等场景）
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setRefreshKey((k) => k + 1);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncPreviewId = () => {
      const params = new URLSearchParams(window.location.search);
      setPreviewId(params.get("preview"));
    };

    syncPreviewId();
    window.addEventListener("popstate", syncPreviewId);
    return () => window.removeEventListener("popstate", syncPreviewId);
  }, []);

  const handleParse = useCallback(async (ids: string[]) => {
    setParseLoading(true);
    setParseCount(ids.length);
    setParsingIds(ids);
    setRefreshKey((k) => k + 1);
    try {
      await Promise.all(
        ids.map((id) => fetch(`/api/documents/${id}/parse`, { method: "POST" }))
      );
    } catch {
      // error handled by list refresh
    } finally {
      setParseLoading(false);
      setParsingIds([]);
      setRefreshKey((k) => k + 1);
    }
  }, []);

  const handlePreview = useCallback((id: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set("preview", id);
    router.push(`/documents?${params.toString()}`, { scroll: false });
    setPreviewId(id);
  }, [router]);

  const handleClosePreview = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete("preview");
    const query = params.toString();
    router.replace(query ? `/documents?${query}` : "/documents", { scroll: false });
    setPreviewId(null);
  }, [router]);

  return (
    <AdminShell>
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <p className="mb-1 text-sm font-medium text-zinc-500">知识生产</p>
          <h1 className="text-2xl font-semibold text-zinc-900">文档导入管线</h1>
          <p className="mt-1 text-sm text-zinc-500">
            上传文档、表格和图片，自动提取文本内容，智能切分后用于 AI 知识提炼
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">上传文件</h2>
          <p className="text-sm text-gray-500 mb-3">
            支持 .txt .md .csv .xlsx .doc .docx .pdf .pptx .png .jpg .jpeg .webp .bmp
            格式，最大 100MB
          </p>
          <DocumentUploader onUploaded={handleUploaded} />
        </div>

        <FeishuImport onImported={handleUploaded} />

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">文档列表</h2>
            <button
              onClick={() => router.push("/candidates")}
              className="px-3 py-1.5 text-sm font-medium text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
            >
              审核工作台 →
            </button>
          </div>
          <DocumentList
            refreshKey={refreshKey}
            parsingIds={parsingIds}
            onParse={handleParse}
            onPreview={handlePreview}
          />
        </div>

        {parseLoading && (
          <div className="fixed bottom-6 right-6 rounded-lg bg-blue-600 px-4 py-3 text-sm text-white shadow-lg">
            {parseCount > 1 ? "正在批量解析文档..." : "正在解析文档..."}
          </div>
        )}

        <DocumentPreview
          documentId={previewId}
          onClose={handleClosePreview}
        />
      </div>
    </AdminShell>
  );
}
