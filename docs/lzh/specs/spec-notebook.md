# SPEC：知识笔记模块基础编辑闭环

## 1. 模块目标

本规范用于定义 `知识笔记` 模块第一阶段功能。知识笔记是用户在系统内直接创建和编辑的 Markdown 文档，页面入口为后台左侧 Sidebar 中 `知识库` 父级下的子导航 `知识笔记`。

本阶段目标：

- 点击左侧 Sidebar `知识笔记` 进入 `/notes` 页面。
- `/notes` 页面在管理后台布局内渲染，不脱离 Header、Sidebar 和 Main Content。
- 页面支持 Markdown 文本编辑和预览。
- 页面支持插入 Markdown 图片地址，图片地址作为 Markdown 文本保存在 `rawContent`。
- 页面支持文档目录初始化、详情加载、切换、创建、保存、删除。
- 页面右侧有独属文档目录 Sidebar，并支持收缩和展开。
- 本阶段只实现基础编辑闭环，不设计 chunks、RAG 绑定、RAG 检索、embedding 或知识库收纳能力。

## 2. 路由与导航

知识笔记页面使用单页工作台路由：

```text
/notes
```

不新增页面路由：

```text
/notes/[id]
```

说明：

- `/notes` 是唯一页面入口。
- 文档切换在 `/notes` 页面内部完成。
- 点击右侧目录项时，不跳转页面，只在当前页面加载对应文档内容。
- 左侧 Sidebar 子导航名称为 `知识笔记`。
- 左侧 Sidebar 子导航路由为 `/notes`。
- 左侧 Sidebar 子导航 icon 使用 `notebook-tabs`。
- 进入 `/notes` 后，后台 Header 标题显示 `知识笔记`。
- 进入 `/notes` 后，左侧 Sidebar 保持后台布局，`知识库` 父级处于当前上下文，`知识笔记` 子项处于选中状态。

## 3. 数据模型约定

### 3.1 复用 DocumentSource

知识笔记保存为一条 `DocumentSource` 记录，不新增笔记表。

本模块复用：

- `DocumentSource`

本模块不新增：

- `KnowledgeNote`
- `Note`
- `Notebook`
- 任何新的 Prisma model
- 任何独立图片表

### 3.2 fileType 区分规则

`DocumentSource.fileType` 用于区分文档来源类型：

```text
note：用户在知识笔记页面创建的 Markdown 笔记
file：外部上传或导入的文档
```

本阶段必须修改 Prisma schema，使 `DocumentSource.fileType` 具备数据库层默认值：

```prisma
fileType String @default("file")
```

要求：

- 用户笔记必须保存为 `fileType = "note"`。
- 外部上传文档应保存为 `fileType = "file"`。
- `fileType` 默认值为 `"file"`。
- 修改 Prisma schema 后运行 `npm run db:generate`。
- 如需同步本地 SQLite，再运行 `npm run db:push`。

### 3.3 sourceType 区分规则

知识笔记使用：

```text
sourceType = "markdown"
fileType = "note"
```

外部上传文档不属于本模块，但应避免被知识笔记接口查出。

### 3.4 字段映射

创建知识笔记时，`DocumentSource` 字段约定如下：

```ts
DocumentSource {
  originalName: string;       // 默认等于 title
  title: string;              // 笔记标题
  fileType: "note";           // 用户笔记
  fileName: string | null;    // 可为 null，或 `${title}.md`
  fileUrl: null;
  mimeType: "text/markdown";
  fileSize: number;           // rawContent 的 UTF-8 字节数
  sourceType: "markdown";
  rawContent: string;         // Markdown 源文本
  status: "pending";
  activeStatus: "active";
  chunkCount: 0;
}
```

`fileSize` 计算：

```ts
Buffer.byteLength(rawContent ?? "", "utf-8")
```

## 4. 页面结构

`/notes` 页面位于后台 Main Content 中，页面内部结构为：

```text
页面上边栏
主体编辑区
右侧文档目录
```

### 4.1 页面上边栏

页面自己的上边栏位于 `/notes` 内容区顶部。

左侧：

- 当前文档名称。
- 文档名称下方显示最后更新时间。

右侧：

