import { batchEmbedTexts, cosineSimilarity } from "@/lib/embedding";
import { splitTextIntoChunks, type TextChunk } from "@/lib/text-splitter";

/**
 * ## 语义分段 —— TextTiling 山谷检测 + 细粒度拆句
 *
 * ### 算法选型理由
 *
 * 常见语义分段方案有三类：
 *
 * | 方案 | 代表实现 | 核心思想 | 细粒度拆句适用？ |
 * |------|---------|---------|:---:|
 * | 百分位阈值 | LangChain/LlamaIndex 默认 | sim < P_N 分位 → 断点 | ✗ |
 * | 固定相似度阈值 | SemChunk | sim < 0.5~0.7 → 断点 | △ |
 * | TextTiling 山谷检测 | Hearst 1997 | 局部极小值 + 谷深足够 → 断点 | ✅ |
 *
 * 百分位阈值在细粒度拆句（句子级 + 换行级）背景下有结构性缺陷：
 * 无论文档是否均质，总强制切除约 N% 的边界。当 90% 以上相邻句对是
 * 同段落内的连贯句子（sim ∈ [0.85, 0.98]），分位法仍会在此区间内切出
 * 大量假断点，把连贯段落切碎。
 *
 * TextTiling 的核心优势在于"有谷才切"——同段落内相似度曲线是平坦高原，
 * 不出山谷 → 不出断点。仅真正的语义切换处（"断崖式下跌"）才切断。
 * 这使其天然适配细粒度拆句的场景。
 *
 * ### 流水线
 *
 * 1. normalizeStructure — 标题前插空行，构造结构边界
 * 2. splitSentences — 按 \n + 。！？细粒度拆句，保留偏移量（Frag.start/end）
 * 3. batchEmbedTexts — DashScope text-embedding-v4 向量化
 * 4. 滑动窗口相似度 — radius=2 低通滤波，消除单句噪声
 * 5. 三层断点：
 *    a. 绝对兜底: sim < 0.45 → 强制断点
 *    b. TextTiling: 局部极小值 + 谷深 ≥ max(0.7×σ, 0.04)
 *    c. 标题强制: 结构标记强制切断
 * 6. 最小长度保护 + 最大句数强制切断
 * 7. 后处理：合并小段 + 超大段二次切分
 *
 * 失败返回 null，调用方自动退回机械分段。
 */
const WINDOW_RADIUS = 2;
const MIN_SEGMENT_CHARS = 150;
const MIN_SEGMENT_SENTENCES = 3;
const MAX_SEGMENT_SENTENCES = 15;
const ABSOLUTE_BREAK = 0.45;
const PEAK_WINDOW = 3;
const MIN_DEPTH = 0.04;
const DEPTH_SIGMA = 0.7;
const MERGE_MIN_CHARS = 100;

/** 标题特征：Markdown #、中文"第X章/节"、【任意内容】、中文数字编号 */
const HEADER_PATTERN =
  /^(?:#{1,6}\s|第[一二三四五六七八九十百千万\d]+[章节]|【[^】]+】|[一二三四五六七八九十]+[、.]\s*\S)/;

const IMAGE_FRAGMENT = /^\[Image\s+\d+:/i;

const ISOLATED_PREFIX =
  /^\s*(?:\d+[.\)、]\s*|[a-zA-Z][.)]\s*|[一二三四五六七八九十]+[、.]\s*|[-•·①-⑳]\s*)$/;

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
 * 细粒度拆句 + 语义合并的二级切分。
 * 失败时返回 null，调用方退回机械切分。
 */
interface Frag {
  text: string;
  start: number;
  end: number;
}

