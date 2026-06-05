import { RAG_CONFIG } from "@/server/services/rag/config";
import type { ScoredKnowledgeChunk } from "@/server/services/rag/context-builder";
import type { KnowledgeChunk, RetrievalMode } from "@/features/rag/types";

type AdjacentDirection = "previous" | "next";

type AdjacentCandidate = {
  chunk: KnowledgeChunk;
  distance: number;
};

/**
 * 邻近 chunk 扩展模块。
 *
 * 职责：
 * 1. 以 MMR 选出的 anchor chunk 为中心补充前后文。
 * 2. 只从已通过 scope/status 过滤的 chunk 集合中取邻居。
 * 3. 按 chunk.id 去重，避免邻近片段重复占用上下文。
 */
export function expandWithAdjacentChunks(
  anchors: ScoredKnowledgeChunk[],
  scopedChunks: KnowledgeChunk[],
  mode: RetrievalMode
): ScoredKnowledgeChunk[] {
  const windowSize = RAG_CONFIG.adjacentWindowByMode[mode];
  const maxExtraChunks = RAG_CONFIG.maxAdjacentExtraChunksByMode[mode];

  if (
    !RAG_CONFIG.adjacentExpansionEnabled ||
    windowSize <= 0 ||
    maxExtraChunks <= 0 ||
    anchors.length === 0
  ) {
    return anchors;
  }

  const chunksById = new Map(scopedChunks.map((chunk) => [chunk.id, chunk]));
  const chunksByKnowledgeAndIndex = buildKnowledgeIndex(scopedChunks);
  const anchorIds = new Set(anchors.map((anchor) => anchor.chunk.id));
  const includedIds = new Set<string>();
  const expanded: ScoredKnowledgeChunk[] = [];
  let extraChunkCount = 0;

  for (const anchor of anchors) {
    appendChunk(expanded, includedIds, anchor);

    for (const adjacent of getAdjacentChunks(
      anchor.chunk,
      windowSize,
      chunksById,
      chunksByKnowledgeAndIndex
    )) {
      if (extraChunkCount >= maxExtraChunks) break;
      if (anchorIds.has(adjacent.chunk.id)) continue;

      const appended = appendChunk(expanded, includedIds, {
        chunk: adjacent.chunk,
        score: getAdjacentScore(anchor.score, adjacent.distance),
      });

      if (appended) {
        extraChunkCount += 1;
      }
    }
  }

  return expanded;
}

function buildKnowledgeIndex(
  chunks: KnowledgeChunk[]
): Map<string, KnowledgeChunk> {
  const chunksByKnowledgeAndIndex = new Map<string, KnowledgeChunk>();

  for (const chunk of chunks) {
    chunksByKnowledgeAndIndex.set(getKnowledgeIndexKey(chunk), chunk);
  }

  return chunksByKnowledgeAndIndex;
}

function getAdjacentChunks(
  anchor: KnowledgeChunk,
  windowSize: number,
  chunksById: Map<string, KnowledgeChunk>,
  chunksByKnowledgeAndIndex: Map<string, KnowledgeChunk>
): AdjacentCandidate[] {
  return [
    ...collectDirectionChunks(
      anchor,
      "previous",
      windowSize,
      chunksById,
      chunksByKnowledgeAndIndex
    ),
    ...collectDirectionChunks(
      anchor,
      "next",
      windowSize,
      chunksById,
      chunksByKnowledgeAndIndex
    ),
  ];
}

function collectDirectionChunks(
  anchor: KnowledgeChunk,
  direction: AdjacentDirection,
  windowSize: number,
  chunksById: Map<string, KnowledgeChunk>,
  chunksByKnowledgeAndIndex: Map<string, KnowledgeChunk>
): AdjacentCandidate[] {
  const adjacentChunks: AdjacentCandidate[] = [];
  const visitedIds = new Set([anchor.id]);
  let currentChunk = anchor;

  for (let distance = 1; distance <= windowSize; distance += 1) {
    const nextChunk = findAdjacentChunk(
      currentChunk,
      direction,
      chunksById,
      chunksByKnowledgeAndIndex
    );

    if (
      !nextChunk ||
      nextChunk.knowledgeId !== anchor.knowledgeId ||
      visitedIds.has(nextChunk.id)
    ) {
      break;
    }

    adjacentChunks.push({
      chunk: nextChunk,
      distance,
    });
    visitedIds.add(nextChunk.id);
    currentChunk = nextChunk;
  }

  return adjacentChunks;
}

function findAdjacentChunk(
  chunk: KnowledgeChunk,
  direction: AdjacentDirection,
  chunksById: Map<string, KnowledgeChunk>,
  chunksByKnowledgeAndIndex: Map<string, KnowledgeChunk>
): KnowledgeChunk | undefined {
  const linkedId =
    direction === "previous" ? chunk.prevChunkId : chunk.nextChunkId;
  const linkedChunk = linkedId ? chunksById.get(linkedId) : undefined;

  if (linkedChunk && linkedChunk.knowledgeId === chunk.knowledgeId) {
    return linkedChunk;
  }

  const offset = direction === "previous" ? -1 : 1;
  return chunksByKnowledgeAndIndex.get(
    getKnowledgeIndexKey({
      knowledgeId: chunk.knowledgeId,
      chunkIndex: chunk.chunkIndex + offset,
    })
  );
}

function appendChunk(
  chunks: ScoredKnowledgeChunk[],
  includedIds: Set<string>,
  scoredChunk: ScoredKnowledgeChunk
): boolean {
  if (includedIds.has(scoredChunk.chunk.id)) return false;

  chunks.push(scoredChunk);
  includedIds.add(scoredChunk.chunk.id);
  return true;
}

function getAdjacentScore(anchorScore: number, distance: number): number {
  return Number(
    (anchorScore * RAG_CONFIG.adjacentScoreDecay ** distance).toFixed(4)
  );
}

function getKnowledgeIndexKey(
  chunk: Pick<KnowledgeChunk, "knowledgeId" | "chunkIndex">
) {
  return `${chunk.knowledgeId}:${chunk.chunkIndex}`;
}
