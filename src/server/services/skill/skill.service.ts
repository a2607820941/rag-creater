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
  SkillDTO,
  SkillManifest,
  SkillPackageExport,
  SkillRunResult,
  SkillValidationResult,
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
    question: { type: "string" },
  },
  required: ["question"],
};

const DEFAULT_OUTPUT_SCHEMA: JsonObject = {
  type: "object",
  properties: {
    answer: { type: "string" },
    citations: { type: "array" },
  },
};

const SKILLS_DIR = path.join(process.cwd(), "skills");

export async function createSkill(input: SkillCreateInput): Promise<SkillDTO> {
  const skill = await prisma.skill.create({
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description,
      type: input.type,
      status: input.status,
      knowledgeScope: stringifyAgentKnowledgeScope(input.knowledgeScope),
      inputSchema: JSON.stringify(input.inputSchema),
      outputSchema: JSON.stringify(input.outputSchema),
      config: JSON.stringify(input.config),
      systemPrompt: input.systemPrompt,
      version: input.version,
    },
  });

  return toSkillDTO(skill);
}

export async function listSkills(options: SkillListQuery) {
  const { page, pageSize, status, keyword } = options;
  const where: Prisma.SkillWhereInput = {};

  if (status) where.status = status;
  if (keyword) {
    where.OR = [
      { name: { contains: keyword } },
      { slug: { contains: keyword } },
      { description: { contains: keyword } },
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

  return runSkill(skill, input);
}

export async function testSkill(
  id: string,
  input: SkillRunInput
): Promise<SkillRunResult | null> {
  const skill = await prisma.skill.findUnique({ where: { id } });
  if (!skill) return null;
  return runSkill(skill, input);
}

export async function runInstalledSkill(
  id: string,
  input: SkillRunInput,
  options?: { signal?: AbortSignal }
): Promise<SkillRunResult | null> {
  const skill = await prisma.skill.findUnique({ where: { id } });
  if (!skill || skill.status !== "published") return null;
  return runSkill(skill, input, options);
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
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.slug)) {
    reasons.push("Skill slug must use lowercase letters, numbers, and hyphens.");
  }
  if (skill.slug.length > 64) {
    warnings.push("Skill slug is longer than 64 characters; shorter names trigger better.");
  }
  if (skill.knowledgeScope.knowledgeBaseIds.length === 0) {
    reasons.push("Skill must bind at least one knowledge base.");
  }
  if (!skill.description || skill.description.trim().length < 20) {
    warnings.push("Description should include the use case and trigger context.");
  }
  if (!hasSchemaProperty(skill.inputSchema)) {
    warnings.push("Input schema has no properties; external callers may not know what to send.");
  }
  if (!hasSchemaProperty(skill.outputSchema)) {
    warnings.push("Output schema has no properties; external callers may not know what to expect.");
  }
  if (!skill.systemPrompt || skill.systemPrompt.trim().length < 40) {
    warnings.push("System prompt is short; add workflow, grounding, and failure guidance.");
  }

  return {
    valid: reasons.length === 0,
    reasons,
    warnings,
  };
}

export function buildSkillManifest(
  skill: SkillDTO,
  origin: string
): SkillManifest {
  return {
    schemaVersion: "1.0",
    name: skill.name,
    slug: skill.slug,
    version: skill.version,
    description: skill.description,
    runtime: {
      type: "http",
      endpoint: `${origin.replace(/\/$/, "")}/api/public/skills/${skill.slug}/run`,
      method: "POST",
    },
    inputSchema: withDefaultSchema(skill.inputSchema, DEFAULT_INPUT_SCHEMA),
    outputSchema: withDefaultSchema(skill.outputSchema, DEFAULT_OUTPUT_SCHEMA),
    auth: { type: "bearer" },
  };
}

export function buildSkillPackage(
  skill: SkillDTO,
  origin: string
): SkillPackageExport {
  const manifest = buildSkillManifest(skill, origin);
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
        path: `${packageName}/agents/openai.yaml`,
        content: buildOpenAiYaml(skill),
      },
      {
        path: `${packageName}/references/api.md`,
        content: buildApiReference(skill, manifest),
      },
      {
        path: `${packageName}/references/knowledge-scope.md`,
        content: buildKnowledgeScopeReference(skill),
      },
    ],
  };
}

