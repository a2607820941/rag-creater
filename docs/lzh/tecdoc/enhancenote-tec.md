# 知识笔记增强技术文档

## 1. 功能目标

在知识笔记页面增加“知识增强”能力。

知识增强的含义是：对笔记 Markdown 的第一层外部资源引用进行解析，例如图片引用、PDF、Word、文本、CSV、Excel 等常见文档链接，然后调用后端已有解析能力生成文本描述或抽取文本，将解析结果保存为增强版 Markdown。后续 RAG 解析和切分可以使用增强版内容，从而让图片和附件等非纯文本信息也能进入 `DocumentChunk` 并参与检索。

第一版目标：

- 编辑器始终展示用户原始 Markdown。
- 后端额外保存增强后的 Markdown。
- 开启增强时，RAG 解析使用增强内容。
- 关闭增强时，RAG 解析回退到原始内容。
- 保存原始笔记后，如果增强开启，则重新生成增强内容并重新生成 chunks。

## 2. 当前链路

当前知识笔记链路如下：

```text
NoteEditor
  -> NoteFeature 本地 state: draftRawContent
  -> updateNote()
  -> DocumentSource.rawContent
  -> parseDocument(noteId)
  -> 读取 DocumentSource.rawContent
  -> splitTextSemantic / splitTextIntoChunks
  -> DocumentChunk
  -> RAG 检索
```

关键事实：

- `DocumentSource` 当前没有 `content` 字段，只有 `rawContent`。
- 笔记编辑器读取和保存的是 `rawContent`。
- 后端 `parseDocument()` 不读取前端 state，只读取数据库中的 `DocumentSource.rawContent`。
- 因此增强内容如果只存在前端本地 state，不能进入 RAG 闭环。

## 3. 总体方案

新增增强字段，将原始笔记和增强笔记分开保存。

```prisma
model DocumentSource {
  rawContent          String?
  enhancedContent     String?
  enhancementEnabled  Boolean   @default(false)
  enhancedAt          DateTime?
}
```

字段含义：

- `rawContent`：用户原始 Markdown，编辑器始终展示和编辑这个字段。
- `enhancedContent`：后端生成的增强版 Markdown。
- `enhancementEnabled`：控制后续解析使用原文还是增强文。
- `enhancedAt`：最近一次增强时间。

这样可以避免用增强内容覆盖用户原始笔记。

## 4. 闭环设计

完整闭环如下：

```text
用户编辑 rawContent
  -> 保存 rawContent 到 DocumentSource
  -> 开启增强时生成 enhancedContent
  -> enhancementEnabled 控制 parseDocument 使用哪个版本
  -> parseDocument 重新生成 DocumentChunk
  -> RAG 检索读取 DocumentChunk
```

开启增强：

```text
保存当前 rawContent
  -> POST /api/notes/[id]/enhance
  -> 扫描 Markdown 内联资源引用
  -> 下载并解析受支持资源
  -> 生成 enhancedContent
  -> enhancementEnabled = true
  -> parseDocument(id)
  -> chunks 来自 enhancedContent
```

关闭增强：

```text
enhancementEnabled = false
  -> parseDocument(id)
  -> chunks 回退到 rawContent
```

保存笔记：

```text
保存 rawContent
  -> 如果 enhancementEnabled = true
       重新增强
       重新 parse
  -> 如果 enhancementEnabled = false
       只保存原文
```

该设计是闭环的，因为最终参与 RAG 的仍然是 `DocumentChunk`，而 `DocumentChunk` 会由后端根据当前开关重新生成。

## 5. 解析策略

当前版本处理远程或本地 HTTP URL 形式的 Markdown 内联资源：

```md
![alt](https://example.com/image.png)
[PDF资料](http://localhost:3000/uploads/note-demo/demo.pdf)
[文本资料](http://localhost:3000/uploads/note-demo/demo.txt)
```

支持类型：

```text
png / jpg / jpeg / webp / bmp
pdf / docx / txt / md / csv / xlsx
```

处理步骤：

```text
1. 扫描 Markdown 中的图片语法和普通链接语法。
2. 记录资源引用在原文中的位置。
3. 校验 URL，只允许 http/https。
4. 先根据 URL 后缀过滤可增强资源，普通网页链接保持原样。
5. 下载资源，限制大小和超时。
6. 根据 Content-Type 或 URL 后缀判断资源类型。
7. 调用现有 parseFileContent(buffer, fileType)。
8. 将解析结果插入原资源引用后方。
9. 单个受支持资源失败时写入失败说明，不中断整篇笔记。
```

插入格式：

