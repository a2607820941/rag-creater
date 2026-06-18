# 知识笔记增强设计文档

## 1. 背景

当前知识笔记使用 Markdown 编辑器，笔记正文保存在 `DocumentSource.rawContent` 中。

当前链路为：

```text
NoteEditor 编辑 Markdown
  -> NoteFeature 本地 state: draftRawContent
  -> 点击保存
  -> PATCH /api/notes/[id]
  -> DocumentSource.rawContent
  -> parseDocument(noteId)
  -> 读取 DocumentSource.rawContent
  -> splitTextSemantic / splitTextIntoChunks
  -> DocumentChunk
  -> RAG 检索
```

当前问题是：如果 Markdown 中包含图片或附件引用，例如：

```md
![退款流程图](https://example.com/refund.png)
```

系统只会把这段 Markdown 语法作为普通文本保存，不会下载图片、识别图片内容，也不会把图片内容变成可检索文本。

## 2. 目标

新增“知识增强”能力，使知识笔记可以在不破坏原始 Markdown 的前提下，生成一个增强后的纯文本 Markdown 版本。

增强版本用于后续解析、切分和 RAG 检索。

目标效果：

```md
![退款流程图](https://example.com/refund.png)

> 知识增强：图片解析结果
> 原始资源：https://example.com/refund.png
> 文件类型：image/png
> 解析内容：该图片展示了用户提交退款申请、客服核验订单、审核处理和结果通知的流程。
```

## 3. 非目标

第一版不处理以下能力：

- 不支持本地相对路径附件，例如 `./images/a.png`，因为单篇笔记没有对应文件包。
- 不支持 zip 包解析。
- 不支持递归解析被引用 Markdown 中的资源。
- 不支持所有外部 URL 文件类型，第一版优先支持远程图片 URL。
- 不在前端直接解析 PDF、图片、Word 等文件。
- 不把增强结果只保存在前端 state 中作为最终知识源。

## 4. 当前代码事实

### 4.1 `DocumentSource` 当前没有 `content` 字段

当前 `prisma/schema.prisma` 中 `DocumentSource` 只有：

```prisma
rawContent String?
```

`content` 字段属于其他模型，例如 `DocumentChunk.content`。

因此不能把“原始笔记”直接存到 `DocumentSource.content`。如果要同时保存原文和增强文，需要新增字段。

### 4.2 笔记编辑器读取的是 `rawContent`

`NoteFeature` 当前通过 `getNoteDetail()` 加载笔记，然后写入：

```ts
setDraftRawContent(note?.rawContent ?? "");
```

编辑器展示的是 `draftRawContent`。

### 4.3 后端切分读取的是数据库内容

`parseDocument()` 对 `fileType === "note"` 的处理是：

```ts
rawContent = doc.rawContent ?? "";
```

因此后端解析/切分不直接读取前端 state，而是读取数据库里的 `DocumentSource.rawContent`。

结论：如果增强结果只保存在前端本地 state，不能形成 RAG 闭环。

## 5. 推荐设计

新增字段，将原始笔记和增强笔记分开存储。

```prisma
model DocumentSource {
  rawContent          String?   // 原始笔记内容，编辑器始终展示这个
  enhancedContent     String?   // 增强后的纯文本 Markdown，用于 RAG 解析
  enhancementEnabled  Boolean   @default(false)
  enhancedAt          DateTime?
}
```

字段语义：

- `rawContent`：用户原始 Markdown，前端编辑器始终展示和编辑这个字段。
- `enhancedContent`：后端根据 `rawContent` 生成的增强 Markdown。
- `enhancementEnabled`：是否在解析/切分时使用增强版本。
- `enhancedAt`：最近一次增强时间，用于展示和排查。

## 6. 闭环数据流

### 6.1 打开笔记

```text
GET /api/notes/[id]
  -> 返回 rawContent / enhancementEnabled / enhancedAt
  -> NoteEditor 始终展示 rawContent
```

前端不展示 `enhancedContent` 作为编辑内容，避免用户直接编辑增强结果导致原文和增强文混淆。

### 6.2 开启知识增强

