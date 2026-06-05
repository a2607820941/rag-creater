import { getSourceTypeLabel } from "@/lib/source-type";

type RecentKnowledgeItem = {
  id: string;
  knowledgeBaseId: string | null;
  title: string;
  sourceType: string;
  status: string;
  parseStatus: string;
  createdAt: string;
};

type RecentKnowledgeListProps = {
  items: RecentKnowledgeItem[];
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStatus(status: string) {
  if (status === "pending") return "待确认";
  if (status === "confirmed") return "已确认";
  if (status === "rejected") return "已驳回";
  return status;
}

export function RecentKnowledgeList({ items }: RecentKnowledgeListProps) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">最近新增知识</h2>

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-400">暂无知识数据</p>
      ) : (
        <div className="mt-4 divide-y divide-zinc-100">
          {items.map((item) => (
            <div key={item.id} className="py-3">
              <p className="truncate text-sm font-medium text-zinc-900">
                {item.title}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {getSourceTypeLabel(item.sourceType)} ·{" "}
                {formatStatus(item.status)} · {formatDate(item.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
