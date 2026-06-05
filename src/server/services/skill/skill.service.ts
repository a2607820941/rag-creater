import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { Prisma, Skill } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  parseAgentKnowledgeScope,
  stringifyAgentKnowledgeScope,
} from "@/features/agent/agent.validation";
import type { ChatCitation } from "@/features/chat/chat.types";
import type { AgentKnowledgeScope } from "@/features/agent/agent.types";
import type { RagRetrieveResponse, RagRetrieveScope } from "@/features/rag/types";
import type {
  JsonObject,
  SkillOutputStyle,
  SkillRuntimeMode,
  SkillDTO,
  SkillManifest,
  SkillPackageExport,
  SkillPackageManifest,
  SkillRunResult,
  SkillRuntimeContract,
  SkillTaskAudience,
  SkillTaskDomain,
  SkillTaskIntent,
  SkillValidationCheck,
  SkillValidationResult,
} from "@/features/skill/skill.types";
import {
  SKILL_OUTPUT_STYLES,
  SKILL_RUNTIME_MODES,
  SKILL_TASK_AUDIENCES,
  SKILL_TASK_DOMAINS,
  SKILL_TASK_INTENTS,
} from "@/features/skill/skill.types";
import type {
  SkillCreateInput,
  SkillListQuery,
  SkillRunInput,
  SkillUpdateInput,
} from "@/features/skill/skill.validation";
import { createChatCompletion } from "@/server/services/agent/llm-client";
import { retrieveRagContexts } from "@/server/services/rag/retriever";

const DEFAULT_INPUT_SCHEMA: JsonObject = {
  type: "object",
  properties: {
    question: {
      type: "string",
      description: "The concrete user question or task request.",
    },
    context: {
      type: "string",
      description: "Optional caller-provided context that is not a knowledge-base citation.",
    },
    outputStyle: {
      type: "string",
      description: "Optional preferred response style, such as concise, checklist, step_by_step, risk_report, or json.",
    },
  },
  required: ["question"],
};

const DEFAULT_OUTPUT_SCHEMA: JsonObject = {
  type: "object",
  properties: {
    answer: {
      type: "string",
      description: "The knowledge-grounded answer for the configured task scenario.",
    },
    citations: {
      type: "array",
      description: "Knowledge-base citations returned by the runtime.",
    },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
      description: "Evidence confidence based on retrieved knowledge coverage.",
    },
    followups: {
      type: "array",
      description: "Optional missing information, next questions, or recommended owner/process.",
    },
  },
  required: ["answer", "citations", "confidence"],
};

const SKILLS_DIR = path.join(process.cwd(), "skills");

export class SkillValidationError extends Error {
  constructor(public readonly validation: SkillValidationResult) {
    super(validation.summary.message);
    this.name = "SkillValidationError";
  }
}

export async function createSkill(input: SkillCreateInput): Promise<SkillDTO> {
  const skill = await prisma.skill.create({
    data: {
      name: input.name,
      slug: input.slug,
      description: withDefaultSkillDescription(input),
      type: input.type,
      status: input.status,
      taskDomain: input.taskDomain,
      taskIntent: input.taskIntent,
      taskAudience: input.taskAudience,
      taskDescription: withDefaultTaskDescription(input),
      triggerExamples: JSON.stringify(withDefaultTriggerExamples(input)),
      nonGoals: JSON.stringify(withDefaultNonGoals(input.nonGoals)),
      outputStyle: input.outputStyle,
      runtimeMode: input.runtimeMode,
      knowledgeScope: stringifyAgentKnowledgeScope(input.knowledgeScope),
      inputSchema: JSON.stringify(withDefaultSchema(input.inputSchema, DEFAULT_INPUT_SCHEMA)),
      outputSchema: JSON.stringify(withDefaultSchema(input.outputSchema, DEFAULT_OUTPUT_SCHEMA)),
      config: JSON.stringify(input.config),
      systemPrompt: input.systemPrompt || buildDefaultRuntimePrompt(input),
      version: input.version,
    },
  });

  return toSkillDTO(skill);
}

export async function listSkills(options: SkillListQuery) {
  const { page, pageSize, status, taskDomain, taskIntent, taskAudience, keyword } =
    options;
  const where: Prisma.SkillWhereInput = {};

  if (status) where.status = status;
  if (taskDomain) where.taskDomain = taskDomain;
  if (taskIntent) where.taskIntent = taskIntent;
  if (taskAudience) where.taskAudience = taskAudience;
  if (keyword) {
    where.OR = [
      { name: { contains: keyword } },
      { slug: { contains: keyword } },
      { description: { contains: keyword } },
      { taskDescription: { contains: keyword } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.skill.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.skill.count({ where }),
  ]);

  return {
    items: items.map(toSkillDTO),
    total,
    page,
    pageSize,
  };
}

export async function getSkillById(id: string): Promise<SkillDTO | null> {
  const skill = await prisma.skill.findUnique({ where: { id } });
  return skill ? toSkillDTO(skill) : null;
}

export async function updateSkill(
  id: string,
  input: SkillUpdateInput
): Promise<SkillDTO | null> {
  const current = await prisma.skill.findUnique({ where: { id } });
  if (!current) return null;

  const data: Prisma.SkillUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.description !== undefined) data.description = input.description;
  if (input.type !== undefined) data.type = input.type;
  if (input.status !== undefined) data.status = input.status;
  if (input.taskDomain !== undefined) data.taskDomain = input.taskDomain;
  if (input.taskIntent !== undefined) data.taskIntent = input.taskIntent;
  if (input.taskAudience !== undefined) data.taskAudience = input.taskAudience;
  if (input.taskDescription !== undefined) {
    data.taskDescription = input.taskDescription;
  }
  if (input.triggerExamples !== undefined) {
    data.triggerExamples = JSON.stringify(input.triggerExamples);
  }
  if (input.nonGoals !== undefined) {
    data.nonGoals = JSON.stringify(input.nonGoals);
  }
  if (input.outputStyle !== undefined) data.outputStyle = input.outputStyle;
  if (input.runtimeMode !== undefined) data.runtimeMode = input.runtimeMode;
  if (input.knowledgeScope !== undefined) {
    data.knowledgeScope = stringifyAgentKnowledgeScope(input.knowledgeScope);
  }
  if (input.inputSchema !== undefined) {
    data.inputSchema = JSON.stringify(input.inputSchema);
  }
  if (input.outputSchema !== undefined) {
    data.outputSchema = JSON.stringify(input.outputSchema);
  }
  if (input.config !== undefined) data.config = JSON.stringify(input.config);
  if (input.systemPrompt !== undefined) data.systemPrompt = input.systemPrompt;
  if (input.version !== undefined) data.version = input.version;

  const skill = await prisma.skill.update({ where: { id }, data });
  if (skill.status === "disabled") {
    await removeMaterializedSkill(skill.slug);
  }
  return toSkillDTO(skill);
}

