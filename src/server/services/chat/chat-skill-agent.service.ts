import { skillCreateSchema } from "@/features/skill/skill.validation";
import { prisma } from "@/lib/db";
import {
  buildAttachmentImageParts,
  buildAttachmentPromptContext,
} from "@/server/services/chat-attachment.service";
import { mergeRecentMessages } from "@/server/services/chat-conversation.service";
import { emitTrace, type ChatStreamEmitter } from "@/server/services/chat/chat-stream";
import { createSkill } from "@/server/services/skill/skill.service";
import {
  streamChatCompletion,
  type LlmMessage,
} from "@/server/services/agent/llm-client";
import type { ChatStreamStatus } from "@/features/chat/chat.types";
import type { DirectChatRequest } from "@/features/chat/chat.validation";

import {
  attachImagesToCurrentUserMessage,
  getTextMessageContent,
  renderAttachmentInstruction,
} from "./chat-prompt-helpers";

type SkillAgentRequest = Pick<
  DirectChatRequest,
  "message" | "attachmentIds" | "llmInterface"
>;

export async function streamSkillAgentChat(input: {
  request: SkillAgentRequest;
  conversationId: string;
  emit: ChatStreamEmitter;
  recentMessages: LlmMessage[];
  memorySummary: string | null;
  signal?: AbortSignal;
}): Promise<{ answer: string }> {
  const { request, conversationId, emit, recentMessages, memorySummary, signal } =
    input;

  emit("rag-summary", {
    status: "not-applicable",
    citationCount: 0,
  });
  emit("citations", []);

  if (isSkillSaveConfirmation(request.message)) {
    const draft = await findLatestSkillDraft(conversationId, recentMessages);
    if (!draft) {
      const answer =
        "I did not find a valid Skill draft in the recent conversation. Please ask me to generate a Skill draft first, then reply with \u786e\u8ba4 or \u4fdd\u5b58.";
      emit("token", answer);
      return { answer };
    }

    const parsed = skillCreateSchema.safeParse(draft);
    if (!parsed.success) {
      const answer = `The Skill draft is not ready to save: ${parsed.error.issues[0].message}. Please ask me to revise the draft and include a valid knowledgeScope.`;
      emit("token", answer);
      return { answer };
    }

    const skill = await createSkill({
      ...parsed.data,
      slug: await ensureUniqueSkillSlug(parsed.data.slug),
      status: "draft",
    });
    emitTrace(emit, {
      type: "skill",
      title: "Saved Skill draft",
      detail: `${skill.name} (${skill.slug})`,
      status: "completed",
    });
    emit("skill-draft-saved", {
      id: skill.id,
      name: skill.name,
      slug: skill.slug,
      status: "draft",
      publishEndpoint: `/api/skills/${skill.id}/publish`,
    });
    const answer = `Skill draft saved.

Name: ${skill.name}
Slug: ${skill.slug}
Status: ${skill.status}

Next steps:
1. Test it with POST /api/skills/${skill.id}/test
2. Publish it with POST /api/skills/${skill.id}/publish
3. After publishing, Claude Code or Codex can read /api/public/skills/${skill.slug}/manifest and call /api/public/skills/${skill.slug}/run with the one-time Bearer API key returned by publish.`;
    emit("token", answer);
    return { answer };
  }

  const [attachmentContext, imageParts] = await Promise.all([
    buildAttachmentPromptContext(request.attachmentIds),
    buildAttachmentImageParts(request.attachmentIds),
  ]);
  const knowledgeBases = await listActiveKnowledgeBasesForSkillAgent();
  emitTrace(emit, {
    type: "plan",
    title: "Prepare Skill draft",
    detail: `${knowledgeBases.split("\n").filter(Boolean).length} active knowledge base item(s) available.`,
    status: "running",
  });
  const messages = attachImagesToCurrentUserMessage(
    mergeRecentMessages(
      buildSkillAgentMessages({
        userMessage: request.message,
        attachmentContext,
        knowledgeBases,
      }),
      recentMessages,
      memorySummary
    ),
    imageParts
  );

  emit("status", { status: "generating" } satisfies { status: ChatStreamStatus });
  const answer = await streamChatCompletion(
    messages,
    (token) => emit("token", token),
    request.llmInterface ?? "openai",
    { signal }
  );

  return { answer };
}

