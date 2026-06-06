#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(__dirname, "..");
const configPath = path.join(packageDir, ".skill-runtime.json");
const apiKey = process.argv[2] || process.env.SKILL_API_KEY || "";

if (!apiKey.trim()) {
  console.error(`Usage:
  node scripts/set-runtime-key.mjs <api-key>

You can also pass SKILL_API_KEY in the current terminal:
  SKILL_API_KEY="<api-key>" node scripts/set-runtime-key.mjs`);
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
