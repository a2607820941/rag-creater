# 技术方案：RAG 详情页文档归属与 Chunk 展示改造

## 1. 目标

基于 `docs/lzh/specs/spec.detail.md`，改造 `/knowledge-bases/[id]` 详情页，使其在后台布局内展示 RAG 基础信息、已引用文档、待选文档，并通过弹窗查看已引用文档和待选文档的 chunk 明细。

本阶段只调整 `DocumentSource` 与 `KnowledgeBase` 的归属关系，即 `KnowledgeBaseDocument` 关系；不上传文件、不解析文档、不生成 chunk、不编辑文档内容、不编辑 chunk 内容。

## 2. 当前代码现状

当前相关目录和文件：

```txt
src/app/knowledge-bases/[id]/page.tsx
src/features/knowledge-bases/api.ts
src/features/knowledge-bases/types.ts
src/features/knowledge-bases/utils.ts
src/features/knowledge-bases/server/knowledge-base-service.ts
src/features/knowledge-bases/server/mappers.ts
src/features/knowledge-bases/server/schemas.ts
src/app/api/rag-management/knowledge-bases/[id]/tree/route.ts
src/app/api/rag-management/knowledge-bases/[id]/documents/route.ts
src/app/api/rag-management/documents/route.ts
```

现有可复用能力：

- `GET /api/rag-management/knowledge-bases/[id]/tree` 获取 RAG 详情树，包含已绑定文档和文档 chunks。
- `GET /api/rag-management/documents?status=parsed&activeStatus=active` 获取可用文档列表。
- `GET /api/rag-management/documents/[id]/chunks` 获取任意可访问文档的 chunks，可用于待选文档查看分片。
- `POST /api/rag-management/knowledge-bases/[id]/documents` 绑定文档到知识库。
- `DELETE /api/rag-management/knowledge-bases/[id]/documents` 从知识库解绑文档。
- `KnowledgeBaseDocument.sortOrder` 已存在。
- `DocumentSource.fileType`、`status`、`activeStatus` 已存在。
- `DocumentChunk` 已能通过 `mapDocumentChunk` 映射为前端 chunk 数据。

需要修正或补强的点：

- `mapDocumentSourceDetail` 当前没有完整返回 `originalName`、`fileType`、`chunkCount` 等详情页需要的字段。
- 现有绑定服务只校验文档是否存在，还需要校验文档是否满足知识源条件。
- 详情页当前逻辑集中在 `src/app/knowledge-bases/[id]/page.tsx`，后续应拆到 `features/knowledge-bases` 下，页面入口保持轻量。

## 3. 技术路线

采用“复用现有增量接口”的方案，不新增 `compose` API。

数据加载：

```txt
1. GET /api/rag-management/knowledge-bases/[id]/tree
   -> 获取 RAG 基础信息、已引用文档、已引用文档 chunks

2. GET /api/rag-management/documents?status=parsed&activeStatus=active
   -> 获取所有可作为知识源的文档

3. 前端用已引用文档 id 集合过滤，得到待选文档

4. 用户点击任意文档“分片”时
   -> 已引用文档优先使用 tree 中已有 chunks
   -> 待选文档按需 GET /api/rag-management/documents/[id]/chunks
   -> 统一使用弹窗只读展示
```

保存：

```txt
1. 前端比较 initialSelectedDocumentIds 与当前 selectedDocuments
2. 计算 toAdd
3. 计算 toRemove
4. toAdd 非空时调用 POST /api/rag-management/knowledge-bases/[id]/documents
5. toRemove 非空时调用 DELETE /api/rag-management/knowledge-bases/[id]/documents
6. 保存成功后重新请求详情树和可用文档列表
```

优点：

- 不新增 API 路由。
- 复用现有服务和路由。
- 保存语义清晰：前端负责计算差异，后端负责增量绑定/解绑。
- 支持清空已引用文档：`toRemove` 包含全部已引用文档，`toAdd` 为空时只调用 DELETE。

限制：

- 当文档量很大时，`GET /api/rag-management/documents` 会返回较多待过滤数据。当前阶段不做搜索、分页和虚拟滚动，后续可增加 `excludeKnowledgeBaseId` 或 compose 专用接口。

