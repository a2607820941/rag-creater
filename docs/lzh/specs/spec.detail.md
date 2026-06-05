# SPEC: RAG 详情页文档归属与 Chunk 展示改造

## 1. 背景

当前点击 RAG 知识库卡片后进入 `/knowledge-bases/[id]` 详情页。详情页必须仍然渲染在后台 `AdminShell` 布局内，只替换主内容区，不脱离左侧 Sidebar 和顶部 Header。

旧的 `rag.phase2.md` 描述的是“点击卡片打开上传弹窗”的阶段能力。当前阶段不再沿用旧弹窗入口、上传流程和删除流程，但可以参考旧弹窗中文档条目的展示字段，例如文档名称、大小、更新时间、chunk 数和操作按钮的呈现方式。

本阶段目标是在 RAG 详情页中实现：

- 查看当前 RAG 基础信息。
- 查看当前 RAG 已引用的文档。
- 查看当前 RAG 尚未引用但可作为知识源的待选文档。
- 调整文档与当前 RAG 的归属关系。
- 通过弹窗查看已引用文档和待选文档的 chunk 明细。

本阶段不修改文档内容，不修改 chunk 内容，不上传文件，不解析文档，不生成 chunk，不生成 embedding。

## 2. 阶段边界

本阶段必须实现：

- `/knowledge-bases/[id]` 在 `AdminShell` 内渲染。
- RAG 基础信息展示。
- 已引用文档列表。
- 待选文档列表。
- 文档条目展示 `fileType`。
- “启用”待选文档，将其加入当前 RAG。
- “撤下”已引用文档，将其从当前 RAG 移除。
- 手动保存文档归属关系。
- 保存失败时保留当前前端编排状态。
- 已引用文档和待选文档均可查看 chunk 明细。
- chunk 明细以弹窗形式展示，不以内嵌展开形式展示。

本阶段不实现：

- 文件上传。
- 文档解析。
- chunk 生成。
- chunk 编辑。
- chunk 删除。
- 文档内容编辑。
- 文档删除。
- 拖拽交互。
- 复杂排序管理。
- 文档搜索和筛选。
- RAG 检索、embedding、召回测试。

## 3. 文档可选条件

待选文档本质上是“当前 RAG 尚未引用，但状态允许被 RAG 作为知识源使用的 `DocumentSource`”。

本阶段可被 RAG 选择的文档固定满足：

```text
DocumentSource.activeStatus = "active"
DocumentSource.status = "parsed"
```

说明：

- `status = "parsed"` 表示文档已经处于可作为知识源的状态。
- `activeStatus = "active"` 表示文档未被业务禁用。
- `fileType` 不限制为 `"file"`，因此用户知识笔记 `fileType = "note"` 只要满足上述状态，也可以作为待选文档。
- 待选文档必须排除当前 RAG 已经通过 `KnowledgeBaseDocument` 引用的文档。

## 4. 数据定义

### 4.1 已引用文档

已引用文档来自当前 RAG 的绑定关系：

```text
KnowledgeBase
-> KnowledgeBaseDocument
-> DocumentSource
```

这些文档会作为当前 RAG 的知识来源。

### 4.2 待选文档

待选文档来自 `DocumentSource`，并满足：

```text
activeStatus = "active"
status = "parsed"
not exists KnowledgeBaseDocument where knowledgeBaseId = currentRagId and documentId = DocumentSource.id
```

### 4.3 ComposeDocument

详情页文档编排使用的文档摘要类型：

```ts
type ComposeDocument = {
  id: string;
  title: string;
  originalName: string;
  fileName: string | null;
  sourceType: string;
  fileType: string;
  status: string;
  activeStatus: string;
  chunkCount: number;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
};
```

`fileType` 必须返回，用于区分外部文档和知识笔记：

```text
file: 外部上传或导入文档
note: 用户在知识笔记页面创建的 Markdown 笔记
```

### 4.4 Chunk 展示数据

已引用文档和待选文档都需要支持查看 chunk 明细。chunk 只读展示，不允许编辑。