export async function deleteSkill(id: string): Promise<boolean> {
  const current = await prisma.skill.findUnique({ where: { id } });
  if (!current) return false;

  await prisma.skill.delete({ where: { id } });
  await removeMaterializedSkill(current.slug);
  return true;
}

export async function publishSkill(
  id: string,
  origin: string
): Promise<{ skill: SkillDTO; manifest: SkillManifest; apiKey: string }> {
  const skill = await prisma.skill.findUnique({ where: { id } });
  if (!skill) throw new Error("Skill not found");

  const snapshot = toSkillDTO(skill);
  const validation = validateSkillForPackage(snapshot);
  if (!validation.valid) {
    throw new SkillValidationError(validation);
  }
  const manifest = buildSkillManifest(snapshot, origin);
  const apiKey = generateApiKey();

  await prisma.$transaction(async (tx) => {
    await tx.skillVersion.upsert({
      where: {
        skillId_version: {
          skillId: skill.id,
          version: skill.version,
        },
      },
      create: {
        skillId: skill.id,
        version: skill.version,
        manifestJson: JSON.stringify(manifest),
        snapshotJson: JSON.stringify(snapshot),
      },
      update: {},
    });

    await tx.skillApiKey.create({
      data: {
        skillId: skill.id,
        name: `Publish key ${new Date().toISOString()}`,
        keyHash: hashApiKey(apiKey),
      },
    });

    await tx.skill.update({
      where: { id: skill.id },
      data: { status: "published" },
    });
  });

  const published = await prisma.skill.findUniqueOrThrow({ where: { id } });
  await materializePublishedSkill(toSkillDTO(published), manifest, origin);
  return { skill: toSkillDTO(published), manifest, apiKey };
}

export async function getPublishedSkillManifest(
  slug: string,
  origin: string
): Promise<SkillManifest | null> {
  const skill = await prisma.skill.findUnique({ where: { slug } });
  if (!skill || skill.status !== "published") return null;

  const version = await prisma.skillVersion.findFirst({
    where: { skillId: skill.id },
    orderBy: { createdAt: "desc" },
  });

  if (version) {
    return parseJson<SkillManifest>(version.manifestJson);
  }

  return buildSkillManifest(toSkillDTO(skill), origin);
}

export async function runPublishedSkill(
  slug: string,
  apiKey: string | null,
  input: SkillRunInput
): Promise<SkillRunResult | null> {
  const skill = await prisma.skill.findUnique({ where: { slug } });
  if (!skill || skill.status !== "published") return null;
  if (!apiKey || !(await isValidSkillApiKey(skill.id, apiKey))) {
    throw new Error("UNAUTHORIZED");
  }

  return runSkillRuntime(skill, input);
}

export async function testSkill(
  id: string,
  input: SkillRunInput
): Promise<SkillRunResult | null> {
  const skill = await prisma.skill.findUnique({ where: { id } });
  if (!skill) return null;
  return runSkillRuntime(skill, input);
}

export async function runInstalledSkill(
  id: string,
  input: SkillRunInput,
  options?: { signal?: AbortSignal }
): Promise<SkillRunResult | null> {
  const skill = await prisma.skill.findUnique({ where: { id } });
  if (!skill || skill.status !== "published") return null;
  return runSkillRuntime(skill, input, options);
}

export async function exportSkillPackage(
  id: string,
  origin: string
): Promise<SkillPackageExport | null> {
  const skill = await prisma.skill.findUnique({ where: { id } });
  if (!skill) return null;

  return buildSkillPackage(toSkillDTO(skill), origin);
}

