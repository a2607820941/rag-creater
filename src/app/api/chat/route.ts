import { NextRequest, NextResponse } from "next/server";

import { directChatRequestSchema } from "@/features/chat/chat.validation";
import type {
  ChatCitation,
  ChatRagSummary,
  ChatStreamStatus,
} from "@/features/chat/chat.types";
import type { RagRetrieveResponse, RagRetrieveScope } from "@/features/rag/types";
import { parseAgentKnowledgeScope } from "@/features/agent/agent.validation";
import { prisma } from "@/lib/db";
import {
  buildAttachmentImageParts,
  buildAttachmentPromptContext,
} from "@/server/services/chat-attachment.service";
import {
  getOrCreateChatConversation,
  mergeRecentMessages,
  prepareChatConversationMemory,
} from "@/server/services/chat-conversation.service";
import { executeChat } from "@/server/services/chat/chat-executor";
import {
  createChatSseEmitter,
  emitTrace,
  type ChatStreamEmitter,
} from "@/server/services/chat/chat-stream";
import {
  RAG_CITATION_MIN_SCORE,
  shouldUseRagForMessage,
} from "@/server/services/rag/gating";
import { retrieveRagContexts } from "@/server/services/rag/retriever";
import {
  buildKnowledgeDocumentMap,
  formatKnowledgeDocumentToolResult,
  retrieveKnowledgeDocuments,
  type KnowledgeFile,
  type KnowledgeDocumentToolInput,
} from "@/server/services/knowledge-agent-document.service";
import {
  createChatCompletion,
  streamChatCompletion,
  type LlmContentPart,
  type LlmMessage,
} from "@/server/services/agent/llm-client";
import { createUsageLog } from "@/server/services/analytics.service";
import { createSkill } from "@/server/services/skill/skill.service";
import { skillCreateSchema } from "@/features/skill/skill.validation";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = directChatRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0].message,
        },
      },
      { status: 400 }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const emit = createChatSseEmitter(controller, request.signal);

      try {
        const conversation = await getOrCreateChatConversation({
          conversationId: parsed.data.conversationId,
          message: parsed.data.message,
          mode: parsed.data.chatMode,
          agentId: parsed.data.agentId,
        });
        const { recentMessages, memorySummary } =
          await prepareChatConversationMemory(
            conversation.id,
            parsed.data.llmInterface ?? "openai"
          );

        emit("meta", {
          conversationId: conversation.id,
        });
        emit("status", {
          status:
            parsed.data.chatMode === "rag-openai" ? "retrieving" : "organizing",
        });

        await executeChat({
          request: parsed.data,
          conversationId: conversation.id,
          emit,
          signal: request.signal,
          handlers: {
            runSkillAgent: () =>
              streamSkillAgentChat(
                parsed.data,
                conversation.id,
                emit,
                recentMessages,
                memorySummary,
                request.signal
              ),
            runKnowledgeAgent: () =>
              streamKnowledgeAgentChat(
                parsed.data,
                emit,
                recentMessages,
                memorySummary,
                request.signal
              ),
            prepareDirectChat: () =>
              prepareDirectChat(
                parsed.data,
                request.nextUrl.origin,
                recentMessages,
                memorySummary
              ),
            afterKnowledgeAgent: async (result) => {
              await reportKnowledgeAgentUsage({
                query: parsed.data.message,
                knowledgeFiles: result.knowledgeFiles ?? [],
              });
            },
            afterDirectChat: async () => {
              if (parsed.data.chatMode === "openai") {
                await reportDirectChatUsage({
                  query: parsed.data.message,
                  chatMode: parsed.data.chatMode,
                });
              }
            },
          },
        });
      } catch (error) {
        if (request.signal.aborted || (error as Error).name === "AbortError") {
          return;
        }

        emit("status", { status: "failed" });
        emit("error", {
          code: "CHAT_ERROR",
          message: error instanceof Error ? error.message : "Chat failed",
        });
      } finally {
        try {
          controller.close();
        } catch {
          // Client may have already closed the stream.
        }
      }
    },
    cancel() {
      // The client controls cancellation through request.signal.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

async function prepareDirectChat(
  input: {
    message: string;
    agentId?: string;
    chatMode: "openai" | "agent" | "knowledge-agent" | "skill-agent" | "rag-openai";
    attachmentIds?: string[];
  },
  origin: string,
  recentMessages: LlmMessage[],
  memorySummary: string | null
): Promise<{
  messages: LlmMessage[];
  citations: ChatCitation[];
  ragSummary: ChatRagSummary;
}> {
  const [attachmentContext, imageParts] = await Promise.all([
    buildAttachmentPromptContext(input.attachmentIds),
    buildAttachmentImageParts(input.attachmentIds),
  ]);

  if (input.chatMode === "agent") {
    const agent = await getActiveAgent(input.agentId);
    const agentContext = await retrieveAgentContext(input.message, agent);
    const citations = agentContext ? toCitations(agentContext.retrieve) : [];
    if (agentContext) {
      await reportRagUsage({
        origin,
        query: input.message,
        scope: agentContext.scope,
        retrieve: agentContext.retrieve,
      });
    }

    return {
      messages: attachImagesToCurrentUserMessage(
        mergeRecentMessages(
          buildAgentMessages({
            userMessage: input.message,
            systemPrompt: appendAgentKnowledgeContext(
              agent.systemPrompt,
              agentContext?.retrieve ?? null
            ),
            attachmentContext,
          }),
          recentMessages,
          memorySummary
        ),
        imageParts
      ),
      citations,
      ragSummary: {
        status: citations.length > 0 ? "hit" : "miss",
        citationCount: citations.length,
      },
    };
  }

  if (input.chatMode === "rag-openai") {
    const shouldUseKnowledgeBase = shouldUseRagForMessage(input.message);
    if (!shouldUseKnowledgeBase) {
      return {
        messages: attachImagesToCurrentUserMessage(
          mergeRecentMessages(
            buildPlainChatMessages(input.message, attachmentContext),
            recentMessages,
            memorySummary
          ),
          imageParts
        ),
        citations: [],
        ragSummary: { status: "skipped", citationCount: 0 },
      };
    }

    const { retrieve, scope } = await retrieveOpenaiContext(input.message);
    const citations = toCitations(retrieve);
    await reportRagUsage({
      origin,
      query: input.message,
      scope,
      retrieve,
    });

    return {
      messages: attachImagesToCurrentUserMessage(
        mergeRecentMessages(
          buildRagOnlyMessages(input.message, retrieve, attachmentContext),
          recentMessages,
          memorySummary
        ),
        imageParts
      ),
      citations,
      ragSummary: {
        status: citations.length > 0 ? "hit" : "miss",
        citationCount: citations.length,
      },
    };
  }

  return {
    messages: attachImagesToCurrentUserMessage(
      mergeRecentMessages(
        buildPlainChatMessages(input.message, attachmentContext),
        recentMessages,
        memorySummary
      ),
      imageParts
    ),
    citations: [],
    ragSummary: { status: "not-applicable", citationCount: 0 },
  };
}

async function streamKnowledgeAgentChat(
  input: {
    message: string;
    attachmentIds?: string[];
    llmInterface?: "default" | "openai" | "local";
  },
  send: ChatStreamEmitter,
  recentMessages: LlmMessage[],
  memorySummary: string | null,
  signal?: AbortSignal
): Promise<{ answer: string; knowledgeFiles: KnowledgeFile[] }> {
  const [attachmentContext, imageParts] = await Promise.all([
    buildAttachmentPromptContext(input.attachmentIds),
    buildAttachmentImageParts(input.attachmentIds),
  ]);
  const documentMap = await buildKnowledgeDocumentMap();
  emitTrace(send, {
    type: "plan",
    title: "Map available documents",
    detail: "Build a list of imported knowledge documents for the agent.",
    status: "completed",
  });
  const probeMessages = attachImagesToCurrentUserMessage(
    mergeRecentMessages(
      buildKnowledgeAgentMessages({
        userMessage: input.message,
        attachmentContext,
        documentMap: documentMap.text,
      }),
      recentMessages,
      memorySummary
    ),
    imageParts
  );

  send("rag-summary", {
    status: "not-applicable",
    citationCount: 0,
  });
  send("citations", []);
  send("status", { status: "organizing" } satisfies {
    status: ChatStreamStatus;
  });

  const llmInterface = input.llmInterface ?? "openai";
  emitTrace(send, {
    type: "plan",
    title: "Ask agent to choose files",
    detail: "The model decides whether a retrieve_files action is needed.",
    status: "running",
  });
  const firstResponse = await createChatCompletion(probeMessages, llmInterface, {
    signal,
  });
  const toolInput = parseRetrieveFilesAction(firstResponse);

  if (!toolInput) {
    emitTrace(send, {
      type: "generation",
      title: "Direct answer",
      detail: "The agent answered without reading additional files.",
      status: "completed",
    });
    send("status", { status: "generating" } satisfies {
      status: ChatStreamStatus;
    });
    send("token", firstResponse);
    return { answer: firstResponse, knowledgeFiles: [] };
  }

  send("status", { status: "reading-documents" } satisfies {
    status: ChatStreamStatus;
  });
  emitTrace(send, {
    type: "retrieval",
    title: "Read selected files",
    detail: `${toolInput.documents.length} file request(s) from retrieve_files.`,
    status: "running",
  });
  const toolResult = await retrieveKnowledgeDocuments(toolInput);
  const knowledgeFiles = toolResult.files.map((file) => ({
    id: file.id,
    title: file.title,
    chunkCount: file.chunkCount,
  }));
  send(
    "knowledge-files",
    knowledgeFiles
  );
  emitTrace(send, {
    type: "evidence",
    title: "Selected file evidence",
    detail: `${knowledgeFiles.length} file(s) loaded for the final answer.`,
    status: "completed",
  });

  const finalMessages: LlmMessage[] = [
    ...probeMessages,
    {
      role: "assistant",
      content: firstResponse,
    },
    {
      role: "user",
      content: `${formatKnowledgeDocumentToolResult(toolResult)}

请基于上面的 retrieve_files 工具结果回答用户原始问题。不要再次输出 <|Action|>，也不要声称读取了正式知识库或向量检索结果。`,
    },
  ];

  send("status", { status: "generating" } satisfies {
    status: ChatStreamStatus;
  });
  const answer = await streamChatCompletion(
    finalMessages,
    (token) => send("token", token),
    llmInterface,
    { signal }
  );

  return { answer, knowledgeFiles };
}

async function streamSkillAgentChat(
  input: {
    message: string;
    attachmentIds?: string[];
    llmInterface?: "default" | "openai" | "local";
  },
  conversationId: string,
  send: ChatStreamEmitter,
  recentMessages: LlmMessage[],
  memorySummary: string | null,
  signal?: AbortSignal
): Promise<{ answer: string }> {
  send("rag-summary", {
    status: "not-applicable",
    citationCount: 0,
  });
  send("citations", []);

  if (isSkillSaveConfirmation(input.message)) {
    const draft = await findLatestSkillDraft(conversationId, recentMessages);
    if (!draft) {
      const answer =
        "I did not find a valid Skill draft in the recent conversation. Please ask me to generate a Skill draft first, then reply with confirm/save.";
      send("token", answer);
      return { answer };
    }

    const parsed = skillCreateSchema.safeParse(draft);
    if (!parsed.success) {
      const answer = `The Skill draft is not ready to save: ${parsed.error.issues[0].message}. Please ask me to revise the draft and include a valid knowledgeScope.`;
      send("token", answer);
      return { answer };
    }

    const skill = await createSkill({
      ...parsed.data,
      slug: await ensureUniqueSkillSlug(parsed.data.slug),
      status: "draft",
    });
    emitTrace(send, {
      type: "skill",
      title: "Saved Skill draft",
      detail: `${skill.name} (${skill.slug})`,
      status: "completed",
    });
    send("skill-draft-saved", {
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
3. After publishing, external platforms can read /api/public/skills/${skill.slug}/manifest and call /api/public/skills/${skill.slug}/run with the one-time Bearer API key returned by publish.`;
    send("token", answer);
    return { answer };
  }

  const [attachmentContext, imageParts] = await Promise.all([
    buildAttachmentPromptContext(input.attachmentIds),
    buildAttachmentImageParts(input.attachmentIds),
  ]);
  const knowledgeBases = await listActiveKnowledgeBasesForSkillAgent();
  emitTrace(send, {
    type: "plan",
    title: "Prepare Skill draft",
    detail: `${knowledgeBases.split("\n").filter(Boolean).length} active knowledge base item(s) available.`,
    status: "running",
  });
  const messages = attachImagesToCurrentUserMessage(
    mergeRecentMessages(
      buildSkillAgentMessages({
        userMessage: input.message,
        attachmentContext,
        knowledgeBases,
      }),
      recentMessages,
      memorySummary
    ),
    imageParts
  );

  send("status", { status: "generating" } satisfies {
    status: ChatStreamStatus;
  });
  const answer = await streamChatCompletion(
    messages,
    (token) => send("token", token),
    input.llmInterface ?? "openai",
    { signal }
  );

  return { answer };
}

async function getActiveAgent(agentId?: string) {
  if (!agentId) {
    throw new Error("Agent 模式需要先创建并启用一个 Agent");
  }

  const agent = await prisma.expertAgent.findUnique({
    where: { id: agentId },
  });

  if (!agent) throw new Error("Agent 不存在");
  if (agent.status !== "active") throw new Error("Agent 未启用");
  return agent;
}

async function retrieveAgentContext(
  query: string,
  agent: Awaited<ReturnType<typeof getActiveAgent>>
): Promise<{ retrieve: RagRetrieveResponse; scope: RagRetrieveScope } | null> {
  const configuredScope = parseAgentKnowledgeScope(agent.knowledgeScope);
  let knowledgeBaseIds = configuredScope.knowledgeBaseIds;

  if (configuredScope.mode === "all" || knowledgeBaseIds.length === 0) {
    const activeKnowledgeBases = await prisma.knowledgeBase.findMany({
      where: { status: "active" },
      select: { id: true },
    });
    knowledgeBaseIds = activeKnowledgeBases.map((item) => item.id);
  }

  if (knowledgeBaseIds.length === 0) {
    return null;
  }

  const scope: RagRetrieveScope = { knowledgeBaseIds };
  if (configuredScope.knowledgeIds.length > 0) {
    scope.knowledgeIds = configuredScope.knowledgeIds;
  }
  if (configuredScope.categoryIds.length > 0) {
    scope.categoryIds = configuredScope.categoryIds;
  }
  if (configuredScope.tagIds.length > 0) {
    scope.tagIds = configuredScope.tagIds;
  }
  if (configuredScope.chunkTypes.length > 0) {
    scope.chunkTypes = configuredScope.chunkTypes;
  }

  const retrieve = await retrieveRagContexts({
    query,
    mode: "balanced",
    scope,
  });

  return { retrieve, scope };
}

async function retrieveOpenaiContext(
  query: string
): Promise<{ retrieve: RagRetrieveResponse; scope: RagRetrieveScope }> {
  const knowledgeBases = await prisma.knowledgeBase.findMany({
    where: { status: "active" },
    select: { id: true },
  });
  const knowledgeBaseIds = knowledgeBases.map((item) => item.id);
  const scope = {
    knowledgeBaseIds:
      knowledgeBaseIds.length > 0 ? knowledgeBaseIds : ["kb_001", "kb_rag"],
  };

  const retrieve = await retrieveRagContexts({
    query,
    mode: "balanced",
    scope,
  });

  return { retrieve, scope };
}

async function reportRagUsage(input: {
  origin: string;
  query: string;
  scope: RagRetrieveScope;
  retrieve: RagRetrieveResponse;
}) {
  try {
    const response = await fetch(`${input.origin}/api/usage/logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: input.query,
        mode: "balanced",
        scope: input.scope,
        contexts: input.retrieve.contexts,
        references: input.retrieve.references,
      }),
    });

    if (!response.ok) {
      console.warn("Failed to report RAG usage log", {
        status: response.status,
        statusText: response.statusText,
      });
    }
  } catch (error) {
    console.warn("Failed to report RAG usage log", error);
  }
}