已引用文档的 chunk 可以来自 RAG 详情 tree。待选文档的 chunk 可以在用户点击“分片”时按 documentId 请求。

建议复用以下字段：

```ts
type DetailChunk = {
  id: string;
  documentSourceId: string | null;
  content: string;
  chunkIndex: number;
  chunkType: string;
  title?: string | null;
  suggestedCategory?: string | null;
  suggestedTags?: string | null;
  reviewStatus?: string | null;
  charStart: number;
  charEnd: number;
  createdAt?: string;
};
```

每个 chunk 至少展示：

- chunk 序号。
- chunk 类型。
- chunk 内容。
- 字符范围或字符数。
- 如果存在，展示标题、分类、标签、审核状态。

## 5. 页面结构

详情页结构：

```text
返回知识库列表按钮
RAG 基础信息卡片
文档归属管理区
  已引用文档
    文档条目
  待选文档
    文档条目
  Chunk 查看弹窗
```

页面仍然处于 `AdminShell` 的 Main Content 内。

## 6. 文档条目展示

每个文档条目参考 `rag.phase2.md` 中旧弹窗的文档列表展示，但适配详情页。

文档条目展示：

- 文档标题。
- 原始文件名或 `fileName`。
- `fileType` 标签。
- `sourceType` 标签。
- 解析状态 `status`。
- 启用状态 `activeStatus`。
- chunk 数量。
- 文件大小。
- 更新时间。
- 操作按钮。

已引用文档操作按钮：

```text
分片
撤下
```

待选文档操作按钮：

```text
分片
启用
```

交互规则：

- 点击“分片”打开 chunk 查看弹窗，不改变文档归属，不触发 dirty 状态。
- 点击“撤下”只更新前端编排状态，不立即请求后端。
- 点击“启用”只更新前端编排状态，不立即请求后端。
- 同一个文档不能同时出现在已引用和待选两侧。
- 同一个列表内不能出现重复文档。
- 移动后页面进入 dirty 状态。

## 7. Chunk 明细展示

已引用文档和待选文档都必须支持查看 chunk 明细。

展示方式：

- 文档条目中提供“分片”按钮。
- 点击“分片”后打开弹窗展示该文档的所有 chunk。
- 已引用文档优先使用详情 tree 中已经返回的 `document.chunks`。
- 待选文档点击“分片”时，按需请求该文档的 chunks。
- 弹窗关闭后不影响已引用/待选列表，也不改变 dirty 状态。
- 如果该文档没有 chunk，弹窗显示空态文案：

```text
暂无分片数据
```

限制：

- 不允许新增 chunk。
- 不允许编辑 chunk。
- 不允许删除 chunk。
- 不允许重新切分。
- 不允许在本页触发 embedding。
- 查看待选文档 chunk 不等于启用该文档，只有点击“启用”并保存后才会写入 `KnowledgeBaseDocument`。

## 8. 保存机制

### 8.1 手动保存

手动保存是本阶段主路径。

文档归属管理区右上角提供按钮：

```text
保存文档配置
```

规则：

- 没有未保存变更时按钮禁用。
- `saving = true` 时按钮显示保存中状态。
- 点击保存后提交当前“已引用文档”的 id 列表。
- 保存成功后刷新 RAG 详情数据和文档编排数据。
- 保存成功后清除 dirty 状态。
- 保存失败时保留当前前端编排状态，并显示错误提示。

### 8.2 离开页面

离开页面时如果存在 dirty 状态：

- 优先提示用户存在未保存变更。
- 可以做 best-effort 自动保存，但不作为强验收。
- 自动保存失败不阻塞页面卸载。

不要求通过 React cleanup 保证异步保存一定成功。

## 9. API 与服务复用

本质上本阶段只是在修改 `DocumentSource` 与 `KnowledgeBase` 的对应关系，即 `KnowledgeBaseDocument` 关系。

优先复用现有接口和服务：