- 保存按钮。
- 新建按钮。
- 删除按钮。

### 4.2 标题编辑规则

当前文档名称默认是展示态。

交互规则：

- 点击文档名称后，名称变为标题输入框。
- 标题输入框使用 `onBlur` 保存标题。
- 按 Enter 保存标题。
- Esc 不做特殊处理，不取消、不保存、不退出编辑态。
- 保存成功后，标题输入框回到展示态。
- 保存失败时，标题输入框保持编辑态，并显示错误提示。
- 标题保存时同步更新 `DocumentSource.title` 和 `DocumentSource.originalName`。
- 如实现中使用 `fileName`，标题保存时可同步更新 `fileName`。
- 标题为空时不允许保存为空标题，应回退到上一次有效标题或使用 `未命名文档`。

### 4.3 最后更新时间

标题下方以一行小字显示最后更新时间。

规则：

- 使用当前文档的 `updatedAt`。
- 保存正文或标题成功后，应更新页面上的最后更新时间。
- 没有选中文档时不显示最后更新时间。

### 4.4 顶部按钮

保存按钮：

- 保存当前文档标题和 Markdown 正文。
- 成功后更新当前文档的 `updatedAt`。

新建按钮：

- 创建一篇空 Markdown 笔记。
- 创建成功后刷新右侧目录。
- 新文档自动成为当前选中文档。
- 新建文档默认标题为 `未命名文档`。
- 新建文档默认 `rawContent = ""`。

删除按钮：

- 仅在当前有选中文档时可用。
- 点击后弹出确认框。
- 确认框样式和交互参考 RAG 知识库管理中的删除确认弹窗。
- 用户确认后删除当前文档。
- 删除成功后刷新右侧目录。
- 删除后优先选中更新时间最新的剩余文档。
- 如果删除后没有任何文档，页面进入空状态。

## 5. 初始化与文档选择

### 5.1 首次进入页面

进入 `/notes` 时，页面立即初始化加载知识笔记列表。

第一步请求列表：

```text
GET /api/notes
```

列表查询固定条件：

```text
sourceType = "markdown"
fileType = "note"
```

排序规则：

```text
updatedAt desc
```

列表接口只返回目录摘要，不返回 `rawContent`。

初始化选择规则：

- 如果存在笔记，默认选中 `updatedAt` 最新的一篇。
- 选中后再请求：

```text
GET /api/notes/[id]
```

- 详情接口返回该文档的 `title`、`rawContent`、`updatedAt` 等详情字段。
- 如果不存在笔记，页面显示空状态。

### 5.2 点击右侧目录切换文档

点击右侧目录中的文档项时：

```text
检查 saving 锁
→ 自动保存当前文档
→ 保存成功
→ 请求被点击文档详情
→ 编辑区显示被点击文档上次保存的内容
→ 右侧目录高亮被点击文档
```

要求：

- 切换前必须先尝试保存当前文档。
- 如果当前文档没有修改，可以跳过保存请求。
- 如果当前文档保存失败，不切换到新文档，应展示错误提示。
- 只有保存成功后才能切换。
- 切换成功后重新请求目标文档详情，不能依赖列表中的正文内容。

### 5.3 saving 锁

页面需要维护 `saving` 状态。

规则：

- `saving = true` 时，不允许重复触发保存请求。
- `saving = true` 时，右侧目录切换、新建、删除和保存按钮应禁用或忽略点击。
- 点击目录项切换时，如果触发保存，则必须等待保存成功后再切换。
- 保存失败时，保持当前文档和当前草稿，不更新 `activeNoteId`。
- 标题保存失败时，标题保持编辑态。
- 正文保存失败时，正文草稿保持当前输入内容。

## 6. 空状态

当知识笔记列表为空时，页面主体显示空状态。

空状态视觉要求：

- 页面显示背景，不能是纯空白。
- 内容在主体区域中间显示。
- 中间主文案：

```text
当前还没有文档哦，来创建一个吧
```

- 文案下方显示 `inbox` 图标。
- 图标下方显示蓝色按钮：

```text
创建新文档
```

交互规则：