export function validateSkillForPackage(skill: SkillDTO): SkillValidationResult {
  const runtime = buildSkillRuntimeContract(skill, "https://example.com");
  const checks: SkillValidationCheck[] = [
    validationCheck({
      id: "slug-format",
      category: "identity",
      severity: "blocking",
      passed: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.slug),
      title: "Slug is install-safe",
      detail: "Skill slug must use lowercase letters, numbers, and hyphens so package paths and external agents can read it safely.",
      action: "Use a lowercase kebab-case slug, for example procurement-process-guide.",
    }),
    validationCheck({
      id: "slug-length",
      category: "identity",
      severity: "warning",
      passed: skill.slug.length <= 64,
      title: "Slug is concise",
      detail: "Short slugs are easier for Claude Code, Codex, scripts, and humans to recognize.",
      action: "Keep the slug under 64 characters if possible.",
    }),
    validationCheck({
      id: "description-task-fit",
      category: "task_quality",
      severity: "warning",
      passed: hasDistinctTaskDescription(skill),
      title: "Description distinguishes the task scenario",
      detail: "The description should explain when to use this Skill, not only say that it queries a knowledge base.",
      action: "Mention the domain, audience, task intent, and trigger condition in the description.",
    }),
    validationCheck({
      id: "task-description",
      category: "task_quality",
      severity: "warning",
      passed: skill.taskDescription.trim().length >= 40,
      title: "Task scenario is concrete",
      detail: "A concrete task scenario helps agents decide whether this Skill should be invoked.",
      action: "Describe the enterprise workflow, expected user need, and evidence boundary.",
    }),
    validationCheck({
      id: "knowledge-scope",
      category: "knowledge_scope",
      severity: "blocking",
      passed: skill.knowledgeScope.knowledgeBaseIds.length > 0,
      title: "Knowledge scope is bound",
      detail: "Runtime execution needs at least one knowledge base to retrieve evidence.",
      action: "Bind one or more knowledge bases before publishing.",
    }),
    validationCheck({
      id: "trigger-examples",
      category: "examples",
      severity: "warning",
      passed: skill.triggerExamples.length >= 2,
      title: "Trigger examples are available",
      detail: "Trigger examples help external agents invoke the Skill for the right user requests.",
      action: "Add at least two realistic requests that should use this Skill.",
    }),
    validationCheck({
      id: "non-goals",
      category: "examples",
      severity: "warning",
      passed: skill.nonGoals.length >= 2,
      title: "Non-goals prevent over-triggering",
      detail: "Non-goals keep the Skill from being used as a generic chat or generic knowledge-base search tool.",
      action: "Add at least two requests or situations where this Skill should not be used.",
    }),
    validationCheck({
      id: "boundary-examples",
      category: "examples",
      severity: "info",
      passed: buildBoundaryExamples(skill).length >= 3,
      title: "Boundary examples are generated",
      detail: "Boundary examples guide agents when evidence is incomplete, risk is high, or the request partially matches the task.",
      action: "Review references/examples.md after export and customize boundary examples if the scenario is sensitive.",
    }),
    validationCheck({
      id: "test-examples",
      category: "examples",
      severity: "warning",
      passed: getConfiguredTestExamples(skill.config).length > 0,
      title: "Test examples are configured",
      detail: "Concrete test examples help users verify the Skill before publishing and help future UI show a one-click test plan.",
      action: "Add config.testExamples with at least one representative input, expected behavior, or edge case.",
    }),
    validationCheck({
      id: "input-schema",
      category: "schema",
      severity: "warning",
      passed: hasSchemaProperty(runtime.inputSchema) && hasSchemaField(runtime.inputSchema, "question"),
      title: "Input schema is clear",
      detail: "External agents need a predictable request contract. The default contract includes question, context, and outputStyle.",
      action: "Keep question as the required input and add only task-specific optional fields.",
    }),
    validationCheck({
      id: "output-schema",
      category: "schema",
      severity: "warning",
      passed:
        hasSchemaProperty(runtime.outputSchema) &&
        hasSchemaField(runtime.outputSchema, "answer") &&
        hasSchemaField(runtime.outputSchema, "citations") &&
        hasSchemaField(runtime.outputSchema, "confidence"),
      title: "Output schema includes answer, citations, and confidence",
      detail: "A useful Skill response should tell callers the answer, source evidence, and how strong the evidence is.",
      action: "Use the default output schema or include answer, citations, confidence, and optional followups.",
    }),
    validationCheck({
      id: "output-style",
      category: "task_quality",
      severity: "warning",
      passed: Boolean(skill.outputStyle),
      title: "Output format is selected",
      detail: "Output style tells agents whether to expect a cited answer, checklist, step-by-step guide, risk report, or JSON.",
      action: "Choose an output style that matches the enterprise task.",
    }),
    validationCheck({
      id: "runtime-contract",
      category: "runtime",
      severity: "blocking",
      passed:
        runtime.type === "http" &&
        runtime.method === "POST" &&
        runtime.auth.type === "bearer" &&
        runtime.endpoint.includes(`/api/public/skills/${skill.slug}/run`),
      title: "External runtime contract is available",
      detail: "The exported package must tell Claude Code and Codex how to call this platform runtime.",
      action: "Keep the public run endpoint and bearer auth in references/api.md and manifest.json.",
    }),
    validationCheck({
      id: "runtime-script",
      category: "runtime",
      severity: "info",
      passed: true,
      title: "Runtime helper script will be exported",
      detail: "scripts/run-skill.mjs is included so agents that can run Node.js can call the runtime directly.",
      action: "After publishing, test the script with SKILL_API_KEY and a sample question.",
    }),
    validationCheck({
      id: "system-prompt",
      category: "prompt",
      severity: "warning",
      passed: hasGroundingPrompt(skill.systemPrompt),
      title: "System prompt includes grounding and failure behavior",
      detail: "The runtime prompt should require evidence-based answers, citations, and explicit handling for missing evidence.",
      action: "Use the default runtime prompt or add citation and insufficient-evidence rules to the custom prompt.",
    }),
  ];

  const reasons = checks
    .filter((check) => check.status === "fail" && check.severity === "blocking")
    .map((check) => `${check.title}: ${check.action}`);
  const warnings = checks
    .filter((check) => check.status === "warning")
    .map((check) => `${check.title}: ${check.action}`);
  const blockingCount = reasons.length;
  const warningCount = warnings.length;
  const passedCount = checks.filter((check) => check.status === "pass").length;

  return {
    valid: blockingCount === 0,
    reasons,
    warnings,
    summary: {
      blockingCount,
      warningCount,
      passedCount,
      totalCount: checks.length,
      message:
        blockingCount > 0
          ? `${blockingCount} blocking issue(s) must be fixed before publishing.`
          : warningCount > 0
            ? `${warningCount} quality improvement(s) recommended before publishing.`
            : "Skill is ready to publish.",
    },
    checks,
  };
}

export function buildSkillManifest(
  skill: SkillDTO,
  origin: string
): SkillManifest {
  const runtime = buildSkillRuntimeContract(skill, origin);
  return buildPublicSkillManifest(skill, runtime);
}

export function buildSkillRuntimeContract(
  skill: SkillDTO,
  origin: string
): SkillRuntimeContract {
  return {
    type: "http",
    mode: skill.runtimeMode,
    endpoint: `${origin.replace(/\/$/, "")}/api/public/skills/${skill.slug}/run`,
    method: "POST",
    auth: { type: "bearer" },
    inputSchema: withDefaultSchema(skill.inputSchema, DEFAULT_INPUT_SCHEMA),
    outputSchema: withDefaultSchema(skill.outputSchema, DEFAULT_OUTPUT_SCHEMA),
  };
}

function buildPublicSkillManifest(
  skill: SkillDTO,
  runtime: SkillRuntimeContract
): SkillManifest {
  return {
    schemaVersion: "1.0",
    name: skill.name,
    slug: skill.slug,
    version: skill.version,
    description: skill.description,
    taskScenario: skill.taskScenario,
    runtime: {
      type: runtime.type,
      endpoint: runtime.endpoint,
      method: runtime.method,
    },
    inputSchema: runtime.inputSchema,
    outputSchema: runtime.outputSchema,
    auth: runtime.auth,
  };
}

export function buildSkillPackage(
  skill: SkillDTO,
  origin: string
): SkillPackageExport {
  const runtime = buildSkillRuntimeContract(skill, origin);
  const manifest = buildPublicSkillManifest(skill, runtime);
  const validation = validateSkillForPackage(skill);
  const packageName = skill.slug;

  return {
    packageName,
    validation,
    files: [
      {
        path: `${packageName}/SKILL.md`,
        content: buildPackageSkillMd(skill, manifest),
      },
      {
        path: `${packageName}/manifest.json`,
        content: JSON.stringify(buildPackageManifest(skill, runtime), null, 2),
      },
      {
        path: `${packageName}/INSTALL.md`,
        content: buildInstallGuide(skill),
      },
      {
        path: `${packageName}/references/api.md`,
        content: buildApiReference(skill, runtime),
      },
      {
        path: `${packageName}/references/knowledge-scope.md`,
        content: buildKnowledgeScopeReference(skill),
      },
      {
        path: `${packageName}/references/task-scenario.md`,
        content: buildTaskScenarioReference(skill),
      },
      {
        path: `${packageName}/references/examples.md`,
        content: buildExamplesReference(skill),
      },
      {
        path: `${packageName}/references/runtime.md`,
        content: buildRuntimeReference(skill, runtime),
      },
      {
        path: `${packageName}/scripts/run-skill.mjs`,
        content: buildRunSkillScript(),
      },
      {
        path: `${packageName}/scripts/set-runtime-key.mjs`,
        content: buildSetRuntimeKeyScript(),
      },
      {
        path: `${packageName}/scripts/install-skill.mjs`,
        content: buildInstallSkillScript(),
      },
    ],
  };
}