```text
POST /api/knowledge-bases/[id]/documents
DELETE /api/knowledge-bases/[id]/documents
GET /api/rag-management/documents/[id]/chunks
```

如果现有接口无法表达“保存当前最终集合”，可以在服务层新增一个“保存最终集合”的函数，但实现应复用现有绑定、解绑、校验和事务逻辑，避免重复业务规则。

保存最终集合的前端提交语义：

```ts
{
  documentIds: string[]
}
```

后端处理规则：

- 校验 RAG 是否存在。
- 校验所有 `documentIds` 是否存在。
- 校验所有 `documentIds` 是否满足可选条件：`activeStatus = "active"` 且 `status = "parsed"`。
- 计算当前已绑定集合与提交集合的差异。
- 新增需要绑定的关系。
- 删除需要解绑的关系。
- 不删除 `DocumentSource`。
- 不删除 `DocumentChunk`。
- 不修改文档内容。
- 不修改 chunk 内容。

如果继续使用增量接口，则前端保存时可以计算 `toAdd` 和 `toRemove`：

```text
toAdd -> POST /api/knowledge-bases/[id]/documents
toRemove -> DELETE /api/knowledge-bases/[id]/documents
```

## 10. 前端状态

详情页内局部维护文档编排状态，不放入 Zustand。

建议状态：

```ts
type ComposeState = {
  selectedDocuments: ComposeDocument[];
  availableDocuments: ComposeDocument[];
  initialSelectedDocumentIds: string[];
  chunkDialogOpen: boolean;
  chunkDialogDocument: ComposeDocument | null;
  chunkDialogChunks: DetailChunk[];
  chunkDialogLoading: boolean;
  chunkDialogError: string | null;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  error: string | null;
};
```

dirty 判断：

```ts
selectedDocuments.map((doc) => doc.id)
```

与 `initialSelectedDocumentIds` 不一致时，视为 dirty。

chunk 弹窗状态只服务查看行为，不参与 dirty 判断。

## 11. 与知识笔记的关系

知识笔记也保存为 `DocumentSource`：

```text
fileType = "note"
sourceType = "markdown"
```

当知识笔记的状态满足：

```text
activeStatus = "active"
status = "parsed"
```

它可以出现在 RAG 详情页的待选文档中。

知识笔记页面负责提供“是否成为知识源”的开关，用于在 `pending` 与 `parsed` 状态之间切换。该增量能力定义在 `docs/lzh/specs/spec-notebook.md`。

## 12. 验收标准

1. 点击 RAG 卡片进入 `/knowledge-bases/[id]`。
2. 详情页仍然处于 `AdminShell` 后台布局内。
3. 详情页不弹出旧上传弹窗。
4. 详情页不提供文件上传入口。
5. 页面展示 RAG 基础信息。
6. 页面展示已引用文档列表。
7. 页面展示待选文档列表。
8. 待选文档只包含 `activeStatus = "active"` 且 `status = "parsed"` 的 `DocumentSource`。
9. 待选文档包含 `fileType` 字段展示。
10. `fileType = "note"` 的知识笔记在状态为 `parsed` 时可以作为待选文档。
11. 点击“启用”后，文档从待选列表移动到已引用列表。
12. 点击“撤下”后，文档从已引用列表移动到待选列表。
13. 移动文档后页面进入 dirty 状态。
14. 点击保存后正确更新 `KnowledgeBaseDocument` 关系。
15. 保存失败时保留当前前端编排状态。
16. 解绑关系时不删除 `DocumentSource`。
17. 解绑关系时不删除 `DocumentChunk`。
18. 本页不允许编辑文档内容。
19. 本页不允许编辑 chunk 内容。
20. 已引用文档可以展示 chunk 明细。
21. 待选文档可以展示 chunk 明细。
22. chunk 明细以弹窗形式展示，不以内嵌展开形式展示。
23. 查看 chunk 不会改变 dirty 状态。
24. chunk 明细为只读展示。
25. 本阶段不实现拖拽。
26. 不破坏知识文档管理页的上传能力。
27. 不破坏知识笔记页面。