## 4. 后端设计

### 4.1 文档可选条件

可被 RAG 引用的 `DocumentSource` 必须满足：

```ts
{
  activeStatus: "active",
  status: "parsed"
}
```

该规则必须同时出现在：

- 待选文档查询。
- 绑定接口服务端校验。

前端过滤只能作为展示优化，不能替代后端校验。

### 4.2 Mapper 调整

修改 `src/features/knowledge-bases/server/mappers.ts`。

`mapDocumentSourceListItem` 需要返回：

```ts
{
  id,
  title,
  name,
  originalName,
  sourceType,
  fileType,
  fileName,
  fileSize,
  size,
  status,
  activeStatus,
  chunkCount,
  uploadedAt,
  createdAt,
  updatedAt
}
```

`mapDocumentSourceDetail` 需要返回：

```ts
{
  id,
  title,
  name,
  originalName,
  sourceType,
  fileType,
  fileName,
  fileSize,
  size,
  rawContent,
  status,
  activeStatus,
  chunkCount,
  uploadedAt,
  createdAt,
  updatedAt,
  chunks
}
```

注意：

- 详情页展示 `fileType` 依赖 mapper 返回值。
- RAG 详情树中的已引用文档也必须包含 `fileType`。
- `chunkCount` 优先使用 `chunks.length`，没有 include chunks 时使用 `DocumentSource.chunkCount`。

### 4.3 Service 校验

修改 `src/features/knowledge-bases/server/knowledge-base-service.ts`。

新增内部函数：

```ts
async function assertDocumentsCanBeKnowledgeSource(
  tx: Prisma.TransactionClient,
  documentIds: string[]
): Promise<string[]>
```

职责：

- 去重。
- 查询 `DocumentSource`。
- 校验所有 id 存在。
- 校验所有文档满足：

```ts
status === "parsed"
activeStatus === "active"
```

- 不限制 `fileType`，因此 `file` 与 `note` 都允许。
- 返回去重后的 id 列表。

绑定服务调整：

```ts
bindDocumentsToKnowledgeBaseService(knowledgeBaseId, documentIds)
```

从只调用 `assertDocumentIdsExist` 改为调用 `assertDocumentsCanBeKnowledgeSource`。

解绑服务保持：

```ts
unbindDocumentsFromKnowledgeBaseService(knowledgeBaseId, documentIds)
```

解绑只删除 `KnowledgeBaseDocument` 关系，不删除 `DocumentSource` 和 `DocumentChunk`。

### 4.4 Schema

现有 `documentIdsBodySchema`：

```ts
z.object({
  documentIds: z.array(z.string().min(1)).min(1),
})
```

可以保留，因为本阶段复用增量 POST/DELETE 接口。前端保存时：

- `toAdd.length === 0` 时不调用 POST。
- `toRemove.length === 0` 时不调用 DELETE。
- 没有变更时不调用任何接口。

因此不需要支持空数组请求。

## 5. 前端 API 封装

修改 `src/features/knowledge-bases/api.ts`，新增封装：

```ts
export async function fetchKnowledgeSourceDocuments() {
  return fetch("/api/rag-management/documents?status=parsed&activeStatus=active");
}

export async function bindKnowledgeBaseDocuments(
  knowledgeBaseId: string,
  documentIds: string[]
) {
  return fetch(`/api/rag-management/knowledge-bases/${knowledgeBaseId}/documents`, {
    method: "POST",
    body: JSON.stringify({ documentIds }),
  });
}

export async function unbindKnowledgeBaseDocuments(
  knowledgeBaseId: string,
  documentIds: string[]
) {
  return fetch(`/api/rag-management/knowledge-bases/${knowledgeBaseId}/documents`, {
    method: "DELETE",
    body: JSON.stringify({ documentIds }),
  });
}

export async function fetchDocumentChunks(params: { documentId: string }) {
  return fetch(`/api/rag-management/documents/${params.documentId}/chunks`);
}
```

实际实现继续复用现有 `readApiData`。

## 6. 类型设计

修改 `src/features/knowledge-bases/types.ts`。

扩展文档类型：