function buildSkillAgentMessages(input: {
  userMessage: string;
  attachmentContext: string;
  knowledgeBases: string;
}): LlmMessage[] {
  return [
    {
      role: "system",
      content: `You are Skill Agent, an assistant that produces reusable API Skills from this knowledge-base platform.

Follow a skill-creator style workflow:
1. Understand concrete examples first. Ask for 1-3 example user requests, caller platform, success criteria, expected input, expected output, and failure behavior.
2. Define the task identity. Knowledge bases are resource dependencies; the task scenario is the Skill identity.
3. Choose a corporate information system domain: hr, finance, legal, procurement, approval, workplace, security, privacy, compliance, aigc, or general.
4. Choose the intent: qa, policy_check, process_guidance, case_triage, summary, drafting, or risk_review.
5. Choose the audience: employee, manager, operator, admin, expert_agent, or external_agent.
6. Plan reusable contents. Decide whether this Skill needs only an API manifest, or also Agent Skill Package resources such as references, scripts, or assets.
7. Keep the core Skill concise. Do not stuff all knowledge into the prompt; bind explicit knowledgeBaseIds and rely on RAG at runtime.
8. Set the right degree of freedom. Use schema and runtime rules for fragile API behavior; leave wording flexible when multiple answers are valid.
9. Validate before save. Ensure slug naming, task scenario, knowledge scope, input schema, output schema, trigger examples, non-goals, and system prompt are clear.
10. Include a machine-readable draft between <skill_draft> and </skill_draft>. The JSON must match the internal create Skill API.
11. Tell the user to reply "\u786e\u8ba4" or "\u4fdd\u5b58" only after they have reviewed the draft. English "confirm" or "save" is also accepted, but Chinese confirmation should be shown first. Do not claim the Skill is saved until the user confirms.

When information is missing, ask targeted questions instead of inventing production details.
Never default to all knowledge bases. Ask the user to choose one or more knowledgeBaseIds from the list.

Available active knowledge bases:
${input.knowledgeBases}

The draft JSON shape:
{
  "name": "Human readable Skill name",
  "slug": "lowercase-kebab-slug",
  "description": "What this API Skill does",
  "type": "rag_agent",
  "status": "draft",
  "taskDomain": "general",
  "taskIntent": "qa",
  "taskAudience": "external_agent",
  "taskDescription": "Concrete enterprise workflow this Skill handles. Mention the domain, audience, expected decisions or outputs, and evidence boundaries.",
  "triggerExamples": [
    "Example request that should use this Skill"
  ],
  "nonGoals": [
    "Example request that should not use this Skill"
  ],
  "outputStyle": "answer_with_citations",
  "runtimeMode": "platform_rag",
  "knowledgeScope": {
    "mode": "knowledgeBases",
    "knowledgeBaseIds": ["selected knowledge base id"],
    "categoryIds": [],
    "tagIds": [],
    "knowledgeIds": [],
    "chunkTypes": []
  },
  "inputSchema": {
    "type": "object",
    "properties": {
      "question": { "type": "string" }
    },
    "required": ["question"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "answer": { "type": "string" },
      "citations": { "type": "array" }
    }
  },
  "config": {
    "callerPlatforms": ["claude-code", "codex"],
    "testExamples": [
      {
        "input": { "question": "Representative request that should use this Skill" },
        "expected": "Knowledge-grounded answer with citations, or a clear missing-evidence response"
      }
    ],
    "packageResources": {
      "references": ["api.md", "task-scenario.md", "examples.md", "runtime.md", "knowledge-scope.md"],
      "scripts": ["run-skill.mjs"],
      "assets": []
    }
  },
  "systemPrompt": "Runtime instruction for the Skill",
  "version": "0.1.0"
}

Attachment context:
${renderAttachmentInstruction(input.attachmentContext)}`,
    },
    {
      role: "user",
      content: input.userMessage,
    },
  ];
}

