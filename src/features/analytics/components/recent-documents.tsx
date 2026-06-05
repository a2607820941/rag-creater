import Link from "next/link";

type RecentDocument = {
  id: string;
  originalName: string;
  fileType: string;
  status: string;
  chunkCount: number;
  createdAt: string;
};

type RecentDocumentsProps = {
  documents: RecentDocument[];
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RecentDocuments({ documents }: RecentDocumentsProps) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-950">最近新增文档</h2>
        <Link href="/documents" className="text-sm font-medium text-blue-600">
          去文档导入
        </Link>
      </div>

      {documents.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-400">
          暂无数据
        </p>
      ) : (
        <div className="divide-y divide-zinc-100">
          {documents.map((document) => (
            <div key={document.id} className="flex items-center gap-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xs font-semibold uppercase text-blue-600">
                {document.fileType}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900">
                  {document.originalName}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {document.status} · {document.chunkCount} 段 ·{" "}
                  {formatDate(document.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