export function toSkillDTO(skill: Skill): SkillDTO {
  const taskDomain = asTaskDomain(skill.taskDomain);
  const taskIntent = asTaskIntent(skill.taskIntent);
  const taskAudience = asTaskAudience(skill.taskAudience);
  const outputStyle = asOutputStyle(skill.outputStyle);
  const taskDescription = skill.taskDescription || buildFallbackTaskDescription({
    name: skill.name,
    description: skill.description,
    taskDomain,
    taskIntent,
    taskAudience,
  });
  const description =
    skill.description ||
    withDefaultSkillDescription({
      name: skill.name,
      description: skill.description,
      taskDomain,
      taskIntent,
      taskAudience,
      taskDescription,
    });
  const baseForDefaults = {
    name: skill.name,
    description: skill.description,
    taskDomain,
    taskIntent,
    taskAudience,
    taskDescription,
  };
  const triggerExamples = withDefaultTriggerExamples({
    ...baseForDefaults,
    triggerExamples: parseJsonStringArray(skill.triggerExamples),
  });
  const nonGoals = withDefaultNonGoals(parseJsonStringArray(skill.nonGoals));

  return {
    id: skill.id,
    name: skill.name,
    slug: skill.slug,
    description,
    type: skill.type === "rag_agent" ? "rag_agent" : "rag_agent",
    status:
      skill.status === "published" || skill.status === "disabled"
        ? skill.status
        : "draft",
    taskDomain,
    taskIntent,
    taskAudience,
    taskDescription,
    triggerExamples,
    nonGoals,
    outputStyle,
    runtimeMode: asRuntimeMode(skill.runtimeMode),
    taskScenario: {
      domain: taskDomain,
      intent: taskIntent,
      audience: taskAudience,
      description: taskDescription,
      triggerExamples,
      nonGoals,
      outputStyle,
    },
    knowledgeScope: parseAgentKnowledgeScope(skill.knowledgeScope),
    inputSchema: parseJsonObject(skill.inputSchema),
    outputSchema: parseJsonObject(skill.outputSchema),
    config: parseJsonObject(skill.config),
    systemPrompt: skill.systemPrompt,
    version: skill.version,
    createdAt: skill.createdAt.toISOString(),
    updatedAt: skill.updatedAt.toISOString(),
  };
}

async function runSkillRuntime(
  skill: Skill,
  input: SkillRunInput,
  options?: { signal?: AbortSignal }
): Promise<SkillRunResult> {
  const dto = toSkillDTO(skill);
  const question = extractQuestion(input.input);
  const retrieve = await retrieveRagContexts({
    query: question,
    mode: "balanced",
    scope: toRagScope(dto.knowledgeScope),
  });
  const citations = toCitations(retrieve);

  const messages = [
    {
      role: "system" as const,
      content: buildRunSystemPrompt(dto, retrieve),
    },
    {
      role: "user" as const,
      content: JSON.stringify(input.input, null, 2),
    },
  ];

  try {
    const answer = await createChatCompletion(
      messages,
      input.llmInterface ?? "openai",
      options
    );
    const result = {
      answer: answer || "No answer generated.",
      citations,
      skill: {
        id: skill.id,
        slug: skill.slug,
        version: skill.version,
      },
    };

    await prisma.skillRunLog.create({
      data: {
        skillId: skill.id,
        inputJson: JSON.stringify(input.input),
        outputJson: JSON.stringify(result),
        citationCount: citations.length,
      },
    });

    return result;
  } catch (error) {
    await prisma.skillRunLog.create({
      data: {
        skillId: skill.id,
        inputJson: JSON.stringify(input.input),
        error: error instanceof Error ? error.message : "Skill run failed",
        status: "failed",
      },
    });
    throw error;
  }
}

async function materializePublishedSkill(
  skill: SkillDTO,
  manifest: SkillManifest,
  origin: string
) {
  const skillDir = path.join(SKILLS_DIR, skill.slug);
  const packageFiles = buildSkillPackage(skill, origin).files;

  await fs.rm(skillDir, { recursive: true, force: true });
  await fs.mkdir(skillDir, { recursive: true });
  await Promise.all(
    packageFiles.map(async (file) => {
      const relativePath = file.path.replace(`${skill.slug}/`, "");
      const target = path.join(skillDir, relativePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, file.content, "utf8");
    })
  );
}

async function removeMaterializedSkill(slug: string) {
  await fs.rm(path.join(SKILLS_DIR, slug), { recursive: true, force: true });
}

function buildRunSystemPrompt(skill: SkillDTO, retrieve: RagRetrieveResponse) {
  return `${skill.systemPrompt || buildDefaultRuntimePrompt(skill)}

Skill name: ${skill.name}
Skill description: ${skill.description || "None"}
Task domain: ${skill.taskDomain}
Task intent: ${skill.taskIntent}
Target audience: ${skill.taskAudience}
Task scenario: ${skill.taskDescription}
Output style: ${skill.outputStyle}

Trigger examples:
${formatList(skill.triggerExamples, "No trigger examples configured.")}

Non-goals:
${formatList(skill.nonGoals, "No non-goals configured.")}

Knowledge base context:
${retrieve.llmContext || "No relevant knowledge base context was found."}

Rules:
1. First decide whether the request fits the task scenario. If it does not, say this Skill is not the right fit and explain the closest supported scope.
2. Prefer the knowledge base context when it is relevant.
3. If the context does not support the answer, say that no reliable knowledge base evidence was found and list the missing information.
4. If you use a context item, cite it with its [ref_n] marker.
5. For policy, privacy, security, compliance, finance, legal, approval, or procurement matters, do not invent official decisions or approvals.
6. Return a direct answer for API consumers; do not include hidden reasoning.`;
}