```ts
export type RagDoc = {
  id: string;
  name: string;
  title?: string;
  originalName?: string;
  fileName?: string | null;
  sourceType?: string;
  fileType?: string;
  status?: string;
  activeStatus?: string;
  chunkCount?: number;
  size: number;
  fileSize?: number;
  uploadedAt: string;
  createdAt?: string;
  updatedAt?: string;
  chunks?: RagChunk[];
};
```

扩展 chunk 类型，沿用 mapper 当前输出字段：

```ts
export type RagChunk = {
  id: string;
  documentId: string;
  content: string;
  chunkIndex?: number;
  status?: string;
  startIndex?: number;
  endIndex?: number;
  chunkType?: string;
  title?: string | null;
  suggestedCategory?: string | null;
  suggestedTags?: string | null;
  knowledgeType?: string | null;
  reviewStatus?: string | null;
  createdAt?: string;
  updatedAt?: string;
};
```

新增详情页局部类型：

```ts
type DocumentAssignmentState = {
  selectedDocuments: RagDoc[];
  availableDocuments: RagDoc[];
  initialSelectedDocumentIds: string[];
  chunkDialogOpen: boolean;
  chunkDialogDocument: RagDoc | null;
  chunkDialogChunks: RagChunk[];
  chunkDialogLoading: boolean;
  chunkDialogError: string | null;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  error: string | null;
};
```

状态只在详情页或详情页 feature 内维护，不放入 Zustand。

## 7. 前端组件设计

建议将详情页拆出业务组件，页面入口保持轻量。

### 7.1 页面入口

文件：

```txt
src/app/knowledge-bases/[id]/page.tsx
```

职责：

- 包裹 `AdminShell`。
- 渲染 `KnowledgeBaseDetailFeature`。

示例结构：

```tsx
export default function KnowledgeBaseDetailPage() {
  return (
    <AdminShell>
      <KnowledgeBaseDetailFeature />
    </AdminShell>
  );
}
```

### 7.2 业务组件

建议新增：

```txt
src/features/knowledge-bases/components/knowledge-base-detail-feature.tsx
src/features/knowledge-bases/components/document-assignment-panel.tsx
src/features/knowledge-bases/components/assignment-document-list.tsx
src/features/knowledge-bases/components/assignment-document-item.tsx
src/features/knowledge-bases/components/document-chunk-list.tsx
src/features/knowledge-bases/components/document-chunks-dialog.tsx
```

职责：

`KnowledgeBaseDetailFeature`

- 获取路由参数 `id`。
- 加载 RAG 详情树。
- 加载所有可作为知识源的文档。
- 计算已引用和待选文档。
- 维护 chunk 弹窗状态。
- 处理已引用/待选文档的分片查看。
- 维护保存、错误、loading 状态。
- 渲染返回按钮、基础信息卡片、文档归属面板。

`DocumentAssignmentPanel`

- 接收已引用文档、待选文档、dirty、saving。
- 渲染保存按钮。
- 分别渲染两个列表。

`AssignmentDocumentList`

- 渲染区域标题、描述、数量、空态。
- 渲染文档条目。

`AssignmentDocumentItem`

- 展示文档元信息。
- 已引用文档和待选文档均展示“分片”按钮。
- 已引用文档展示“撤下”按钮。
- 待选文档展示“启用”按钮。
- 点击“分片”只触发弹窗查看，不改变文档归属。

`DocumentChunkList`

- 只读展示 chunks。
- 支持空态。
- 不提供编辑、删除、新增入口。

`DocumentChunksDialog`

- 接收当前文档和 chunks。
- 以弹窗形式展示 chunk 明细。
- 展示加载状态、错误状态和空状态。
- 关闭弹窗不改变文档归属状态。

## 8. 数据流

### 8.1 初始化

```text
进入 /knowledge-bases/[id]
-> loading = true
-> GET tree
-> GET source documents
-> selectedDocuments = tree.documents
-> availableDocuments = sourceDocuments - selectedDocuments
-> initialSelectedDocumentIds = selectedDocuments.map(id)
-> dirty = false
-> loading = false
```

待选文档过滤规则：

```ts
const selectedIds = new Set(selectedDocuments.map((doc) => doc.id));
const availableDocuments = allSourceDocuments.filter(
  (doc) =>
    doc.activeStatus === "active" &&
    doc.status === "parsed" &&
    !selectedIds.has(doc.id)
);
```

