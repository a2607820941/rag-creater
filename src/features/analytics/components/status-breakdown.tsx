type StatusBreakdownProps = {
  title: string;
  items: Array<{
    status: string;
    count: number;
  }>;
};

const STATUS_LABELS: Record<string, string> = {
  active: "启用",
  disabled: "停用",
  draft: "草稿",
  failed: "失败",
  parsed: "已解析",
  parsing: "解析中",
  uploaded: "待解析",
  uploading: "上传中",
};

export function StatusBreakdown({ title, items }: StatusBreakdownProps) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-zinc-400">暂无数据</p>
        ) : (
          items.map((item) => (
            <div key={item.status} className="flex items-center justify-between">
              <span className="text-sm text-zinc-600">
                {STATUS_LABELS[item.status] ?? item.status}
              </span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                {item.count.toLocaleString("zh-CN")}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
