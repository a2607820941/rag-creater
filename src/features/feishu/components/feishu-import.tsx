"use client";

import { useState } from "react";

interface FeishuImportProps {
  onImported: () => void;
}

const SUPPORTED_TYPES = [
  { label: "新版文档", path: "/docx/" },
  { label: "旧版文档", path: "/docs/" },
  { label: "知识库", path: "/wiki/" },
  { label: "电子表格", path: "/sheets/" },
  { label: "多维表格", path: "/bitable/" },
  { label: "会议纪要", path: "/minutes/" },
];

export function FeishuImport({ onImported }: FeishuImportProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ title: string } | null>(null);

  const handleImport = async () => {
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/feishu/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const json = await res.json();

      if (json.success) {
        setResult({ title: json.data.title });
        setUrl("");
        onImported();
      } else {
        setError(json.error?.message || "导入失败");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">飞书导入</h2>
      <p className="text-sm text-gray-500 mb-3">
        支持 {SUPPORTED_TYPES.map((t) => t.label).join("、")}，粘贴链接后自动识别类型并导入
      </p>

      <div className="flex items-center gap-3">
        <input
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
            setResult(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !loading) handleImport();
          }}
          placeholder="https://xxx.feishu.cn/wiki/xxxxx"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          onClick={handleImport}
          disabled={loading || !url.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {loading ? (
            <>
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              导入中...
            </>
          ) : (
            "导入"
          )}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}

      {result && (
        <p className="mt-2 text-sm text-green-600">
          已导入「{result.title}」
        </p>
      )}
    </div>
  );
}
