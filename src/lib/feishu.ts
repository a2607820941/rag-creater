/**
 * 飞书 Open API 客户端
 *
 * 用于获取飞书文档/表格/多维表格/会议纪要内容，导入到知识库管线。
 * 需要配置环境变量:
 *   FEISHU_APP_ID
 *   FEISHU_APP_SECRET
 */

const BASE_URL = "https://open.feishu.cn/open-apis";

// ── 飞书 API 响应类型 ──────────────────────────────────

interface AuthResult {
  code?: number;
  msg?: string;
  tenant_access_token?: string;
}

interface DocxDocument {
  title?: string;
}

interface DocxContentData {
  content?: string;
}

interface WikiNode {
  obj_token?: string;
  obj_type?: string;
  title?: string;
}

interface SheetMeta {
  sheet_id?: string;
  title?: string;
  row_count?: number;
  column_count?: number;
}

interface SpreadsheetMeta {
  spreadsheet?: { title?: string };
}

interface BitableAppMeta {
  app?: { title?: string };
}

interface BitableTable {
  table_id?: string;
  name?: string;
}

interface BitableRecord {
  fields?: Record<string, unknown>;
}

interface BitableRecordsPage {
  items?: BitableRecord[];
  has_more?: boolean;
  page_token?: string;
}

// ── 飞书文档类型 ────────────────────────────────────────

/** 飞书可导入的文档类型 */
export type FeishuDocType =
  | "docx"
  | "wiki"
  | "docs"
  | "sheets"
  | "bitable"
  | "minutes"
  | "unknown";

const DOC_TYPE_LABEL: Partial<Record<FeishuDocType, string>> = {
  docx: "文档",
  wiki: "知识库",
  docs: "旧版文档",
  sheets: "电子表格",
  bitable: "多维表格",
  minutes: "会议纪要",
};

/** URL 解析结果 */
export type FeishuUrlInfo = {
  isFeishu: boolean;
  docType: FeishuDocType;
  token: string;
  rawUrl: string;
};

// ── URL 识别 ────────────────────────────────────────────

/**
 * 识别并解析飞书链接。
 *
 * 支持格式:
 *   https://{tenant}.feishu.cn/docx/{docToken}      — 新版文档
 *   https://{tenant}.feishu.cn/wiki/{wikiNodeToken}  — 知识库
 *   https://{tenant}.feishu.cn/docs/{docToken}       — 旧版文档
 *   https://{tenant}.feishu.cn/sheets/{sheetToken}   — 电子表格
 *   https://{tenant}.feishu.cn/bitable/{appToken}    — 多维表格
 *   https://{tenant}.feishu.cn/minutes/{minuteToken} — 会议纪要
 */
export function identifyFeishuUrl(input: string): FeishuUrlInfo {
  const path = input.trim().split("?")[0];
  const result: FeishuUrlInfo = {
    isFeishu: false,
    docType: "unknown",
    token: "",
    rawUrl: input.trim(),
  };

  if (!/feishu\.cn/i.test(path)) return result;
  result.isFeishu = true;

  const patterns: [RegExp, FeishuDocType][] = [
    [/docx\/([a-zA-Z0-9]+)/, "docx"],
    [/wiki\/([a-zA-Z0-9]+)/, "wiki"],
    [/docs\/([a-zA-Z0-9]+)/, "docs"],
    [/sheets\/([a-zA-Z0-9]+)/, "sheets"],
    [/bitable\/([a-zA-Z0-9]+)/, "bitable"],
    [/minutes\/([a-zA-Z0-9]+)/, "minutes"],
  ];

  for (const [regex, type] of patterns) {
    const match = path.match(regex);
    if (match) {
      result.docType = type;
      result.token = match[1];
      return result;
    }
  }

  return result;
}

// ── 入口 ────────────────────────────────────────────────

/**
 * 获取飞书文档/表格/多维表格/会议纪要的纯文本内容。
 *
 * 1. 解析 URL 识别文档类型
 * 2. 按类型调用对应的 API 获取内容
 * 3. wiki 链接先解析节点，根据 obj_type 自动路由
 * 4. 未知路径尝试从 URL 末尾提取 token 兜底
 */