- 点击空状态中的 `创建新文档` 按钮，行为与页面右上角 `新建` 按钮一致。
- 创建成功后退出空状态，右侧目录展示新文档，编辑区选中新文档。

## 7. 右侧文档目录

### 7.1 目录内容

右侧目录展示所有知识笔记。

数据来源：

```text
GET /api/notes
```

排序：

```text
updatedAt desc
```

目录项至少展示：

- 文档标题。
- 最后更新时间。

当前选中的文档目录项应有明确选中状态。

### 7.2 目录收缩与展开

右侧目录支持收缩和展开。

展开状态：

- 目录显示在页面右侧。
- 目录顶部可以显示标题，例如 `文档目录`。
- 目录项按更新时间从最新到最久远排序。
- 收缩按钮 icon 使用 `indent-increase`。

收缩状态：

- 右侧目录面板隐藏。
- 页面右侧贴屏显示一个小按钮。
- 小按钮 icon 使用 `indent-decrease`。
- 点击小按钮后展开目录。

## 8. Markdown 编辑能力

### 8.1 编辑器依赖

推荐使用：

```text
@uiw/react-md-editor
```

第一阶段任务必须检查依赖是否已安装：

- 如果 `package.json` 中未安装 `@uiw/react-md-editor`，第一阶段应先安装该依赖。
- 安装后更新 lockfile。
- 编辑器组件必须是 Client Component。
- 编辑器值绑定到当前文档的 `rawContent`。
- Markdown 预览能力由编辑器提供。
- 不引入 BlockNote、Tiptap、Lexical、Slate 等复杂富文本编辑器。

### 8.2 Markdown 保存

Markdown 正文直接保存到：

```text
DocumentSource.rawContent
```

保存时同时更新：

- `fileSize`
- `updatedAt`
- 如标题有变化，同步更新标题相关字段

### 8.3 图片处理

本阶段图片只作为 Markdown 文本的一部分保存。

要求：

- 不上传图片。
- 不维护图片表。
- 不做图片 OCR。
- 不做图片解析。
- 图片地址以 Markdown 字符串形式保存在 `rawContent`。

示例：

```md
![架构图](https://example.com/images/rag-schema.png)
```

## 9. API 设计

### 9.1 获取知识笔记列表

```text
GET /api/notes
```

查询条件固定为：

```text
sourceType = "markdown"
fileType = "note"
```

排序：

```text
updatedAt desc
```

返回目录摘要：

```ts
{
  id: string;
  title: string;
  fileSize: number;
  sourceType: "markdown";
  fileType: "note";
  status: string;
  activeStatus: string;
  createdAt: string;
  updatedAt: string;
}[]
```

说明：

- 列表接口不得返回 `rawContent`。
- 无论是笔记还是导入文档，页面一次只能查看一个文档正文。
- 正文必须通过选中文档后按 id 请求详情获取。

### 9.2 获取知识笔记详情

```text
GET /api/notes/[id]
```

实现要求：

- 只能读取 `sourceType = "markdown"` 且 `fileType = "note"` 的记录。
- 如果笔记不存在，返回 404。
- 如果目标记录不是知识笔记，返回 404。

返回：

```ts
{
  id: string;
  title: string;
  originalName: string;
  rawContent: string | null;
  fileSize: number;
  sourceType: "markdown";
  fileType: "note";
  status: string;
  activeStatus: string;
  createdAt: string;
  updatedAt: string;
}
```

### 9.3 创建知识笔记

```text
POST /api/notes
```

请求体：

```ts
{
  title?: string;
  rawContent?: string;
}
```

默认值：

```ts
title = "未命名文档"
rawContent = ""
```

创建 `DocumentSource`：

```ts
{
  originalName: title,
  title,
  fileType: "note",
  fileName: `${title}.md`,
  fileUrl: null,
  mimeType: "text/markdown",
  fileSize: Buffer.byteLength(rawContent ?? "", "utf-8"),
  sourceType: "markdown",
  rawContent: rawContent ?? "",
  status: "pending",
  activeStatus: "active",
  chunkCount: 0
}
```

返回创建后的笔记详情。

### 9.4 更新知识笔记

```text
PATCH /api/notes/[id]
```

请求体：

