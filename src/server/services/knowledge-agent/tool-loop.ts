import type { ChatCitation, ChatKnowledgeFile } from "@/features/chat/chat.types";
import type { LlmInterfaceKey } from "@/features/chat/chat.validation";
import type { LlmMessage } from "@/server/services/agent/llm-client";
import { createChatCompletion } from "@/server/services/agent/llm-client";
import { emitTrace, type ChatStreamEmitter } from "@/server/services/chat/chat-stream";
import {
  buildFinalizationPrompt,
  formatToolResultForModel,
} from "@/server/services/knowledge-agent/prompts";
import {
  KNOWLEDGE_AGENT_MAX_INVALID_ACTIONS,
  KNOWLEDGE_AGENT_MAX_TOOL_ROUNDS,
  KNOWLEDGE_AGENT_TOTAL_CHAR_BUDGET,
  listKnowledgeMapInputSchema,
  retrieveFilesInputSchema,
  searchChunksInputSchema,
  toolActionNameSchema,
  type KnowledgeAgentBudgetState,
  type KnowledgeAgentToolResult,
  type ParsedKnowledgeAgentAction,
} from "@/server/services/knowledge-agent/types";
import {
  runListKnowledgeMapTool,
  runRetrieveFilesTool,
  runSearchChunksTool,
} from "@/server/services/knowledge-agent/tools";

export async function runKnowledgeAgentToolLoop(input: {
  messages: LlmMessage[];
  llmInterface: LlmInterfaceKey;
  emit: ChatStreamEmitter;
  signal?: AbortSignal;
}) {
  const messages = [...input.messages];
  const budgetState: KnowledgeAgentBudgetState = {
    remainingTotalBudget: KNOWLEDGE_AGENT_TOTAL_CHAR_BUDGET,
  };
  const citations: ChatCitation[] = [];
  const knowledgeFiles: ChatKnowledgeFile[] = [];
  let invalidActions = 0;

  for (let round = 1; round <= KNOWLEDGE_AGENT_MAX_TOOL_ROUNDS; round += 1) {
    emitTrace(input.emit, {
      type: "plan",
      title: `Knowledge Agent round ${round}`,
      detail: "Ask the model whether it needs a read-only tool.",
      status: "running",
    });

    const response = await createChatCompletion(messages, input.llmInterface, {
      signal: input.signal,
    });
    const parsed = parseKnowledgeAgentAction(response);
    messages.push({ role: "assistant", content: response });

    if (parsed.kind === "final" || parsed.kind === "message") {
      messages.push({
        role: "user",
        content: buildFinalizationPrompt("the model indicated it has enough evidence"),
      });
      return {
        messages,
        citations,
        knowledgeFiles,
      };
    }

    const result =
      parsed.kind === "invalid_action"
        ? invalidToolResult("unknown", parsed.reason, budgetState)
        : await executeAction(parsed, budgetState);
    messages.push({ role: "user", content: formatToolResultForModel(result) });
    citations.push(...(result.citations ?? []));
    knowledgeFiles.push(...(result.knowledgeFiles ?? []));

    if (!result.ok) {
      invalidActions += 1;
    } else {
      invalidActions = 0;
    }

    emitTrace(input.emit, {
      type: result.ok ? "evidence" : "warning",
      title: `Tool result: ${result.toolName}`,
      detail: `${result.returnedCharCount} characters returned.`,
      status: result.ok ? "completed" : "failed",
    });

    if (budgetState.remainingTotalBudget <= 0) {
      messages.push({
        role: "user",
        content: buildFinalizationPrompt("tool context budget exhausted"),
      });
      return {
        messages,
        citations,
        knowledgeFiles,
      };
    }

    if (invalidActions >= KNOWLEDGE_AGENT_MAX_INVALID_ACTIONS) {
      messages.push({
        role: "user",
        content: buildFinalizationPrompt("too many invalid or unavailable tool calls"),
      });
      return {
        messages,
        citations,
        knowledgeFiles,
      };
    }
  }

  messages.push({
    role: "user",
    content: buildFinalizationPrompt("maximum tool rounds reached"),
  });
  return {
    messages,
    citations,
    knowledgeFiles,
  };
}

export function parseKnowledgeAgentAction(
  text: string
): ParsedKnowledgeAgentAction {
  const finalMatch = text.match(/<\|Final\|>\s*([\s\S]*)$/i);
  if (finalMatch) {
    return { kind: "final", content: finalMatch[1].trim() };
  }

  const actionMatch = text.match(/<\|Action\|>\s*([a-zA-Z0-9_-]+)/i);
  if (!actionMatch) {
    return { kind: "message", content: text.trim() };
  }

  const nameResult = toolActionNameSchema.safeParse(actionMatch[1]);
  if (!nameResult.success) {
    return {
      kind: "invalid_action",
      name: actionMatch[1],
      input: {},
      reason: `Unsupported tool name: ${actionMatch[1]}`,
    };
  }

  const inputMatch = text.match(/<\|Action Input\|>\s*([\s\S]*?)(?:\n\s*<\||$)/i);
  if (!inputMatch) {
    return { kind: "action", name: nameResult.data, input: {} };
  }

  try {
    return {
      kind: "action",
      name: nameResult.data,
      input: JSON.parse(inputMatch[1].trim()) as unknown,
    };
  } catch {
    return {
      kind: "action",
      name: nameResult.data,
      input: inputMatch[1].trim(),
    };
  }
}

async function executeAction(
  action: Extract<ParsedKnowledgeAgentAction, { kind: "action" }>,
  budgetState: KnowledgeAgentBudgetState
): Promise<KnowledgeAgentToolResult> {
  const budget = { budgetState };

  if (action.name === "list_knowledge_map") {
    const parsed = listKnowledgeMapInputSchema.safeParse(action.input);
    if (!parsed.success) {
      return invalidToolResult(action.name, parsed.error.issues[0]?.message, budgetState);
    }
    return runListKnowledgeMapTool(parsed.data, budget);
  }

  if (action.name === "retrieve_files") {
    const parsed = retrieveFilesInputSchema.safeParse(action.input);
    if (!parsed.success) {
      return invalidToolResult(action.name, parsed.error.issues[0]?.message, budgetState);
    }
    return runRetrieveFilesTool(parsed.data, budget);
  }

  const parsed = searchChunksInputSchema.safeParse(action.input);
  if (!parsed.success) {
    return invalidToolResult(action.name, parsed.error.issues[0]?.message, budgetState);
  }
  return runSearchChunksTool(parsed.data, budget);
}

function invalidToolResult(
  toolName: KnowledgeAgentToolResult["toolName"],
  message: string | undefined,
  budgetState: KnowledgeAgentBudgetState
): KnowledgeAgentToolResult {
  return {
    toolName,
    ok: false,
    content: `Invalid tool input: ${message ?? "unknown validation error"}`,
    returnedCharCount: 0,
    remainingRoundBudget: 0,
    remainingTotalBudget: budgetState.remainingTotalBudget,
  };
}
