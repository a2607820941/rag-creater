import { RAG_CONFIG } from "@/server/services/rag/config";
import type {
  KnowledgeChunk,
  RagContext,
  RagReference,
  RagRetrieveMetrics,
  RagRetrieveResponse,
} from "@/features/rag/types";

/**
 * 检索结果上下文构建模块。
 *
 * 职责：
 * 1. 把检索命中的 chunk 转成结构化 contexts。
 * 2. 生成可直接交给 LLM 的 llmContext。
 * 3. 生成 references，并保证 refId 与 llmContext 中的 [ref_n] 对齐。
 */
export type ScoredKnowledgeChunk = {
  chunk: KnowledgeChunk;
  score: number;
  contextMetadata?: Record<string, unknown>;
};

type BuildRetrieveResponseOptions = {
  metrics?: RagRetrieveMetrics;
};

type ContextBlock = {
  id: string;
  knowledgeBaseId: string;
  knowledgeId: string;
  title: string;
  content: string;
  chunkType: KnowledgeChunk["chunkType"];
  score: number;
  categoryId?: string;
  tagIds?: string[];
  metadata?: Record<string, unknown>;
  referenceChunks: KnowledgeChunk[];
  order: number;
};

const MIN_OVERLAP_CHARS = 8;

/**
 * 把检索命中的 chunk 整理成对外响应。
 *
 * contexts 给调用方做结构化处理，llmContext 可直接拼进 prompt，
 * references 用于把 [ref_n] 映射回来源知识。
 */
export function buildRetrieveResponse(
  query: string,
  scoredChunks: ScoredKnowledgeChunk[],
  options: BuildRetrieveResponseOptions = {}
): RagRetrieveResponse {
  const contexts: RagContext[] = [];
  const references: RagReference[] = [];
  const llmContextParts: string[] = [];
  const contextBlocks = buildContextBlocks(dedupeScoredChunks(scoredChunks));
  let usedChars = 0;

  for (const block of contextBlocks) {
    const refId = `ref_${contexts.length + 1}`;
    const header = `[${refId}] ${block.title}\n`;
    const separator = llmContextParts.length > 0 ? "\n\n" : "";
    const remaining =
      RAG_CONFIG.maxContextChars - usedChars - separator.length - header.length;

    if (remaining <= 0) break;

    // 初版先按字符预算截断，后续接入 tokenizer 后可以替换为 token 预算。
    const content =
      block.content.length > remaining
        ? block.content.slice(0, remaining)
        : block.content;

    if (!content.trim()) continue;

    const context: RagContext = {
      id: `ctx_${block.id}`,
      knowledgeBaseId: block.knowledgeBaseId,
      knowledgeId: block.knowledgeId,
      chunkId: block.id,
      title: block.title,
      content,
      chunkType: block.chunkType,
      score: block.score,
      categoryId: block.categoryId,
      tagIds: block.tagIds,
      metadata: block.metadata,
    };

    contexts.push(context);
    references.push(...buildReferences(refId, block));

    const llmContextPart = `${header}${content}`;
    llmContextParts.push(llmContextPart);
    usedChars += separator.length + llmContextPart.length;
  }

  const response: RagRetrieveResponse = {
    query,
    contexts,
    llmContext: llmContextParts.join("\n\n"),
    references,
  };

  if (options.metrics) {
    response.metrics = options.metrics;
  }

  return response;
}

/** 对进入 context-builder 的 scored chunks 按 chunk.id 做最终兜底去重。 */
function dedupeScoredChunks(
  scoredChunks: ScoredKnowledgeChunk[]
): ScoredKnowledgeChunk[] {
  const seenChunkIds = new Set<string>();
  const dedupedChunks: ScoredKnowledgeChunk[] = [];

  for (const scoredChunk of scoredChunks) {
    if (seenChunkIds.has(scoredChunk.chunk.id)) continue;

    seenChunkIds.add(scoredChunk.chunk.id);
    dedupedChunks.push(scoredChunk);
  }

  return dedupedChunks;
}

