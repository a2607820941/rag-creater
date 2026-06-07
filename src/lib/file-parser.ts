import mammoth from "mammoth";
import jschardet from "jschardet";
import iconv from "iconv-lite";
import * as XLSX from "xlsx";

const ALLOWED_TYPES = [
  "txt", "md", "csv", "xlsx", "doc", "docx", "pdf",
  "ppt", "pptx", "png", "jpg", "jpeg", "webp", "bmp",
  "note",
] as const;
export type AllowedFileType = (typeof ALLOWED_TYPES)[number];
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export interface DocImage {
  index: number;
  buffer: Buffer;
  mimeType: string;
  placeholder: string;
}

const ENCODING_FALLBACKS = ["GBK", "GB2312", "BIG5", "SHIFT_JIS"];

function decodeTextBuffer(buffer: Buffer): string {
  // Detect encoding
  const detected = jschardet.detect(buffer);
  const encoding = detected.encoding?.toUpperCase() ?? "";

  // Try detected encoding first (if confidence is reasonable)
  if (encoding && detected.confidence && detected.confidence >= 0.5) {
    try {
      return iconv.decode(buffer, encoding);
    } catch {
      // fall through to UTF-8
    }
  }

  // Try UTF-8
  const utf8Result = buffer.toString("utf-8");
  // Check for replacement characters indicating decoding failure
  if (!utf8Result.includes("�")) {
    return utf8Result;
  }

  // Try common encodings for Chinese documents
  for (const enc of ENCODING_FALLBACKS) {
    try {
      const result = iconv.decode(buffer, enc);
      if (!result.includes("�")) {
        return result;
      }
    } catch {
      // skip
    }
  }

  // Last resort: return UTF-8 result even if it has replacement chars
  return utf8Result;
}

export function validateFileType(
  fileType: string
): fileType is AllowedFileType {
  return ALLOWED_TYPES.includes(fileType as AllowedFileType);
}

export function getFileTypeFromName(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? null;
  if (!ext || !validateFileType(ext)) return null;
  return ext;
}

// ── CSV/表格 Markdown 格式化 ──────────────────────────

const MAX_TABLE_COLS_MARKDOWN = 5;

/**
 * Convert mammoth HTML output to Markdown with proper pipe tables.
 * mammoth's convertToMarkdown does NOT output pipe tables for most Word tables
 * (cells with <w:p> wrappers become separate paragraphs). We use HTML output
 * instead and convert <table> elements ourselves.
 */
function mammothHtmlToMarkdown(html: string): string {
  // 1. Convert <table> elements to Markdown pipe tables
  // Using [\s\S] instead of "." with "s" flag for broader TS target compat
  let result = html.replace(
    /<table>([\s\S]*?)<\/table>/g,
    (_, tableContent: string) => {
      const rows: string[][] = [];
      for (const rowMatch of tableContent.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
        const cells: string[] = [];
        for (const cellMatch of rowMatch[1].matchAll(/<td>([\s\S]*?)<\/td>/g)) {
          // Extract text from <p> tags inside <td>, join multi-paragraph cells
          const cellText = cellMatch[1]
            .replace(/<p>([\s\S]*?)<\/p>/g, (_: string, p: string) => p + "\n")
            .trim();
          cells.push(cellText);
        }
        if (cells.length > 0) rows.push(cells);
      }
      if (rows.length === 0) return "";
      return rowsToMarkdownTable(rows) + "\n\n";
    }
  );

  // 2. Convert <p> tags to plain text paragraphs
  result = result.replace(/<p>([\s\S]*?)<\/p>/g, "$1\n\n");

  // 3. Clean up: remove excessive blank lines, but keep paragraph separators
  result = result.replace(/\n{4,}/g, "\n\n\n");

  return result.trim();
}

/**
 * Format table rows. Wide tables (>5 cols) use key-value per row;
 * narrow tables use Markdown grid.
 */
function rowsToMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const colCount = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => {
    const p = [...r];
    while (p.length < colCount) p.push("");
    return p;
  });

  const header = padded[0];
  const body = padded.slice(1);

  if (colCount > MAX_TABLE_COLS_MARKDOWN) {
    // Wide table → key-value rows
    const kvRows = body.map((row) =>
      header.map((h, i) => `${h}: ${row[i].trim()}`).join("  |  ")
    );
    return kvRows.map((r) => "| " + r + " |").join("\n");
  }

  const divider = header.map(() => "---");
  const fmtRow = (cells: string[]) =>
    "| " + cells.map((c) => c.trim()).join(" | ") + " |";

  const lines = [fmtRow(header), fmtRow(divider)];
  for (const row of body) {
    lines.push(fmtRow(row));
  }
  return lines.join("\n");
}

