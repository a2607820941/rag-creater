"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  AgentKnowledgeScope,
} from "@/features/agent/agent.types";

type AgentItem = {
  id: string;
  name: string;
  description: string | null;
  answerStyle: string;
  knowledgeScope: AgentKnowledgeScope;
  showReferences: boolean;
  allowKnowledgeCapture: boolean;
  status: string;
  updatedAt: string;
};

type AgentListResponse = {
  success: boolean;
  data?: {
    items: AgentItem[];
    total: number;
    page: number;
    pageSize: number;
  };
  error?: {
    message?: string;
  };
};

type AgentAvailabilityResult = {
  valid: boolean;
  reasons: string[];
  warnings: string[];
  checks: {
    enabledKnowledgeBaseCount: number;
    availableChunkCount: number;
    uncheckedScopeFields: string[];
  };
};

type ValidateResponse = {
  success: boolean;
  data?: AgentAvailabilityResult;
  error?: {
    message?: string;
  };
};

type ValidationState = {
  loading: boolean;
  result?: AgentAvailabilityResult;
  error?: string;
};

type AgentListProps = {
  refreshKey: number;
  onRefresh: () => void;
};

const STATUS_OPTIONS = [
  { key: "", label: "全部" },
  { key: "draft", label: "草稿" },
  { key: "active", label: "启用" },
  { key: "disabled", label: "停用" },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "bg-amber-50 text-amber-700" },
  active: { label: "启用", color: "bg-emerald-50 text-emerald-700" },
  disabled: { label: "停用", color: "bg-rose-50 text-rose-600" },
};

const STYLE_LABELS: Record<string, string> = {
  strict: "严谨",
  concise: "简洁",
  teaching: "教学",
  support: "客服",
};

const AGENT_LIST_REQUEST_TIMEOUT_MS = 15_000;

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("zh-CN", {
    year: "numeric",
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
      color: "bg-zinc-100 text-zinc-600",
    }
  );
}

function formatCount(label: string, count: number): string | null {
  return count > 0 ? `${label} ${count}` : null;
}

function formatScopeSummary(scope: AgentKnowledgeScope): string {
  const parts = [
    "指定知识库",
    formatCount("知识库", scope.knowledgeBaseIds.length),
  ].filter(Boolean);

  return parts.join(" / ");
}

function getValidationText(state?: ValidationState): {
  text: string;
  className: string;
} {
  if (!state) {
    return {
      text: "未检查",
      className: "bg-zinc-100 text-zinc-500",
    };
  }
  if (state.loading) {
    return {
      text: "检查中",
      className: "bg-cyan-50 text-cyan-700",
    };
  }
  if (state.error) {
    return {
      text: "检查失败",
      className: "bg-rose-50 text-rose-700",
    };
  }
  if (state.result?.valid) {
    return {
      text: "可用",
      className: "bg-emerald-50 text-emerald-700",
    };
  }
  return {
    text: "不可用",
    className: "bg-amber-50 text-amber-700",
  };
}

