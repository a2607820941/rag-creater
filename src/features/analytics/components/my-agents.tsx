import Link from "next/link";

import type { DashboardAgent } from "@/server/services/analytics.service";

type MyAgentsProps = {
  agents: DashboardAgent[];
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft: { label: "草稿", className: "bg-amber-50 text-amber-700" },
  active: { label: "启用", className: "bg-emerald-50 text-emerald-700" },
  disabled: { label: "停用", className: "bg-rose-50 text-rose-600" },
};

const STYLE_LABELS: Record<string, string> = {
  strict: "严谨",
  concise: "简洁",
  teaching: "教学",
  support: "客服",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusDisplay(status: string) {
  return (
    STATUS_LABELS[status] ?? {
      label: status,
      className: "bg-zinc-100 text-zinc-600",
    }
  );
}

export function MyAgents({ agents }: MyAgentsProps) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-zinc-950">我的 Agent</h2>
        <Link href="/agents" className="text-sm font-medium text-blue-600">
          查看全部
        </Link>
      </div>

      {agents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 py-8 text-center">
          <p className="text-sm font-medium text-zinc-700">
            还没有专家 Agent
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            创建 Agent 后，可以在这里快速进入对话。
          </p>
          <Link
            href="/agents/new"
            className="mt-4 inline-flex rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            新建 Agent
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-zinc-100">
          {agents.map((agent) => {
            const status = getStatusDisplay(agent.status);

            return (
              <div key={agent.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-zinc-950">
                        {agent.name}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs text-zinc-500">
                      {agent.description || "暂无描述"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Link
                      href={`/agents/chat?agentId=${agent.id}`}
                      className="rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      进入对话
                    </Link>
                    <Link
                      href={`/agents/${agent.id}/edit`}
                      className="rounded-md bg-zinc-950 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                    >
                      编辑
                    </Link>
                  </div>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {STYLE_LABELS[agent.answerStyle] ?? agent.answerStyle} · 绑定{" "}
                  {agent.knowledgeBaseCount.toLocaleString("zh-CN")} 个知识库 ·{" "}
                  {agent.conversationCount.toLocaleString("zh-CN")} 个会话 ·{" "}
                  {formatDate(agent.updatedAt)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