function isSkillSaveConfirmation(message: string) {
  const normalized = message
    .trim()
    .toLowerCase()
    .replace(/[.!?\u3002\uff01\uff1f]+$/g, "")
    .replace(/\s+/g, " ");

  if (
    /^(confirm|save|confirm save|save it|please save|yes, save|ok save)$/.test(
      normalized
    )
  ) {
    return true;
  }

  return (
    normalized === "\u786e\u8ba4" ||
    normalized === "\u4fdd\u5b58" ||
    normalized === "\u786e\u8ba4\u4fdd\u5b58" ||
    normalized.includes("\u786e\u8ba4\u4fdd\u5b58") ||
    normalized.includes("\u4fdd\u5b58\u8fd9\u4e2a")
  );
}

async function ensureUniqueSkillSlug(slug: string): Promise<string> {
  const base = slug.slice(0, 72).replace(/-+$/g, "") || "skill";
  let candidate = base;
  let suffix = 1;

  while (await prisma.skill.findUnique({ where: { slug: candidate } })) {
    suffix += 1;
    const suffixText = `-${suffix}`;
    candidate = `${base.slice(0, 80 - suffixText.length).replace(/-+$/g, "")}${suffixText}`;
  }

  return candidate;
}

async function findLatestSkillDraft(
  conversationId: string,
  recentMessages: LlmMessage[]
): Promise<unknown | null> {
  const memoryDraft = parseLatestSkillDraft(recentMessages);
  if (memoryDraft) return memoryDraft;

  const persistedMessages = await prisma.chatMessage.findMany({
    where: {
      conversationId,
      role: "assistant",
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return parseLatestSkillDraft(
    persistedMessages.map((message) => ({
      role: "assistant" as const,
      content: message.content,
    }))
  );
}

function parseLatestSkillDraft(messages: LlmMessage[]): unknown | null {
  for (const message of [...messages].reverse()) {
    if (message.role !== "assistant") continue;
    const content = getTextMessageContent(message.content);
    const candidates = extractSkillDraftJsonCandidates(content);

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (looksLikeSkillDraft(parsed)) return parsed;
      } catch {
        // Try the next possible JSON block.
      }
    }
  }

  return null;
}

function extractSkillDraftJsonCandidates(content: string): string[] {
  const candidates: string[] = [];
  const taggedMatches = content.matchAll(
    /<skill_draft>\s*([\s\S]*?)\s*<\/skill_draft>/gi
  );
  for (const match of taggedMatches) {
    candidates.push(cleanJsonBlock(match[1]));
  }

  const fencedMatches = content.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
  for (const match of fencedMatches) {
    candidates.push(cleanJsonBlock(match[1]));
  }

  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(cleanJsonBlock(content.slice(firstBrace, lastBrace + 1)));
  }

  return candidates;
}

function cleanJsonBlock(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}

function looksLikeSkillDraft(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const draft = value as Record<string, unknown>;
  return (
    typeof draft.name === "string" &&
    typeof draft.slug === "string" &&
    draft.knowledgeScope !== null &&
    typeof draft.knowledgeScope === "object" &&
    draft.inputSchema !== null &&
    typeof draft.inputSchema === "object" &&
    typeof draft.systemPrompt === "string"
  );
}

async function listActiveKnowledgeBasesForSkillAgent() {
  const knowledgeBases = await prisma.knowledgeBase.findMany({
    where: { status: "active" },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
    },
  });

  if (knowledgeBases.length === 0) {
    return "No active knowledge bases are available. Ask the user to create or enable a knowledge base before saving a Skill.";
  }

  return knowledgeBases
    .map(
      (item) =>
        `- id: ${item.id}; name: ${item.name}; description: ${
          item.description || "None"
        }`
    )
    .join("\n");
}
