"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Play,
  RefreshCcw,
  Send,
  ShieldAlert,
  Trash2,
} from "lucide-react";

import { AdminShell } from "@/components/layout/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  SKILL_OUTPUT_STYLE_LABELS,
  SKILL_RUNTIME_MODE_LABELS,
  SKILL_STATUS_LABELS,
  SKILL_TASK_AUDIENCE_LABELS,
  SKILL_TASK_DOMAIN_LABELS,
  SKILL_TASK_INTENT_LABELS,
  SKILL_VALIDATION_SEVERITY_LABELS,
  SKILL_VALIDATION_STATUS_LABELS,
} from "@/features/skill/skill-labels";
import type {
  SkillDTO,
  SkillRunResult,
  SkillStatus,
  SkillValidationCheck,
  SkillValidationResult,
} from "@/features/skill/skill.types";

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { message?: string };
};

type PublishResult = {
  skill: SkillDTO;
  manifest: unknown;
  apiKey: string;
};

type DetailTab = "overview" | "install" | "test" | "scenario" | "runtime" | "validate";

const TABS: { value: DetailTab; label: string }[] = [
  { value: "overview", label: "概览" },
  { value: "install", label: "安装" },
  { value: "test", label: "测试" },
  { value: "scenario", label: "任务场景" },
  { value: "runtime", label: "平台调用" },
  { value: "validate", label: "校验" },
];