export async function fetchFeishuDocContent(
  urlOrId: string,
): Promise<{ title: string; content: string }> {
  const accessToken = await authenticate();

  const info = identifyFeishuUrl(urlOrId);
  if (!info.isFeishu) throw new Error("无效的飞书链接");

  if (info.docType === "unknown") {
    return fetchByUrlFallback(info.rawUrl, accessToken);
  }

  switch (info.docType) {
    case "sheets":
      return fetchSheetContent(info.token, accessToken);
    case "bitable":
      return fetchBitableContent(info.token, accessToken);
    case "wiki":
      return fetchWikiContent(info.token, accessToken);
    case "minutes":
      return fetchMinutesContent(info.token, accessToken);
    default:
      return fetchDocxContent(info.token, accessToken);
  }
}

// ── 鉴权 ────────────────────────────────────────────────

async function authenticate(): Promise<string> {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  if (!appId || !appSecret) throw new Error("未配置飞书应用凭证");

  const res = await fetch(`${BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  if (!res.ok) throw new Error(`飞书鉴权失败: ${res.status}`);

  const data: AuthResult = await res.json();
  if (data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`飞书鉴权失败: ${data.msg ?? "unknown"}`);
  }
  return data.tenant_access_token;
}

// ── URL 兜底 ────────────────────────────────────────────

async function fetchByUrlFallback(
  rawUrl: string,
  accessToken: string,
): Promise<{ title: string; content: string }> {
  const lastSeg = rawUrl.replace(/\/$/, "").split("/").pop() ?? "";
  if (/^[a-zA-Z0-9]{20,}$/.test(lastSeg)) {
    try {
      return await fetchDocxContent(lastSeg, accessToken);
    } catch {
      // fall through
    }
  }
  throw new Error("不支持的飞书链接");
}

// ── docx 文档 ──────────────────────────────────────────

async function fetchDocxContent(
  documentId: string,
  accessToken: string,
  knownTitle?: string,
): Promise<{ title: string; content: string }> {
  let title = knownTitle ?? "未命名文档";

  if (!knownTitle) {
    const res = await fetch(`${BASE_URL}/docx/v1/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const data: { data?: { document?: DocxDocument } } = await res.json();
      if (data.data?.document?.title) title = data.data.document.title;
    }
  }

  const contentRes = await fetch(
    `${BASE_URL}/docx/v1/documents/${documentId}/raw_content`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!contentRes.ok) {
    if (contentRes.status === 403) throw new Error("飞书 API 权限不足");
    throw new Error(`获取文档失败 (${contentRes.status})`);
  }

  const contentData: { data?: DocxContentData } = await contentRes.json();
  const content = contentData.data?.content ?? "";
  if (!content.trim()) throw new Error("文档内容为空");

  return { title, content };
}

// ── wiki 知识库 ────────────────────────────────────────

async function fetchWikiContent(
  wikiToken: string,
  accessToken: string,
): Promise<{ title: string; content: string }> {
  const res = await fetch(
    `${BASE_URL}/wiki/v2/spaces/get_node?token=${wikiToken}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data: { code?: number; data?: { node?: WikiNode } } = await res.json();

  const node = data.data?.node;
  const objToken = node?.obj_token;
  if (!objToken) {
    throw new Error("解析飞书 wiki 节点失败");
  }
  const nodeTitle = node?.title;
  switch (node?.obj_type) {
    case "docx":
      return fetchDocxContent(objToken, accessToken, nodeTitle ?? undefined);
    case "sheet":
      return fetchSheetContent(objToken, accessToken);
    case "bitable":
      return fetchBitableContent(objToken, accessToken);
    default:
      throw new Error(`不支持导入此 wiki 节点 (${node?.obj_type})`);
  }
}

// ── 会议纪要（妙记） ──────────────────────────────────

async function fetchMinutesContent(
  minuteToken: string,
  accessToken: string,
): Promise<{ title: string; content: string }> {
  const infoRes = await fetch(`${BASE_URL}/minutes/v1/minutes/${minuteToken}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!infoRes.ok) throw new Error("获取妙记失败");
  const infoData: { data?: { title?: string } } = await infoRes.json();
  const title = infoData.data?.title ?? "未命名会议纪要";

  const transcriptRes = await fetch(
    `${BASE_URL}/minutes/v1/minutes/${minuteToken}/transcript?need_speaker=true&file_format=txt`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!transcriptRes.ok) {
    if (transcriptRes.status === 403) throw new Error("飞书 API 权限不足");
    throw new Error(`获取转写失败 (${transcriptRes.status})`);
  }

  const content = await transcriptRes.text();
  if (!content.trim()) throw new Error("会议纪要内容为空");

  return { title, content };
}

