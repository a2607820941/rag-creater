#!/usr/bin/env node
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
  console.error(`Usage:
  node scripts/install-skill.mjs codex
  node scripts/install-skill.mjs claude-code
  node scripts/install-skill.mjs codex --target /path/to/skills/${manifest.slug || "skill-slug"}`);
}
