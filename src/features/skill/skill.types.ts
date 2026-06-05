import type { AgentKnowledgeScope } from "@/features/agent/agent.types";
import type { ChatCitation } from "@/features/chat/chat.types";

export const SKILL_STATUSES = ["draft", "published", "disabled"] as const;
export const SKILL_TYPES = ["rag_agent"] as const;

export type SkillStatus = (typeof SKILL_STATUSES)[number];
export type SkillType = (typeof SKILL_TYPES)[number];

export type JsonObject = Record<string, unknown>;

export type SkillDTO = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: SkillType;
  status: SkillStatus;
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