export function toSkillDTO(skill: Skill): SkillDTO {
  return {
    id: skill.id,
    name: skill.name,
    slug: skill.slug,
    description: skill.description,
    type: skill.type === "rag_agent" ? "rag_agent" : "rag_agent",
    status:
      skill.status === "published" || skill.status === "disabled"
        ? skill.status
        : "draft",
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

async function runSkill(
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
  const internalManifest = {
    id: skill.id,
    name: skill.name,
    slug: skill.slug,
    version: skill.version,
    description: buildPackageDescription(skill),
    runtime: {
      type: "internal-skill",
      skillId: skill.id,
    },
  };

  await fs.mkdir(skillDir, { recursive: true });
  await Promise.all(
    packageFiles.map(async (file) => {
      const relativePath = file.path.replace(`${skill.slug}/`, "");
      const target = path.join(skillDir, relativePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, file.content, "utf8");
    })
  );
  await fs.writeFile(
    path.join(skillDir, "manifest.json"),
    JSON.stringify(internalManifest, null, 2),
    "utf8"
  );
}

async function removeMaterializedSkill(slug: string) {
  await fs.rm(path.join(SKILLS_DIR, slug), { recursive: true, force: true });
}

function buildRunSystemPrompt(skill: SkillDTO, retrieve: RagRetrieveResponse) {
  return `${skill.systemPrompt || "You are an API Skill powered by a knowledge base. Answer strictly from the provided context when possible."}

Skill name: ${skill.name}
Skill description: ${skill.description || "None"}

Knowledge base context:
${retrieve.llmContext || "No relevant knowledge base context was found."}

Rules:
1. Prefer the knowledge base context when it is relevant.
2. If the context does not support the answer, say that no reliable knowledge base evidence was found.
3. If you use a context item, cite it with its [ref_n] marker.
4. Return a direct answer for API consumers; do not include hidden reasoning.`;
}

function buildPackageSkillMd(skill: SkillDTO, manifest: SkillManifest) {
  const description = buildPackageDescription(skill);

  return `---
name: ${skill.slug}
description: ${yamlScalar(description)}
---

# ${skill.name}

Use this skill to call the ${skill.name} API Skill from the knowledge-base platform.

## Workflow

1. Confirm the user request matches this skill's purpose.
2. Read \`references/api.md\` for the HTTP contract before calling the endpoint.
3. Read \`references/knowledge-scope.md\` only when knowledge-base coverage matters.
4. Send a JSON request that matches the input schema.
5. Use returned citations when explaining knowledge-grounded answers.

## Runtime

- Endpoint: \`${manifest.runtime.endpoint}\`
- Method: \`${manifest.runtime.method}\`
- Auth: Bearer token

## Output Handling

Return the API answer directly. If the response includes citations, surface the most relevant sources. If the API reports no reliable knowledge-base evidence, say that clearly instead of filling gaps.
`;
}

function buildOpenAiYaml(skill: SkillDTO) {
  return `display_name: ${yamlScalar(skill.name)}
short_description: ${yamlScalar(shorten(skill.description || `Call the ${skill.name} API Skill.`, 120))}
default_prompt: ${yamlScalar(`Use ${skill.name} to answer the user's request with the configured knowledge base and return citations when available.`)}
`;
}

function buildApiReference(skill: SkillDTO, manifest: SkillManifest) {
  return `# API Reference

## Manifest

\`\`\`json
${JSON.stringify(manifest, null, 2)}
\`\`\`

## Request

\`\`\`http
POST ${manifest.runtime.endpoint}
Authorization: Bearer <api-key>
Content-Type: application/json
\`\`\`

\`\`\`json
{
  "input": ${JSON.stringify(sampleInputFromSchema(manifest.inputSchema), null, 2)}
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
${JSON.stringify(manifest.inputSchema, null, 2)}
\`\`\`

## Output Schema

\`\`\`json
${JSON.stringify(manifest.outputSchema, null, 2)}
\`\`\`
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
  const base = skill.description || `Call the ${skill.name} API Skill.`;
  return `${base} Use when an agent needs to invoke the published HTTP API Skill, follow its input/output schema, or return knowledge-grounded answers with citations.`;
}

function extractQuestion(input: JsonObject) {
  const candidates = ["question", "query", "message", "prompt", "text"];
  for (const key of candidates) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return JSON.stringify(input);
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

function shorten(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 3)}...`
    : normalized;
}