/** 将同一知识下 chunkIndex 连续的 chunks 合并成 context block。 */
function buildContextBlocks(
  scoredChunks: ScoredKnowledgeChunk[]
): ContextBlock[] {
  return Array.from(groupScoredChunks(scoredChunks).values())
    .flatMap(buildGroupBlocks)
    .sort((a, b) => a.order - b.order);
}

/** 按知识库和 knowledgeId 对 chunks 分组，避免跨知识合并。 */
function groupScoredChunks(
  scoredChunks: ScoredKnowledgeChunk[]
): Map<string, Array<ScoredKnowledgeChunk & { order: number }>> {
  const groups = new Map<
    string,
    Array<ScoredKnowledgeChunk & { order: number }>
  >();

  scoredChunks.forEach((scoredChunk, order) => {
    const groupKey = getKnowledgeItemKey(scoredChunk.chunk);
    const group = groups.get(groupKey) ?? [];
    group.push({
      ...scoredChunk,
      order,
    });
    groups.set(groupKey, group);
  });

  return groups;
}

/** 将同一知识分组内的连续 chunkIndex 切成一个或多个 block。 */
function buildGroupBlocks(
  scoredChunks: Array<ScoredKnowledgeChunk & { order: number }>
): ContextBlock[] {
  const sortedChunks = [...scoredChunks].sort(
    (a, b) => a.chunk.chunkIndex - b.chunk.chunkIndex || a.order - b.order
  );
  const blocks: ContextBlock[] = [];
  let currentBlockChunks: Array<ScoredKnowledgeChunk & { order: number }> = [];

  for (const scoredChunk of sortedChunks) {
    const previousChunk = currentBlockChunks.at(-1)?.chunk;
    const isContinuous =
      previousChunk &&
      scoredChunk.chunk.chunkIndex === previousChunk.chunkIndex + 1;

    if (currentBlockChunks.length > 0 && !isContinuous) {
      blocks.push(createContextBlock(currentBlockChunks));
      currentBlockChunks = [];
    }

    currentBlockChunks.push(scoredChunk);
  }

  if (currentBlockChunks.length > 0) {
    blocks.push(createContextBlock(currentBlockChunks));
  }

  return blocks;
}

/** 把一组连续 chunks 合并为单个可打包的 context block。 */
function createContextBlock(
  scoredChunks: Array<ScoredKnowledgeChunk & { order: number }>
): ContextBlock {
  const primaryChunk = getPrimaryScoredChunk(scoredChunks);
  const chunks = scoredChunks.map((item) => item.chunk);
  const chunkIds = chunks.map((chunk) => chunk.id);
  const sourceChunkIds = getSourceChunkIds(chunks);
  const metadata = mergeMetadata(primaryChunk.chunk.metadata, {
    ...primaryChunk.contextMetadata,
    knowledgeItemId: primaryChunk.chunk.knowledgeId,
    sourceChunkIds,
    mergedChunkIds: chunkIds,
    chunkIndexRange: {
      start: chunks[0].chunkIndex,
      end: chunks[chunks.length - 1].chunkIndex,
    },
    merged: chunks.length > 1,
  });

  return {
    id: primaryChunk.chunk.id,
    knowledgeBaseId: primaryChunk.chunk.knowledgeBaseId,
    knowledgeId: primaryChunk.chunk.knowledgeId,
    title: primaryChunk.chunk.title,
    content: mergeChunkContents(chunks),
    chunkType: primaryChunk.chunk.chunkType,
    score: primaryChunk.score,
    categoryId: primaryChunk.chunk.categoryId,
    tagIds: primaryChunk.chunk.tagIds,
    metadata,
    referenceChunks: chunks,
    order: Math.min(...scoredChunks.map((item) => item.order)),
  };
}

