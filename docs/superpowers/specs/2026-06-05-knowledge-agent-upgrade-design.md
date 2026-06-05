# Knowledge Agent Upgrade Design

## Background

The project already has three related capabilities:

- Standard RAG retrieval through `retrieveRagContexts`, which retrieves relevant chunks once and injects them into the model prompt.
- Agent chat mode, which uses an `ExpertAgent` system prompt plus one retrieval pass scoped by `knowledgeScope`.
- Knowledge Agent chat mode, implemented in `src/app/api/chat/route.ts`, which builds a temporary document map, asks the model to emit a text-form `retrieve_files` action, reads up to three parsed documents once, and then asks the model to answer.

This is enough for simple document Q&A, but not enough for knowledge-base organization, analysis, or review. Those tasks require the agent to inspect available evidence, choose a read scope, compare multiple pieces of content, continue reading when evidence is insufficient, and produce auditable findings.

## Goal

Upgrade the existing Knowledge Agent into an agentic RAG executor that can support knowledge-base organization, analysis, and review.

The first version must support exactly three retrieval scopes:

- `files`: read specific imported documents by `DocumentSource.id`.
- `knowledgeBase`: read documents and chunks attached to selected knowledge bases.
- `all`: inspect all active, parsed documents available to the platform.

Directory-level reading is intentionally out of scope because the current data model does not contain stable directory or hierarchy fields.

## Non-Goals

- Do not implement directory, folder, or path-based retrieval in the first version.
- Do not add automatic write actions such as approving, rejecting, deleting, or editing knowledge chunks.
- Do not require native OpenAI tool calling in the first version.
- Do not replace the existing RAG retriever.
- Do not redesign the chat UI beyond adding trace/status payloads needed to show tool progress.

## Existing Constraints

The current `llm-client.ts` supports plain chat completions and streaming completions. It does not expose a provider-neutral tools interface.

The current `Knowledge Agent` action protocol is text-based:

```text
<|Action|> retrieve_files
<|Action Input|> {"documents":["documentId"]}
```

The current document map is built at request time from parsed `DocumentSource` rows and a short slice of `rawContent`. This is not stable enough to serve as a global knowledge map for analysis or review.

The current `DocumentSource` / `DocumentChunk` model is sufficient for file, knowledge-base, and all-scope reads. It is not sufficient for directory reads.

## Recommended Architecture

Move Knowledge Agent execution out of `src/app/api/chat/route.ts` into a dedicated service directory:

```text
src/server/services/knowledge-agent/
  executor.ts
  knowledge-map.ts
  prompts.ts
  tool-loop.ts
  tools.ts
  types.ts
```

Responsibilities:

- `executor.ts`: public entry point used by chat route handlers.
- `knowledge-map.ts`: builds the global knowledge map injected into the system prompt.
- `prompts.ts`: owns the Knowledge Agent system prompt, tool instructions, and final-answer rules.
- `tool-loop.ts`: runs the bounded multi-round action loop.
- `tools.ts`: validates and executes read-only tools.
- `types.ts`: shared Zod schemas and TypeScript types.

The chat route should delegate Knowledge Agent mode to this executor and keep only request orchestration, SSE emission, persistence, and error handling.

## Executor Interface

The executor must preserve the current chat behavior: intermediate planning/tool calls may be non-streaming, but the final answer must stream tokens through the existing SSE path.

Recommended public interface:

```ts
type RunKnowledgeAgentInput = {
  userMessage: string;
  attachmentIds?: string[];
  llmInterface?: LlmInterfaceKey;
  recentMessages: LlmMessage[];
  memorySummary: string | null;
  signal?: AbortSignal;
  emit: ChatStreamEmitter;
};

type RunKnowledgeAgentResult = {
  answer: string;
  knowledgeFiles: Array<{ id: string; title: string; chunkCount: number }>;
  citations: ChatCitation[];
};
```

Execution rules:

- Planning and tool-selection turns use non-streaming `createChatCompletion`.
- Tool results are appended to the message list as text messages.
- The final answer turn uses `streamChatCompletion` and calls `emit("token", token)` for each token.
- The executor returns the accumulated final `answer` only after streaming completes, so the caller can persist the exchange.
- The initial messages must be built with the existing conversation context behavior: attachment context, image parts, `mergeRecentMessages`, and `memorySummary` must remain part of the prompt assembly.

## Data Model

Add a persisted document knowledge map instead of continuing to expand `DocumentSource`.

```prisma
model DocumentSource {
  // existing fields omitted
  knowledgeMap DocumentKnowledgeMap?
}

model DocumentKnowledgeMap {
  id               String   @id @default(cuid())
  documentSourceId String   @unique
  summary          String
  keywordsJson     String   @default("[]")
  outlineJson      String   @default("[]")
  signalsJson      String   @default("{}")
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  documentSource DocumentSource @relation(fields: [documentSourceId], references: [id], onDelete: Cascade)
}
```

