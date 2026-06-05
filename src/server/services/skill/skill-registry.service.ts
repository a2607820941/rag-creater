import fs from "node:fs/promises";
import path from "node:path";

import type { LlmInterfaceKey } from "@/features/chat/chat.validation";
import type { JsonObject, SkillRunResult } from "@/features/skill/skill.types";
import { createChatCompletion } from "@/server/services/agent/llm-client";
import { runInstalledSkill } from "@/server/services/skill/skill.service";

const SKILLS_DIR = path.join(process.cwd(), "skills");

export type InstalledSkill = {
  id: string;
  name: string;
  slug: string;
  version: string;
  description: string;
  skillPath: string;
};

type InstalledSkillManifest = {
  id?: unknown;
  name?: unknown;
  slug?: unknown;
  version?: unknown;
  description?: unknown;
};

export async function discoverInstalledSkills(): Promise<InstalledSkill[]> {
  let entries;
  try {
    entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const skillPath = path.join(SKILLS_DIR, entry.name);
        try {
          const [skillMd, manifestText] = await Promise.all([
            fs.readFile(path.join(skillPath, "SKILL.md"), "utf8"),
            fs.readFile(path.join(skillPath, "manifest.json"), "utf8"),
          ]);
          const manifest = JSON.parse(manifestText) as InstalledSkillManifest;
          const metadata = parseSkillMetadata(skillMd);
          const id = asNonEmptyString(manifest.id);
          const slug = asNonEmptyString(manifest.slug) ?? entry.name;
          const name =
            asNonEmptyString(manifest.name) ?? metadata.name ?? slug;
          const description =
            asNonEmptyString(manifest.description) ??
            metadata.description ??
            "";

          if (!id || !description) return null;

          return {
            id,
            name,
            slug,
            version: asNonEmptyString(manifest.version) ?? "0.1.0",
            description,
            skillPath,
          } satisfies InstalledSkill;
        } catch {
          return null;
        }
      })
  );

  return skills
    .filter((skill): skill is InstalledSkill => skill !== null)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function selectAndRunInstalledSkill(
  message: string,
  llmInterface: LlmInterfaceKey = "openai",
  options?: { signal?: AbortSignal }
): Promise<{ skill: InstalledSkill; result: SkillRunResult } | null> {
  const skills = await discoverInstalledSkills();
  if (skills.length === 0) return null;

  const selection = await createChatCompletion(
    [
      {
        role: "system",
        content: `Select one installed Skill only when it clearly matches the user's request.

Return JSON only:
{"slug":"skill-slug","input":{"question":"the user's request"}}

If no Skill clearly matches, return:
{"slug":null}

Installed Skills:
${skills
  .map(
    (skill) =>
      `- ${skill.slug}: ${skill.description} (version ${skill.version})`
  )
  .join("\n")}`,
      },
      { role: "user", content: message },
    ],
    llmInterface,
    options
  );

  const parsed = parseSelection(selection);
  if (!parsed?.slug) return null;

  const skill = skills.find((item) => item.slug === parsed.slug);
  if (!skill) return null;

  const result = await runInstalledSkill(
    skill.id,
    { input: parsed.input ?? { question: message }, llmInterface },
    options
  );
  return result ? { skill, result } : null;
}

function parseSkillMetadata(content: string) {
  const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter) return {};

  const values: Record<string, string> = {};
  for (const line of frontmatter[1].split(/\r?\n/)) {
    const match = line.match(/^([a-zA-Z0-9_-]+):\s*(.+)$/);
    if (!match) continue;
    values[match[1]] = parseYamlScalar(match[2]);
  }

  return {
    name: values.name,
    description: values.description,
  };
}

function parseYamlScalar(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "string" ? parsed : value.trim();
  } catch {
    return value.trim().replace(/^["']|["']$/g, "");
  }
}

function parseSelection(value: string): {
  slug: string | null;
  input?: JsonObject;
} | null {
  const match = value.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]) as {
      slug?: unknown;
      input?: unknown;
    };
    if (parsed.slug !== null && typeof parsed.slug !== "string") return null;
    return {
      slug: parsed.slug ?? null,
      input:
        parsed.input && typeof parsed.input === "object" && !Array.isArray(parsed.input)
          ? (parsed.input as JsonObject)
          : undefined,
    };
  } catch {
    return null;
  }
}

function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
