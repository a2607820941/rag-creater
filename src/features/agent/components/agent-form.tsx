"use client";

import { type ReactNode, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { buildAgentSystemPrompt } from "@/features/agent/agent-prompt";
import { KnowledgeBaseScopeSelect } from "@/features/agent/components/knowledge-base-scope-select";
import {
  DEFAULT_AGENT_KNOWLEDGE_SCOPE,
  agentCreateSchema,
  type AgentCreateInput,
} from "@/features/agent/agent.validation";

type AgentFormValues = AgentCreateInput;

type AgentFormProps = {
  mode: "create" | "edit";
  agentId?: string;
  initialValues?: Partial<AgentFormValues>;
};

type ReadinessStatus = "pass" | "warn" | "fail" | "info";

type ReadinessCheck = {
  label: string;
  detail: string;
  status: ReadinessStatus;
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

const ANSWER_STYLE_OPTIONS = [
  {
    value: "strict",
    label: "严谨",
    description: "少发挥，优先还原知识库结论。",
  },
  {
    value: "concise",
    label: "简洁",
    description: "压缩回答长度，适合快速问答。",
  },
  {
    value: "teaching",
    label: "教学",
    description: "解释步骤和背景，适合内部培训。",
  },
  {
    value: "support",
    label: "客服",
    description: "面向用户问题，语气更服务化。",
  },
];

const STATUS_OPTIONS = [
  { value: "draft", label: "草稿", description: "配置中，不进入正式消费。" },
  { value: "active", label: "启用", description: "可被问答模块调用。" },
  { value: "disabled", label: "停用", description: "保留配置但不可使用。" },
];

const READINESS_COLORS: Record<ReadinessStatus, string> = {
  pass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warn: "border-amber-200 bg-amber-50 text-amber-700",
  fail: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-slate-200 bg-slate-50 text-slate-600",
};

const INPUT_CLASS =
  "w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100";

function createDefaultValues(
  initialValues?: Partial<AgentFormValues>
): AgentFormValues {
  return {
    name: initialValues?.name ?? "",
    description: initialValues?.description ?? "",
    answerStyle: initialValues?.answerStyle ?? "strict",
    knowledgeScope: {
      ...DEFAULT_AGENT_KNOWLEDGE_SCOPE,
      mode: "knowledgeBases",
      ...initialValues?.knowledgeScope,
      knowledgeBaseIds:
        initialValues?.knowledgeScope?.knowledgeBaseIds ??
        DEFAULT_AGENT_KNOWLEDGE_SCOPE.knowledgeBaseIds,
      categoryIds: [],
      tagIds: [],
      knowledgeIds: [],
      chunkTypes: [],
    },
    showReferences: initialValues?.showReferences ?? true,
    allowKnowledgeCapture: initialValues?.allowKnowledgeCapture ?? false,
    status: initialValues?.status ?? "draft",
    systemPrompt: initialValues?.systemPrompt ?? "",
  };
}

function buildLocalReadiness(values: AgentFormValues): ReadinessCheck[] {
  const scope = values.knowledgeScope;
  const hasKnowledgeBase = scope.knowledgeBaseIds.length > 0;

  return [
    {
      label: "角色信息",
      status: values.name.trim() ? "pass" : "fail",
      detail: values.name.trim() ? "已设置 Agent 名称" : "需要填写名称",
    },
    {
      label: "知识库边界",
      status: hasKnowledgeBase ? "pass" : "fail",
      detail: hasKnowledgeBase
        ? `已绑定 ${scope.knowledgeBaseIds.length} 个知识库`
        : "RAG scope 至少需要一个知识库 ID",
    },
    {
      label: "发布状态",
      status: values.status === "disabled" ? "warn" : "pass",
      detail:
        values.status === "disabled"
          ? "停用状态不会进入问答消费"
          : values.status === "active"
            ? "启用后需通过可用性检查"
            : "草稿可保存后继续完善",
    },
  ];
}

export function AgentForm({ mode, agentId, initialValues }: AgentFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<AgentFormValues>(() =>
    createDefaultValues(initialValues)
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [availability, setAvailability] =
    useState<AgentAvailabilityResult | null>(null);

  const previewPrompt = useMemo(
    () =>
      buildAgentSystemPrompt({
        name: values.name,
        description: values.description,
        answerStyle: values.answerStyle,
        knowledgeScope: values.knowledgeScope,
        showReferences: values.showReferences,
        allowKnowledgeCapture: values.allowKnowledgeCapture,
      }),
    [values]
  );

  const readiness = useMemo(() => buildLocalReadiness(values), [values]);
  const failedChecks = readiness.filter((item) => item.status === "fail");

  const updateValue = <TKey extends keyof AgentFormValues>(
    key: TKey,
    value: AgentFormValues[TKey]
  ) => {
    setNotice(null);
    setAvailability(null);
    setValues((current) => ({ ...current, [key]: value }));
  };

  const handleKnowledgeBaseIdsChange = (nextIds: string[]) => {
    setNotice(null);
    setAvailability(null);
    setValues((current) => ({
      ...current,
      knowledgeScope: {
        ...current.knowledgeScope,
        mode: "knowledgeBases",
        knowledgeBaseIds: nextIds,
      },
    }));
  };

  const handleValidate = async () => {
    setError(null);
    setNotice(null);

    if (!agentId) {
      setNotice("保存 Agent 后即可进行数据库级可用性检查。");
      return;
    }

    setChecking(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/validate`, {
        method: "POST",
      });
      const json = (await res.json()) as ValidateResponse;
      if (!json.success || !json.data) {
        throw new Error(json.error?.message || "检查失败");
      }
      setAvailability(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "检查失败");
    } finally {
      setChecking(false);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setNotice(null);
    const payload = {
      ...values,
      description: values.description?.trim() || undefined,
      knowledgeScope: {
        ...values.knowledgeScope,
        categoryIds: [],
        tagIds: [],
        knowledgeIds: [],
        chunkTypes: [],
      },
      systemPrompt: previewPrompt,
    };
    const parsed = agentCreateSchema.safeParse(payload);

    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    if (mode === "edit" && !agentId) {
      setError("缺少 Agent ID");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        mode === "create" ? "/api/agents" : `/api/agents/${agentId}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        }
      );
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error?.message || "保存失败");
      }
      router.push("/agents");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2">
          <SummaryMetric
            label="知识库"
            value={values.knowledgeScope.knowledgeBaseIds.length}
            detail="检索边界"
          />
        </div>

        <FormSection
          index="01"
          title="基础人设"
          description="定义专家身份、语气和生命周期。"
        >
          <div className="grid gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-zinc-800">
                Agent 名称
              </span>
              <input
                value={values.name}
                onChange={(event) => updateValue("name", event.target.value)}
                className={`${INPUT_CLASS} h-10`}
                placeholder="例如：产品客服专家"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-zinc-800">
                描述
              </span>
              <textarea
                value={values.description ?? ""}
                onChange={(event) =>
                  updateValue("description", event.target.value)
                }
                className={`${INPUT_CLASS} min-h-24 resize-y py-2 leading-6`}
                placeholder="说明这个 Agent 的角色、服务对象和回答边界"
              />
            </label>

            <OptionGrid
              label="回答风格"
              value={values.answerStyle}
              options={ANSWER_STYLE_OPTIONS}
              onChange={(value) => updateValue("answerStyle", value)}
            />

            <OptionGrid
              label="状态"
              value={values.status}
              options={STATUS_OPTIONS}
              onChange={(value) =>
                updateValue("status", value as AgentFormValues["status"])
              }
            />
          </div>
        </FormSection>

        <FormSection
          index="02"
          title="知识边界"
          description="当前只绑定知识库作为检索边界；知识条目、AI 标签和 AI 类别暂不开放配置。"
        >
          <div className="space-y-5">
            <KnowledgeBaseScopeSelect
              value={values.knowledgeScope.knowledgeBaseIds}
              onChange={handleKnowledgeBaseIdsChange}
            />
          </div>
        </FormSection>

        <FormSection
          index="03"
          title="回答策略"
          description="控制回答是否带来源，以及是否允许从对话中沉淀候选知识。"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <TogglePanel
              title="展示引用来源"
              description="开启后要求回答保留 [ref_x] 来源标记。"
              checked={values.showReferences}
              onChange={(checked) => updateValue("showReferences", checked)}
            />
            <TogglePanel
              title="允许对话沉淀"
              description="开启后高价值对话可进入待审核知识流程。"
              checked={values.allowKnowledgeCapture}
              onChange={(checked) =>
                updateValue("allowKnowledgeCapture", checked)
              }
            />
          </div>
        </FormSection>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-800">
            {notice}
          </div>
        )}

        <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-between gap-3 border-t border-zinc-200 bg-white/95 px-1 py-4 backdrop-blur">
          <button
            type="button"
            onClick={() => router.push("/agents")}
            className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            取消
          </button>
          <div className="flex items-center gap-3">
            {failedChecks.length > 0 && (
              <span className="hidden text-xs text-rose-600 sm:inline">
                还有 {failedChecks.length} 项需要处理
              </span>
            )}
            <button
              type="button"
              onClick={handleValidate}
              disabled={checking}
              className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {checking ? "检查中..." : "检查可用性"}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="rounded-md bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "保存中..." : "保存 Agent"}
            </button>
          </div>
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <ReadinessPanel
          checks={readiness}
          availability={availability}
          onValidate={handleValidate}
          checking={checking}
          canValidate={Boolean(agentId)}
        />
        <PromptPreviewPanel prompt={previewPrompt} />
      </aside>
    </div>
  );
}

