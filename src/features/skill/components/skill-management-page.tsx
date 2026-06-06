"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  Eye,
  PackageCheck,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
} from "lucide-react";

import { AdminShell } from "@/components/layout/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SKILL_STATUS_LABELS,
  SKILL_TASK_AUDIENCE_LABELS,
  SKILL_TASK_DOMAIN_LABELS,
  SKILL_TASK_INTENT_LABELS,
} from "@/features/skill/skill-labels";
import type {
  SkillDTO,
  SkillStatus,
} from "@/features/skill/skill.types";

type SkillListResponse = {
  success: boolean;
  data?: {
    items: SkillDTO[];
    total: number;
    page: number;
    pageSize: number;
  };
  error?: { message?: string };
};

const STATUS_OPTIONS = ["all", "draft", "published", "disabled"] as const;
const DOMAIN_OPTIONS = [
  "all",
  "hr",
  "finance",
  "legal",
  "procurement",
  "approval",
  "workplace",
  "security",
  "privacy",
  "compliance",
  "aigc",
  "general",
] as const;
const INTENT_OPTIONS = [
  "all",
  "qa",
  "policy_check",
  "process_guidance",
  "case_triage",
  "summary",
  "drafting",
  "risk_review",
] as const;

export function SkillManagementPage() {
  const [items, setItems] = useState<SkillDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("all");
  const [taskDomain, setTaskDomain] =
    useState<(typeof DOMAIN_OPTIONS)[number]>("all");
  const [taskIntent, setTaskIntent] =
    useState<(typeof INTENT_OPTIONS)[number]>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(
    () => ({
      published: items.filter((item) => item.status === "published").length,
      draft: items.filter((item) => item.status === "draft").length,
      disabled: items.filter((item) => item.status === "disabled").length,
    }),
    [items]
  );

  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "100",
      });
      if (keyword.trim()) params.set("keyword", keyword.trim());
      if (status !== "all") params.set("status", status);
      if (taskDomain !== "all") params.set("taskDomain", taskDomain);
      if (taskIntent !== "all") params.set("taskIntent", taskIntent);

      const res = await fetch(`/api/skills?${params.toString()}`);
      const json = (await res.json()) as SkillListResponse;
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error?.message || "加载 Skill 失败");
      }
      setItems(json.data.items);
      setTotal(json.data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载 Skill 失败");
    } finally {
      setLoading(false);
    }
  }, [keyword, status, taskDomain, taskIntent]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSkills(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSkills]);

  async function updateSkillStatus(skill: SkillDTO, nextStatus: SkillStatus) {
    setError(null);
    try {
      const res = await fetch(`/api/skills/${skill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error?.message || "更新 Skill 状态失败");
      }
      await loadSkills();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新 Skill 状态失败");
    }
  }

  async function deleteSkill(skill: SkillDTO) {
    if (!window.confirm(`删除 Skill「${skill.name}」？该操作会移除管理记录。`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/skills/${skill.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error?.message || "删除 Skill 失败");
      }
      await loadSkills();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除 Skill 失败");
    }
  }

  return (
    <AdminShell>
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6">
        <section className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <PackageCheck aria-hidden="true" className="size-5 text-emerald-700" />
              <h1 className="text-xl font-semibold text-slate-950">Skill 管理</h1>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              管理通过 Skill Agent 生产的企业任务 Skill，完成测试、校验、安装包下载和外部 Agent 使用配置。
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/agents/chat?mode=skill-agent">回到 Skill Agent</Link>
            </Button>
            <Button asChild>
              <Link href="/agents/chat?mode=skill-agent">
                <Plus data-icon="inline-start" />
                新建 Skill
              </Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <Metric label="全部 Skill" value={total} />
          <Metric label="已发布" value={stats.published} />
          <Metric label="草稿" value={stats.draft} />
          <Metric label="已停用" value={stats.disabled} />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-200 bg-white px-2">
              <Search aria-hidden="true" className="size-4 shrink-0 text-slate-400" />
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索名称、slug、描述或任务场景"
                className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect
                value={status}
                onValueChange={(value) =>
                  setStatus(value as (typeof STATUS_OPTIONS)[number])
                }
                options={STATUS_OPTIONS}
                label="状态"
                labels={{ all: "全部状态", ...SKILL_STATUS_LABELS }}
              />
              <FilterSelect
                value={taskDomain}
                onValueChange={(value) =>
                  setTaskDomain(value as (typeof DOMAIN_OPTIONS)[number])
                }
                options={DOMAIN_OPTIONS}
                label="业务域"
                labels={{ all: "全部业务域", ...SKILL_TASK_DOMAIN_LABELS }}
              />
              <FilterSelect
                value={taskIntent}
                onValueChange={(value) =>
                  setTaskIntent(value as (typeof INTENT_OPTIONS)[number])
                }
                options={INTENT_OPTIONS}
                label="任务"
                labels={{ all: "全部任务", ...SKILL_TASK_INTENT_LABELS }}
              />
              <Button type="button" variant="outline" onClick={() => void loadSkills()}>
                <RefreshCcw data-icon="inline-start" />
                刷新
              </Button>
            </div>
          </div>

          {error ? (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">名称</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">任务场景</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">状态</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">版本</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">知识范围</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">更新时间</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                      正在加载 Skill...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                      暂无 Skill。请回到 Skill Agent 通过会话生产。
                    </td>
                  </tr>
                ) : (
                  items.map((skill) => (
                    <tr key={skill.id} className="border-b border-slate-100">
                      <td className="border-b border-slate-100 px-3 py-3 align-top">
                        <div className="font-medium text-slate-950">{skill.name}</div>
                        <div className="mt-1 text-xs text-slate-500">{skill.slug}</div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3 align-top">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline">
                            {SKILL_TASK_DOMAIN_LABELS[skill.taskDomain]}
                          </Badge>
                          <Badge variant="outline">
                            {SKILL_TASK_INTENT_LABELS[skill.taskIntent]}
                          </Badge>
                          <Badge variant="outline">
                            {SKILL_TASK_AUDIENCE_LABELS[skill.taskAudience]}
                          </Badge>
                        </div>
                        <div className="mt-2 line-clamp-2 max-w-md text-xs text-slate-500">
                          {skill.taskDescription}
                        </div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3 align-top">
                        <StatusBadge status={skill.status} />
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3 align-top text-xs text-slate-600">
                        {skill.version}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3 align-top text-xs text-slate-600">
                        {skill.knowledgeScope.knowledgeBaseIds.length} 个知识库
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3 align-top text-xs text-slate-500">
                        {formatDate(skill.updatedAt)}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3 align-top">
                        <div className="flex justify-end gap-1">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/skills/${skill.id}`}>
                              <Eye data-icon="inline-start" />
                              详情
                            </Link>
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <a href={`/api/skills/${skill.id}/export-package?format=zip`}>
                              <Download data-icon="inline-start" />
                              下载
                            </a>
                          </Button>
                          {skill.status === "disabled" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void updateSkillStatus(skill, "draft")}
                            >
                              启用
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void updateSkillStatus(skill, "disabled")}
                            >
                              禁用
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => void deleteSkill(skill)}
                            title="删除"
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </AdminShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function FilterSelect({
  label,
  options,
  value,
  onValueChange,
  labels,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onValueChange: (value: string) => void;
  labels: Record<string, string>;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-32">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {labels[option] ?? option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StatusBadge({ status }: { status: SkillStatus }) {
  if (status === "published") return <Badge>{SKILL_STATUS_LABELS[status]}</Badge>;
  if (status === "disabled") {
    return <Badge variant="destructive">{SKILL_STATUS_LABELS[status]}</Badge>;
  }
  return <Badge variant="outline">{SKILL_STATUS_LABELS[status]}</Badge>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