```ts
{
  title?: string;
  rawContent?: string;
}
```

实现要求：

- 只能更新 `sourceType = "markdown"` 且 `fileType = "note"` 的记录。
- 更新 `title` 时同步更新 `originalName`。
- 更新 `rawContent` 时同步更新 `fileSize`。
- 如果标题或正文发生变化，`updatedAt` 应由 Prisma 自动更新。
- 不自动生成 chunks。
- 不绑定 RAG。
- 不处理图片上传。
- 如果笔记不存在，返回 404。

### 9.5 删除知识笔记

```text
DELETE /api/notes/[id]
```

实现要求：

- 只能删除 `sourceType = "markdown"` 且 `fileType = "note"` 的记录。
- 删除前前端必须二次确认。
- 删除成功后返回被删除的 `id`。
- 如果笔记不存在，返回 404。

返回：

```ts
{
  id: string;
}
```

## 10. Zod Schema 设计

新增或放置在笔记模块附近：

```text
src/features/notes/server/schemas.ts
```

包含：

```ts
createNoteSchema
updateNoteSchema
noteIdSchema
```

规则：

- `createNoteSchema.title` 可选，未传时使用 `未命名文档`。
- `createNoteSchema.rawContent` 可选，未传时使用空字符串。
- `updateNoteSchema` 至少传入 `title` 或 `rawContent` 一个字段。
- `title` 如果传入，trim 后不能为空。
- `rawContent` 如果传入，必须是字符串。
- `noteIdSchema` 校验路由参数 id。

## 11. Service 设计

新增：

```text
src/features/notes/server/note-service.ts
```

需要实现：

```ts
listNotesService();
getNoteDetailService(id);
createNoteService(input);
updateNoteService(id, input);
deleteNoteService(id);
```

### 11.1 listNotesService

职责：

- 查询 `DocumentSource`。
- 固定条件：`sourceType = "markdown"`，`fileType = "note"`。
- 按 `updatedAt desc` 排序。
- 只返回目录摘要字段。
- 不返回 `rawContent`。

### 11.2 getNoteDetailService

职责：

- 按 id 查询单条 `DocumentSource`。
- 固定条件：`sourceType = "markdown"`，`fileType = "note"`。
- 返回详情字段，包括 `rawContent`。
- 不允许读取外部上传文档。

### 11.3 createNoteService

职责：

- 创建一条 `DocumentSource`。
- 初始化为 Markdown 知识笔记。
- 写入 `fileType = "note"`。
- 不创建 chunks。
- 不绑定 RAG。

### 11.4 updateNoteService

职责：

- 更新标题和 Markdown 正文。
- 如果传入标题，同步更新 `originalName` 和可选的 `fileName`。
- 如果传入正文，同步更新 `rawContent` 和 `fileSize`。
- 不自动重建 chunks。
- 不绑定 RAG。

### 11.5 deleteNoteService

职责：

- 删除对应 `DocumentSource`。
- 只允许删除 `sourceType = "markdown"` 且 `fileType = "note"` 的记录。
- 不删除外部上传文档。

## 12. Route Handler 文件设计

新增：

```text
src/app/api/notes/route.ts
src/app/api/notes/[id]/route.ts
```

### 12.1 `src/app/api/notes/route.ts`

导出：

```ts
export async function GET(request: Request);
export async function POST(request: Request);
```

职责：

- GET：返回知识笔记目录摘要列表，按 `updatedAt desc` 排序，不返回 `rawContent`。
- POST：创建知识笔记。

### 12.2 `src/app/api/notes/[id]/route.ts`

导出：

```ts
export async function GET(request: Request, context);
export async function PATCH(request: Request, context);
export async function DELETE(request: Request, context);
```

职责：

- GET：返回单个知识笔记详情，包括 `rawContent`。
- PATCH：保存标题或正文。
- DELETE：删除知识笔记。

本阶段不设计：

- `POST /api/notes/[id]/chunks/generate`
- `POST /api/notes/[id]/bind-knowledge-bases`
- `DELETE /api/notes/[id]/bind-knowledge-bases`

## 13. 前端实现要求

### 13.1 页面文件

新增或迁移：

```text
src/app/notes/page.tsx
```