export function SkillDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const skillId = params.id;

  const [skill, setSkill] = useState<SkillDTO | null>(null);
  const [validation, setValidation] = useState<SkillValidationResult | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [testQuestion, setTestQuestion] = useState("");
  const [testResult, setTestResult] = useState<SkillRunResult | null>(null);

  const runtimeEndpoint = useMemo(() => {
    if (!skill) return "";
    return `/api/public/skills/${skill.slug}/run`;
  }, [skill]);

  const loadSkill = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [skillRes, validationRes] = await Promise.all([
        fetch(`/api/skills/${skillId}`),
        fetch(`/api/skills/${skillId}/validate`),
      ]);
      const skillJson = (await skillRes.json()) as ApiResponse<SkillDTO>;
      if (!skillRes.ok || !skillJson.success || !skillJson.data) {
        throw new Error(skillJson.error?.message || "加载 Skill 失败");
      }
      const loadedSkill = skillJson.data;
      const validationJson =
        (await validationRes.json()) as ApiResponse<SkillValidationResult>;
      setSkill(loadedSkill);
      setValidation(validationJson.success ? validationJson.data ?? null : null);
      setTestQuestion((current) =>
        current.trim()
          ? current
          : loadedSkill.triggerExamples[0] ||
            loadedSkill.taskDescription ||
            `请基于 ${loadedSkill.name} 回答一个典型问题`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载 Skill 失败");
    } finally {
      setLoading(false);
    }
  }, [skillId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSkill(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSkill]);

  async function updateStatus(nextStatus: SkillStatus) {
    if (!skill) return;
    setActionLoading("status");
    setError(null);
    try {
      const res = await fetch(`/api/skills/${skill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = (await res.json()) as ApiResponse<SkillDTO>;
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error?.message || "更新 Skill 状态失败");
      }
      setSkill(json.data);
      await loadSkill();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新 Skill 状态失败");
    } finally {
      setActionLoading(null);
    }
  }

  async function publishSkill() {
    if (!skill) return;
    setActionLoading("publish");
    setError(null);
    try {
      const res = await fetch(`/api/skills/${skill.id}/publish`, { method: "POST" });
      const json = (await res.json()) as ApiResponse<PublishResult | SkillValidationResult>;
      if (!res.ok || !json.success || !json.data || !("apiKey" in json.data)) {
        if (json.data && "summary" in json.data) setValidation(json.data);
        throw new Error(json.error?.message || "Skill 未通过发布校验");
      }
      setPublishResult(json.data);
      setSkill(json.data.skill);
      setActiveTab("install");
      await loadSkill();
    } catch (err) {
      setError(err instanceof Error ? err.message : "发布 Skill 失败");
    } finally {
      setActionLoading(null);
    }
  }

  async function runTest() {
    if (!skill || !testQuestion.trim()) return;
    setActionLoading("test");
    setError(null);
    setTestResult(null);
    try {
      const res = await fetch(`/api/skills/${skill.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: {
            question: testQuestion.trim(),
            context: "Skill 管理页测试调用",
            outputStyle: skill.outputStyle,
          },
          llmInterface: "openai",
        }),
      });
      const json = (await res.json()) as ApiResponse<SkillRunResult>;
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error?.message || "测试 Skill 失败");
      }
      setTestResult(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "测试 Skill 失败");
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteCurrentSkill() {
    if (!skill) return;
    if (!window.confirm(`删除 Skill "${skill.name}"？该操作会移除管理记录。`)) return;
    setActionLoading("delete");
    setError(null);
    try {
      const res = await fetch(`/api/skills/${skill.id}`, { method: "DELETE" });
      const json = (await res.json()) as ApiResponse<{ id: string }>;
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "删除 Skill 失败");
      }
      router.push("/skills");
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除 Skill 失败");
      setActionLoading(null);
    }
  }

  return (
    <AdminShell>
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6">
        <section className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <Button asChild variant="ghost" className="-ml-3 mb-2">
              <Link href="/skills">
                <ArrowLeft data-icon="inline-start" />
                返回 Skill 管理
              </Link>
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold text-slate-950">
                {skill?.name ?? "Skill 详情"}
              </h1>
              {skill ? <StatusBadge status={skill.status} /> : null}
              {validation ? <ValidationBadge validation={validation} /> : null}
            </div>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              {skill?.taskDescription || "查看 Skill 的任务身份、安装包、平台调用说明和发布质量。"}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/agents/chat?mode=skill-agent">新建 Skill</Link>
            </Button>
            {skill ? (
              <Button asChild variant="outline">
                <a href={`/api/skills/${skill.id}/export-package?format=zip`}>
                  <Download data-icon="inline-start" />
                  下载包
                </a>
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={() => void publishSkill()}
              disabled={!skill || actionLoading === "publish"}
            >
              <Send data-icon="inline-start" />
              {actionLoading === "publish" ? "发布中" : "发布 / 生成密钥"}
            </Button>
          </div>
        </section>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            正在加载 Skill...
          </div>
        ) : !skill ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            未找到 Skill。
          </div>
        ) : (
          <>
            <section className="grid gap-3 md:grid-cols-4">
              <Metric label="标识" value={skill.slug} />
              <Metric label="版本" value={skill.version} />
              <Metric label="知识范围" value={`${skill.knowledgeScope.knowledgeBaseIds.length} 个知识库`} />
              <Metric label="最近更新" value={formatDate(skill.updatedAt)} />
            </section>

            <section className="flex flex-wrap gap-2 border-b border-slate-200">
              {TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setActiveTab(tab.value)}
                  className={`border-b-2 px-3 py-2 text-sm font-medium ${
                    activeTab === tab.value
                      ? "border-slate-950 text-slate-950"
                      : "border-transparent text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </section>

            {activeTab === "overview" ? (
              <OverviewTab skill={skill} validation={validation} />
            ) : null}
            {activeTab === "install" ? (
              <InstallTab skill={skill} apiKey={publishResult?.apiKey} />
            ) : null}
            {activeTab === "test" ? (
              <TestTab
                question={testQuestion}
                setQuestion={setTestQuestion}
                result={testResult}
                loading={actionLoading === "test"}
                onRun={() => void runTest()}
              />
            ) : null}
            {activeTab === "scenario" ? <ScenarioTab skill={skill} /> : null}
            {activeTab === "runtime" ? (
              <RuntimeTab skill={skill} endpoint={runtimeEndpoint} />
            ) : null}
            {activeTab === "validate" ? (
              <ValidationTab validation={validation} onRefresh={() => void loadSkill()} />
            ) : null}

            <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div>
                <div className="text-sm font-medium text-slate-950">管理动作</div>
                <div className="mt-1 text-xs text-slate-500">
                  生产内容请回到 Skill Agent，会话生成后再来这里测试、下载和安装。
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={actionLoading === "status"}
                  onClick={() =>
                    void updateStatus(skill.status === "disabled" ? "draft" : "disabled")
                  }
                >
                  {skill.status === "disabled" ? "启用" : "禁用"}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={actionLoading === "delete"}
                  onClick={() => void deleteCurrentSkill()}
                >
                  <Trash2 data-icon="inline-start" />
                  删除
                </Button>
              </div>
            </section>
          </>
        )}
      </main>
    </AdminShell>
  );
}

function OverviewTab({
  skill,
  validation,
}: {
  skill: SkillDTO;
  validation: SkillValidationResult | null;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Panel title="任务身份">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {SKILL_TASK_DOMAIN_LABELS[skill.taskDomain]}
          </Badge>
          <Badge variant="outline">
            {SKILL_TASK_INTENT_LABELS[skill.taskIntent]}
          </Badge>
          <Badge variant="outline">
            {SKILL_TASK_AUDIENCE_LABELS[skill.taskAudience]}
          </Badge>
          <Badge variant="outline">
            {SKILL_OUTPUT_STYLE_LABELS[skill.outputStyle]}
          </Badge>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-600">{skill.description || skill.taskDescription}</p>
      </Panel>
      <Panel title="发布质量">
        {validation ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">阻塞项</span>
              <strong className="text-slate-950">{validation.summary.blockingCount}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">提醒项</span>
              <strong className="text-slate-950">{validation.summary.warningCount}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">通过项</span>
              <strong className="text-slate-950">{validation.summary.passedCount}</strong>
            </div>
            <p className="pt-2 text-xs text-slate-500">{validation.summary.message}</p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">暂未拿到校验结果。</p>
        )}
      </Panel>
    </section>
  );
}

function InstallTab({
  skill,
  apiKey,
}: {
  skill: SkillDTO;
  apiKey?: string;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Panel title="一键安装">
        <p className="text-sm leading-6 text-slate-600">
          下载 Skill 包后，在包目录执行安装脚本。Codex 和 Claude Code 会读取同一个 SKILL.md，
          后续由脚本调用本平台的知识库检索和问答能力。
        </p>
        <CodeBlock
          value={`cd ${skill.slug}\nnode scripts/install-skill.mjs codex\nnode scripts/install-skill.mjs claude-code`}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild>
            <a href={`/api/skills/${skill.id}/export-package?format=zip`}>
              <Download data-icon="inline-start" />
              下载 zip
            </a>
          </Button>
        </div>
      </Panel>
      <Panel title="运行密钥">
        {apiKey ? (
          <>
            <p className="text-sm text-slate-600">密钥只在发布后展示一次，请写入目标 Agent 的 Skill 目录。</p>
            <CodeBlock value={`node scripts/set-runtime-key.mjs "${apiKey}"`} />
          </>
        ) : (
          <p className="text-sm leading-6 text-slate-600">
            点击“发布 / 生成密钥”后会返回一次性运行密钥。已经安装过的 Skill 可以重新发布并重新写入密钥。
          </p>
        )}
      </Panel>
    </section>
  );
}

function TestTab({
  question,
  setQuestion,
  result,
  loading,
  onRun,
}: {
  question: string;
  setQuestion: (value: string) => void;
  result: SkillRunResult | null;
  loading: boolean;
  onRun: () => void;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[420px_1fr]">
      <Panel title="测试输入">
        <Textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={8}
          placeholder="输入一个应该触发该 Skill 的任务问题"
        />
        <Button type="button" className="mt-3" disabled={loading || !question.trim()} onClick={onRun}>
          <Play data-icon="inline-start" />
          {loading ? "测试中" : "运行测试"}
        </Button>
      </Panel>
      <Panel title="测试结果">
        {result ? (
          <div className="space-y-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
              {result.answer}
            </div>
            <div>
              <div className="mb-2 text-xs font-medium text-slate-500">引用来源</div>
              {result.citations.length ? (
                <div className="space-y-2">
                  {result.citations.map((citation, index) => (
                    <div key={`${citation.knowledgeId}-${index}`} className="rounded-md border border-slate-200 p-2 text-xs text-slate-600">
                      <div className="font-medium text-slate-900">{citation.title}</div>
                      <div className="mt-1 line-clamp-2">{citation.content}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">本次没有返回引用。</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">运行测试后会在这里展示回答和引用来源。</p>
        )}
      </Panel>
    </section>
  );
}

function ScenarioTab({ skill }: { skill: SkillDTO }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <Panel title="什么时候使用">
        <List items={skill.triggerExamples} empty="暂无触发样例" />
      </Panel>
      <Panel title="不要什么时候使用">
        <List items={skill.nonGoals} empty="暂无不适用场景" />
      </Panel>
      <Panel title="任务描述">
        <p className="text-sm leading-6 text-slate-600">{skill.taskDescription}</p>
      </Panel>
      <Panel title="系统提示词">
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100">
          {skill.systemPrompt || "未配置系统提示词"}
        </pre>
      </Panel>
    </section>
  );
}

function RuntimeTab({ skill, endpoint }: { skill: SkillDTO; endpoint: string }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <Panel title="平台调用说明">
        <p className="text-sm leading-6 text-slate-600">
          这里描述外部 Agent 如何调用本平台执行 Skill。Skill 包负责告诉 Codex / Claude Code
          什么时候使用、怎么组织输入；真正的知识库检索、引用生成和调用日志仍由平台接口完成。
        </p>
      </Panel>
      <Panel title="接口契约">
        <div className="space-y-3 text-sm text-slate-600">
          <Row label="请求方式" value="POST" />
          <Row label="接口地址" value={endpoint} />
          <Row label="鉴权方式" value="Bearer 运行密钥" />
          <Row label="执行能力" value={SKILL_RUNTIME_MODE_LABELS[skill.runtimeMode]} />
        </div>
      </Panel>
      <Panel title="包元信息">
        <CodeBlock
          value={JSON.stringify(
            {
              skillSlug: skill.slug,
              platformRuntime: SKILL_RUNTIME_MODE_LABELS[skill.runtimeMode],
              compatibleAgents: ["Claude Code", "Codex"],
            },
            null,
            2
          )}
        />
      </Panel>
      <Panel title="输入格式">
        <CodeBlock value={JSON.stringify(skill.inputSchema, null, 2)} />
      </Panel>
      <Panel title="输出格式">
        <CodeBlock value={JSON.stringify(skill.outputSchema, null, 2)} />
      </Panel>
    </section>
  );
}

function ValidationTab({
  validation,
  onRefresh,
}: {
  validation: SkillValidationResult | null;
  onRefresh: () => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">发布前校验</h2>
          <p className="mt-1 text-xs text-slate-500">
            校验任务身份、触发样例、不适用场景、知识范围、输出格式和平台调用说明。
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onRefresh}>
          <RefreshCcw data-icon="inline-start" />
          刷新
        </Button>
      </div>
      {validation ? (
        <div className="space-y-2">
          {validation.checks.map((check) => (
            <ValidationRow key={check.id} check={check} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">暂无校验结果。</p>
      )}
    </section>
  );
}

function ValidationRow({ check }: { check: SkillValidationCheck }) {
  const display = getValidationCheckDisplay(check);

  return (
    <div className="flex gap-3 rounded-md border border-slate-200 p-3">
      {check.status === "pass" ? (
        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-600" />
      ) : (
        <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-600" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-950">{display.title}</span>
          <Badge variant={check.status === "fail" ? "destructive" : "outline"}>
            {SKILL_VALIDATION_SEVERITY_LABELS[check.severity]} ·{" "}
            {SKILL_VALIDATION_STATUS_LABELS[check.status]}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-slate-600">{display.detail}</p>
        <p className="mt-1 text-xs text-slate-500">{display.action}</p>
      </div>
    </div>
  );
}

function getValidationCheckDisplay(check: SkillValidationCheck) {
  const translations: Record<
    string,
    { title: string; detail: string; action: string }
  > = {
    "slug-format": {
      title: "标识可安全安装",
      detail: "Skill 标识需要使用小写字母、数字和短横线，方便外部 Agent 和脚本读取。",
      action: "建议使用类似 procurement-process-guide 的短横线命名。",
    },
    "slug-length": {
      title: "标识足够简洁",
      detail: "较短的标识更容易被 Codex、Claude Code、脚本和使用者识别。",
      action: "建议将标识控制在 64 个字符以内。",
    },
    "description-task-fit": {
      title: "描述能区分任务场景",
      detail: "描述应说明什么时候使用这个 Skill，而不只是说明它会查询知识库。",
      action: "补充业务域、目标用户、任务意图和触发条件。",
    },
    "task-description": {
      title: "任务场景足够具体",
      detail: "具体任务场景能帮助外部 Agent 判断是否应该调用该 Skill。",
      action: "说明企业流程、用户诉求和证据边界。",
    },
    "knowledge-scope": {
      title: "已绑定知识范围",
      detail: "平台执行 Skill 时需要至少一个知识库作为证据来源。",
      action: "发布前请绑定一个或多个知识库。",
    },
    "trigger-examples": {
      title: "已配置触发样例",
      detail: "触发样例能帮助外部 Agent 在合适的用户请求中调用 Skill。",
      action: "建议至少提供两个真实的应该触发请求。",
    },
    "non-goals": {
      title: "已配置不适用场景",
      detail: "不适用场景可以避免 Skill 被当作通用聊天或通用知识库搜索工具滥用。",
      action: "建议至少提供两个不应使用该 Skill 的请求或场景。",
    },
    "boundary-examples": {
      title: "已生成边界样例",
      detail: "边界样例用于处理证据不足、风险较高或请求只部分匹配的情况。",
      action: "导出后可检查 references/examples.md，并按敏感场景补充。",
    },
    "test-examples": {
      title: "已配置测试样例",
      detail: "测试样例便于发布前验证，也方便后续做一键测试计划。",
      action: "建议配置代表性输入、预期行为或边界问题。",
    },
    "input-schema": {
      title: "输入格式清晰",
      detail: "外部 Agent 需要稳定的请求格式，默认包含 question、context 和 outputStyle。",
      action: "保留 question 作为核心输入，只按任务需要增加可选字段。",
    },
    "output-schema": {
      title: "输出格式包含答案、引用和置信度",
      detail: "可用的 Skill 响应应告诉调用方答案、证据来源和证据强度。",
      action: "建议使用默认输出格式，包含答案、引用来源、置信度和可选追问建议。",
    },
    "output-style": {
      title: "已选择输出样式",
      detail: "输出样式用于告诉 Agent 返回带引用回答、清单、步骤、风险报告或 JSON。",
      action: "请选择与企业任务匹配的输出样式。",
    },
    "runtime-contract": {
      title: "已有外部调用契约",
      detail: "导出包需要说明 Codex 和 Claude Code 如何调用本平台执行 Skill。",
      action: "保持 manifest.json 和 references/api.md 中的接口与鉴权说明。",
    },
    "runtime-script": {
      title: "会导出运行脚本",
      detail: "scripts/run-skill.mjs 可让支持 Node.js 的 Agent 直接调用平台接口。",
      action: "发布后可用运行密钥和样例问题测试脚本。",
    },
    "system-prompt": {
      title: "系统提示词包含证据约束",
      detail: "运行提示词应要求基于证据回答、返回引用，并在证据不足时明确说明。",
      action: "使用默认提示词，或在自定义提示词中保留引用和证据不足规则。",
    },
  };

  return translations[check.id] ?? check;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
        <FileText aria-hidden="true" className="size-4 text-slate-500" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: SkillStatus }) {
  if (status === "published") return <Badge>{SKILL_STATUS_LABELS[status]}</Badge>;
  if (status === "disabled") {
    return <Badge variant="destructive">{SKILL_STATUS_LABELS[status]}</Badge>;
  }
  return <Badge variant="outline">{SKILL_STATUS_LABELS[status]}</Badge>;
}

function ValidationBadge({ validation }: { validation: SkillValidationResult }) {
  if (validation.valid) return <Badge>校验通过</Badge>;
  return <Badge variant="destructive">需补充 {validation.summary.blockingCount}</Badge>;
}

function CodeBlock({ value }: { value: string }) {
  return (
    <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100">
      {value}
    </pre>
  );
}

function List({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600">
          {item}
        </li>
      ))}
    </ul>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="break-all font-medium text-slate-950">{value}</span>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
