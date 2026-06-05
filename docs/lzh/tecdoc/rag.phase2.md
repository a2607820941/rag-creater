# RAG 知识文档与分片管理 Phase 2 技术文档

## 1. 文档目标

本文档基于 `docs/lzh/specs/rag.phase2.md`，用于指导 RAG 知识库管理 Phase 2 的前端实现。

Phase 2 目标是在 Phase 1 已完成的 `/knowledge-bases` 页面基础上，补充单个知识库下的文档与分片管理能力：

- 点击知识库卡片主体打开当前知识库的知识文档管理弹窗。
- 弹窗中支持单文件上传 mock。
- 上传后生成文档记录和 2-3 条 mock 分片。
- 文档列表保存在 `selectedDocs`。
- 当前查看的文档分片保存在 `selectedChunks`。
- 上传和删除文档后同步更新 `items` 中对应知识库的 `documentCount` / `chunkCount`。
- 主列表 `items` 仍然不保存 documents/chunks 明细。

本文档只定义 Phase 2 前端技术方案，不进入真实文件上传、真实文档解析、真实分片生成、权限、多租户和服务端持久化。

---

## 2. Phase 1 现状与约束

Phase 1 已落地的关键文件：

```text
src/app/knowledge-bases/page.tsx
src/features/knowledge-bases/api.ts
src/features/knowledge-bases/mock-data.ts
src/features/knowledge-bases/types.ts
src/features/knowledge-bases/utils.ts
src/features/knowledge-bases/knowledge-base-management.tsx
src/store/slices/knowledge-base-slice.ts
```

当前 Zustand slice 已有状态：

```ts
items: RagListItem[];
selectedId: string | null;
selected: RagDetail | null;
selectedDocs: RagDoc[];
selectedChunks: RagChunk[];
loading: boolean;
error: string | null;
```

Phase 2 必须继续遵循 Phase 1 的边界：

- `items` 是轻量知识库列表，只保存卡片展示和统计字段。
- `items` 不保存 `documents` 或 `chunks` 明细。
- 文档列表只保存在 `selectedDocs`。
- 当前分片列表只保存在 `selectedChunks`。
- 当前选中知识库信息保存在 `selectedId` 和 `selected`。

---

## 3. 推荐实现方式

### 3.1 组件拆分

Phase 1 的 `knowledge-base-management.tsx` 已经包含列表、筛选、表单和删除确认框。Phase 2 会继续增加上传、文档列表和分片弹窗，如果全部堆进同一个文件，后续维护会明显变差。

建议在 `src/features/knowledge-bases/` 下新增少量业务组件：

```text
src/features/knowledge-bases/knowledge-documents-dialog.tsx
src/features/knowledge-bases/document-upload-zone.tsx
src/features/knowledge-bases/document-chunks-dialog.tsx
```

职责说明：

- `knowledge-base-management.tsx`：继续作为页面容器，负责知识库列表、卡片主体点击、打开文档弹窗。
- `knowledge-documents-dialog.tsx`：负责 `查看知识` 弹窗、文档列表、删除文档确认框。
- `document-upload-zone.tsx`：负责点击选择文件、拖拽上传、文件校验和上传错误展示。
- `document-chunks-dialog.tsx`：负责只读展示当前文档的分片。

通用 UI 仍使用 `src/components/ui/` 下的 shadcn/ui 组件，不新增独立 UI 库。

### 3.2 状态设计

Phase 2 不新增独立 store，只扩展现有 `knowledge-base-slice.ts`。

建议新增或调整的状态动作：

```ts
setSelectedDocs: (docs: RagDoc[]) => void;
setSelectedChunks: (chunks: RagChunk[]) => void;
setSelectedId: (id: string | null) => void;
setSelected: (detail: RagDetail | null) => void;
updateItem: (id: string, patch: Partial<RagListItem>) => void;
```

其中 `setSelectedDocs`、`setSelectedChunks`、`setSelectedId`、`setSelected`、`updateItem` 已在 Phase 1 slice 中存在。Phase 2 可以直接复用。

