import type { AgentKnowledgeScope } from "@/features/agent/agent.types";
import type { ChatCitation } from "@/features/chat/chat.types";

export const SKILL_STATUSES = ["draft", "published", "disabled"] as const;
export const SKILL_TYPES = ["rag_agent"] as const;
export const SKILL_TASK_DOMAINS = [
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
export const SKILL_TASK_INTENTS = [
  "qa",
  "policy_check",
  "process_guidance",
  "case_triage",
  "summary",
  "drafting",
  "risk_review",
] as const;
export const SKILL_TASK_AUDIENCES = [
  "employee",
  "manager",
  "operator",
  "admin",
  "expert_agent",
  "external_agent",
] as const;
export const SKILL_OUTPUT_STYLES = [
  "answer_with_citations",
  "checklist",
  "step_by_step",
  "risk_report",
  "json",
] as const;
export const SKILL_RUNTIME_MODES = ["platform_rag"] as const;

export type SkillStatus = (typeof SKILL_STATUSES)[number];
export type SkillType = (typeof SKILL_TYPES)[number];
export type SkillTaskDomain = (typeof SKILL_TASK_DOMAINS)[number];
export type SkillTaskIntent = (typeof SKILL_TASK_INTENTS)[number];
export type SkillTaskAudience = (typeof SKILL_TASK_AUDIENCES)[number];
export type SkillOutputStyle = (typeof SKILL_OUTPUT_STYLES)[number];
export type SkillRuntimeMode = (typeof SKILL_RUNTIME_MODES)[number];

export type JsonObject = Record<string, unknown>;

export type SkillTaskScenario = {
  domain: SkillTaskDomain;
  intent: SkillTaskIntent;
  audience: SkillTaskAudience;
  description: string;
  triggerExamples: string[];
  nonGoals: string[];
  outputStyle: SkillOutputStyle;
};

export type SkillRuntimeContract = {
  type: "http";
  mode: SkillRuntimeMode;
  endpoint: string;
  method: "POST";
  auth: {
    type: "bearer";
  };
  inputSchema: JsonObject;
  outputSchema: JsonObject;
};

export type SkillDTO = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: SkillType;
  status: SkillStatus;
  taskDomain: SkillTaskDomain;
  taskIntent: SkillTaskIntent;
  taskAudience: SkillTaskAudience;
  taskDescription: string;
  triggerExamples: string[];
  nonGoals: string[];
  outputStyle: SkillOutputStyle;
  runtimeMode: SkillRuntimeMode;
  taskScenario: SkillTaskScenario;
  knowledgeScope: AgentKnowledgeScope;
  inputSchema: JsonObject;
  outputSchema: JsonObject;
  config: JsonObject;
  systemPrompt: string | null;
  version: string;
  createdAt: string;
  updatedAt: string;
};

export type SkillManifest = {
  schemaVersion: "1.0";
  name: string;
  slug: string;
  version: string;
  description: string | null;
  taskScenario: SkillTaskScenario;
  runtime: {
    type: "http";
    endpoint: string;
    method: "POST";
  };
  inputSchema: JsonObject;
  outputSchema: JsonObject;
  auth: {
    type: "bearer";
  };
};

export type SkillPackageManifest = {
  schemaVersion: "1.0";
  packageType: "enterprise-rag-skill";
  id: string;
  name: string;
  slug: string;
  version: string;
  description: string;
  compatibleAgents: ["claude-code", "codex"];
  taskScenario: SkillTaskScenario;
  runtime: SkillRuntimeContract & {
    skillId: string;
  };
  resources: {
    entrypoint: "SKILL.md";
    installGuide: "INSTALL.md";
    references: string[];
    scripts: string[];
  };
};

export type SkillRunResult = {
  answer: string;
  citations: ChatCitation[];
  skill: {
    id: string;
    slug: string;
    version: string;
  };
};

export type SkillValidationResult = {
  valid: boolean;
  reasons: string[];
  warnings: string[];
  summary: {
    blockingCount: number;
    warningCount: number;
    passedCount: number;
    totalCount: number;
    message: string;
  };
  checks: SkillValidationCheck[];
};

export type SkillValidationCheck = {
  id: string;
  category:
    | "identity"
    | "task_quality"
    | "knowledge_scope"
    | "schema"
    | "runtime"
    | "examples"
    | "prompt";
  severity: "blocking" | "warning" | "info";
  status: "pass" | "fail" | "warning";
  title: string;
  detail: string;
  action: string;
};

export type SkillPackageFile = {
  path: string;
  content: string;
};

export type SkillPackageExport = {
  packageName: string;
  files: SkillPackageFile[];
  validation: SkillValidationResult;
};