服务端已经按 `status=parsed&activeStatus=active` 过滤，前端仍保留防御性过滤。

### 8.2 启用文档

```text
点击待选文档“启用”
-> 从 availableDocuments 移除
-> 添加到 selectedDocuments 末尾
-> dirty = true
```

不立即请求后端。

### 8.3 撤下文档

```text
点击已引用文档“撤下”
-> 从 selectedDocuments 移除
-> 添加到 availableDocuments 顶部
-> dirty = true
```

不立即请求后端。

### 8.4 保存

```text
点击保存文档配置
-> saving = true
-> currentIds = selectedDocuments.map(id)
-> initialIds = initialSelectedDocumentIds
-> toAdd = currentIds - initialIds
-> toRemove = initialIds - currentIds
-> if toAdd.length > 0: POST bind
-> if toRemove.length > 0: DELETE unbind
-> 重新加载 tree 和 source documents
-> dirty = false
-> saving = false
```

失败处理：

- 保留当前 `selectedDocuments` 和 `availableDocuments`。
- `dirty` 保持 true。
- 显示错误提示。
- `saving` 回到 false。

### 8.5 查看分片

已引用文档：

```text
点击“分片”
-> 从 selectedDocuments 中读取当前 document.chunks
-> 写入 chunkDialogDocument / chunkDialogChunks
-> 打开 DocumentChunksDialog
```

待选文档：

```text
点击“分片”
-> 打开 DocumentChunksDialog
-> chunkDialogLoading = true
-> GET /api/rag-management/documents/[id]/chunks
-> 写入 chunkDialogChunks
-> chunkDialogLoading = false
```

失败处理：

- 弹窗保持打开。
- 显示错误提示。
- 不改变 `selectedDocuments`、`availableDocuments`。
- 不改变 dirty 状态。

### 8.6 离开页面

本阶段不强制实现可靠自动保存。

如果实现提示：

- 可用 `beforeunload` 提示浏览器刷新/关闭。
- App Router 内部跳转拦截不是强需求。
- best-effort 自动保存不作为验收依据。

## 9. Chunk 明细展示

已引用文档和待选文档都可以查看 chunk 明细。

已引用文档的 chunks 优先来自 RAG 详情树：

```txt
GET /api/rag-management/knowledge-bases/[id]/tree
```

待选文档的 chunks 在点击“分片”时按需请求：

```txt
GET /api/rag-management/documents/[id]/chunks
```

展示规则：

- 已引用文档和待选文档条目都展示“分片”按钮。
- 点击“分片”统一打开弹窗。
- 不再在文档条目下方以内嵌展开形式展示 chunks。
- chunk 弹窗为只读展示。
- chunk 列表为空时显示“暂无分片数据”。
- 查看待选文档 chunk 只是预览行为，不等于启用该文档。
- 查看 chunk 不改变 dirty 状态。

字段展示：

- `chunkIndex`
- `chunkType`
- `reviewStatus`
- `title`
- `suggestedCategory`
- `suggestedTags`
- `content`
- `startIndex/endIndex` 或字符数

`suggestedTags` 如果是 JSON 字符串，前端按现有详情页逻辑尝试 `JSON.parse`，失败则按空数组处理。

## 10. 知识笔记状态开关依赖

`fileType = "note"` 的知识笔记是否出现在待选文档，由其 `status` 决定。

笔记页增量定义在：

```txt
docs/lzh/specs/spec-notebook.md
```

详情页只依赖最终数据状态：

```text
status = "parsed"
activeStatus = "active"
```

实现计划中需要包含笔记页增量：

- `PATCH /api/notes/[id]` 支持 `status?: "pending" | "parsed"`。
- 笔记顶部栏新增“是否成为知识源”开关。
- 开关打开写入 `status = "parsed"`。
- 开关关闭写入 `status = "pending"`。

该能力可以和详情页改造放在同一阶段计划中，但详情页不直接修改笔记状态。

## 11. UI 方案

页面整体沿用后台管理风格，避免营销式布局。

RAG 基础信息区：