export function AgentList({ refreshKey, onRefresh }: AgentListProps) {
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [validationById, setValidationById] = useState<
    Record<string, ValidationState>
  >({});
  const fetchSeqRef = useRef(0);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (keyword.trim()) params.set("keyword", keyword.trim());
    return params.toString();
  }, [keyword, status]);

  const stats = useMemo(
    () => ({
      total: agents.length,
      active: agents.filter((item) => item.status === "active").length,
      draft: agents.filter((item) => item.status === "draft").length,
      withScope: agents.filter(
        (item) => item.knowledgeScope.knowledgeBaseIds.length > 0
      ).length,
    }),
    [agents]
  );

  const fetchAgents = useCallback(async (signal?: AbortSignal) => {
    const fetchSeq = fetchSeqRef.current + 1;
    fetchSeqRef.current = fetchSeq;
    const isCurrentFetch = () => fetchSeqRef.current === fetchSeq;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    setLoading(true);
    setError(null);
    try {
      const request = fetch(query ? `/api/agents?${query}` : "/api/agents", {
        signal,
      });
      const timeout = new Promise<Response>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("加载超时，请重试"));
        }, AGENT_LIST_REQUEST_TIMEOUT_MS);
      });
      const res = await Promise.race([request, timeout]);
      const json = (await res.json()) as AgentListResponse;
      if (!json.success || !json.data) {
        throw new Error(json.error?.message || "加载失败");
      }
      if (isCurrentFetch()) {
        setAgents(json.data.items);
      }
    } catch (err) {
      if (signal?.aborted || !isCurrentFetch()) return;
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      if (!signal?.aborted && isCurrentFetch()) {
        setLoading(false);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    fetchAgents(controller.signal);

    return () => {
      controller.abort();
    };
  }, [fetchAgents, refreshKey]);

  const handleValidate = async (agentId: string) => {
    setValidationById((current) => ({
      ...current,
      [agentId]: { loading: true },
    }));

    try {
      const res = await fetch(`/api/agents/${agentId}/validate`, {
        method: "POST",
      });
      const json = (await res.json()) as ValidateResponse;
      if (!json.success || !json.data) {
        throw new Error(json.error?.message || "检查失败");
      }
      setValidationById((current) => ({
        ...current,
        [agentId]: { loading: false, result: json.data },
      }));
    } catch (err) {
      setValidationById((current) => ({
        ...current,
        [agentId]: {
          loading: false,
          error: err instanceof Error ? err.message : "检查失败",
        },
      }));
    }
  };

  const handleDelete = async (agent: AgentItem) => {
    if (!confirm(`确定删除「${agent.name}」？`)) return;
    setDeletingId(agent.id);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error?.message || "删除失败");
      }
      setAgents((prev) => prev.filter((item) => item.id !== agent.id));
      setValidationById((current) => {
        const next = { ...current };
        delete next[agent.id];
        return next;
      });
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <StatTile label="当前列表" value={stats.total} detail="个 Agent" />
        <StatTile label="已启用" value={stats.active} detail="可进入消费" />
        <StatTile label="草稿" value={stats.draft} detail="待完善配置" />
        <StatTile label="已绑定范围" value={stats.withScope} detail="含知识库" />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-1">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setStatus(option.key)}
              className={`min-h-8 rounded-full px-3 text-xs font-medium transition-colors ${
                status === option.key
                  ? "bg-cyan-700 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索名称或描述"
          className="ml-auto h-9 min-w-52 rounded-md border border-zinc-200 px-3 text-sm text-zinc-700 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-lg border border-zinc-200 bg-white py-16 text-sm text-zinc-500">
          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
          加载中...
        </div>
      ) : error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
          <button
            type="button"
            onClick={() => fetchAgents()}
            className="ml-2 underline"
          >
            重试
          </button>
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white py-16 text-center">
          <p className="text-sm font-medium text-zinc-700">
            还没有专家 Agent
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            先创建角色，再绑定知识范围和回答策略。
          </p>
          <Link
            href="/agents/new"
            className="mt-4 inline-flex rounded-md bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-800"
          >
            新建 Agent
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
          <table className="w-full min-w-[1120px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase text-zinc-500">
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">风格</th>
                <th className="px-4 py-3">知识范围</th>
                <th className="px-4 py-3">策略</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">可用性</th>
                <th className="px-4 py-3">更新时间</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {agents.map((agent) => {
                const statusDisplay = getStatusDisplay(agent.status);
                const validationState = validationById[agent.id];
                const validationDisplay = getValidationText(validationState);
                const validationMessage =
                  validationState?.error ??
                  validationState?.result?.reasons[0] ??
                  validationState?.result?.warnings[0] ??
                  (validationState?.result
                    ? `可用知识库 ${validationState.result.checks.enabledKnowledgeBaseCount} 个`
                    : "点击检查后查看结果");

                return (
                  <tr key={agent.id} className="hover:bg-zinc-50/70">
                    <td className="max-w-[260px] px-4 py-3">
                      <div className="font-medium text-zinc-950">
                        {agent.name}
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">
                        {agent.description || "暂无描述"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {STYLE_LABELS[agent.answerStyle] ?? agent.answerStyle}
                    </td>
                    <td className="max-w-[300px] px-4 py-3">
                      <div className="text-zinc-800">
                        {formatScopeSummary(agent.knowledgeScope)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            agent.showReferences
                              ? "bg-cyan-50 text-cyan-700"
                              : "bg-zinc-100 text-zinc-500"
                          }`}
                        >
                          {agent.showReferences ? "展示引用" : "隐藏引用"}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            agent.allowKnowledgeCapture
                              ? "bg-indigo-50 text-indigo-700"
                              : "bg-zinc-100 text-zinc-500"
                          }`}
                        >
                          {agent.allowKnowledgeCapture ? "允许沉淀" : "不沉淀"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusDisplay.color}`}
                      >
                        {statusDisplay.label}
                      </span>
                    </td>
                    <td className="max-w-[220px] px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${validationDisplay.className}`}
                      >
                        {validationDisplay.text}
                      </span>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">
                        {validationMessage}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {formatDate(agent.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link
                          href={`/agents/${agent.id}/edit`}
                          className="rounded px-2 py-1 text-xs font-medium text-cyan-700 hover:bg-cyan-50"
                        >
                          编辑
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleValidate(agent.id)}
                          disabled={validationState?.loading}
                          className="rounded px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {validationState?.loading ? "检查中" : "检查"}
                        </button>
                        {agent.status === "active" ? (
                          <Link
                            href={`/agents/chat?agentId=${agent.id}`}
                            className="rounded px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                          >
                            对话
                          </Link>
                        ) : (
                          <button
                            type="button"
                            disabled
                            title="只有启用状态的 Agent 可以进入对话"
                            className="rounded px-2 py-1 text-xs font-medium text-zinc-400"
                          >
                            对话
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(agent)}
                          disabled={deletingId === agent.id}
                          className="rounded px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingId === agent.id ? "删除中" : "删除"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-zinc-500">{label}</div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <span className="text-2xl font-semibold text-zinc-950">{value}</span>
        <span className="pb-1 text-xs text-zinc-400">{detail}</span>
      </div>
    </div>
  );
}