/** 选出 block 中 score 最高的 chunk 作为标题、类型和主 chunkId 来源。 */
function getPrimaryScoredChunk(
  scoredChunks: Array<ScoredKnowledgeChunk & { order: number }>
): ScoredKnowledgeChunk & { order: number } {
  return scoredChunks.reduce((bestChunk, scoredChunk) => {
    if (scoredChunk.score !== bestChunk.score) {
      return scoredChunk.score > bestChunk.score ? scoredChunk : bestChunk;
    }

    return scoredChunk.order < bestChunk.order ? scoredChunk : bestChunk;
  }, scoredChunks[0]);
}

/** 合并连续 chunk 文本，并去掉相邻文本之间的最大重叠片段。 */
function mergeChunkContents(chunks: KnowledgeChunk[]): string {
  return chunks.reduce((content, chunk) => {
    if (!content) return chunk.content;
    return appendContentWithoutOverlap(content, chunk.content);
  }, "");
}

/** 将下一段文本追加到已有文本后，并只保留一份重叠内容。 */
function appendContentWithoutOverlap(
  previousContent: string,
  nextContent: string
): string {
  const overlapLength = findMaxOverlapLength(previousContent, nextContent);

  if (overlapLength >= MIN_OVERLAP_CHARS) {
    return previousContent + nextContent.slice(overlapLength);
  }

  const separator =
    previousContent.endsWith("\n") || nextContent.startsWith("\n") ? "" : "\n\n";
  return `${previousContent}${separator}${nextContent}`;
}

/** 查找前一段尾部和后一段头部之间的最大完全重叠长度。 */
function findMaxOverlapLength(
  previousContent: string,
  nextContent: string
): number {
  const maxLength = Math.min(previousContent.length, nextContent.length);

  for (let length = maxLength; length >= MIN_OVERLAP_CHARS; length -= 1) {
    if (previousContent.endsWith(nextContent.slice(0, length))) {
      return length;
    }
  }

  return 0;
}

/** 收集合并 block 可追踪的所有源 chunk IDs。 */
function getSourceChunkIds(chunks: KnowledgeChunk[]): string[] {
  const sourceChunkIds = chunks.flatMap((chunk) => [
    chunk.id,
    ...(chunk.sourceChunkIds ?? []),
  ]);

  return Array.from(new Set(sourceChunkIds));
}

/** 为同一个 context block 的所有来源 chunk 生成可追踪 reference。 */
function buildReferences(refId: string, block: ContextBlock): RagReference[] {
  const referencesByChunkId = new Map<string, RagReference>();

  for (const chunk of block.referenceChunks) {
    appendReference(referencesByChunkId, refId, chunk, chunk.id);

    for (const sourceChunkId of chunk.sourceChunkIds ?? []) {
      appendReference(referencesByChunkId, refId, chunk, sourceChunkId);
    }
  }

  return Array.from(referencesByChunkId.values());
}

/** 将一个 chunkId 追加到 reference map 中，已存在时保持首次来源。 */
function appendReference(
  referencesByChunkId: Map<string, RagReference>,
  refId: string,
  chunk: KnowledgeChunk,
  chunkId: string
) {
  if (referencesByChunkId.has(chunkId)) return;

  referencesByChunkId.set(chunkId, {
    refId,
    knowledgeBaseId: chunk.knowledgeBaseId,
    knowledgeId: chunk.knowledgeId,
    chunkId,
    title: chunk.title,
    chunkType: chunk.chunkType,
  });
}

/** 生成知识分组 key，当前项目中 knowledgeId 对应知识条目 ID。 */
function getKnowledgeItemKey(chunk: KnowledgeChunk): string {
  return `${chunk.knowledgeBaseId}:${chunk.knowledgeId}`;
}

/** 合并 chunk 原始 metadata 和本次检索临时标记。 */
function mergeMetadata(
  chunkMetadata: Record<string, unknown> | undefined,
  contextMetadata: Record<string, unknown> | undefined
) {
  if (!contextMetadata) return chunkMetadata;

  return {
    ...(chunkMetadata ?? {}),
    ...contextMetadata,
  };
}