```md
![退款流程图](https://example.com/refund.png)

> 知识增强：内联资源解析结果
> 原始资源：https://example.com/refund.png
> 文件类型：image/png
> 解析内容：该图片展示了退款申请、订单核验、审核处理和结果通知流程。
```

失败时：

```md
![退款流程图](https://example.com/refund.png)

> 知识增强：资源解析失败
> 原始资源：https://example.com/refund.png
> 原因：图片下载超时
```

## 6. 后端实现

### 6.1 新增服务

新增：

```text
src/features/note/server/note-enhancement-service.ts
```

核心函数：

```ts
export async function enhanceNoteService(params: {
  id: string;
  rawContent?: string;
  enabled?: boolean;
  reparse?: boolean;
}) {
  // 1. 校验 note 存在
  // 2. 使用 params.rawContent 或数据库 rawContent
  // 3. 扫描 Markdown 第一层内联资源引用
  // 4. 下载资源并调用 parseFileContent
  // 5. 生成 enhancedContent
  // 6. 写入 enhancedContent / enhancementEnabled / enhancedAt
  // 7. reparse=true 时调用 parseDocument(id)
}
```

### 6.2 新增 API

新增：

```text
POST /api/notes/[id]/enhance
```

请求：

```ts
{
  rawContent?: string;
  enabled?: boolean;
  reparse?: boolean;
}
```

响应：

```ts
{
  note: NoteDetail;
  enhancement: {
    enabled: boolean;
    enhancedAt: string | null;
    assetCount: number;
    successCount: number;
    failedCount: number;
    assets: Array<{
      source: string;
      type: string;
      status: "success" | "failed";
      insertedText?: string;
      error?: string;
    }>;
  };
}
```

### 6.3 扩展笔记更新接口

`PATCH /api/notes/[id]` 增加：

```ts
{
  enhancementEnabled?: boolean;
}
```

当关闭增强时，不删除 `enhancedContent`，只修改开关并重新 parse，使 chunks 回退到 `rawContent`。

## 7. parseDocument 兼容改造

当前 `parseDocument()` 对 note 的逻辑是：

```ts
rawContent = doc.rawContent ?? "";
```

需要改为：

```ts
const sourceContent =
  doc.fileType === "note" &&
  doc.enhancementEnabled &&
  doc.enhancedContent
    ? doc.enhancedContent
    : doc.rawContent ?? "";
```

然后用 `sourceContent` 切分 chunks。

特别注意：当前 `replaceTextChunksAndIndex()` 会把传入的 `options.rawContent` 写回 `DocumentSource.rawContent`。增强场景不能把 `enhancedContent` 写回 `rawContent`，否则编辑器会被增强文本污染。

建议改造为：

```ts
replaceTextChunksAndIndex(documentSourceId, chunks, {
  nextRawContent?: string;
  updateRawContent?: boolean;
})
```

调用规则：

```text
普通上传文档：
  updateRawContent = true
  nextRawContent = 解析结果

知识笔记：
  updateRawContent = false
  只更新 status / chunkCount / error / chunks
```

这是兼容性的关键点。

## 8. 前端实现

### 8.1 类型扩展

扩展 `NoteSummary` / `NoteDetail`：

```ts
export type NoteSummary = {
  enhancementEnabled: boolean;
  enhancedAt: string | null;
};

export type NoteDetail = NoteSummary & {
  rawContent: string | null;
};
```

前端不需要拿 `enhancedContent` 作为编辑器内容。第一版可以不返回完整 `enhancedContent`，避免前端误展示或误编辑。

### 8.2 NoteTopbar 增加控件

增加“知识增强”开关：

```text
[知识增强 开/关] [保存] [新建] [删除]
```

新增 props：

```ts
enhancementEnabled: boolean;
enhancing: boolean;
onEnhancementEnabledChange: (enabled: boolean) => void;
```

### 8.3 NoteFeature 状态

新增状态：

```ts
const [enhancementEnabled, setEnhancementEnabled] = React.useState(false);
const [enhancing, setEnhancing] = React.useState(false);
const [enhancedAt, setEnhancedAt] = React.useState<string | null>(null);
```

加载笔记时同步：

```ts
setDraftRawContent(note.rawContent ?? "");
setEnhancementEnabled(note.enhancementEnabled);
setEnhancedAt(note.enhancedAt);
```

编辑器仍然使用：

```tsx
<NoteEditor value={draftRawContent} />
```

### 8.4 保存逻辑

保存时：

```ts
async function saveCurrentNote() {
  const updated = await updateNote(activeNote.id, {
    title: normalizedTitle,
    rawContent: draftRawContent,
  });

  if (updated.enhancementEnabled) {
    await enhanceNote(activeNote.id, {
      rawContent: draftRawContent,
      enabled: true,
      reparse: true,
    });
  }

  await loadNoteDetail(activeNote.id);
}
```