function buildPackageSkillMd(skill: SkillDTO, manifest: SkillManifest) {
  const description = buildPackageDescription(skill);

  return `---
name: ${skill.slug}
description: ${yamlScalar(description)}
---

# ${skill.name}

Use this skill when the user needs help with this enterprise task:

${skill.taskDescription}

This skill is backed by the knowledge-base platform runtime. The knowledge base is a resource dependency; the task scenario is the reason to invoke the skill.

## When To Use

${formatList(skill.triggerExamples, `- Requests that match ${skill.taskIntent} work in the ${skill.taskDomain} domain.`)}

## Do Not Use

${formatList(skill.nonGoals, "- Generic knowledge-base search or tasks outside the configured enterprise workflow.")}

## Workflow

1. Confirm the request matches the task scenario and does not match the non-goals.
2. Read \`references/task-scenario.md\` if you need more detail on the domain, intent, audience, or output style.
3. Read \`references/api.md\` before calling the runtime endpoint.
4. Send a JSON request that matches the input schema.
5. Use returned citations when explaining knowledge-grounded answers.
6. If the runtime reports weak or missing evidence, say what information is missing instead of filling gaps.

## Additional Resources

- For the task contract and invocation examples, see [references/task-scenario.md](references/task-scenario.md).
- For concrete request and response examples, see [references/examples.md](references/examples.md).
- For the HTTP runtime contract, see [references/api.md](references/api.md).
- For runtime behavior and safety boundaries, see [references/runtime.md](references/runtime.md).
- For configured knowledge resources, see [references/knowledge-scope.md](references/knowledge-scope.md).
- For one-command installation into Codex or Claude Code, see [INSTALL.md](INSTALL.md).
- To call the runtime from Claude Code or Codex, use [scripts/run-skill.mjs](scripts/run-skill.mjs) with \`SKILL_API_KEY\`.

## Runtime

- Endpoint: \`${manifest.runtime.endpoint}\`
- Method: \`${manifest.runtime.method}\`
- Auth: Bearer token

## Output Handling

Return the API answer directly. If the response includes citations, surface the most relevant sources. If the API reports no reliable knowledge-base evidence, say that clearly instead of filling gaps.
`;
}

function buildPackageManifest(
  skill: SkillDTO,
  runtime: SkillRuntimeContract
): SkillPackageManifest {
  return {
    schemaVersion: "1.0",
    packageType: "enterprise-rag-skill",
    id: skill.id,
    name: skill.name,
    slug: skill.slug,
    version: skill.version,
    description: buildPackageDescription(skill),
    compatibleAgents: ["claude-code", "codex"],
    taskScenario: skill.taskScenario,
    runtime: {
      ...runtime,
      skillId: skill.id,
    },
    resources: {
      entrypoint: "SKILL.md",
      installGuide: "INSTALL.md",
      references: [
        "references/api.md",
        "references/knowledge-scope.md",
        "references/task-scenario.md",
        "references/examples.md",
        "references/runtime.md",
      ],
      scripts: [
        "scripts/run-skill.mjs",
        "scripts/set-runtime-key.mjs",
        "scripts/install-skill.mjs",
      ],
    },
  };
}

function buildInstallGuide(skill: SkillDTO) {
  return `# Install

This folder is a portable Skill package for Claude Code and Codex-compatible Skill workflows.

## One-Command Install

From this Skill folder, run one of:

\`\`\`bash
node scripts/install-skill.mjs codex
node scripts/install-skill.mjs claude-code
\`\`\`

By default, the installer copies this folder to:

- Codex: \`$CODEX_HOME/skills/${skill.slug}\`, or \`~/.codex/skills/${skill.slug}\` when \`CODEX_HOME\` is not set.
- Claude Code: \`$CLAUDE_HOME/skills/${skill.slug}\`, or \`~/.claude/skills/${skill.slug}\` when \`CLAUDE_HOME\` is not set.

To install somewhere else:

\`\`\`bash
node scripts/install-skill.mjs codex --target /path/to/skills/${skill.slug}
node scripts/install-skill.mjs claude-code --target /path/to/skills/${skill.slug}
\`\`\`

## Runtime API Key

This Skill calls the platform runtime. After publishing, copy the one-time API key shown by the platform.

### Recommended: store the key in this installed Skill folder

Use this when Codex or Claude Code is already running, or when you use a desktop app. Shell \`export\` commands only affect the current terminal process and child processes launched from it; an already-running agent app will not see them.

After installing the Skill, run this inside the installed Skill folder:

\`\`\`bash
node scripts/set-runtime-key.mjs "<api-key>"
node scripts/run-skill.mjs '{"question":"What should I know?"}'
\`\`\`

Default installed folders:

\`\`\`bash
cd ~/.codex/skills/${skill.slug}
node scripts/set-runtime-key.mjs "<api-key>"

cd ~/.claude/skills/${skill.slug}
node scripts/set-runtime-key.mjs "<api-key>"
\`\`\`

The setup script writes a local \`.skill-runtime.json\` file with owner-only permissions when possible. Do not commit or share that file.

### Temporary terminal-only setup

Use this only when the same terminal launches the process that will call the Skill:

\`\`\`bash
export SKILL_API_KEY="<api-key>"
node scripts/run-skill.mjs '{"question":"What should I know?"}'
\`\`\`

The generated package does not store the plaintext API key by default.

## What Agents Should Read

1. Start with \`SKILL.md\`.
2. Read \`references/task-scenario.md\` to decide whether this Skill fits the request.
3. Read \`references/api.md\` before calling the runtime.
4. Use \`scripts/run-skill.mjs\` when local script execution is available.
`;
}

function buildRunSkillScript() {
  return `#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.resolve(__dirname, "../manifest.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

const endpoint =
  process.env.SKILL_ENDPOINT ||
  manifest.runtime?.http?.endpoint ||
  manifest.runtime?.endpoint;
const apiKey = process.env.SKILL_API_KEY || (await readStoredApiKey());

if (!endpoint) {
  console.error("Missing Skill endpoint. Set SKILL_ENDPOINT or check manifest.json.");
  process.exit(1);
}

if (!apiKey) {
  console.error("Missing API key. Set SKILL_API_KEY or run: node scripts/set-runtime-key.mjs <api-key>");
  process.exit(1);
}

const rawInput = process.argv.slice(2).join(" ").trim();
const input = rawInput
  ? parseInput(rawInput)
  : { question: "What should I know?" };

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${apiKey}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ input }),
});

const text = await response.text();
let payload;
try {
  payload = JSON.parse(text);
} catch {
  payload = text;
}

if (!response.ok) {
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(payload, null, 2));

function parseInput(value) {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Treat plain text as the question.
  }

  return { question: value };
}

async function readStoredApiKey() {
  try {
    const configPath = path.resolve(__dirname, "../.skill-runtime.json");
    const config = JSON.parse(await fs.readFile(configPath, "utf8"));
    return typeof config.apiKey === "string" && config.apiKey.trim()
      ? config.apiKey.trim()
      : "";
  } catch {
    return "";
  }
}
`;
}

function buildSetRuntimeKeyScript() {
  return `#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(__dirname, "..");
const configPath = path.join(packageDir, ".skill-runtime.json");
const apiKey = process.argv[2] || process.env.SKILL_API_KEY || "";

if (!apiKey.trim()) {
  console.error(\`Usage:
  node scripts/set-runtime-key.mjs <api-key>

You can also pass SKILL_API_KEY in the current terminal:
  SKILL_API_KEY="<api-key>" node scripts/set-runtime-key.mjs\`);
  process.exit(1);
}

await fs.writeFile(
  configPath,
  JSON.stringify(
    {
      apiKey: apiKey.trim(),
      updatedAt: new Date().toISOString(),
    },
    null,
    2
  ),
  { encoding: "utf8", mode: 0o600 }
);

try {
  await fs.chmod(configPath, 0o600);
} catch {
  // Some filesystems do not support chmod; the file is still usable.
}

console.log(JSON.stringify({
  ok: true,
  storedAt: configPath,
  nextStep: "Open Codex or Claude Code and ask a request that matches this Skill's task scenario.",
}, null, 2));
`;
}

