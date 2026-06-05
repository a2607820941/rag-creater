type AnalyticsListItem = {
  id: string;
  title: string;
  meta: string;
};

type PlaceholderPanelProps = {
  title: string;
  emptyText: string;
  items: AnalyticsListItem[];
  className?: string;
};

export function PlaceholderPanel({
  title,
  emptyText,
  items,
  className = "",
}: PlaceholderPanelProps) {
  return (
    <section
      className={`rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm ${className}`}
    >
      <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-400">{emptyText}</p>
      ) : (
        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2"
            >
              <p className="truncate text-sm font-medium text-zinc-900">
                {item.title}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{item.meta}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