### 13.2 前端模块目录

推荐新增：

```text
src/features/notes/
```

推荐文件：

```text
src/features/notes/api.ts
src/features/notes/index.tsx
src/features/notes/components/note-editor.tsx
src/features/notes/components/note-directory.tsx
src/features/notes/components/note-empty-state.tsx
src/features/notes/components/delete-note-dialog.tsx
src/features/notes/server/schemas.ts
src/features/notes/server/note-service.ts
```

### 13.3 前端 API 封装

新增：

```text
src/features/notes/api.ts
```

封装：

```ts
listNotes();
getNoteDetail(id);
createNote(input);
updateNote(id, input);
deleteNote(id);
```

### 13.4 `/notes` 页面功能

页面初始化：

- 请求 `GET /api/notes`。
- 将返回列表同步到右侧目录。
- 如果列表不为空，默认选中更新时间最新的文档。
- 请求 `GET /api/notes/[id]` 加载选中文档详情。
- 如果列表为空，展示空状态。

编辑：

- Markdown 编辑器编辑当前选中文档的 `rawContent`。
- 当前文档标题支持展示态和编辑态切换。
- 标题通过 `onBlur` 和 Enter 保存。
- Esc 无特殊行为。
- 保存按钮保存当前标题和正文。

切换：

- 点击右侧目录项时，先检查 `saving`。
- 如果当前文档有未保存变更，先自动保存当前文档。
- 保存成功后再切换到被点击文档。
- 切换后请求被点击文档详情。
- 保存失败则保持当前文档并显示错误提示。

新建：

- 右上角新建按钮和空状态新建按钮行为一致。
- 创建后刷新目录并选中新文档。
- 创建后请求或使用创建接口返回的详情填充编辑区。

删除：

- 右上角删除按钮触发确认弹窗。
- 确认后删除当前文档。
- 删除后刷新目录。
- 删除后优先选中更新时间最新的剩余文档。

右侧目录：

- 按 `updatedAt desc` 排序。
- 支持收缩和展开。
- 展开时使用 `indent-increase` 图标作为收缩按钮。
- 收缩时贴屏显示小按钮，使用 `indent-decrease` 图标作为展开按钮。

## 14. 错误处理

| 场景 | 状态码 | 前端行为 |
| --- | --- | --- |
| 创建参数校验失败 | 400 | 显示错误提示 |
| 详情不存在 | 404 | 刷新目录并提示文档不存在 |
| 更新参数校验失败 | 400 | 显示错误提示，不切换文档 |
| 更新不存在的笔记 | 404 | 刷新目录并提示文档不存在 |
| 删除不存在的笔记 | 404 | 刷新目录并提示文档不存在 |
| 目标记录不是知识笔记 | 404 | 不显示外部上传文档内容 |
| 服务端未知错误 | 500 | 显示错误提示 |

## 15. 前端状态规则

页面至少需要维护：

```ts
notes: NoteSummary[]
activeNoteId: string | null
activeNote: NoteDetail | null
draftTitle: string
draftRawContent: string
titleEditing: boolean
directoryOpen: boolean
loading: boolean
detailLoading: boolean
saving: boolean
deleting: boolean
error: string | null
```

派生规则：

- `activeNote` 来自详情接口，不来自列表接口。
- 判断是否有未保存变更时，对比 `activeNote.title/rawContent` 与 `draftTitle/draftRawContent`。
- 切换目录前，如果没有未保存变更，可以不发送保存请求。
- `saving` 为 true 时，禁用或忽略保存、切换、新建、删除动作。

## 16. 本阶段不做

本阶段不实现：

- RAG 绑定
- 解除 RAG 绑定
- 生成 chunks
- embedding
- RAG 检索
- 图片上传
- 图片表
- 图片 OCR
- 文件系统型目录
- 标签系统
- 自动保存
- 历史版本
- 协作编辑
- 评论
- 权限管理
- AI 总结
- AI 改写
- `/notes/[id]` 页面

## 17. 验收标准