如实现时需要让文档操作更集中，可以新增两个派生 action：

```ts
addSelectedDoc: (doc: RagDoc, chunks: RagChunk[]) => void;
deleteSelectedDoc: (docId: string) => void;
```

但第一版建议先保持简单：在业务组件中组合调用 `setSelectedDocs`、`setSelectedChunks`、`updateItem`，避免过早扩大 slice API。

---

## 4. 类型调整

当前 `RagChunk` 没有 `documentId`，Phase 2 需要知道分片属于哪个文档，因此建议调整 `src/features/knowledge-bases/types.ts`：

```ts
export type RagChunk = {
  id: string;
  documentId: string;
  content: string;
  tokenCount?: number;
  charCount?: number;
  createdAt?: string;
};
```

当前 `RagDetail` 是：

```ts
export type RagDetail = RagListItem & {
  documents: RagDoc[];
};
```

Phase 2 不把文档列表放进 `selected`，而是单独放在 `selectedDocs`。建议改为：

```ts
export type RagDetail = RagListItem;
```

这样状态含义更清楚：

- `selected`：当前知识库基础详情。
- `selectedDocs`：当前知识库文档列表。
- `selectedChunks`：当前正在查看的分片列表。

---

## 5. 文件上传规则

### 5.1 支持类型

允许上传的扩展名：

```ts
const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md", ".markdown"];
```

允许上传的 MIME 类型可作为辅助判断：

```ts
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
];
```

文件类型判断以扩展名为主，MIME 类型为辅助，因为部分浏览器或系统可能无法稳定提供 Markdown MIME。

### 5.2 文件大小

文件大小上限：

```ts
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;
```

超过 20MB 时直接拦截，并展示用户可见错误：

```text
文件大小不能超过 20MB
```

### 5.3 单文件限制

Phase 2 不支持一次选择多个文件。

处理规则：

- `input[type=file]` 不设置 `multiple`。
- 拖拽时如果 `files.length > 1`，直接拦截。
- 错误提示：

```text
当前仅支持一次上传 1 个文件
```

### 5.4 重名限制

同一知识库下不允许上传同名文件。

校验范围：

```ts
selectedDocs.some((doc) => doc.name === file.name);
```

重名错误提示：

```text
当前知识库已存在同名文档
```

---

## 6. 上传 mock 设计

### 6.1 文档生成

上传成功后生成文档：

```ts
const doc: RagDoc = {
  id: createClientId(),
  name: file.name,
  size: file.size,
  uploadedAt: new Date().toISOString(),
};
```

### 6.2 分片生成

每个文件随机生成 2-3 条分片：

```ts
const chunkCount = 2 + Math.floor(Math.random() * 2);
```

分片结构：

```ts
const chunks: RagChunk[] = Array.from({ length: chunkCount }, (_, index) => {
  const content = `这是从 ${file.name} 生成的模拟知识分片 ${index + 1}。`;

  return {
    id: createClientId(),
    documentId: doc.id,
    content,
    charCount: content.length,
    tokenCount: Math.ceil(content.length / 2),
    createdAt: new Date().toISOString(),
  };
});
```

说明：

- `tokenCount` 当前阶段只是简单估算，不代表真实 tokenizer。
- chunks 不写入 `items`。
- `selectedChunks` 只保存当前正在查看的文档分片。

### 6.3 分片缓存建议

如果只使用 `selectedChunks`，上传多个文档后只能保留“当前正在查看”的文档分片，无法再打开旧文档分片。

因此建议新增一个页面本地状态维护当前弹窗内的分片映射：

```ts
const [chunksByDocumentId, setChunksByDocumentId] = useState<
  Record<string, RagChunk[]>
>({});
```

规则：

- 上传成功后：`chunksByDocumentId[doc.id] = chunks`
- 点击文档 `分片`：从 `chunksByDocumentId[doc.id]` 取出并写入 `selectedChunks`
- 删除文档：从 `chunksByDocumentId` 中移除该文档 id

该状态只用于 Phase 2 mock。后续接入真实接口时，点击分片可直接请求后端，不需要长期保留该映射。

