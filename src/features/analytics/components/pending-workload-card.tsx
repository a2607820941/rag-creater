import type { PendingWorkload } from "@/server/services/analytics.service";

type PendingWorkloadCardProps = {
  workload: PendingWorkload;
  className?: string;
};

const ITEMS = [
  {
    key: "pendingDocuments" as const,
    label: "待处理文档",
    description: "上传、排队或解析中的文档",
  },
  {
    key: "failedDocuments" as const,
    label: "解析失败",
    description: "需要重新处理的文档",
  },
  {
    key: "pendingKnowledge" as const,
    label: "待审核知识",
    description: "已提炼但尚未确认的知识",
  },
];

export function PendingWorkloadCard({
  workload,
  className = "",
}: PendingWorkloadCardProps) {
  const total =
    workload.pendingDocuments +
    workload.failedDocuments +
    workload.pendingKnowledge;

  return (
    <section
      className={`rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">待处理积压</h2>
          <p className="mt-1 text-sm text-zinc-500">看当前流程卡在哪一步</p>
        </div>
        <div className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-600">
          {total.toLocaleString("zh-CN")} 项
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {ITEMS.map((item) => (
          <div
            key={item.key}
            className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-zinc-900">{item.label}</p>
                <p className="mt-1 text-xs text-zinc-500">{item.description}</p>
              </div>
              <p className="text-lg font-semibold tracking-tight text-zinc-950">
                {workload[item.key].toLocaleString("zh-CN")}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