```text
用户点击“开启知识增强”
  -> 保存当前 rawContent
  -> POST /api/notes/[id]/enhance
  -> 后端读取或接收最新 rawContent
  -> 扫描第一层 Markdown 资源
  -> 调用后端解析能力
  -> 生成 enhancedContent
  -> 写入 DocumentSource.enhancedContent
  -> 设置 enhancementEnabled = true
  -> 触发 parseDocument(id) 重新生成 chunks
```

### 6.3 关闭知识增强

```text
用户点击“关闭知识增强”
  -> PATCH /api/notes/[id]
  -> enhancementEnabled = false
  -> 触发 parseDocument(id) 重新用 rawContent 生成 chunks
```

关闭时不需要把原文“还给 rawContent”，因为原文一直保存在 `rawContent` 中。

### 6.4 保存笔记

如果增强关闭：

```text
保存 rawContent
  -> 不重新增强
```

如果增强开启：

```text
保存 rawContent
  -> 重新执行知识增强
  -> 更新 enhancedContent
  -> 重新 parseDocument(id)
  -> DocumentChunk 使用增强后的内容
```

这样可以保证用户编辑原始笔记后，增强版本和 RAG chunks 不会停留在旧内容。

### 6.5 解析/切分

`parseDocument()` 中 note 的内容选择逻辑改为：

```ts
const sourceContent =
  doc.enhancementEnabled && doc.enhancedContent
    ? doc.enhancedContent
    : doc.rawContent ?? "";
```

然后使用 `sourceContent` 继续执行：

```text
splitTextSemantic(sourceContent)
  -> splitTextIntoChunks(sourceContent)
  -> replaceTextChunksAndIndex()
```

注意：当前 `replaceTextChunksAndIndex()` 会把传入的 `options.rawContent` 写回 `DocumentSource.rawContent`。增强场景不能把 `enhancedContent` 覆盖到 `rawContent`，否则会破坏“编辑器始终展示原始 Markdown”的设计。

因此需要同步调整写回策略：

```ts
await replaceTextChunksAndIndex(id, chunks, {
  rawContent: doc.rawContent ?? "",
  preserveRawContent: isNote,
});
```

或者将函数改为更明确的语义：

```ts
replaceTextChunksAndIndex(documentSourceId, chunks, {
  nextRawContent?: string;
  updateRawContent?: boolean;
})
```

对普通上传文档，解析结果仍然需要写回 `rawContent`；对知识笔记，`rawContent` 由笔记编辑保存逻辑维护，parse 阶段只负责重建 chunks 和更新 `status/chunkCount/error`。

## 7. 后端 API 设计

### 7.1 增强接口

```text
POST /api/notes/[id]/enhance
```

请求体：

```ts
{
  rawContent?: string;
  enabled?: boolean;
  reparse?: boolean;
}
```

字段说明：