async function reportKnowledgeAgentUsage(input: {
  query: string;
  knowledgeFiles: KnowledgeFile[];
}) {
  try {
    const references = await buildKnowledgeAgentReferences(input.knowledgeFiles);
    const scopeKnowledgeBaseIds = Array.from(
      new Set(references.map((reference) => reference.knowledgeBaseId))
    );

    if (scopeKnowledgeBaseIds.length === 0) {
      const activeKnowledgeBases = await prisma.knowledgeBase.findMany({
        where: { status: "active" },
        select: { id: true },
      });
      scopeKnowledgeBaseIds.push(
        ...activeKnowledgeBases.map((knowledgeBase) => knowledgeBase.id)
      );
    }

    await createUsageLog({
      query: input.query,
      mode: "balanced",
      scope: {
        knowledgeBaseIds:
          scopeKnowledgeBaseIds.length > 0
            ? scopeKnowledgeBaseIds
            : ["knowledge-agent"],
      },
      contexts: [],
      references,
    });
  } catch (error) {
    console.warn("Failed to report knowledge-agent usage log", error);
  }
}

async function reportDirectChatUsage(input: {
  query: string;
  chatMode: "agent" | "openai";
}) {
  try {
    await createUsageLog({
      source: input.chatMode === "agent" ? "agent_chat" : "openai_chat",
      query: input.query,
      mode: "balanced",
      scope: {
        knowledgeBaseIds: [input.chatMode],
      },
      contexts: [],
      references: [],
      noHit: false,
    });
  } catch (error) {
    console.warn("Failed to report direct chat usage log", error);
  }
}