- 保留当前信息卡片。
- 保存文档归属成功后重新拉取详情刷新统计。

文档归属管理区：

```text
Card
  Header
    标题：文档归属管理
    描述：调整当前 RAG 引用哪些知识源
    操作：保存文档配置
  Body
    已引用文档
    待选文档
```

文档条目：

- 使用白底列表项或浅边框卡片。
- 左侧为文档图标。
- 中间为标题、来源、状态、大小、更新时间。
- 右侧为“启用”或“撤下”按钮。
- `fileType` 使用 Badge。
- `status` 与 `activeStatus` 使用 Badge。

Chunk 明细：

- 使用弹窗展示。
- 已引用文档和待选文档复用同一个弹窗。
- 弹窗内使用紧凑列表。
- 内容使用 `whitespace-pre-wrap`。
- 长内容不截断主要信息，但可限制单条最大高度并允许滚动。

空态：

- 已引用文档为空：`当前 RAG 暂未引用文档，可从待选文档中启用。`
- 待选文档为空：`暂无可选文档。`
- chunk 为空：`暂无分片数据。`

## 12. 错误处理

加载失败：

- RAG 详情加载失败：展示错误，并提供返回知识库列表按钮。
- 待选文档加载失败：保留详情信息，文档归属区显示错误。

保存失败：

- 保留当前前端移动结果。
- `dirty` 保持 true。
- 显示错误提示。
- 保存按钮重新可用。

后端校验失败：

- 文档不存在：返回 400 或统一业务错误。
- 文档不是可用知识源：返回 400。
- 知识库不存在：返回 404。

## 13. 技术闭环判断

当前方案形成技术闭环。

闭环链路：

```text
详情页进入
-> GET tree 获取 RAG 与已引用文档/chunks
-> GET documents 获取 parsed + active 文档
-> 前端拆分 selected/available
-> 用户点击任意文档“分片”
-> 已引用文档使用 tree chunks，待选文档按需 GET document chunks
-> 弹窗只读展示 chunks
-> 用户启用/撤下
-> 前端计算 toAdd/toRemove
-> 复用 POST/DELETE 绑定接口保存关系
-> 后端校验文档可作为知识源
-> 后端只更新 KnowledgeBaseDocument
-> 重新 GET tree/documents 刷新页面
```

无冲突点：

- 不新增 compose API，与“优先复用旧接口和服务”的要求一致。
- 不做拖拽，与当前阶段边界一致。
- 不上传、不解析、不生成 chunk，与详情页只做归属调整一致。
- chunk 明细只读展示，与“必须展示 chunk 明细但不能修改”一致。
- 待选文档查看 chunk 不写入 `KnowledgeBaseDocument`，与“启用后保存才建立归属”的规则一致。
- `fileType = "note"` 的知识笔记通过 `status = "parsed"` 进入待选文档，与笔记页增量开关一致。

需要在计划中明确的前置事项：

- mapper 必须补齐 `fileType/originalName/chunkCount`。
- 绑定服务必须补文档可选状态校验。
- 笔记页开关需要和详情页同阶段或前置完成，否则 note 只能通过其他方式变成 `parsed` 后才会出现在待选文档。

## 14. 验证建议

建议执行：

```bash
npm run build
```

针对改动文件可运行：

```bash
npx eslint src/app/knowledge-bases src/features/knowledge-bases src/app/api/rag-management src/app/api/notes src/features/note
```

人工验证：

- 点击 RAG 卡片进入详情页，布局仍有 Sidebar 和 Header。
- 已引用文档点击“分片”后以弹窗显示 chunk 明细。
- 待选文档点击“分片”后以弹窗显示 chunk 明细。
- 查看 chunk 不会让页面进入 dirty 状态。
- 待选文档只显示 `parsed + active` 文档。
- `fileType = note` 且 `status = parsed` 的笔记出现在待选文档。
- 点击“启用”后进入已引用列表，未保存前刷新页面不应持久化。
- 点击“撤下”后进入待选列表，未保存前刷新页面不应持久化。
- 点击保存后刷新页面，归属关系保持。
- 保存失败时前端移动结果仍保留。
- 本页没有上传、解析、编辑文档、编辑 chunk 入口。