开启增强：

```ts
async function enableEnhancement() {
  await saveCurrentNote();
  await enhanceNote(activeNote.id, {
    rawContent: draftRawContent,
    enabled: true,
    reparse: true,
  });
  await loadNoteDetail(activeNote.id);
}
```

关闭增强：

```ts
async function disableEnhancement() {
  await updateNote(activeNote.id, {
    enhancementEnabled: false,
  });
  await parseNoteAgain(activeNote.id); // 可复用 enhance 接口的 enabled=false + reparse=true
  await loadNoteDetail(activeNote.id);
}
```

实现时可以让 `POST /api/notes/[id]/enhance` 同时支持 `enabled=false`，内部只关闭开关并 reparse，避免新增额外 API。

## 9. 可行性检查

### 9.1 后端解析能力可复用

项目已有：

```ts
parseFileContent(buffer, fileType)
```

对图片类型会优先调用视觉模型，失败时兜底 OCR：

```text
png / jpg / jpeg / webp / bmp
  -> chatWithVision
  -> tesseract.js OCR fallback
```

因此当前版本支持图片和常见文档资源增强是可行的。

### 9.2 数据模型可扩展

`DocumentSource` 是统一文档来源模型，给它增加增强字段不会破坏现有关系：

```text
DocumentSource
  -> DocumentChunk
  -> RAG 检索
```

旧文档的默认值：

```text
enhancementEnabled = false
enhancedContent = null
enhancedAt = null
```

因此现有上传文档、普通笔记、RAG 解析默认仍使用 `rawContent`。

### 9.3 前端状态不复杂

编辑器继续只管理 `draftRawContent`，增强内容不进入编辑器显示状态，因此不会引入双编辑源冲突。

### 9.4 闭环成立

闭环成立的必要条件：

- 增强结果必须持久化到 `enhancedContent`。
- `parseDocument()` 必须根据 `enhancementEnabled` 选择内容。
- 开启/关闭增强后必须重新生成 chunks。
- 保存原文后，如果增强开启，必须重新增强并重新 parse。
- parse 阶段不能把增强内容覆盖到 `rawContent`。

本方案覆盖以上条件。

## 10. 兼容性检查

### 10.1 对普通上传文档兼容

普通上传文档不设置 `enhancementEnabled`，仍走原流程：

```text
parseFileContent(file)
  -> rawContent
  -> chunks
```

### 10.2 对已有笔记兼容

已有笔记迁移后默认：

```text
enhancementEnabled = false
```

所以编辑、保存、解析都继续使用 `rawContent`。

### 10.3 对 RAG 检索兼容

RAG 不需要知道增强逻辑。它仍然读取 `DocumentChunk`。增强只改变 chunks 的生成来源，不改变 RAG 查询接口。

### 10.4 对编辑器兼容

编辑器仍然展示 `rawContent`，不会展示 `enhancedContent`，所以不会改变用户编辑体验。

### 10.5 需要小心的兼容点

`replaceTextChunksAndIndex()` 当前会写回 `rawContent`。必须改造，否则增强 parse 会污染原始笔记。

## 11. 安全限制

远程资源下载必须限制：

- 只允许 `http:` 和 `https:`。
- 单个资源大小限制，建议 10MB。
- 请求超时，建议 10 秒。
- 限制重定向次数。
- 后续生产环境应增加 SSRF 防护，禁止内网 IP、localhost、metadata 地址。
- 第一版只解析第一层资源，不递归解析。

## 12. 第一版验收标准

- 笔记编辑器始终显示原始 Markdown。
- 数据库中保存 `rawContent` 和 `enhancedContent` 两份内容。
- 开启增强后，远程图片和常见文档引用能生成解析说明。
- 开启增强后，`parseDocument()` 使用 `enhancedContent` 生成 chunks。
- 关闭增强后，`parseDocument()` 使用 `rawContent` 生成 chunks。
- 保存原文且增强开启时，会重新增强并重新生成 chunks。
- 单个受支持资源解析失败不会导致整篇笔记增强失败。
- 普通上传文档和未开启增强的笔记行为不变。

## 13. 需要修改的文件

```text
prisma/schema.prisma
src/features/note/types.ts
src/features/note/api.ts
src/features/note/index.tsx
src/features/note/components/note-topbar.tsx
src/features/note/server/schemas.ts
src/features/note/server/note-service.ts
src/features/note/server/note-enhancement-service.ts
src/app/api/notes/[id]/enhance/route.ts
src/server/services/document.service.ts
```

修改 Prisma schema 后执行：

```bash
npm run db:generate
npm run db:push
```