1. 左侧 Sidebar 子导航名称为 `知识笔记`。
2. 点击 `知识笔记` 进入 `/notes`。
3. `/notes` 页面在管理后台布局内渲染。
4. 初次进入 `/notes` 时请求 `GET /api/notes`。
5. `GET /api/notes` 只返回目录摘要，不返回 `rawContent`。
6. 列表查询条件为 `sourceType = "markdown"` 且 `fileType = "note"`。
7. 如果列表不为空，默认选中更新时间最新的文档。
8. 默认选中后请求 `GET /api/notes/[id]` 加载 `rawContent`。
9. 右侧目录按 `updatedAt desc` 排序。
10. 没有笔记时显示空状态文案 `当前还没有文档哦，来创建一个吧`。
11. 空状态文案下方显示 `inbox` 图标。
12. 空状态图标下方显示蓝色 `创建新文档` 按钮。
13. 右上角有保存、新建、删除三个按钮。
14. 空状态新建按钮和右上角新建按钮行为一致。
15. 新建笔记创建一条 `DocumentSource`。
16. 新建笔记 `fileType = "note"`。
17. 新建笔记 `sourceType = "markdown"`。
18. `DocumentSource.fileType` 在 Prisma schema 中具备 `@default("file")`。
19. Markdown 正文保存到 `DocumentSource.rawContent`。
20. 图片只作为 Markdown 字符串保存在 `rawContent`。
21. 不上传图片，不维护图片表。
22. 点击右侧目录项前会自动保存当前文档。
23. 只有保存成功后才切换文档。
24. 自动保存失败时不切换文档。
25. `saving` 为 true 时不允许重复保存、切换、新建或删除。
26. 当前文档标题支持点击进入编辑态。
27. 标题输入框通过 `onBlur` 保存。
28. 标题输入框按 Enter 保存。
29. 标题输入框按 Esc 无特殊行为。
30. 标题保存失败时保持编辑态。
31. 标题下方显示最后更新时间。
32. 保存成功后更新时间刷新。
33. 删除按钮弹出二次确认框。
34. 删除确认框样式参考 RAG 知识库管理删除弹窗。
35. 删除成功后刷新目录。
36. 删除后有剩余文档时选中更新时间最新的文档。
37. 删除后无文档时进入空状态。
38. 右侧目录展开时收缩按钮使用 `indent-increase`。
39. 右侧目录收缩后贴屏小按钮使用 `indent-decrease`。
40. 本页面不出现生成 chunks、RAG 绑定、解除绑定、RAG 检索相关按钮或流程。
41. 不引入 BlockNote、Tiptap、Lexical、Slate。
42. 如未安装 `@uiw/react-md-editor`，第一阶段包含安装该依赖。
43. TypeScript 不出现明显类型错误。
44. 不破坏现有知识库管理、知识文档、专家 Agent、专家对话页面。

## 18. 第一阶段实现顺序

第一阶段先实现完整基础编辑闭环，推荐顺序：

1. 同步布局文档和侧边栏导航，确保 `知识笔记` 路由为 `/notes`。
2. 将知识笔记页面入口统一为 `src/app/notes/page.tsx`。
3. 检查 `package.json` 是否安装 `@uiw/react-md-editor`；如未安装，先安装依赖并更新 lockfile。
4. 修改 Prisma schema：将 `DocumentSource.fileType` 调整为 `String @default("file")`。
5. 运行 `npm run db:generate`，必要时运行 `npm run db:push`。
6. 创建 `src/features/notes/server/schemas.ts`。
7. 创建 `src/features/notes/server/note-service.ts`，确保列表不返回 `rawContent`，详情按 id 返回 `rawContent`。
8. 创建 `src/app/api/notes/route.ts`，实现 GET 列表和 POST 创建。
9. 创建 `src/app/api/notes/[id]/route.ts`，实现 GET 详情、PATCH 保存和 DELETE 删除。
10. 创建 `src/features/notes/api.ts`。
11. 创建 `/notes` 页面内部组件：编辑器、右侧目录、空状态、删除确认框。
12. 实现初始化：列表摘要请求、默认选中最新文档、详情请求。
13. 实现保存锁：保存成功后再切换，保存失败不切换。
14. 实现标题 onBlur / Enter 保存，Esc 无特殊行为，保存失败保持编辑态。
15. 手动验证初始化、新建、详情加载、保存、切换、删除、目录收缩和空状态。
16. 运行 `npm run build`；如 lint 已配置且需要验证，再运行 `npm run lint` 并记录结果。
## 19. 增量：知识笔记成为知识源开关