The map should be generated after document parsing succeeds. If a document does not yet have a persisted map, the Knowledge Agent should fall back to a deterministic summary from `rawContent` and chunk metadata.

Generation should be attached to the existing document parsing pipeline:

- `src/app/api/documents/[id]/parse/route.ts` calls `parseDocument`.
- `src/app/api/documents/batch-parse/route.ts` calls `parseDocument` for each selected document.
- `parseDocument` delegates successful chunk replacement and indexing to `replaceTextChunksAndIndex`.
- `replaceTextChunksAndIndex` is the preferred trigger point because it also covers manual content/chunk replacement flows that re-index the document.

The first implementation should generate the map synchronously after chunks are saved and indexed successfully. If map generation fails, parsing should still succeed and the error should be logged; the Knowledge Agent can fall back to deterministic summaries. A later background job can backfill or refresh maps without blocking document ingestion.

`signalsJson` should include review-oriented metadata such as:

```json
{
  "chunkCount": 18,
  "hasEmptyChunks": false,
  "containsNumbers": true,
  "containsDates": true,
  "parseQuality": "good",
  "reviewRisk": "medium"
}
```

This keeps the first version useful even before deeper quality scoring is added.

## Scope Type

Use one schema across all Knowledge Agent tools:

```ts
type KnowledgeAgentScope =
  | { type: "files"; documentIds: string[] }
  | { type: "knowledgeBase"; knowledgeBaseIds: string[] }
  | { type: "all" };
```

Validation rules:

- `files.documentIds` must contain 1 to 20 ids.
- `knowledgeBase.knowledgeBaseIds` must contain 1 to 10 ids.
- `all` must not accept extra narrowing fields in the first version.
- All tools must enforce parsed and active document constraints at the database layer.

## Tools

### `list_knowledge_map`

Purpose: let the model inspect available knowledge structure before deciding what to read.

Input:

```ts
{
  scope: KnowledgeAgentScope;
  limit?: number;
}
```

Limit rules:

- default: 50
- maximum: 100
- values above 100 are rejected by Zod validation rather than silently expanded

Output:

- document id
- title/original name
- source type/file type
- attached knowledge base names
- chunk count
- persisted summary
- keywords
- review signals
- updated time

This tool should return compact metadata only, not full document content.

### `retrieve_files`

Purpose: read document evidence from file, knowledge-base, or all scope.

Input:

```ts
{
  scope: KnowledgeAgentScope;
  mode: "summary" | "chunks" | "full";
  query?: string;
  limit?: number;
}
```

Behavior:

- `summary`: returns persisted map summaries and review signals.
- `chunks`: returns matching chunks, optionally filtered by `query`.
- `full`: returns ordered document content within a strict character budget.

Limits:

- maximum 5 files per call for `full`
- maximum 30 chunks per call for `chunks`
- default limit 10 for `summary` and `chunks`
- maximum 20,000 returned characters per round
- maximum 60,000 returned characters across the whole loop

### `search_chunks`

Purpose: reuse existing RAG retrieval for focused evidence search.

Input:

```ts
{
  scope: KnowledgeAgentScope;
  query: string;
  limit?: number;
}
```

Behavior:

- For `knowledgeBase`, convert scope directly to `RagRetrieveScope`.
- For `files`, selected ids are `DocumentSource.id` values. The current RAG adapter maps `RagRetrieveScope.knowledgeIds` to `DocumentChunk.documentSourceId`, so the first implementation can pass these ids as `knowledgeIds`. This contract must be documented in the tool schema and tested. If the RAG type is later renamed, use `documentSourceIds` to make the meaning explicit.
- For `all`, resolve active knowledge bases first, then call `retrieveRagContexts`.

This tool should return citations-compatible chunk references so final answers can point back to evidence.

## Tool Loop

The first version should keep a provider-neutral text action protocol because the project supports `default`, `openai`, and `local` LLM interfaces.

Allowed model outputs:

```text
<|Action|> list_knowledge_map
<|Action Input|> {"scope":{"type":"all"},"limit":50}
```

```text
<|Action|> retrieve_files
<|Action Input|> {"scope":{"type":"knowledgeBase","knowledgeBaseIds":["kb_id"]},"mode":"chunks","query":"审批流程","limit":20}
```

```text
<|Final|>
final answer here
```

Loop rules:

- Maximum 5 tool rounds per user request.
- Maximum 2 consecutive invalid tool inputs.
- Tool input must be parsed as JSON and validated with Zod.
- Tool failures are returned to the model as tool-result messages, not thrown as final request failures unless the executor cannot continue.
- The executor stops when the model emits `<|Final|>`, emits a normal answer without an action, or reaches loop limits.
- `tool-loop.ts` owns the cross-round character budget. Each tool result must report `returnedCharCount`, `remainingRoundBudget`, and `remainingTotalBudget`.
- When total budget is exhausted, tools return a structured budget-exhausted result. They must not return empty content without explanation.
- The loop should ask the model to finalize from gathered evidence after budget exhaustion instead of continuing to call tools.

## Prompt Design

The Knowledge Agent system prompt should include:

- role: knowledge-base organization, analysis, and review assistant
- available scopes: files, knowledgeBase, all
- available tools and JSON schemas
- global knowledge map
- evidence rules
- final answer format
- safety rule: no write actions are available

The prompt must instruct the model to use tools when answering requires document evidence, comparison, exclusion, aggregation, or review recommendations.

The prompt must not claim that directory reads are available.

## Final Answer Format

The model should produce readable Markdown for chat, but the executor should also capture structured evidence metadata.

Recommended final answer sections:

- conclusion
- evidence used
- findings
- review or organization suggestions
- limitations

Findings should use these categories:

```ts
type KnowledgeAgentFindingType =
  | "gap"
  | "conflict"
  | "duplicate"
  | "quality_issue"
  | "review_suggestion"
  | "summary";
```

The first version can store the natural-language answer plus `knowledgeFilesJson`, reusing the existing `ChatMessage` schema. A later version can add a structured findings table if the UI needs filtering and workflow actions.

## Chat Integration

Update Knowledge Agent mode in `src/app/api/chat/route.ts` so it calls the new executor.

The executor should receive the current chat context:

```ts
{
  userMessage: string;
  attachmentIds?: string[];
  llmInterface?: LlmInterfaceKey;
  recentMessages: LlmMessage[];
  memorySummary: string | null;
  signal?: AbortSignal;
  emit: ChatStreamEmitter;
}
```

The executor should return:

```ts
{
  answer: string;
  knowledgeFiles: Array<{ id: string; title: string; chunkCount: number }>;
  citations: ChatCitation[];
}
```

SSE events should continue to use existing event names where possible:

- `trace`: emit planning, retrieval, evidence, warning, and generation steps.
- `status`: use `organizing`, `reading-documents`, and `generating`.
- `knowledge-files`: emit files touched by tools.
- `citations`: emit chunk-level evidence returned by `search_chunks`.

No new frontend route is required for the first version.

The existing `src/server/services/knowledge-agent-document.service.ts` should not remain as a parallel implementation. During migration, either:

- move reusable functions into the new `knowledge-agent` service directory and delete the old service after imports are updated, or
- keep the old file as a thin compatibility wrapper that re-exports the new implementation.

The preferred outcome is one implementation path under `src/server/services/knowledge-agent/`.

## Error Handling

Handle these cases explicitly:

- no parsed documents available
- selected files do not exist or are not active
- selected knowledge bases do not exist or are inactive
- tool input is invalid JSON
- requested scope is too broad for `full` mode
- character budget is exhausted
- LLM output contains an unknown action
- maximum tool rounds reached

When evidence is incomplete, the final answer should state the limitation instead of presenting a complete audit.

## Testing Strategy

Unit-level tests should cover:

- scope schema validation
- action parsing
- tool-loop stop conditions
- document map fallback behavior
- file and knowledge-base scope filtering
- character budget truncation

Integration-level checks should cover:

- Knowledge Agent can inspect all-scope map and answer a summary question.
- Knowledge Agent can retrieve specific files and cite used documents.
- Knowledge Agent can search chunks inside a knowledge base.
- Invalid action input is returned to the model as a recoverable tool result.
- No write operation is exposed through Knowledge Agent tools.

If the project still has no test script, validation should use `npm run build` plus targeted manual API checks.

## Rollout Plan

1. Add `DocumentKnowledgeMap` model and Prisma migration.
2. Generate or backfill document maps for parsed documents.
3. Add the `knowledge-agent` service directory.
4. Implement Zod schemas and read-only tools.
5. Implement bounded text-protocol tool loop.
6. Move existing Knowledge Agent chat orchestration to the new executor.
7. Preserve existing chat behavior for simple questions.
8. Add build verification and manual API checks.

## Acceptance Criteria

- Knowledge Agent supports only `files`, `knowledgeBase`, and `all` scopes.
- Knowledge Agent can run multiple read/search rounds before final answering.
- Knowledge Agent can answer organization, analysis, and review questions using retrieved evidence.
- Knowledge Agent does not expose write operations.
- Existing `openai`, `agent`, `rag-openai`, and `skill-agent` chat modes continue to work.
- Build passes after implementation.