function buildInstallSkillScript() {
  return `#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(__dirname, "..");
const manifest = JSON.parse(
  await fs.readFile(path.join(packageDir, "manifest.json"), "utf8")
);

const args = process.argv.slice(2);
const targetAgent = args[0];
const explicitTarget = readOption(args, "--target");

if (!targetAgent || !["codex", "claude-code"].includes(targetAgent)) {
  printUsage();
  process.exit(1);
}

const targetDir =
  explicitTarget ||
  path.join(defaultSkillsHome(targetAgent), manifest.slug || path.basename(packageDir));

await fs.rm(targetDir, { recursive: true, force: true });
await copyDirectory(packageDir, targetDir);

console.log(JSON.stringify({
  ok: true,
  agent: targetAgent,
  skill: manifest.slug,
  installedTo: targetDir,
  nextSteps: [
    "Set SKILL_API_KEY to the one-time API key returned by the platform publish action.",
    "Open the target agent and ask a request that matches this Skill's task scenario.",
  ],
}, null, 2));

function defaultSkillsHome(agent) {
  if (agent === "codex") {
    return path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "skills");
  }

  return path.join(process.env.CLAUDE_HOME || path.join(os.homedir(), ".claude"), "skills");
}

function readOption(values, name) {
  const index = values.indexOf(name);
  if (index < 0) return null;
  const value = values[index + 1];
  return value ? path.resolve(value) : null;
}

async function copyDirectory(source, target) {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
    } else if (entry.isFile()) {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

function printUsage() {
  console.error(\`Usage:
  node scripts/install-skill.mjs codex
  node scripts/install-skill.mjs claude-code
  node scripts/install-skill.mjs codex --target /path/to/skills/\${manifest.slug || "skill-slug"}\`);
}
`;
}

function buildApiReference(skill: SkillDTO, runtime: SkillRuntimeContract) {
  return `# API Reference

## Runtime Contract

\`\`\`json
${JSON.stringify(runtime, null, 2)}
\`\`\`

## Request

\`\`\`http
POST ${runtime.endpoint}
Authorization: Bearer <api-key>
Content-Type: application/json
\`\`\`

\`\`\`json
{
  "input": ${JSON.stringify(sampleInputFromSchema(runtime.inputSchema), null, 2)}
}
\`\`\`

## Response

\`\`\`json
{
  "success": true,
  "data": {
    "answer": "string",
    "citations": [],
    "skill": {
      "id": "${skill.id}",
      "slug": "${skill.slug}",
      "version": "${skill.version}"
    }
  }
}
\`\`\`

## Input Schema

\`\`\`json
${JSON.stringify(runtime.inputSchema, null, 2)}
\`\`\`

## Output Schema

\`\`\`json
${JSON.stringify(runtime.outputSchema, null, 2)}
\`\`\`
`;
}

function buildTaskScenarioReference(skill: SkillDTO) {
  return `# Task Scenario

## Identity

- Domain: ${skill.taskDomain}
- Intent: ${skill.taskIntent}
- Audience: ${skill.taskAudience}
- Output style: ${skill.outputStyle}

## Task Description

${skill.taskDescription}

## When To Use

${formatList(skill.triggerExamples, "No trigger examples configured.")}

## Do Not Use

${formatList(skill.nonGoals, "No non-goals configured.")}

## Enterprise Context

This Skill is designed for corporate information system workflows such as HR, finance, legal, procurement, approvals, workplace services, security, privacy, compliance, and AIGC enablement. Treat the configured knowledge bases as evidence sources, not as the Skill identity.
`;
}

function buildExamplesReference(skill: SkillDTO) {
  const sampleInput = sampleInputFromSchema(
    withDefaultSchema(skill.inputSchema, DEFAULT_INPUT_SCHEMA)
  );

  return `# Examples

## Requests That Should Use This Skill

${formatList(skill.triggerExamples, "No trigger examples configured.")}

## Requests That Should Not Use This Skill

${formatList(skill.nonGoals, "No non-goals configured.")}

## Boundary Questions

${formatList(buildBoundaryExamples(skill), "No boundary examples configured.")}

## Configured Test Examples

${formatConfiguredTestExamples(skill)}

## Sample Runtime Request

\`\`\`json
{
  "input": ${JSON.stringify(sampleInput, null, 2)}
}
\`\`\`

## Expected Response Shape

\`\`\`json
{
  "success": true,
  "data": {
    "answer": "Knowledge-grounded answer for the configured task scenario.",
    "citations": [],
    "confidence": "medium",
    "followups": [
      "Missing evidence or next step when the knowledge base is incomplete."
    ],
    "skill": {
      "id": "${skill.id}",
      "slug": "${skill.slug}",
      "version": "${skill.version}"
    }
  }
}
\`\`\`
`;
}

function buildRuntimeReference(skill: SkillDTO, runtime: SkillRuntimeContract) {
  return `# Runtime

## Runtime Mode

${skill.runtimeMode}

This package is designed for Claude Code and Codex compatible Skill folder workflows. It delegates execution to the platform RAG runtime:

- Endpoint: \`${runtime.endpoint}\`
- Method: \`${runtime.method}\`
- Auth: Bearer token

## Optional Script

Use \`scripts/run-skill.mjs\` when the agent can execute local Node.js scripts.

\`\`\`bash
node scripts/set-runtime-key.mjs "<api-key>"
node scripts/run-skill.mjs '{"question":"What should I know?"}'
\`\`\`

The setup command stores the key in this installed Skill folder. This is recommended for desktop apps or already-running agent processes.

For a temporary terminal-only setup:

\`\`\`bash
SKILL_API_KEY="<api-key>" node scripts/run-skill.mjs '{"question":"What should I know?"}'
\`\`\`

Use \`scripts/install-skill.mjs\` to copy this package into Codex or Claude Code:

\`\`\`bash
node scripts/install-skill.mjs codex
node scripts/install-skill.mjs claude-code
\`\`\`

## Runtime Behavior

1. The runtime extracts a question from the JSON input.
2. It retrieves context from the configured knowledge scope.
3. It applies the Skill task scenario and system prompt.
4. It returns an answer with citations when supporting evidence exists.

## Safety Boundaries

For security, privacy, compliance, legal, finance, procurement, approval, and HR matters, treat returned answers as knowledge-grounded assistance. Do not present them as final approvals, legal opinions, policy exceptions, or completed business actions unless the runtime evidence explicitly supports that.
`;
}