- `rawContent`：可选。传入当前前端草稿，避免数据库里的内容不是最新版本。
- `enabled`：可选。默认 `true`，用于开启增强。
- `reparse`：可选。默认 `true`，增强完成后是否重新生成 chunks。若目标是让增强内容参与 RAG，必须保持为 `true`。

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
  }
}
```

### 7.2 普通更新接口扩展

`PATCH /api/notes/[id]` 支持：

```ts
{
  rawContent?: string;
  enhancementEnabled?: boolean;
}
```

当 `enhancementEnabled` 从 `true` 改为 `false` 时，后端只切换开关，不删除 `enhancedContent`。这样再次开启时可以选择复用旧增强结果或重新增强。

第一版建议每次开启都重新增强，保证内容新鲜。

## 8. Markdown 资源解析策略

第一版只解析 Markdown 图片语法：

```md
![alt](https://example.com/a.png)
```

解析步骤：

```text
1. 扫描 Markdown 中的图片引用。
2. 记录引用在原文中的位置。
3. 校验 URL 协议，只允许 http/https。
4. 下载资源，限制大小和超时。
5. 根据 Content-Type 或 URL 后缀判断文件类型。
6. 如果是项目支持的图片类型，调用 parseFileContent(buffer, imageType)。
7. 将解析结果插入原引用后方。
8. 单个资源解析失败时，不中断整篇笔记增强。
```

插入格式：

```md
> 知识增强：图片解析结果
> 原始资源：{url}
> 文件类型：{mimeType}
> 解析内容：{parsedText}
```

失败格式：

```md
> 知识增强：资源解析失败
> 原始资源：{url}
> 原因：{error}
```

## 9. 安全与限制

外部 URL 下载需要控制风险：

- 只允许 `http:` 和 `https:`。
- 限制单个资源大小，例如 10MB。
- 设置请求超时，例如 10 秒。
- 禁止跟随过多重定向。
- 后续如进入生产环境，需要增加 SSRF 防护，例如禁止内网 IP、localhost、metadata 地址。
- 增强只解析第一层资源，不递归解析资源中的二级引用。

## 10. 前端设计

### 10.1 编辑器展示

编辑器始终展示原始内容：

```ts
<NoteEditor value={draftRawContent} />
```

不展示 `enhancedContent`，避免用户误编辑增强文本。

### 10.2 Topbar 控件

在 `NoteTopbar` 增加一个“知识增强”开关或按钮。

推荐 UI：

```text
[知识增强：开/关] [保存] [新建] [删除]
```

状态：

```ts
enhancementEnabled: boolean;
enhancing: boolean;
enhancedAt: string | null;
```

### 10.3 保存逻辑

伪代码：

```ts
async function saveCurrentNote() {
  const updatedNote = await updateNote(activeNote.id, {
    title: normalizedTitle,
    rawContent: draftRawContent,
  });

  if (updatedNote.enhancementEnabled) {
    await enhanceNote(activeNote.id, {
      rawContent: draftRawContent,
      reparse: true,
    });
  }

  await reloadNoteDetail(activeNote.id);
}
```

注意：增强逻辑放后端执行，前端只负责触发和展示状态。

## 11. 服务层设计

新增服务：

```text
src/features/note/server/note-enhancement-service.ts
```

核心函数：

```ts
enhanceNoteService(params: {
  id: string;
  rawContent?: string;
  enabled?: boolean;
  reparse?: boolean;
})
```

职责：

```text
1. 校验 note 是否存在。
2. 获取最新 rawContent。
3. 扫描 Markdown 第一层资源。
4. 下载并解析资源。
5. 生成 enhancedContent。
6. 更新 DocumentSource.enhancedContent / enhancementEnabled / enhancedAt。
7. 如果 reparse=true，调用 parseDocument(id) 重新生成 chunks。
8. 返回增强摘要。
```

## 12. 数据闭环检查

本方案形成闭环，原因如下：

```text
用户编辑的是 rawContent
  -> rawContent 持久化到 DocumentSource
  -> 开启增强时生成 enhancedContent
  -> enhancementEnabled 控制解析使用 rawContent 还是 enhancedContent
  -> parseDocument 根据开关选择内容
  -> replaceTextChunksAndIndex 生成 DocumentChunk
  -> RAG 检索读取 DocumentChunk
```

关闭增强时：

```text
enhancementEnabled = false
  -> parseDocument 回退到 rawContent
  -> 重新生成 chunks
  -> RAG 不再使用增强内容
```

保存原文且增强开启时：

```text
rawContent 更新
  -> enhanceNoteService 重新生成 enhancedContent
  -> parseDocument 重新生成 chunks
  -> RAG 使用最新增强内容
```

因此不会出现“前端有增强文本，但后端 RAG 仍使用旧数据”的断链问题。

## 13. 待实现文件

预计需要修改：

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

修改 Prisma schema 后需要执行：

```bash
npm run db:generate
npm run db:push
```

## 14. 风险

- 外部图片 URL 下载存在安全风险，需要限制协议、大小和超时。
- 视觉模型或 OCR 失败时，需要保留失败标记而不是中断整篇笔记。
- 增强后重新 parse 会覆盖当前 note 的 text chunks，需要确保这是用户预期。
- 如果增强耗时较长，前端需要显示 `enhancing` 状态。
- 当前项目已有中文编码乱码问题，新增文案时需要确认文件编码为 UTF-8。

## 15. 第一版验收标准

- 笔记编辑器始终显示原始 Markdown。
- 可开启/关闭知识增强。
- 开启增强后，后端生成并保存 `enhancedContent`。
- 开启增强后解析笔记时使用 `enhancedContent`。
- 关闭增强后解析笔记时使用 `rawContent`。
- 保存原始笔记后，如果增强开启，会重新生成增强内容。
- Markdown 图片 URL 能被解析并在增强内容中插入说明文本。
- 单个图片解析失败不会导致整篇笔记增强失败。
