import { batchEmbedTexts, cosineSimilarity } from "@/lib/embedding";
import { splitTextIntoChunks, type TextChunk } from "@/lib/text-splitter";

const WINDOW_RADIUS = 2;
const MIN_SEGMENT_CHARS = 150;
const MIN_SEGMENT_SENTENCES = 3;

/** 标题特征：Markdown #、中文"第X章/节"、【任意内容】、中文数字编号（一、/ 二. 等） */
const HEADER_PATTERN =
  /^(?:#{1,6}\s|第[一二三四五六七八九十百千万\d]+[章节]|【[^】]+】|[一二三四五六七八九十]+[、.]\s*\S)/;

/**
 * 判断句子是否为标题/章节开头，应该作为新段的起始。
 */
function isHeaderSentence(s: string): boolean {
  return HEADER_PATTERN.test(s.trim());
}

/** 在标题/章节标记前插入空行，让段落拆句能正确识别结构边界 */
function normalizeStructure(text: string): string {
  return text
    // ## 标题
    .replace(/(^|[^\n])(#{1,6}\s)/gm, "$1\n\n$2")
    // 第X章/节
    .replace(/(^|[^\n])(第[一二三四五六七八九十百千万\d]+[章节])/gm, "$1\n\n$2")
    // 【任意内容】
    .replace(/(^|[^\n])(【[^】]+】)/gm, "$1\n\n$2")
    // 中文数字编号（一、二、三、...），、后面可带空格也可不带
    .replace(/(^|[^\n])([一二三四五六七八九十]+[、.]\s*\S)/gm, "$1\n\n$2");
}

/**
 * 基于 Markdown 语义块与标题前瞻的二级切分：
 * 1. 结构化预处理（标题前插换行）
 * 2. 拆句 + 合并孤立序号
 * 3. 批量向量化
 * 4. 滑动窗口 + 标题强制切断
 * 5. 动态百分位阈值 + 绝对相似度兜底
 * 6. 最小长度保护拼接（标题切断不受最小长度限制）
 * 7. 超长 segment 二次切分
 * 失败时返回 null，调用方退回机械切分。
 */
export async function splitTextSemantic(
  text: string,
  maxChunkSize = 2000
): Promise<TextChunk[] | null> {
  try {
    const normalized = normalizeStructure(text);
    const sentences = splitSentences(normalized);
    if (sentences.length <= 1) return null;

    const results = await batchEmbedTexts(sentences);

    // 滑动窗口相似度
    const similarities: number[] = [];
    for (let i = 0; i < results.length - 1; i++) {
      const leftStart = Math.max(0, i - WINDOW_RADIUS + 1);
      const leftEnd = i + 1;
      const rightStart = i + 1;
      const rightEnd = Math.min(results.length, i + 1 + WINDOW_RADIUS);

      const leftEmbeddings = results
        .slice(leftStart, leftEnd)
        .map((r) => r.embedding);
      const rightEmbeddings = results
        .slice(rightStart, rightEnd)
        .map((r) => r.embedding);

      const leftAvg = avgEmbedding(leftEmbeddings);
      const rightAvg = avgEmbedding(rightEmbeddings);
      similarities.push(cosineSimilarity(leftAvg, rightAvg));
    }

    if (similarities.length === 0) return null;

    // 动态阈值：30% 分位
    const sorted = [...similarities].sort((a, b) => a - b);
    const dynamicThreshold = sorted[Math.floor(sorted.length * 0.3)];

    // 语义断点 + 标题强制切断
    const breakpoints = new Set<number>();
    for (let i = 0; i < similarities.length; i++) {
      if (similarities[i] < dynamicThreshold) {
        breakpoints.add(i + 1);
      }
    }
    // 标题前瞻：下一句是标题时，强制在当前位置切断，让标题成为下一段开头
    for (let i = 0; i < sentences.length - 1; i++) {
      if (isHeaderSentence(sentences[i + 1])) {
        breakpoints.add(i + 1);
      }
    }

    // 最小长度保护拼接（标题断点不受限制）
    const segments: string[] = [];
    let current = "";
    let currentSentenceCount = 0;

    for (let i = 0; i < sentences.length; i++) {
      current += sentences[i];
      currentSentenceCount++;

      const atBreakpoint = breakpoints.has(i + 1);
      const isLast = i === sentences.length - 1;
      const nextIsHeader = !isLast && isHeaderSentence(sentences[i + 1]);

      if (atBreakpoint || isLast) {
        const meetsMin =
          nextIsHeader || // 标题强制切，不检查最小长度
          current.trim().length >= MIN_SEGMENT_CHARS ||
          currentSentenceCount >= MIN_SEGMENT_SENTENCES;

        if (meetsMin || isLast) {
          if (current.trim()) segments.push(current);
          current = "";
          currentSentenceCount = 0;
        }
        // 不满足最小长度 → 拒绝切分
      }
    }

    // 超长 segment 二次切分
    const allChunks: TextChunk[] = [];
    let offset = 0;
    for (const seg of segments) {
      const segChunks = splitTextIntoChunks(seg, { maxChunkSize });
      for (const c of segChunks) {
        allChunks.push({
          content: c.content,
          charStart: offset + c.charStart,
          charEnd: offset + c.charEnd,
        });
      }
      offset += seg.length;
    }

    return allChunks.length > 0 ? allChunks : null;
  } catch {
    return null;
  }
}

function avgEmbedding(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];
  const dim = embeddings[0].length;
  const avg = new Array(dim).fill(0);
  for (const emb of embeddings) {
    for (let j = 0; j < dim; j++) {
      avg[j] += emb[j];
    }
  }
  for (let j = 0; j < dim; j++) {
    avg[j] /= embeddings.length;
  }
  return avg;
}

function isTableRow(s: string): boolean {
  return /^\|.+\|$/.test(s.trim()) || /^\*\*表\s*\d+\*\*/.test(s.trim());
}

function mergeTableBlocks(sentences: string[]): string[] {
  const result: string[] = [];
  let tableBuffer: string[] = [];

  for (const s of sentences) {
    if (isTableRow(s)) {
      tableBuffer.push(s);
    } else {
      if (tableBuffer.length > 0) {
        result.push(tableBuffer.join("\n"));
        tableBuffer = [];
      }
      result.push(s);
    }
  }
  // flush remaining table at end
  if (tableBuffer.length > 0) {
    result.push(tableBuffer.join("\n"));
  }

  return result;
}

/**
 * 拆句策略（通用，不过拟合）：
 * 1. 先按空行（\n\n+）切成段落 — 这才是真正的结构边界
 * 2. 段落内长于 300 字的，按句末标点（。！？.!?）再拆分
 * 3. 单个 \n（换行不空行）保留在句子内部，不切断
 * 4. 合并孤立序号、合并表格块
 */
function splitSentences(text: string): string[] {
  // 第一步：按空行切段落
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);

  // 第二步：长段落按句末标点拆分
  const raw: string[] = [];
  for (const para of paragraphs) {
    if (para.length <= 300) {
      raw.push(para);
    } else {
      // 先按中文标点和换行切，再按英文句末切
      const sub = para
        .split(/(?<=[。！？])\s*/u)
        .flatMap((s) => s.split(/(?<!\d)(?<=[.!?])\s+(?=[A-Z一-鿿])/u))
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      raw.push(...sub);
    }
  }

  // 第三步：合并孤立序号前缀
  const merged: string[] = [];
  const ISOLATED_PREFIX =
    /^\s*(?:\d+[.\)、]\s*|[a-zA-Z][.)]\s*|[一二三四五六七八九十]+[、.]\s*|[-•·①-⑳]\s*)$/;

  for (let i = 0; i < raw.length; i++) {
    if (ISOLATED_PREFIX.test(raw[i]) && i + 1 < raw.length) {
      merged.push(raw[i] + raw[i + 1]);
      i++;
    } else {
      merged.push(raw[i]);
    }
  }

  // 第四步：合并表格块
  return mergeTableBlocks(merged);
}