function buildKnowledgeScopeReference(skill: SkillDTO) {
  return `# Knowledge Scope

This API Skill is grounded in the following configured knowledge scope.

\`\`\`json
${JSON.stringify(skill.knowledgeScope, null, 2)}
\`\`\`

Runtime prompt:

\`\`\`text
${skill.systemPrompt || "No custom system prompt configured."}
\`\`\`
`;
}

function buildPackageDescription(skill: SkillDTO) {
  const base =
    skill.description ||
    skill.taskDescription ||
    `Call the ${skill.name} API Skill.`;
  return `${base} Use for ${skill.taskIntent} tasks in the ${skill.taskDomain} domain for ${skill.taskAudience} users, with platform RAG grounding and citations.`;
}

function extractQuestion(input: JsonObject) {
  const candidates = ["question", "query", "message", "prompt", "text"];
  for (const key of candidates) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return JSON.stringify(input);
}

function withDefaultTaskDescription(input: SkillCreateInput | SkillDTO) {
  return (
    input.taskDescription?.trim() ||
    buildFallbackTaskDescription({
      name: input.name,
      description: input.description,
      taskDomain: input.taskDomain,
      taskIntent: input.taskIntent,
      taskAudience: input.taskAudience,
    })
  );
}

type SkillDefaultContext = {
  name: string;
  description?: string | null;
  taskDomain: SkillTaskDomain;
  taskIntent: SkillTaskIntent;
  taskAudience: SkillTaskAudience;
  taskDescription?: string;
  triggerExamples?: string[];
};

function withDefaultSkillDescription(input: SkillDefaultContext) {
  if (input.description?.trim()) return input.description.trim();

  return `Use this skill for ${intentLabel(input.taskIntent)} in ${domainLabel(
    input.taskDomain
  )} workflows when ${audienceLabel(
    input.taskAudience
  )} need a task-specific, knowledge-grounded answer with citations. Trigger on concrete requests matching: ${
    input.taskDescription || input.name
  }`;
}

function buildFallbackTaskDescription(input: {
  name: string;
  description?: string | null;
  taskDomain: SkillTaskDomain;
  taskIntent: SkillTaskIntent;
  taskAudience: SkillTaskAudience;
}) {
  const base = input.description || input.name;
  return `${base} Use this Skill when ${audienceLabel(
    input.taskAudience
  )} need ${intentLabel(input.taskIntent)} for ${domainLabel(
    input.taskDomain
  )} workflows. The Skill is triggered by the business task scenario, then uses configured enterprise knowledge bases as evidence sources.`;
}

function withDefaultTriggerExamples(input: SkillDefaultContext) {
  if (input.triggerExamples && input.triggerExamples.length > 0) {
    return input.triggerExamples;
  }

  const audience = audienceLabel(input.taskAudience);
  const domain = domainLabel(input.taskDomain);
  const intent = intentLabel(input.taskIntent);

  return [
    `${audience} asks for ${intent} in a ${domain} workflow and expects a knowledge-grounded answer with citations.`,
    `Help me handle a ${domain} task: ${input.taskDescription || input.description || input.name}`,
    `Use the ${input.name} Skill to answer a ${domain} ${input.taskIntent} question and show the source evidence.`,
  ];
}

function withDefaultNonGoals(nonGoals: string[]) {
  if (nonGoals.length > 0) return nonGoals;
  return [
    "Do not use for generic chat or unrelated knowledge-base search.",
    "Do not use as a final approval, legal opinion, financial decision, or security exception workflow.",
    "Do not answer outside the configured knowledge evidence when the task requires enterprise policy accuracy.",
  ];
}

function buildDefaultRuntimePrompt(input: SkillCreateInput | SkillDTO) {
  const taskDescription = withDefaultTaskDescription(input);
  const nonGoals = withDefaultNonGoals(input.nonGoals);
  const triggerExamples = withDefaultTriggerExamples({
    name: input.name,
    description: input.description,
    taskDomain: input.taskDomain,
    taskIntent: input.taskIntent,
    taskAudience: input.taskAudience,
    taskDescription,
    triggerExamples: input.triggerExamples,
  });

  return `You are an enterprise API Skill for a corporate information system knowledge-base platform.

Task scenario:
${taskDescription}

Domain: ${input.taskDomain}
Intent: ${input.taskIntent}
Audience: ${input.taskAudience}
Output style: ${input.outputStyle}

Default boundaries:
${formatList(nonGoals, "No non-goals configured.")}

Default trigger examples:
${formatList(triggerExamples, "No trigger examples configured.")}

Execution rules:
1. Answer only when the user request fits the task scenario or a close boundary case.
2. Use the configured knowledge base context as evidence.
3. Cite source references whenever knowledge-base evidence supports a claim.
4. If evidence is missing or weak, say what is missing and avoid presenting guesses as policy or process truth.
5. For policy, privacy, security, compliance, finance, legal, procurement, approval, workplace, HR, or AIGC enablement questions, be precise about what the evidence supports and what remains uncertain.`;
}

function buildBoundaryExamples(skill: SkillDTO) {
  const domain = domainLabel(skill.taskDomain);
  const intent = intentLabel(skill.taskIntent);

  return [
    `The user asks a ${domain} ${intent} question, but the retrieved evidence is incomplete. Respond with the supported part and list missing information.`,
    `The user asks for an official decision, approval, exception, or legal/financial/security conclusion. Provide knowledge-grounded guidance only and state the required owner or process.`,
    `The user mixes this ${domain} task with an unrelated request. Answer only the supported task scenario and explain what is outside this Skill.`,
  ];
}

function domainLabel(domain: SkillTaskDomain) {
  const labels: Record<SkillTaskDomain, string> = {
    hr: "HR",
    finance: "finance",
    legal: "legal",
    procurement: "procurement",
    approval: "approval",
    workplace: "workplace services",
    security: "security",
    privacy: "privacy",
    compliance: "compliance",
    aigc: "AIGC enablement",
    general: "enterprise knowledge",
  };
  return labels[domain];
}

function intentLabel(intent: SkillTaskIntent) {
  const labels: Record<SkillTaskIntent, string> = {
    qa: "question answering",
    policy_check: "policy checking",
    process_guidance: "process guidance",
    case_triage: "case triage",
    summary: "knowledge summarization",
    drafting: "business drafting",
    risk_review: "risk review",
  };
  return labels[intent];
}

function audienceLabel(audience: SkillTaskAudience) {
  const labels: Record<SkillTaskAudience, string> = {
    employee: "employees",
    manager: "managers",
    operator: "business operators",
    admin: "administrators",
    expert_agent: "expert agents",
    external_agent: "external agents",
  };
  return labels[audience];
}