/**
 * Heuristic: a block of CSV lines likely IS a table if:
 * - ≥2 rows, ≥2 columns, consistent column count
 * - average cell length ≤ 40 (long prose cells aren't table data)
 */
function isTableBlock(rows: string[][]): boolean {
  if (rows.length < 2) return false;
  const colCounts = rows.map((r) => r.length);
  const allSameCols = colCounts.every((c) => c === colCounts[0]);
  if (!allSameCols || colCounts[0] < 2) return false;

  let totalLen = 0;
  let cellCount = 0;
  for (const row of rows) {
    for (const cell of row) {
      totalLen += cell.length;
      cellCount++;
    }
  }
  const avgLen = totalLen / Math.max(1, cellCount);
  return avgLen <= 40;
}

function parseCSVText(text: string): string {
  const lines = text.split(/\r?\n/);
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);

  const parts: string[] = [];
  let tableIndex = 0;

  for (const block of blocks) {
    const rows = block.map((line) => {
      const cells: string[] = [];
      let cell = "";
      let inQuote = false;
      for (const ch of line) {
        if (ch === '"') {
          inQuote = !inQuote;
        } else if (ch === "," && !inQuote) {
          cells.push(cell);
          cell = "";
        } else {
          cell += ch;
        }
      }
      cells.push(cell);
      return cells;
    });

    if (isTableBlock(rows)) {
      tableIndex++;
      parts.push(`**表 ${tableIndex}**`);
      parts.push(rowsToMarkdownTable(rows));
    } else {
      parts.push(block.join("\n"));
    }
  }

  return parts.join("\n\n");
}

/**
 * Fill cells covered by XLSX merge ranges so no cell is left empty.
 */
function fillMergedCells(rows: string[][], merges?: XLSX.Range[]): void {
  if (!merges || merges.length === 0) return;

  for (const merge of merges) {
    const sr = merge.s.r;
    const sc = merge.s.c;
    const er = merge.e.r;
    const ec = merge.e.c;

    if (sr >= rows.length) continue;
    const sourceVal = (rows[sr]?.[sc] ?? "").trim();
    if (!sourceVal) continue;

    for (let r = sr; r <= er && r < rows.length; r++) {
      for (let c = sc; c <= ec; c++) {
        if (r === sr && c === sc) continue;
        while (rows[r].length <= c) rows[r].push("");
        if (rows[r][c].trim() === "") {
          rows[r][c] = sourceVal;
        }
      }
    }
  }
}

function parseXlsxSheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  sheetCount: number
): string {
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const merges = sheet["!merges"] as XLSX.Range[] | undefined;

  const rows: string[][] = raw.map((row) =>
    row.map((cell) =>
      cell === undefined || cell === null ? "" : String(cell)
    )
  );

  fillMergedCells(rows, merges);

  const blocks: string[][][] = [];
  let current: string[][] = [];

  for (const row of rows) {
    if (row.every((c) => c.trim() === "")) {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
    } else {
      current.push(row);
    }
  }
  if (current.length > 0) blocks.push(current);

  const parts: string[] = [];
  if (sheetCount > 1) parts.push(`### ${sheetName}`);

  for (let i = 0; i < blocks.length; i++) {
    const blockRows = blocks[i];
    if (blockRows.length >= 2) {
      const colCount = Math.max(...blockRows.map((r) => r.length));
      if (colCount >= 2) {
        if (blocks.length > 1) parts.push(`**表 ${i + 1}**`);
        parts.push(rowsToMarkdownTable(blockRows));
        continue;
      }
    }
    parts.push(blockRows.map((r) => r.join("  ")).join("\n"));
  }

  return parts.join("\n\n");
}