export async function splitTextSemantic(
  text: string,
  maxChunkSize = 1000
): Promise<TextChunk[] | null> {
  try {
    const normalized = normalizeStructure(text);
    const sentences = splitSentences(normalized);
    if (sentences.length <= 1) return null;

    const sentenceTexts = sentences.map((s) => s.text);
    const results = await batchEmbedTexts(sentenceTexts);

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

    // TextTiling 山谷检测：在相似度曲线上找局部极小值，仅谷深足够时切断。
    // 相比百分位阈值，山谷检测基于局部结构而非全局排名。
    const avg = similarities.reduce((a, b) => a + b, 0) / similarities.length;
    const variance =
      similarities.reduce((s, v) => s + (v - avg) ** 2, 0) /
      similarities.length;
    const stddev = Math.sqrt(variance);
    const depthThreshold = Math.max(DEPTH_SIGMA * stddev, MIN_DEPTH);

    // TextTiling 山谷检测：局部极小值 + 谷深足够 → 断点
    const breakpoints = new Set<number>();
    for (let i = 0; i < similarities.length; i++) {
      // 绝对兜底：话题渐变时可能没有山谷
      if (similarities[i] < ABSOLUTE_BREAK) {
        breakpoints.add(i + 1);
        continue;
      }

      // 须严格小于左右邻居
      if (i > 0 && similarities[i] >= similarities[i - 1]) continue;
      if (
        i < similarities.length - 1 &&
        similarities[i] >= similarities[i + 1]
      )
        continue;

      // 谷深 = (左侧峰顶 + 右侧峰顶) / 2 - 谷底
      const leftStart = Math.max(0, i - PEAK_WINDOW);
      const rightEnd = Math.min(similarities.length - 1, i + PEAK_WINDOW);
      const leftPeak = Math.max(...similarities.slice(leftStart, i));
      const rightPeak = Math.max(
        ...similarities.slice(i + 1, rightEnd + 1)
      );
      const depth = (leftPeak + rightPeak) / 2 - similarities[i];

      if (depth >= depthThreshold) {
        breakpoints.add(i + 1);
      }
    }
    for (let i = 0; i < sentences.length - 1; i++) {
      if (isHeaderFrag(sentences[i + 1])) {
        breakpoints.add(i + 1);
      }
    }

    const segments: Frag[] = [];
    let segStart = 0;
    let currentSentenceCount = 0;

    for (let i = 0; i < sentences.length; i++) {
      const frag = sentences[i];
      if (currentSentenceCount === 0) segStart = frag.start;
      currentSentenceCount++;

      const atBreakpoint = breakpoints.has(i + 1);
      const isLast = i === sentences.length - 1;
      const nextIsHeader =
        !isLast && isHeaderFrag(sentences[i + 1]);

      if (
        atBreakpoint ||
        isLast ||
        currentSentenceCount >= MAX_SEGMENT_SENTENCES
      ) {
        const segEnd = frag.end;
        const segText = normalized.substring(segStart, segEnd);

        const meetsMin =
          nextIsHeader ||
          segText.trim().length >= MIN_SEGMENT_CHARS ||
          currentSentenceCount >= MIN_SEGMENT_SENTENCES;

        if (
          meetsMin ||
          isLast ||
          currentSentenceCount >= MAX_SEGMENT_SENTENCES
        ) {
          if (segText.trim()) {
            segments.push({
              text: segText.trim(),
              start: segStart,
              end: segEnd,
            });
          }
          currentSentenceCount = 0;
        }
        // 不满足最小长度 → 拒绝切分，继续累积
      }
    }

    const merged = mergeSmallSegments(segments);

    // 超长 segment 二次切分
    const allChunks: TextChunk[] = [];
    for (const seg of merged) {
      const segChunks = splitTextIntoChunks(seg.text, { maxChunkSize });
      for (const c of segChunks) {
        allChunks.push({
          content: c.content,
          charStart: seg.start + c.charStart,
          charEnd: seg.start + c.charEnd,
        });
      }
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

function isHeaderFrag(f: Frag): boolean {
  return HEADER_PATTERN.test(f.text.trim());
}

function mergeSmallSegments(segments: Frag[]): Frag[] {
  if (segments.length <= 1) return segments;

  const result: Frag[] = [];
  let i = 0;

  while (i < segments.length) {
    const seg = segments[i];

    if (seg.text.length >= MERGE_MIN_CHARS || i === segments.length - 1) {
      result.push(seg);
      i++;
      continue;
    }

    const prevLen = i > 0 ? result[result.length - 1].text.length : Infinity;
    const nextLen = segments[i + 1].text.length;

    if (prevLen <= nextLen && i > 0) {
      // 合并到前一段
      const prev = result[result.length - 1];
      result[result.length - 1] = {
        text: prev.text + "\n" + seg.text,
        start: prev.start,
        end: seg.end,
      };
    } else {
      // 合并到后一段
      const next = segments[i + 1];
      result.push({
        text: seg.text + "\n" + next.text,
        start: seg.start,
        end: next.end,
      });
      i++; // 跳过被合并的后一段
    }
    i++;
  }

  return result;
}

/**
 * 合并被句末标点拆碎的图片描述片段，保留原始偏移量。
 */
function mergeImageDescriptions(sentences: Frag[]): Frag[] {
  const result: Frag[] = [];
  let buf: Frag[] = [];
  let inImage = false;

  for (const s of sentences) {
    const trimmed = s.text.trim();
    if (IMAGE_FRAGMENT.test(trimmed)) {
      if (inImage && buf.length > 0) {
        result.push(joinFrags(buf));
      }
      buf = [s];
      inImage = !trimmed.endsWith("]");
    } else if (inImage) {
      buf.push(s);
      if (trimmed.endsWith("]")) {
        inImage = false;
        result.push(joinFrags(buf));
        buf = [];
      }
    } else {
      result.push(s);
    }
  }

  if (buf.length > 0) {
    result.push(joinFrags(buf));
  }

  return result;
}

function mergeTableBlocks(sentences: Frag[]): Frag[] {
  const result: Frag[] = [];
  let tableBuffer: Frag[] = [];

  for (const s of sentences) {
    if (isTableRow(s.text)) {
      tableBuffer.push(s);
    } else {
      if (tableBuffer.length > 0) {
        result.push(joinFrags(tableBuffer));
        tableBuffer = [];
      }
      result.push(s);
    }
  }
  if (tableBuffer.length > 0) {
    result.push(joinFrags(tableBuffer));
  }

  return result;
}

function joinFrags(frags: Frag[]): Frag {
  return {
    text: frags.map((f) => f.text).join("\n"),
    start: frags[0].start,
    end: frags[frags.length - 1].end,
  };
}

/**
 * 拆句：按 \n + 句末标点细粒度切分，返回的 Frag 保留原文偏移量。
 */
function splitSentences(text: string): Frag[] {
  const lines = splitLinesWithPos(text);
  const raw = splitSentenceParts(lines, text);
  const merged = mergeIsolatedPrefixes(raw);
  const mergedImg = mergeImageDescriptions(merged);
  return mergeTableBlocks(mergedImg);
}

function splitLinesWithPos(text: string): Frag[] {
  const result: Frag[] = [];
  let searchPos = 0;
  for (const raw of text.split(/\n/)) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    const idx = text.indexOf(trimmed, searchPos);
    if (idx === -1) continue;
    result.push({ text: trimmed, start: idx, end: idx + trimmed.length });
    searchPos = idx + trimmed.length;
  }
  return result;
}

function splitSentenceParts(lines: Frag[], text: string): Frag[] {
  const result: Frag[] = [];
  for (const line of lines) {
    const parts = line.text
      .split(/(?<=[。！？])\s*/u)
      .flatMap((s) =>
        s.split(/(?<!\d)(?<=[.!?])\s*(?=[A-Z一-鿿])/u)
      )
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    let search = line.start;
    for (const p of parts) {
      const idx = text.indexOf(p, search);
      if (idx === -1) continue;
      result.push({ text: p, start: idx, end: idx + p.length });
      search = idx + p.length;
    }
  }
  return result;
}

function mergeIsolatedPrefixes(frags: Frag[]): Frag[] {
  const result: Frag[] = [];
  for (let i = 0; i < frags.length; i++) {
    if (
      ISOLATED_PREFIX.test(frags[i].text) &&
      i + 1 < frags.length
    ) {
      result.push({
        text: frags[i].text + frags[i + 1].text,
        start: frags[i].start,
        end: frags[i + 1].end,
      });
      i++;
    } else {
      result.push(frags[i]);
    }
  }
  return result;
}
