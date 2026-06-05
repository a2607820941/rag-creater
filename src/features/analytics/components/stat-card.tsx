type StatCardProps = {
  label: string;
  value: number;
  description: string;
};

export function StatCard({ label, value, description }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">
        {value.toLocaleString("zh-CN")}
      </p>
      <p className="mt-2 text-sm leading-6 text-zinc-500">{description}</p>
    </div>
  );
}