export async function parseFileContent(
  buffer: Buffer,
  fileType: AllowedFileType,
  onImage?: (img: DocImage) => void
): Promise<string> {
  switch (fileType) {
    case "txt":
    case "md":
      return decodeTextBuffer(buffer);

    case "csv": {
      const text = decodeTextBuffer(buffer);
      return parseCSVText(text);
    }

    case "xlsx": {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const parts: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        parts.push(
          parseXlsxSheet(sheet, sheetName, workbook.SheetNames.length)
        );
      }

      return parts.join("\n\n");
    }

    case "docx": {
      const images: { idx: number; buffer: Buffer; mimeType: string; placeholder: string }[] = [];

      // Use convertToHtml to preserve table structure, then convert to
      // Markdown ourselves. mammoth's convertToMarkdown falls back to
      // paragraph-per-cell for most Word tables (any cell with <w:p>).
      const htmlResult = await mammoth.convertToHtml(
        { buffer },
        {
          convertImage: mammoth.images.imgElement(
            async (image: { contentType: string; readAsBuffer: () => Promise<Buffer> }) => {
              const idx = images.length;
              const placeholder = `__DOCX_IMAGE_${idx}__`;
              const imgBuffer = await image.readAsBuffer();
              images.push({ idx, buffer: imgBuffer, mimeType: image.contentType, placeholder });
              return { src: placeholder };
            }
          ),
        }
      );

      let text = mammothHtmlToMarkdown(htmlResult.value);

      // Replace image placeholders with Vision API descriptions synchronously
      if (images.length > 0) {
        const { chatWithVision } = await import("@/lib/ai-extract");
        const { IMAGE_DESCRIPTION_PROMPT } = await import("@/lib/prompts/extraction");
        const descs = await Promise.all(images.map(async (img) => {
          try {
            const desc = await chatWithVision(img.buffer, img.mimeType, IMAGE_DESCRIPTION_PROMPT);
            return { placeholder: img.placeholder, text: `[Image ${img.idx + 1}: ${desc.slice(0, 500)}]` };
          } catch {
            return { placeholder: img.placeholder, text: `[Image ${img.idx + 1}: could not describe]` };
          }
        }));
        for (const d of descs) {
          text = text.replace(`![](${d.placeholder})`, d.text);
        }
      }

      return text;
    }

    case "pdf": {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });

      const textResult = await parser.getText({ pageJoiner: "" });

      let tableResult = null;
      try { tableResult = await parser.getTable(); } catch { /* non-fatal */ }

      let imageResult = null;
      try { imageResult = await parser.getImage({ imageThreshold: 0 }); } catch { /* non-fatal */ }

      const pageTables = new Map();
      if (tableResult?.pages) {
        for (const p of tableResult.pages) pageTables.set(p.num, p.tables);
      }
      const pageImages = new Map();
      if (imageResult?.pages) {
        for (const p of imageResult.pages) pageImages.set(p.pageNumber, p.images);
      }

      // Describe images synchronously before chunking
      let imgIdx = 0;
      const imgDescs = new Map<number, string[]>();
      if (imageResult && imageResult.total > 0) {
        type PendingImg = { pageNum: number; buf: Buffer; mime: string };
        const allImgs: PendingImg[] = [];
        for (const page of imageResult.pages) {
          for (const img of page.images) {
            if (!img.data) continue;
            const mimeMatch = img.dataUrl?.match(/data:(image\/[^;]+);/);
            allImgs.push({ pageNum: page.pageNumber, buf: Buffer.from(img.data), mime: mimeMatch?.[1] ?? "image/png" });
          }
        }

        if (allImgs.length > 0) {
          const { chatWithVision } = await import("@/lib/ai-extract");
          const { IMAGE_DESCRIPTION_PROMPT } = await import("@/lib/prompts/extraction");
          const results = await Promise.all(allImgs.map(async (img, i) => {
            const num = imgIdx + i + 1;
            try {
              const desc = await chatWithVision(img.buf, img.mime, IMAGE_DESCRIPTION_PROMPT);
              return `[Image ${num}: ${desc.slice(0, 500)}]`;
            } catch {
              return `[Image ${num}: could not describe]`;
            }
          }));

          for (let i = 0; i < results.length; i++) {
            const pageNum = allImgs[i].pageNum;
            if (!imgDescs.has(pageNum)) imgDescs.set(pageNum, []);
            imgDescs.get(pageNum)!.push(results[i]);
            imgIdx++;
          }
        }
      }

      // Build output page by page
      const parts: string[] = [];
      for (const page of textResult.pages) {
        parts.push(page.text);

        const tables = pageTables.get(page.num);
        if (tables) {
          for (let t = 0; t < tables.length; t++) {
            const table = tables[t];
            if (table && table.length >= 2) {
              parts.push(`**Page ${page.num} Table ${t + 1}**\n\n${rowsToMarkdownTable(table)}`);
            }
          }
        }

        const descs = imgDescs.get(page.num);
        if (descs) parts.push(...descs);
      }

      await parser.destroy();
      return parts.join("\n");
    }

    case "doc": {
      const wordExtractor = await import("word-extractor");
      const WordExtractor = (wordExtractor as unknown as { default: new () => { extract: (buf: Buffer) => Promise<{ getBody: () => string }> } }).default;
      const extractor = new WordExtractor();
      const doc = await extractor.extract(buffer);
      return doc.getBody();
    }

    case "pptx": {
      const jszip = await import("jszip");
      const JSZip = jszip.default;
      const zip = await JSZip.loadAsync(buffer);

      const slideFiles = Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
        .sort((a, b) => {
          const numA = parseInt(a.match(/\d+/)![0], 10);
          const numB = parseInt(b.match(/\d+/)![0], 10);
          return numA - numB;
        });

      let imageIdx = 0;
      const parts: string[] = [];
      for (let i = 0; i < slideFiles.length; i++) {
        const slideNum = slideFiles[i].match(/\d+/)![0];
        const xmlContent = await zip.files[slideFiles[i]].async("text");
        const texts = [...xmlContent.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)];
        const slideText = texts.map((m) => m[1]).join("").trim();
        if (slideText) {
          parts.push(`## Slide ${i + 1}\n\n${slideText}`);
        } else {
          // Slide has no text but may have images — keep a header
          parts.push(`## Slide ${i + 1}`);
        }

        // Extract and describe slide images synchronously
        {
          const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
          const relsFile = zip.files[relsPath];
          if (relsFile) {
            const relsXml = await relsFile.async("text");
            const blips = [...xmlContent.matchAll(/<a:blip[^>]*r:embed="([^"]*)"[^>]*>/g)];
            if (blips.length > 0) {
              const relMap = new Map<string, string>();
              for (const [, relId, target] of relsXml.matchAll(
                /<Relationship[^>]*Id="([^"]*)"[^>]*Target="([^"]*)"[^>]*\/>/g
              )) {
                relMap.set(relId, target);
              }

              type SlideImg = { buf: Buffer; mime: string; idx: number };
              const imgs: SlideImg[] = [];
              for (const [, embedId] of blips) {
                const target = relMap.get(embedId);
                if (!target) continue;
                const mediaPath = target.startsWith("../media/")
                  ? `ppt/media/${target.replace("../media/", "")}`
                  : `ppt/media/${target}`;
                const mediaFile = zip.files[mediaPath];
                if (!mediaFile) continue;
                const ext = target.split(".").pop()?.toLowerCase() ?? "png";
                imgs.push({
                  idx: imageIdx++,
                  buf: await mediaFile.async("nodebuffer") as Buffer,
                  mime: ext === "jpg" || ext === "jpeg" ? "image/jpeg"
                    : ext === "webp" ? "image/webp"
                    : ext === "bmp" ? "image/bmp"
                    : "image/png",
                });
              }

              if (imgs.length > 0) {
                const { chatWithVision } = await import("@/lib/ai-extract");
                const { IMAGE_DESCRIPTION_PROMPT } = await import("@/lib/prompts/extraction");
                const results = await Promise.all(imgs.map(async (img) => {
                  try {
                    const desc = await chatWithVision(img.buf, img.mime, IMAGE_DESCRIPTION_PROMPT);
                    return `[Image ${img.idx + 1}: ${desc.slice(0, 500)}]`;
                  } catch {
                    return `[Image ${img.idx + 1}: could not describe]`;
                  }
                }));
                parts.push(...results);
              }
            }
          }
        }
      }

      // Also extract speaker notes
      const notesFiles = Object.keys(zip.files)
        .filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(name))
        .sort((a, b) => {
          const numA = parseInt(a.match(/\d+/)![0], 10);
          const numB = parseInt(b.match(/\d+/)![0], 10);
          return numA - numB;
        });

      for (const notesFile of notesFiles) {
        const xmlContent = await zip.files[notesFile].async("text");
        const texts = [...xmlContent.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)];
        const notesText = texts.map((m) => m[1]).join("").trim();
        if (notesText) {
          const slideNum = notesFile.match(/\d+/)![0];
          parts.push(`## Slide ${slideNum} Notes\n\n${notesText}`);
        }
      }

      return parts.join("\n\n") || "[PPTX: No text content found]";
    }

    case "ppt": {
      throw new Error(
        "旧的 .ppt 格式暂不支持，请将文件转换为 .pptx 格式后重新上传。"
      );
    }

    case "png":
    case "jpg":
    case "jpeg":
    case "webp":
    case "bmp": {
      const mime = fileType === "jpg" ? "image/jpeg" : `image/${fileType}`;
      try {
        const { chatWithVision } = await import("@/lib/ai-extract");
        const { IMAGE_DESCRIPTION_PROMPT } = await import(
          "@/lib/prompts/extraction"
        );
        return await chatWithVision(buffer, mime, IMAGE_DESCRIPTION_PROMPT);
      } catch {
        // 多模态失败，兜底 OCR
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("chi_sim+eng");
        try {
          const base64 = buffer.toString("base64");
          const dataUrl = `data:${mime};base64,${base64}`;
          const { data } = await worker.recognize(dataUrl);
          const text = data.text.trim();
          return text || "[图片无法识别]";
        } finally {
          await worker.terminate();
        }
      }
    }

    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}
