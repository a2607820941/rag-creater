import Link from "next/link";

import { AdminShell } from "@/components/layout/admin-shell";
import { AgentForm } from "@/features/agent/components/agent-form";

export default function NewAgentPage() {
  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-sm font-medium text-cyan-700">
              专家 Agent
            </p>
            <h1 className="text-2xl font-semibold tracking-normal text-zinc-950">
              新建 Agent
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              先定义专家人设，再收窄知识边界，最后生成稳定 system prompt。
            </p>
          </div>
          <Link
            href="/agents"
            className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
          >
            返回列表
          </Link>
        </div>

        <AgentForm mode="create" />
      </div>
    </AdminShell>
  );
}
