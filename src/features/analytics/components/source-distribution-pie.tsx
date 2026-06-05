import type { SourceDistributionItem } from "@/server/services/analytics.service";

type SourceDistributionPieProps = {
  items: SourceDistributionItem[];
};

const COLORS = [
  "#2563eb",
  "#0ea5e9",
  "#14b8a6",
  "#22c55e",
  "#f59e0b",
  "#f97316",
];
const MAX_SOURCE_ITEMS = 6;
const SOURCE_LEGEND_HEIGHT = 420;

function formatPercent(value: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

export function SourceDistributionPie({ items }: SourceDistributionPieProps) {
  const displayItems = items.slice(0, MAX_SOURCE_ITEMS);
  const total = displayItems.reduce((sum, item) => sum + item.count, 0);

  let offset = 0;
  const stops = displayItems.map((item, index) => {
    const percentage = total === 0 ? 0 : (item.count / total) * 100;
    const start = offset;
    const end = offset + percentage;
    offset = end;
    return `${COLORS[index % COLORS.length]} ${start}% ${end}%`;
  });

  return (
    <section className="h-full overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">素材来源占比</h2>
          <p className="mt-1 text-sm text-zinc-500">按现有素材来源字段统计</p>
        </div>
        <div className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-600">
          {total.toLocaleString("zh-CN")} 条
        </div>
      </div>

      {displayItems.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-400">暂无素材来源数据</p>
      ) : (
        <div className="mt-5 grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
          <div className="flex items-center justify-center">
            <div className="relative h-56 w-56">
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    total > 0
                      ? `conic-gradient(${stops.join(", ")})`
                      : "#e4e4e7",
                }}
              />
              <div className="absolute inset-5 rounded-full bg-white shadow-inner" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-3xl font-semibold tracking-tight text-zinc-950">
                    {total.toLocaleString("zh-CN")}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">素材总数</p>
                </div>
              </div>
            </div>
          </div>

          <div
            className="space-y-3 overflow-hidden"
            style={{
              height: SOURCE_LEGEND_HEIGHT,
              maxHeight: SOURCE_LEGEND_HEIGHT,
            }}
          >
            {displayItems.map((item, index) => (
              <div
                key={item.sourceType}
                className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="truncate text-sm font-medium text-zinc-900">
                      {item.label}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-zinc-900">
                      {item.count.toLocaleString("zh-CN")}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {formatPercent(item.count, total)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