function FormSection({
  index,
  title,
  description,
  children,
}: {
  index: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-semibold text-zinc-500">
          {index}
        </span>
        <div>
          <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function SummaryMetric({
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

function OptionGrid({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; description: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <span className="mb-2 block text-sm font-medium text-zinc-800">
        {label}
      </span>
      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`min-h-20 rounded-lg border p-3 text-left transition-colors ${
              value === option.value
                ? "border-cyan-500 bg-cyan-50 text-cyan-900"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
            }`}
          >
            <span className="block text-sm font-semibold">{option.label}</span>
            <span className="mt-1 block text-xs leading-5 text-zinc-500">
              {option.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TogglePanel({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
        checked
          ? "border-cyan-300 bg-cyan-50"
          : "border-zinc-200 bg-white hover:border-zinc-300"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4"
      />
      <span>
        <span className="block text-sm font-semibold text-zinc-900">
          {title}
        </span>
        <span className="mt-1 block text-xs leading-5 text-zinc-500">
          {description}
        </span>
      </span>
    </label>
  );
}

function ReadinessPanel({
  checks,
  availability,
  onValidate,
  checking,
  canValidate,
}: {
  checks: ReadinessCheck[];
  availability: AgentAvailabilityResult | null;
  onValidate: () => void;
  checking: boolean;
  canValidate: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">发布前检查</h2>
          <p className="mt-1 text-xs text-zinc-500">
            本地配置与数据库可用性分开检查。
          </p>
        </div>
        <button
          type="button"
          onClick={onValidate}
          disabled={checking}
          className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {checking ? "检查中" : canValidate ? "后端检查" : "待保存"}
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {checks.map((item) => (
          <div
            key={item.label}
            className={`rounded-md border px-3 py-2 text-xs ${READINESS_COLORS[item.status]}`}
          >
            <div className="font-semibold">{item.label}</div>
            <div className="mt-0.5 leading-5">{item.detail}</div>
          </div>
        ))}
      </div>

      {availability && (
        <div
          className={`mt-4 rounded-lg border p-3 text-xs ${
            availability.valid
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          <div className="font-semibold">
            {availability.valid ? "后端检查通过" : "后端检查未通过"}
          </div>
          <div className="mt-2 space-y-1 leading-5">
            {availability.reasons.map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
            {availability.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
            <p>
              可用知识库 {availability.checks.enabledKnowledgeBaseCount} 个，
              可用片段 {availability.checks.availableChunkCount} 个
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function PromptPreviewPanel({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            System Prompt
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            保存时同步写入 Agent 配置。
          </p>
        </div>
        <button
          type="button"
          onClick={copyPrompt}
          className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap rounded-md border border-zinc-200 bg-zinc-50 p-4 text-xs leading-6 text-zinc-700">
        {prompt}
      </pre>
    </div>
  );
}
