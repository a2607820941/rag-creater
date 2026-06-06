import type {
  SkillOutputStyle,
  SkillRuntimeMode,
  SkillStatus,
  SkillTaskAudience,
  SkillTaskDomain,
  SkillTaskIntent,
  SkillValidationCheck,
} from "@/features/skill/skill.types";

export const SKILL_STATUS_LABELS: Record<SkillStatus, string> = {
  draft: "草稿",
  published: "已发布",
  disabled: "已停用",
};

export const SKILL_TASK_DOMAIN_LABELS: Record<SkillTaskDomain, string> = {
  hr: "人事",
  finance: "财务",
  legal: "法务",
  procurement: "采购",
  approval: "审批",
  workplace: "职场",
  security: "安全",
  privacy: "隐私",
  compliance: "合规",
  aigc: "AIGC",
  general: "通用",
};

export const SKILL_TASK_INTENT_LABELS: Record<SkillTaskIntent, string> = {
  qa: "知识问答",
  policy_check: "制度核验",
  process_guidance: "流程指引",
  case_triage: "问题分诊",
  summary: "信息总结",
  drafting: "文案起草",
  risk_review: "风险审查",
};

export const SKILL_TASK_AUDIENCE_LABELS: Record<SkillTaskAudience, string> = {
  employee: "员工",
  manager: "管理者",
  operator: "运营同学",
  admin: "管理员",
  expert_agent: "专家 Agent",
  external_agent: "外部 Agent",
};

export const SKILL_OUTPUT_STYLE_LABELS: Record<SkillOutputStyle, string> = {
  answer_with_citations: "带引用回答",
  checklist: "检查清单",
  step_by_step: "分步说明",
  risk_report: "风险报告",
  json: "结构化 JSON",
};

export const SKILL_RUNTIME_MODE_LABELS: Record<SkillRuntimeMode, string> = {
  platform_rag: "平台知识库检索",
};

export const SKILL_VALIDATION_SEVERITY_LABELS: Record<
  SkillValidationCheck["severity"],
  string
> = {
  blocking: "阻塞",
  warning: "提醒",
  info: "信息",
};

export const SKILL_VALIDATION_STATUS_LABELS: Record<
  SkillValidationCheck["status"],
  string
> = {
  pass: "通过",
  fail: "未通过",
  warning: "需关注",
};

export function getSkillTaskLabels(skill: {
  taskDomain: SkillTaskDomain;
  taskIntent: SkillTaskIntent;
  taskAudience: SkillTaskAudience;
  outputStyle?: SkillOutputStyle;
}) {
  return {
    domain: SKILL_TASK_DOMAIN_LABELS[skill.taskDomain],
    intent: SKILL_TASK_INTENT_LABELS[skill.taskIntent],
    audience: SKILL_TASK_AUDIENCE_LABELS[skill.taskAudience],
    outputStyle: skill.outputStyle
      ? SKILL_OUTPUT_STYLE_LABELS[skill.outputStyle]
      : undefined,
  };
}
