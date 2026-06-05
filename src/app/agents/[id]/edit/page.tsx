"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { AdminShell } from "@/components/layout/admin-shell";
import { AgentForm } from "@/features/agent/components/agent-form";
import type { AgentKnowledgeScope } from "@/features/agent/agent.types";

type AgentDetail = {
  id: string;
  name: string;
  description: string | null;
  answerStyle: string;
  knowledgeScope: AgentKnowledgeScope;
  showReferences: boolean;
  allowKnowledgeCapture: boolean;
  status: "draft" | "active" | "disabled";
  systemPrompt: string | null;
};

type AgentDetailResponse = {
  success: boolean;
  data?: AgentDetail;
  error?: {
    message?: string;
  };
};

export default function EditAgentPage() {
  const params = useParams<{ id: string }>();
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchAgent() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/agents/${params.id}`, {
          signal: controller.signal,
        });
        const json = (await res.json()) as AgentDetailResponse;
        if (!json.success || !json.data) {
          throw new Error(json.error?.message || "加载失败");
        }
        if (!controller.signal.aborted) {
          setAgent(json.data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "加载失败");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchAgent();

    return () => {
      controller.abort();
    };
  }, [params.id]);

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-sm font-medium text-cyan-700">
              专家 Agent
            </p>
            <h1 className="text-2xl font-semibold tracking-normal text-zinc-950">
              编辑 Agent
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              调整角色、知识范围、引用策略和沉淀策略。
            </p>
          </div>
          <Link
            href="/agents"
            className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
          >
            返回列表
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center rounded-lg border border-zinc-200 bg-white py-16 text-sm text-zinc-500">
            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
            加载中...
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : agent ? (
          <AgentForm
            mode="edit"
            agentId={agent.id}
            initialValues={{
              name: agent.name,
              description: agent.description ?? "",
              answerStyle: agent.answerStyle,
              knowledgeScope: agent.knowledgeScope,
              showReferences: agent.showReferences,
              allowKnowledgeCapture: agent.allowKnowledgeCapture,
              status: agent.status,
              systemPrompt: agent.systemPrompt ?? "",
            }}
          />
        ) : null}
      </div>
    </AdminShell>
  );
}