### 19.1 背景

知识笔记本质上也是 `DocumentSource`，其固定类型为：

```text
fileType = "note"
sourceType = "markdown"
```

RAG 详情页的待选文档只展示满足以下条件的 `DocumentSource`：

```text
activeStatus = "active"
status = "parsed"
```

因此，知识笔记是否能作为 RAG 待选知识源，由该笔记的 `status` 决定。

### 19.2 功能目标

在知识笔记页面右上角新增一个滑块按钮，用于控制当前笔记是否成为知识源。

滑块含义：

```text
关闭：当前笔记不作为知识源，status = "pending"
打开：当前笔记可作为知识源，status = "parsed"
```

说明：

- 本开关只修改当前笔记的 `DocumentSource.status`。
- 不生成 chunks。
- 不绑定 RAG。
- 不触发 embedding。
- 不修改 `rawContent`。
- 不修改 `fileType`。
- 不修改 `sourceType`。

### 19.3 UI 规则

位置：

```text
/notes 页面自己的顶部栏右上角
保存按钮、新建按钮、删除按钮同一行
```

交互：

- 滑块关闭时，轨道为红色。
- 滑块打开时，轨道为绿色。
- 鼠标悬停在滑块上时显示提示文案：

```text
是否成为知识源
```

状态同步：

- 当前笔记 `status = "parsed"` 时，滑块自动处于打开状态。
- 当前笔记 `status != "parsed"` 时，滑块自动处于关闭状态。
- 如果该属性在别处被修改为 `parsed`，重新加载或刷新当前笔记详情后，滑块应自动打开。
- 如果该属性在别处被修改为非 `parsed`，重新加载或刷新当前笔记详情后，滑块应自动关闭。

### 19.4 API 与保存规则

复用当前笔记更新接口：

```text
PATCH /api/notes/[id]
```

请求体增量支持：

```ts
{
  status?: "pending" | "parsed"
}
```

切换规则：

- 用户打开滑块时，请求将当前笔记 `status` 更新为 `"parsed"`。
- 用户关闭滑块时，请求将当前笔记 `status` 更新为 `"pending"`。
- 切换期间按钮进入 loading 或 disabled 状态，避免重复提交。
- 更新成功后，用接口返回值刷新当前笔记详情状态。
- 更新失败时恢复到切换前状态，并显示错误提示。

服务端规则：

- 只能更新 `sourceType = "markdown"` 且 `fileType = "note"` 的记录。
- 如果目标记录不是知识笔记，返回 404。
- `status` 只允许本增量定义的值。
- 本接口不生成 chunk，不删除 chunk，不修改 RAG 绑定。

### 19.5 与 RAG 详情页的关系

当知识笔记满足：

```text
activeStatus = "active"
status = "parsed"
fileType = "note"
```

它可以出现在 RAG 详情页的待选文档列表中。

当用户在知识笔记页关闭“是否成为知识源”后：

```text
status = "pending"
```

该笔记不再满足 RAG 详情页待选文档条件。

### 19.6 验收标准

1. 知识笔记页面右上角存在“是否成为知识源”滑块。
2. 滑块关闭时轨道为红色。
3. 滑块打开时轨道为绿色。
4. 鼠标悬停滑块时显示“是否成为知识源”。
5. 当前笔记 `status = "parsed"` 时滑块自动打开。
6. 当前笔记 `status != "parsed"` 时滑块自动关闭。
7. 打开滑块后，当前笔记 `status` 更新为 `"parsed"`。
8. 关闭滑块后，当前笔记 `status` 更新为 `"pending"`。
9. 切换失败时恢复原状态并显示错误提示。
10. 切换不会生成 chunk。
11. 切换不会绑定 RAG。
12. 切换不会修改 `rawContent`。
13. `status = "parsed"` 的知识笔记可以作为 RAG 详情页待选文档。
14. `status = "pending"` 的知识笔记不会作为 RAG 详情页待选文档。