function toRagScope(scope: AgentKnowledgeScope): RagRetrieveScope {
  return {
    knowledgeBaseIds: scope.knowledgeBaseIds,
    knowledgeIds: scope.knowledgeIds.length > 0 ? scope.knowledgeIds : undefined,
    categoryIds: scope.categoryIds.length > 0 ? scope.categoryIds : undefined,
    tagIds: scope.tagIds.length > 0 ? scope.tagIds : undefined,
    chunkTypes: scope.chunkTypes.length > 0 ? scope.chunkTypes : undefined,
  };
}

function toCitations(retrieve: RagRetrieveResponse): ChatCitation[] {
  return retrieve.contexts.map((context, index) => {
    const reference = retrieve.references.find(
      (item) => item.chunkId === context.chunkId
    );

    return {
      refId: reference?.refId ?? `ref_${index + 1}`,
      chunkId: context.chunkId,
      knowledgeId: context.knowledgeId,
      documentId: context.knowledgeId,
      knowledgeBaseId: context.knowledgeBaseId,
      title: context.title,
      content: context.content,
      chunkType: context.chunkType,
      score: context.score,
    };
  });
}

async function isValidSkillApiKey(skillId: string, apiKey: string) {
  const key = await prisma.skillApiKey.findUnique({
    where: { keyHash: hashApiKey(apiKey) },
  });

  return Boolean(key && key.skillId === skillId && key.status === "active");
}

function generateApiKey() {
  return `sk_live_${crypto.randomBytes(32).toString("base64url")}`;
}

function hashApiKey(apiKey: string) {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

function parseJsonObject(value: string | null): JsonObject {
  return parseJson<JsonObject>(value) ?? {};
}

function parseJsonStringArray(value: string | null): string[] {
  const parsed = parseJson<unknown>(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === "string");
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function withDefaultSchema(value: JsonObject, fallback: JsonObject) {
  return Object.keys(value).length > 0 ? value : fallback;
}

function formatList(items: string[], fallback: string) {
  if (items.length === 0) return fallback;
  return items.map((item) => `- ${item}`).join("\n");
}

function validationCheck(input: {
  id: string;
  category: SkillValidationCheck["category"];
  severity: SkillValidationCheck["severity"];
  passed: boolean;
  title: string;
  detail: string;
  action: string;
}): SkillValidationCheck {
  return {
    id: input.id,
    category: input.category,
    severity: input.severity,
    status: input.passed
      ? "pass"
      : input.severity === "blocking"
        ? "fail"
        : "warning",
    title: input.title,
    detail: input.detail,
    action: input.action,
  };
}

function hasDistinctTaskDescription(skill: SkillDTO) {
  const description = skill.description?.trim() ?? "";
  if (description.length < 40) return false;

  const genericPatterns = [
    /query.*knowledge/i,
    /search.*knowledge/i,
    /knowledge base/i,
    /知识库查询/,
    /查询知识库/,
  ];
  const hasOnlyGenericDescription = genericPatterns.some((pattern) =>
    pattern.test(description)
  );
  const normalized = description.toLowerCase();
  const hasTaskSignal =
    description.includes(skill.taskDomain) ||
    description.includes(skill.taskIntent) ||
    description.includes(skill.taskAudience) ||
    normalized.includes(domainLabel(skill.taskDomain).toLowerCase()) ||
    normalized.includes(intentLabel(skill.taskIntent).toLowerCase());

  return hasTaskSignal || !hasOnlyGenericDescription;
}

function hasSchemaField(schema: JsonObject, field: string) {
  const properties = schema.properties;
  return (
    properties !== null &&
    properties !== undefined &&
    typeof properties === "object" &&
    !Array.isArray(properties) &&
    Object.prototype.hasOwnProperty.call(properties, field)
  );
}

function hasGroundingPrompt(systemPrompt: string | null) {
  if (!systemPrompt || systemPrompt.trim().length < 80) return false;
  const normalized = systemPrompt.toLowerCase();
  const evidenceSignals = [
    "context",
    "evidence",
    "citation",
    "cite",
    "reference",
    "knowledge",
  ];
  const missingEvidenceSignals = [
    "missing",
    "insufficient",
    "no reliable",
    "not support",
    "缺少",
    "不足",
  ];

  return (
    evidenceSignals.some((signal) => normalized.includes(signal)) &&
    missingEvidenceSignals.some((signal) => normalized.includes(signal))
  );
}

function getConfiguredTestExamples(config: JsonObject) {
  const candidates = [config.testExamples, config.examples, config.testCases];
  return candidates.flatMap((candidate) =>
    Array.isArray(candidate) ? candidate.filter(Boolean) : []
  );
}

function formatConfiguredTestExamples(skill: SkillDTO) {
  const examples = getConfiguredTestExamples(skill.config);
  if (examples.length === 0) {
    return "No configured test examples. Add `config.testExamples` to support one-click verification in future UI.";
  }

  return `\`\`\`json
${JSON.stringify(examples, null, 2)}
\`\`\``;
}

function hasSchemaProperty(schema: JsonObject) {
  const properties = schema.properties;
  return (
    properties !== null &&
    properties !== undefined &&
    typeof properties === "object" &&
    !Array.isArray(properties) &&
    Object.keys(properties).length > 0
  );
}

function sampleInputFromSchema(schema: JsonObject): JsonObject {
  const properties = schema.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    return { question: "What should I know?" };
  }

  const sample: JsonObject = {};
  for (const [key, value] of Object.entries(properties as JsonObject)) {
    sample[key] = sampleValue(value);
  }

  return Object.keys(sample).length > 0 ? sample : { question: "What should I know?" };
}

function sampleValue(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "string";
  const type = (value as { type?: unknown }).type;
  if (type === "number" || type === "integer") return 1;
  if (type === "boolean") return true;
  if (type === "array") return [];
  if (type === "object") return {};
  return "string";
}

function yamlScalar(value: string) {
  return JSON.stringify(value);
}

function asTaskDomain(value: string): SkillTaskDomain {
  return asEnumValue(SKILL_TASK_DOMAINS, value, "general");
}

function asTaskIntent(value: string): SkillTaskIntent {
  return asEnumValue(SKILL_TASK_INTENTS, value, "qa");
}

function asTaskAudience(value: string): SkillTaskAudience {
  return asEnumValue(SKILL_TASK_AUDIENCES, value, "expert_agent");
}

function asOutputStyle(value: string): SkillOutputStyle {
  return asEnumValue(SKILL_OUTPUT_STYLES, value, "answer_with_citations");
}

function asRuntimeMode(value: string): SkillRuntimeMode {
  return asEnumValue(SKILL_RUNTIME_MODES, value, "platform_rag");
}

function asEnumValue<const T extends readonly string[]>(
  values: T,
  value: string,
  fallback: T[number]
): T[number] {
  return values.includes(value) ? (value as T[number]) : fallback;
}