// ── 电子表格 ──────────────────────────────────────────

async function fetchSheetContent(
  spreadsheetToken: string,
  accessToken: string,
): Promise<{ title: string; content: string }> {
  const infoRes = await fetch(
    `${BASE_URL}/sheets/v3/spreadsheets/${spreadsheetToken}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!infoRes.ok) throw new Error("获取电子表格失败");
  const infoData: SpreadsheetMeta = await infoRes.json();
  const title = infoData.spreadsheet?.title ?? "未命名表格";

  const sheetsRes = await fetch(
    `${BASE_URL}/sheets/v3/spreadsheets/${spreadsheetToken}/sheets/query`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!sheetsRes.ok) throw new Error("获取工作表失败");
  const sheetsData: { data?: { sheets?: SheetMeta[] } } = await sheetsRes.json();
  const sheets = sheetsData.data?.sheets ?? [];

  const parts: string[] = [];
  for (const sheet of sheets) {
    if (!sheet.sheet_id) continue;

    const rangeRes = await fetch(
      `${BASE_URL}/sheets/v2/spreadsheets/${spreadsheetToken}/values/${sheet.sheet_id}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!rangeRes.ok) continue;

    const rangeData: { data?: { valueRange?: { values?: unknown[][] } } } =
      await rangeRes.json();
    const values = rangeData.data?.valueRange?.values;
    if (!values || values.length === 0) continue;

    const rows = values.map((r) => r.map((c) => String(c ?? "")));
    const lines = [`## ${sheet.title ?? "工作表"}`];

    if (rows[0].length >= 2 && rows.length > 1) {
      const header = rows[0];
      const body = rows.slice(1);
      lines.push(
        `| ${header.join(" | ")} |`,
        `| ${header.map(() => "---").join(" | ")} |`,
        ...body.map((r) => `| ${r.join(" | ")} |`),
      );
    } else {
      lines.push(...rows.map((r) => r.join("\t")));
    }

    parts.push(lines.join("\n"));
  }

  const content = parts.join("\n\n");
  if (!content) throw new Error("表格内容为空");
  return { title, content };
}

// ── 多维表格 ──────────────────────────────────────────

async function fetchBitableContent(
  appToken: string,
  accessToken: string,
): Promise<{ title: string; content: string }> {
  const infoRes = await fetch(`${BASE_URL}/bitable/v1/apps/${appToken}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!infoRes.ok) throw new Error("获取多维表格失败");
  const infoData: { data?: BitableAppMeta } = await infoRes.json();
  const title = infoData.data?.app?.title ?? "未命名多维表格";

  const tablesRes = await fetch(`${BASE_URL}/bitable/v1/apps/${appToken}/tables`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!tablesRes.ok) throw new Error("获取数据表失败");
  const tablesData: { data?: { items?: BitableTable[] } } = await tablesRes.json();
  const tables = tablesData.data?.items ?? [];

  const parts: string[] = [];
  for (const table of tables) {
    const tableName = table.name ?? "未命名数据表";
    const fieldNames = new Set<string>();
    const records: string[][] = [];

    let pageToken: string | undefined;
    while (true) {
      const params = new URLSearchParams({ page_size: "500" });
      if (pageToken) params.set("page_token", pageToken);

      const recRes = await fetch(
        `${BASE_URL}/bitable/v1/apps/${appToken}/tables/${table.table_id}/records?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!recRes.ok) break;

      const recData: { data?: BitableRecordsPage } = await recRes.json();
      const items = recData.data?.items ?? [];
      for (const item of items) {
        const fields = item.fields ?? {};
        Object.keys(fields).forEach((k) => fieldNames.add(k));
        records.push(
          Object.keys(fields).map((k) => String(fields[k] ?? "")),
        );
      }

      if (!recData.data?.has_more) break;
      pageToken = recData.data?.page_token;
    }

    if (fieldNames.size === 0) continue;

    const names = [...fieldNames];
    const lines = [`## ${tableName}`];
    lines.push(
      `| ${names.join(" | ")} |`,
      `| ${names.map(() => "---").join(" | ")} |`,
      ...records.map((r) =>
        `| ${names.map((_, i) => r[i] ?? "").join(" | ")} |`,
      ),
    );
    parts.push(lines.join("\n"));
  }

  const content = parts.join("\n\n");
  if (!content) throw new Error("多维表格内容为空");
  return { title, content };
}