---

## 7. 查看知识数据流

点击知识库卡片主体：

```text
用户点击知识库卡片主体
→ setSelectedId(item.id)
→ setSelected(item)
→ setSelectedDocs([])
→ setSelectedChunks([])
→ 打开 KnowledgeDocumentsDialog
```

当前阶段初次打开某个知识库时文档列表为空。

按钮事件处理要求：

- `编辑` 和 `删除` 按钮继续保留在卡片底部。
- 卡片不再展示 `查看知识` 按钮。
- `编辑` 和 `删除` 按钮点击事件需要调用 `event.stopPropagation()`。
- 键盘可访问性建议：卡片主体支持 `Enter` 打开查看知识，按钮仍保持自身语义。

如实现模拟详情请求，可以封装：

```ts
async function loadRagDetail(item: RagListItem) {
  setSelectedId(item.id);
  setSelected(item);
  setSelectedDocs([]);
  setSelectedChunks([]);
}
```

后续接入真实接口时，替换为：

```text
GET /api/knowledge-bases/:id
```

接口失败时仍需要 fallback 到：

```ts
setSelected(item);
setSelectedDocs([]);
setSelectedChunks([]);
```

---

## 8. 上传成功数据流

上传文件通过校验后：

```text
生成 RagDoc
→ 生成 2-3 条 RagChunk
→ setSelectedDocs([...selectedDocs, doc])
→ 更新 chunksByDocumentId
→ updateItem(selectedId, {
    documentCount: selectedDocs.length + 1,
    chunkCount: 当前知识库所有 mock chunks 总数
  })
```

`chunkCount` 计算建议：

```ts
function getTotalChunkCount(chunksByDocumentId: Record<string, RagChunk[]>) {
  return Object.values(chunksByDocumentId).reduce(
    (sum, chunks) => sum + chunks.length,
    0
  );
}
```

注意：

- 不要把 `documents` 写入 `items`。
- 不要把 `chunks` 写入 `items`。
- `items` 只更新 `documentCount` 和 `chunkCount`。

---

## 9. 删除文档数据流

点击文档 `删除`：

```text
setDeleteDocTarget(doc)
→ 打开确认框
```

点击取消：

```text
setDeleteDocTarget(null)
→ 不改任何数据
```

点击确认删除：

```text
从 selectedDocs 删除 doc
→ 从 chunksByDocumentId 删除 doc.id
→ 如果 selectedChunks 属于 doc.id，则 setSelectedChunks([])
→ updateItem(selectedId, {
    documentCount: nextDocs.length,
    chunkCount: nextTotalChunkCount
  })
→ 关闭确认框
```

确认框文案：

```text
标题：确认删除文档
正文：确定要从「<知识库名称>」中删除「<文档名称>」吗？删除后该文档和关联模拟分片会从当前知识库中移除。
按钮：取消 / 确认删除
```

`确认删除` 使用 `destructive` 样式。

---

## 10. 查看分片数据流

点击文档 `分片`：

```text
从 chunksByDocumentId[doc.id] 读取 chunks
→ setSelectedChunks(chunks)
→ 打开 DocumentChunksDialog
```

分片弹窗只读展示：

- 序号。
- content。
- charCount。
- tokenCount。
- createdAt。

如果没有分片：

```text
暂无知识分片
```

---

## 11. API 预留

Phase 2 当前阶段仍以 mock 为主，不要求真实接口联调。

建议在 `src/features/knowledge-bases/api.ts` 中预留函数：

```ts
export async function fetchRagDetail(id: string) {
  const response = await fetch(`/api/knowledge-bases/${id}`);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch knowledge base detail: ${response.status}`
    );
  }

  return response.json();
}

