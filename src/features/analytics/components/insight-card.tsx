import type { DashboardInsight } from "@/server/services/analytics.service";

type InsightCardProps = {
  items: DashboardInsight[];
};

const toneClasses: Record<DashboardInsight["tone"], string> = {
  warning: "border-amber-100 bg-amber-50",
  positive: "border-emerald-100 bg-emerald-50",
  neutral: "border-zinc-100 bg-zinc-50",
};

const markerClasses: Record<DashboardInsight["tone"], string> = {
  warning: "bg-amber-500",
  positive: "bg-emerald-500",
  neutral: "bg-zinc-400",
};

export function InsightCard({ items }: InsightCardProps) {
  const isEmptyState = items.length === 1 && items[0].variant === "empty";

  return (
    <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">智能洞察</h2>
      <div className={`mt-4 grid gap-3 ${isEmptyState ? "" : "md:grid-cols-2"}`}>
        {items.map((item) => (
          <article
            key={item.id}
            className={`rounded-xl border px-4 py-3 ${
              isEmptyState ? "border-dashed" : ""
            } ${toneClasses[item.tone]}`}
          >
            <div className="flex items-start gap-3">
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${markerClasses[item.tone]}`}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-zinc-950">
                  {item.title}
                </h3>
                <p className="mt-1 text-sm leading-6 text-zinc-600">
                  {item.description}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
