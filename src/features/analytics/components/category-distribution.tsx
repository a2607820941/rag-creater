type CategoryDistributionItem = {
  categoryId: string;
  name: string;
  color: string | null;
  count: number;
};

type CategoryDistributionProps = {
  items: CategoryDistributionItem[];
};

export function CategoryDistribution({ items }: CategoryDistributionProps) {
  const maxCount = Math.max(...items.map((item) => item.count), 1);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">分类知识分布</h2>

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-400">暂无分类数据</p>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <div key={item.categoryId}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-zinc-700">
                  {item.color ? (
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                  ) : null}
                  {item.name}
                </span>
                <span className="font-medium text-zinc-900">
                  {item.count.toLocaleString("zh-CN")}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${(item.count / maxCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