async function buildKnowledgeAgentReferences(knowledgeFiles: KnowledgeFile[]) {
  if (knowledgeFiles.length === 0) return [];

  const documents = await prisma.documentSource.findMany({
    where: {
      id: {
        in: knowledgeFiles.map((file) => file.id),
      },
    },
    include: {
      chunks: {
        where: {
          chunkStatus: "active",
          OR: [
            { chunkType: "text" },
            { chunkType: "knowledge", reviewStatus: "confirmed" },
          ],
        },
        orderBy: { chunkIndex: "asc" },
        take: 1,
      },
      knowledgeBases: {
        where: {
          status: "active",
          knowledgeBase: {
            status: "active",
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  return documents.flatMap((document) => {
    const chunk = document.chunks[0];
    const relation = document.knowledgeBases[0];
    if (!chunk || !relation) return [];

    return [
      {
        knowledgeBaseId: relation.knowledgeBaseId,
        knowledgeId: document.id,
        chunkId: chunk.id,
        title: chunk.title ?? document.title ?? document.originalName,
        chunkType:
          chunk.chunkType === "knowledge"
            ? chunk.knowledgeType === "faq"
              ? "qa"
              : "summary"
            : chunk.chunkType === "wiki" ||
                chunk.chunkType === "summary" ||
                chunk.chunkType === "qa"
              ? chunk.chunkType
              : "text",
      } as const,
    ];
  });
}

function buildPlainChatMessages(
  userMessage: string,
  attachmentContext: string
): LlmMessage[] {
  return [
    {
      role: "system",
      content: `你是一个通用 AI 助手。请直接回答用户问题。

${renderAttachmentInstruction(attachmentContext)}`,
    },
    {
      role: "user",
      content: userMessage,
    },
  ];
}

function buildKnowledgeAgentMessages(input: {
  userMessage: string;
  attachmentContext: string;
  documentMap: string;
}): LlmMessage[] {
  return [
    {
      role: "system",
      content: `你是一个 Knowledge Agent，负责帮助用户围绕知识库建设、知识消费、知识整理和知识问答策略进行对话。

当前能力边界：
1. 你当前只能读取“文档导入/解析”模块中已解析完成的导入文档。
2. 你不能读取正式知识库、数据库表或向量检索结果，不要声称已经检索或引用了正式知识库。
3. 如果用户的问题需要具体文档依据，请根据文档地图选择相关文档，并输出 retrieve_files 工具调用。
4. 如果文档地图没有相关文档，请直接说明没有找到可读取依据，并建议用户先上传并解析文档。
5. 如果本轮有附件内容，可以把附件作为当前对话上下文使用，但不要把附件说成已经进入知识库。
6. 回答应偏向可执行方案，例如知识库结构、消费链路、Agent 设计、Prompt 设计、评估方式和落地步骤。

可用文档地图：
${input.documentMap}

当你需要读取导入文档时，只输出以下格式，不要输出其他内容：
<|Action|> retrieve_files
<|Action Input|> {"documents":["documentId 或标题"]}

工具调用限制：
1. documents 最多 3 项。
2. 优先使用文档地图中的 documentId。
3. 读取工具返回结果后，再基于已读取内容回答。

${renderAttachmentInstruction(input.attachmentContext)}
`,
    },
    {
      role: "user",
      content: input.userMessage,
    },
  ];
}

function buildAgentMessages(input: {
  userMessage: string;
  systemPrompt: string | null;
  attachmentContext: string;
}): LlmMessage[] {
  return [
    {
      role: "system",
      content: `${input.systemPrompt || "你是一个专业、可靠的专家 Agent。"}

${renderAttachmentInstruction(input.attachmentContext)}`,
    },
    {
      role: "user",
      content: input.userMessage,
    },
  ];
}

function appendAgentKnowledgeContext(
  systemPrompt: string | null,
  retrieve: RagRetrieveResponse | null
): string {
  const basePrompt =
    systemPrompt || "You are a professional and reliable expert Agent.";
  const knowledgeContext =
    retrieve?.llmContext ||
    "No reliable knowledge-base context was retrieved for this turn.";

  return `${basePrompt}

Knowledge base context:
${knowledgeContext}

Citation rules:
1. When you use knowledge-base context, cite it with [ref_x].
2. Put citation markers immediately after the supported clause, like conclusion[ref_1][ref_2].
3. Do not wrap citation markers in parentheses or connect them with "and", "和", or "与".
4. Do not invent citation ids that are not present in the knowledge-base context.`;
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
2. Plan reusable contents. Decide whether this Skill needs only an API manifest, or also Agent Skill Package resources such as references, scripts, or assets.
3. Keep the core Skill concise. Do not stuff all knowledge into the prompt; bind explicit knowledgeBaseIds and rely on RAG at runtime.
4. Set the right degree of freedom. Use schema and runtime rules for fragile API behavior; leave wording flexible when multiple answers are valid.
5. Validate before save. Ensure slug naming, knowledge scope, input schema, output schema, trigger examples, and system prompt are clear.
6. Include a machine-readable draft between <skill_draft> and </skill_draft>. The JSON must match the internal create Skill API.
7. Tell the user to reply "confirm" or "save" only after they have reviewed the draft. Do not claim the Skill is saved until the user confirms.

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
    "triggerExamples": ["Example request that should use this Skill"],
    "callerPlatforms": ["External platform or agent that will call it"],
    "packageResources": {
      "references": ["api.md", "knowledge-scope.md"],
      "scripts": [],
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

function buildRagOnlyMessages(
  userMessage: string,
  retrieve: RagRetrieveResponse,
  attachmentContext: string
): LlmMessage[] {
  return [
    {
      role: "system",
      content: `你是一个基于知识库上下文回答问题的 AI 助手。

${renderAttachmentInstruction(attachmentContext)}

Citation format rule: put citation markers immediately after the supported clause, like conclusion[ref_1][ref_2]. Do not wrap citation markers in parentheses or connect them with "and", "和", or "与".

知识库检索结果：
${retrieve.llmContext || "未检索到相关知识。"}

要求：
1. 优先理解用户问题和本轮附件内容。
2. 涉及业务知识时，优先基于知识库检索结果回答。
3. 如果使用某段知识库内容，请用 [ref_x] 标注引用。
4. 如果知识库没有可靠依据，请明确说明没有找到可靠依据。
5. 不要编造引用编号。`,
    },
    {
      role: "user",
      content: userMessage,
    },
  ];
}

function renderAttachmentInstruction(attachmentContext: string): string {
  if (!attachmentContext) {
    return "本轮用户没有上传附件。";
  }

  return `${attachmentContext}

附件使用规则：
1. 当用户要求总结、解释、提取或分析附件时，优先使用附件内容。
2. 附件内容只作为当前对话上下文，不代表已经进入业务知识库。
3. 不要把附件内容标注为知识库引用来源。`;
}

function toCitations(retrieve: RagRetrieveResponse): ChatCitation[] {
  return retrieve.contexts
    .filter((context) => context.score >= RAG_CITATION_MIN_SCORE)
    .map((context, index) => {
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

function parseRetrieveFilesAction(text: string): KnowledgeDocumentToolInput | null {
  const actionMatch = text.match(/<\|Action\|>\s*retrieve_files/i);
  if (!actionMatch) return null;

  const inputMatch = text.match(
    /<\|Action Input\|>\s*([\s\S]*?)(?:\n\s*<\||$)/
  );
  if (!inputMatch) return null;

  try {
    const parsed = JSON.parse(inputMatch[1].trim()) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray((parsed as { documents?: unknown }).documents)
    ) {
      return null;
    }

    return {
      documents: (parsed as { documents: unknown[] }).documents.filter(
        (document): document is string => typeof document === "string"
      ),
    };
  } catch {
    return null;
  }
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

function attachImagesToCurrentUserMessage(
  messages: LlmMessage[],
  imageParts: LlmContentPart[]
): LlmMessage[] {
  if (imageParts.length === 0) return messages;

  const index = messages.findLastIndex((message) => message.role === "user");
  if (index < 0) return messages;

  return messages.map((message, messageIndex) => {
    if (messageIndex !== index) return message;

    const text = getTextMessageContent(message.content);
    return {
      ...message,
      content: [{ type: "text", text }, ...imageParts],
    };
  });
}

function getTextMessageContent(content: LlmMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter(
      (part): part is Extract<LlmContentPart, { type: "text" }> =>
        part.type === "text"
    )
    .map((part) => part.text)
    .join("\n");
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
