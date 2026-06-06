#!/usr/bin/env node
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
    "Authorization": `Bearer ${apiKey}`,
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