export async function fetchDocumentChunks(params: {
  knowledgeBaseId: string;
  documentId: string;
}) {
  const response = await fetch(
    `/api/knowledge-bases/${params.knowledgeBaseId}/documents/${params.documentId}/chunks`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch document chunks: ${response.status}`);
  }

  return response.json();
}
```

当前实现可以不主动调用真实接口，或调用失败后立即 fallback 到 mock 空文档列表。

---

## 12. 数据兜底

### 12.1 文档兜底

建议提供：

```ts
export function normalizeRagDoc(input: unknown): RagDoc {
  // name 缺失：未命名文档
  // size 缺失或非数字：0
  // uploadedAt 缺失：--
}
```

文档列表兜底：

```ts
const safeDocs = Array.isArray(selectedDocs) ? selectedDocs : [];
```

### 12.2 分片兜底

建议提供：

```ts
export function normalizeRagChunk(input: unknown): RagChunk {
  // content 缺失：暂无内容
  // charCount/tokenCount 缺失：不展示或 0
  // createdAt 缺失：--
}
```

分片列表兜底：

```ts
const safeChunks = Array.isArray(selectedChunks) ? selectedChunks : [];
```

---

## 13. UI 组件建议

优先复用已存在的 shadcn/ui 组件：

- `Button`
- `Input`
- `Dialog`
- `AlertDialog`
- `Card`
- `Badge`

Phase 2 可以视实现需要新增：

- `Table`：文档列表。
- `Separator`：弹窗内区域分隔。
- `ScrollArea`：分片内容较长时滚动展示。

如果不新增 `Table`，第一版也可以用 `Card` + grid 实现文档列表，但技术计划中应明确采用一种方式，避免实现阶段反复调整。

建议第一版使用 `Card` + grid，减少新增组件数量；如果文档列表后续要支持分页、排序或批量操作，再切到 `Table`。

---

## 14. 页面本地状态建议

`KnowledgeBaseManagement` 可新增：

```ts
const [documentsDialogOpen, setDocumentsDialogOpen] = useState(false);
```

`KnowledgeDocumentsDialog` 内部维护：

```ts
const [uploadError, setUploadError] = useState<string | null>(null);
const [deleteDocTarget, setDeleteDocTarget] = useState<RagDoc | null>(null);
const [chunksDialogOpen, setChunksDialogOpen] = useState(false);
const [chunksByDocumentId, setChunksByDocumentId] = useState<
  Record<string, RagChunk[]>
>({});
```

说明：

- 弹窗开关、上传错误、删除目标属于 UI 临时状态，放组件本地。
- `selectedDocs`、`selectedChunks` 属于跨组件共享数据，放 Zustand。
- `chunksByDocumentId` 当前只服务 Phase 2 mock，可先放文档弹窗本地，避免污染全局 store。

---

## 15. 实现边界

Phase 2 不做：

- 真实文件上传。
- 真实文档解析。
- 真实分片生成。
- 一次选择多个文件。
- 分片编辑。
- 分片删除。
- 分片重新切分。
- 权限控制。
- 多租户隔离。

Phase 2 必须避免：

- 把 `documents` 写入 `items`。
- 把 `chunks` 写入 `items`。
- 从 `items[].documents` 派生 `documentCount`。
- 从 `items[].documents[].chunks` 派生 `chunkCount`。

---

## 16. 验证建议

实现完成后运行：

```bash
npm run lint
npm run build
```

人工验证：

- 知识库卡片不出现 `查看知识` 按钮。
- 点击知识库卡片主体打开弹窗，标题包含当前知识库名称。
- 点击卡片内的 `编辑` 和 `删除` 按钮不会打开查看知识弹窗。
- 初次打开文档列表为空。
- 点击上传区域可以选择文件。
- 拖拽单个合法文件可以上传。
- 一次拖拽多个文件会展示错误。
- 不支持的文件类型会展示错误。
- 超过 20MB 的文件会展示错误。
- 同一知识库下上传同名文件会展示错误。
- 上传成功后文档列表新增 1 条文档。
- 上传成功后卡片 `documentCount` 增加。
- 上传成功后卡片 `chunkCount` 增加 2 或 3。
- 点击文档 `分片` 打开只读分片弹窗。
- 删除文档前出现确认框。
- 点击取消不删除。
- 点击确认删除后文档列表和卡片统计同步更新。
