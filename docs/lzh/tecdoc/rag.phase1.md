# RAG 知识库管理 Phase 1 技术文档

## 1. 文档目标

本文档基于 `docs/lzh/specs/rag.phase1.md`，用于指导 RAG 知识库管理 Phase 1 的前端实现。

Phase 1 目标是完成 `/knowledge-bases` 页面中的知识库基础管理闭环：

- 页面初始化时向后端请求知识库列表。
- 请求成功后初始化 `knowledge-base-slice.ts` 中的 Zustand 轻量列表状态。
- 请求失败或后端暂不可用时，可使用本地 mock 数据作为兜底。
- 页面从 Zustand 中消费 RAG 轻量列表并派生展示数据。
- 支持搜索、排序、统计筛选、新建、编辑、删除。
- Phase 1 只有初始化列表请求模拟后端流程；新建、编辑、删除暂不落库，只更新前端 Zustand。后续接入真实 API 时再替换为 POST / PATCH / DELETE。
- 不实现文档上传、文档列表和分片管理，这些能力拆到 Phase 2。

本文档只定义 Phase 1 技术方案，不进入真实后端接口、权限、多租户、文档管理和分片管理。

---

## 2. 关键设计建议

### 2.1 不建议使用“数组套数组”作为主状态

你提到希望 Zustand 仓库主要储存 RAG 的数组，数组每项是一个子数组，子数组保存该 RAG 的各项属性供页面消费。

从实现维护角度，不建议把主状态设计成：

```ts
type RagRow = unknown[];
type RagState = RagRow[];
```

原因：

- 字段含义依赖数组下标，后续维护困难。
- 新增字段、删除字段、调整顺序时容易造成隐性 bug。
- TypeScript 很难表达每个下标的业务含义。
- 表单、卡片、统计、编辑弹窗都需要反复通过下标读取字段，可读性差。
- 后端字段缺失或顺序变化时，兜底逻辑会变复杂。

推荐主状态使用轻量对象数组：

```ts
type RagListItem = {
  id: string;
  name: string;
  description: string;
  icon: RagIconName;
  documentCount: number;
  chunkCount: number;
  topK: number;
  chunkSize: number;
  similarityThreshold: number;
  status: "active" | "disabled";
  updatedAt: string;
};

type RagState = {
  items: RagListItem[];
};
```

`icon` 不再使用任意字符串，统一收敛为十个 lucide 图标枚举值，并通过该值派生卡片图标颜色。

如果后端早期返回的是数组套数组，可以在接口适配层转换成对象数组，再写入 Zustand：

```ts
function normalizeRagItem(raw: unknown): RagListItem {
  // 后续技术实现中在这里集中处理数组格式、对象格式和字段兜底。
}
```

结论：Zustand 主状态中存 `RagListItem[]`，页面列表只消费轻量对象数组。

### 2.2 documents/chunks 只保留当前选中详情

数据库中可能存在大量 documents 和 chunks。列表页初始化时不应把所有 RAG 的文档和分片明细全部拉到前端。

推荐状态边界：

- `items`：所有 RAG 的轻量列表数据，用于列表展示、搜索、排序、统计。
- `selectedId`：当前选中的 RAG id。
- `selected`：当前选中 RAG 的详情基础信息。
- `selectedDocs`：当前选中 RAG 的文档列表。
- `selectedChunks`：当前正在查看的文档或 RAG 下的分片列表。

用户只会详细查看一个 RAG，因此详情数据按需请求即可：

```text
用户点击查看某个 RAG
→ setSelectedId(id)
→ GET /api/knowledge-bases/:id
→ 更新 selected、selectedDocs
→ 用户点击某个文档的分片
→ GET /api/knowledge-bases/:id/documents/:documentId/chunks
→ 更新 selectedChunks
```

Phase 1 不实现文档和分片详情查询，但状态命名和边界应为 Phase 2 预留。

因此 Phase 1 可以先在 `knowledge-base-slice.ts` 中预留 `selected`、`selectedDocs`、`selectedChunks` 字段，但页面暂不消费文档和分片详情；详情请求与展示放到 Phase 2。

### 2.3 页面展示数量从状态派生

页面展示的知识库总数、启用数量、禁用数量从 `items` 派生。

这些值应从 Zustand 中的 `items` 派生：

- 知识库总量：`items.length`
- 启用数量：`items.filter(item => item.status === "active").length`
- 禁用数量：`items.filter(item => item.status === "disabled").length`
- 文档数量：使用列表接口返回的 `documentCount`
- Chunks 数量：使用列表接口返回的 `chunkCount`

这样新建、编辑、删除后只需要更新 `items`，列表统计会自动变化。文档和分片明细数量由后端在列表接口中计算后返回，前端不在 Phase 1 全量持有明细。

---

## 3. 实现范围

Phase 1 实现：

- `/knowledge-bases` 页面真实业务内容替换当前占位页。
- 页面初始化请求知识库列表。
- 初始化 Zustand 知识库状态。
- mock 数据兜底。
- 知识库筛选操作栏。
- 知识库统计卡片。
- 知识库卡片列表。
- 新建知识库弹窗。
- 编辑知识库弹窗。
- 删除知识库确认框。
- 前端字段兜底和异常兜底。

Phase 1 不实现：

- 查看知识弹窗。
- 文件上传。
- 文档列表。
- 文档删除。
- 分片查看。
- 分片编辑。
- 真实权限控制。
- 多租户隔离。

---

## 4. 推荐文件结构

```text
src/app/knowledge-bases/page.tsx
src/features/knowledge-bases/api.ts
src/features/knowledge-bases/mock-data.ts
src/features/knowledge-bases/types.ts
src/features/knowledge-bases/utils.ts
src/features/knowledge-bases/knowledge-base-management.tsx
src/store/slices/knowledge-base-slice.ts
```

职责说明：

- `page.tsx`：路由入口，只负责把页面放进 `AdminShell`，并渲染业务容器。
- `api.ts`：封装后端请求和响应数据归一化。
- `mock-data.ts`：存放 3-5 条初始化 mock 知识库数据。
- `types.ts`：定义 Phase 1 需要的业务类型。
- `utils.ts`：放置统计、排序、搜索、字段兜底等纯函数。
- `knowledge-base-management.tsx`：页面业务容器，负责初始化请求、组合页面区域、维护 UI 本地状态，并直接使用 `src/components/ui/` 下的 shadcn/ui 通用组件。
- `knowledge-base-slice.ts`：全局知识库数据状态和写操作。

说明：

- 当前阶段不预先拆分大量页面专属 UI 组件。
- `Button`、`Input`、`Dialog`、`Select`、`Switch`、`Card` 等通用 UI 组件统一放在 `src/components/ui/`。
- 业务页面直接组合通用 UI 组件并微调样式。
- 当 `knowledge-base-management.tsx` 明显过大或某段 JSX 需要复用时，再拆业务组件。

---

## 5. 数据模型

### 5.1 状态类型

```ts
export type RagStatus = "active" | "disabled";

export type RagIconName =
  | "Database"
  | "BookOpen"
  | "FileText"
  | "Folder"
  | "Archive"
  | "Brain"
  | "Bot"
  | "GraduationCap"
  | "BriefcaseBusiness"
  | "Lightbulb";

export type RagListItem = {
  id: string;
  name: string;
  description: string;
  icon: RagIconName;
  documentCount: number;
  chunkCount: number;
  topK: number;
  chunkSize: number;
  similarityThreshold: number;
  status: RagStatus;
  updatedAt: string;
};
```

Phase 2 详情数据类型：

```ts
export type RagDoc = {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
};

export type RagChunk = {
  id: string;
  content: string;
  tokenCount?: number;
  charCount?: number;
  createdAt?: string;
};

export type RagDetail = RagListItem & {
  documents: RagDoc[];
};
```

### 5.2 表单类型

```ts
export type KnowledgeBaseFormValues = {
  name: string;
  description: string;
  icon: RagIconName;
  topK: number;
  chunkSize: number;
  similarityThreshold: number;
  status: RagStatus;
};
```

默认值：

```ts
export const DEFAULT_KNOWLEDGE_BASE_FORM_VALUES = {
  name: "",
  description: "",
  icon: "Database",
  topK: 5,
  chunkSize: 500,
  similarityThreshold: 0.7,
  status: "active",
} satisfies KnowledgeBaseFormValues;
```

### 5.3 图标配置

建议在 `src/features/knowledge-bases/types.ts` 或 `utils.ts` 中维护统一配置，页面渲染和表单下拉框共用同一份数据：

```ts
export const RAG_ICON_OPTIONS = [
  { value: "Database", label: "数据库", className: "text-blue-600 bg-blue-50" },
  { value: "BookOpen", label: "知识", className: "text-emerald-600 bg-emerald-50" },
  { value: "FileText", label: "文档", className: "text-cyan-600 bg-cyan-50" },
  { value: "Folder", label: "文件夹", className: "text-yellow-600 bg-yellow-50" },
  { value: "Archive", label: "归档", className: "text-orange-600 bg-orange-50" },
  { value: "Brain", label: "智能", className: "text-purple-600 bg-purple-50" },
  { value: "Bot", label: "Agent", className: "text-indigo-600 bg-indigo-50" },
  { value: "GraduationCap", label: "学习", className: "text-pink-600 bg-pink-50" },
  { value: "BriefcaseBusiness", label: "业务", className: "text-slate-600 bg-slate-50" },
  { value: "Lightbulb", label: "经验", className: "text-amber-600 bg-amber-50" },
] as const;
```

实现要求：

- 图标组件从 `lucide-react` 引入，不手写 SVG。
- 卡片图标、表单预览和下拉选项都从 `RAG_ICON_OPTIONS` 获取展示样式。
- 兜底函数需要把未知 icon 归一为 `Database`。

---

## 6. Zustand 状态设计

`src/store/slices/knowledge-base-slice.ts` 需要从模板状态改造成知识库业务状态。

建议状态结构：

```ts
export type KnowledgeBaseSlice = {
  /** RAG 轻量列表。列表页展示、搜索、排序、统计、新建、编辑、删除都基于该数组。 */
  items: RagListItem[];

  /** 当前选中的 RAG id。 */
  selectedId: string | null;

  /** 当前选中的 RAG 详情。Phase 2 查看详情时按需请求后写入。 */
  selected: RagDetail | null;

  /** 当前选中 RAG 的文档列表。Phase 2 按需请求后写入。 */
  selectedDocs: RagDoc[];

  /** 当前查看的分片列表。Phase 2 按需请求后写入。 */
  selectedChunks: RagChunk[];

  /** 列表初始化或后续请求中的 loading 状态。 */
  loading: boolean;

  /** 请求或本地操作产生的错误信息。 */
  error: string | null;

  /** 用后端返回或 mock 兜底数据整体替换 RAG 轻量列表。 */
  setItems: (items: RagListItem[]) => void;

  /** 设置当前选中的 RAG id。 */
  setSelectedId: (id: string | null) => void;

  /** 设置当前选中的 RAG 详情。 */
  setSelected: (detail: RagDetail | null) => void;

  /** 设置当前选中 RAG 的文档列表。 */
  setSelectedDocs: (docs: RagDoc[]) => void;

  /** 设置当前查看的分片列表。 */
  setSelectedChunks: (chunks: RagChunk[]) => void;

  /** 新增 RAG。 */
  addItem: (item: RagListItem) => void;

  /** 按 id 更新 RAG。 */
  updateItem: (id: string, patch: Partial<RagListItem>) => void;

  /** 按 id 删除 RAG。 */
  deleteItem: (id: string) => void;

  /** 设置请求 loading 状态。 */
  setLoading: (loading: boolean) => void;

  /** 设置错误信息。 */
  setError: (error: string | null) => void;
};
```

说明：

- 状态字段使用简洁命名；slice 类型名可沿用 `KnowledgeBaseSlice`，避免为了重命名产生无意义改动。
- UI 临时状态不进入 Zustand。
- 搜索关键字、排序字段、排序方向、统计卡片筛选、弹窗开关、表单草稿放在页面容器本地 state。
- 主列表不保存 documents/chunks 明细。
- `documentCount` 和 `chunkCount` 作为轻量列表字段保存，由后端列表接口计算后返回。
- 只有当前选中的 RAG 才在 `selected`、`selectedDocs`、`selectedChunks` 中保存详情。
- 新建和编辑成功时，调用方负责把 `updatedAt` 设置为当前时间后写入 store。

---

## 7. 页面初始化数据流

页面初始化时的数据流：

```text
/knowledge-bases 页面渲染
→ KnowledgeBaseManagement 客户端组件挂载
→ 设置 loading=true
→ 调用 fetchRagItems()
→ 后端返回数据
→ normalizeRagItems(raw)
→ setItems(normalized)
→ 设置 loading=false
→ 页面从 Zustand 读取 items 并渲染
```

异常兜底流程：

```text
fetchRagItems() 请求失败
→ console.warn 输出调试信息
→ 使用 mockRagItems 初始化状态
→ setError("知识库数据加载失败，已使用本地模拟数据")
→ 页面仍然可交互
```

设计建议：

- Phase 1 可以先把 `api.ts` 的请求地址写成约定路径，例如 `/api/knowledge-bases`。
- 如果后端接口尚未实现，请求失败后使用 mock 数据兜底。
- 后续接口完成后，只需要调整 `api.ts` 和 `normalizeRagItems`，页面组件不需要重写。

---

## 8. 后端接口约定

Phase 1 前端建议先按以下接口形态设计。

### 8.1 查询知识库列表

```http
GET /api/knowledge-bases
```

列表接口不返回 `documents` 和 `chunks` 明细，只返回知识库卡片展示所需字段以及 `documentCount`、`chunkCount` 统计字段。文档和分片详情由 Phase 2 的详情接口按需加载。

期望响应：

```ts
type GetRagItemsResponse =
  | RagListItem[]
  | {
      data?: unknown;
    };
```

归一化规则：

- 如果响应本身是数组，则直接按数组处理。
- 如果响应是对象且 `data` 是数组，则使用 `data`。
- 其他情况使用空数组。
- 每个 item 都必须经过字段兜底。

### 8.2 新建、编辑、删除

Phase 1 不要求真实调用新建、编辑、删除接口。

当前阶段：

- 新建：写入 Zustand。
- 编辑：更新 Zustand。
- 删除：从 Zustand 移除。

后续接入接口后，可以增加：

```http
POST /api/knowledge-bases
PATCH /api/knowledge-bases/:id
DELETE /api/knowledge-bases/:id
```

### 8.3 Phase 2 详情接口预留

Phase 2 查看某个 RAG 的文档和分片时，不从列表接口取全量明细，而是按需请求：

```http
GET /api/knowledge-bases/:id
GET /api/knowledge-bases/:id/documents/:documentId/chunks
```

请求成功后分别更新：

- `selected`
- `selectedDocs`
- `selectedChunks`

---

## 9. mock 数据设计

`src/features/knowledge-bases/mock-data.ts` 存放：

```ts
export const mockRagItems: RagListItem[] = [
  // 3-5 条数据
];
```

mock 要求：

- 3-5 条知识库。
- 同时包含 `active` 和 `disabled`。
- 覆盖不同 `documentCount` 和 `chunkCount`，方便验证统计和排序。
- `updatedAt` 使用可排序的 ISO 字符串。
- 数据覆盖不同文档数量，方便验证按文档数量排序。

示例覆盖场景：

- active，`documentCount > 0` 且 `chunkCount > 0`。
- active，`documentCount = 0`。
- disabled，`documentCount > 0`。
- disabled，`documentCount = 0`。

---

## 10. 数据兜底与归一化

建议在 `utils.ts` 中提供归一化函数：

```ts
export function normalizeRagItems(input: unknown): RagListItem[] {
  const list = Array.isArray(input)
    ? input
    : typeof input === "object" && input !== null && Array.isArray((input as { data?: unknown }).data)
      ? (input as { data: unknown[] }).data
      : [];

  return list.map(normalizeRagItem);
}
```

单项兜底规则：

- `id` 缺失时生成前端 id。
- `name` 缺失时使用 `未命名知识库`。
- `description` 缺失时使用 `暂无描述`。
- `icon` 缺失或不是十个可选值时使用 `Database`。
- `documentCount` 缺失或非数字时使用 `0`。
- `chunkCount` 缺失或非数字时使用 `0`。
- `topK` 缺失或非数字时使用 `0`。
- `chunkSize` 缺失或非数字时使用 `0`。
- `similarityThreshold` 缺失或非数字时使用 `0`。
- `status` 非 `active` / `disabled` 时使用 `disabled`。
- `updatedAt` 缺失时使用 `--`。

注意：

- 新建表单默认值和接口兜底值不是同一概念。
- 新建默认值使用 `topK=5`、`chunkSize=500`、`similarityThreshold=0.7`。
- 异常数据兜底值按 spec 使用 `0` 或默认文案，避免崩溃。

---

## 11. 页面本地 UI 状态

`KnowledgeBaseManagement` 建议维护以下本地 state：

```ts
type SortField = "updatedAt" | "documentCount";
type SortDirection = "desc" | "asc";
type StatusFilter = "all" | "active" | "disabled" | null;

const [searchInput, setSearchInput] = useState("");
const [submittedSearchKeyword, setSubmittedSearchKeyword] = useState("");
const [sortField, setSortField] = useState<SortField>("updatedAt");
const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
const [formDialogMode, setFormDialogMode] = useState<"create" | "edit" | null>(null);
const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
```

处理规则：

- 输入框输入时只更新 `searchInput`。
- 按 Enter 时把 `searchInput.trim()` 写入 `submittedSearchKeyword`。
- 清空输入时同时清空 `searchInput` 和 `submittedSearchKeyword`。
- 排序字段只影响排序，不影响统计卡片状态。
- 统计卡片只影响状态筛选，不改变排序字段。
- 再次点击已高亮统计卡片时，`statusFilter` 置为 `null`。

---

## 12. 派生数据顺序

页面展示列表建议按以下顺序派生：

```text
Zustand items
→ 数据兜底后的 safeItems
→ submittedSearchKeyword 搜索过滤
→ statusFilter 状态过滤
→ sortField 排序
→ sortDirection 控制正序/倒序
→ 渲染卡片
```

统计卡片数量不使用过滤后的列表，而是始终从全部 `safeItems` 计算。

---

## 13. 新建与编辑表单

### 13.1 shadcn/ui 组件建议

技术实现时建议优先使用以下 shadcn/ui 风格组件：

- `Button`
- `Input`
- `Textarea`
- `Select`
- `Dialog`
- `Switch`
- `Card`
- `Badge`
- `Label`

若项目尚未存在对应组件，可按 shadcn/ui 目录约定新增到 `src/components/ui/`。

### 13.2 表单字段

表单字段：

- `name`
- `description`
- `icon`
- `topK`
- `chunkSize`
- `similarityThreshold`
- `status`

新建默认值：

- `name = ""`
- `description = ""`
- `icon = "Database"`
- `topK = 5`
- `chunkSize = 500`
- `similarityThreshold = 0.7`
- `status = "active"`

图标字段使用下拉框实现：

- 选项来自 `RAG_ICON_OPTIONS`。
- 下拉项展示图标、中文标签和浅色样式预览。
- 保存时只写入 `RagIconName` 字符串，不额外保存颜色字段。

### 13.3 校验规则

保存前校验：

- `name.trim()` 不能为空。
- `topK` 必须为正整数。
- `chunkSize` 必须为正整数。
- `similarityThreshold` 必须在 `0-1` 范围内。
- 新建时不能与任意已有知识库重名。
- 编辑时名称重复校验排除当前知识库 id。

校验失败：

- 不写入 Zustand。
- 弹窗不关闭。
- 保存按钮上方展示红色错误提示。

### 13.4 保存规则

新建成功：

- 生成前端唯一 id。
- `updatedAt` 设置为当前时间。
- `documentCount` 初始化为 `0`。
- `chunkCount` 初始化为 `0`。
- 调用 `addItem`。
- 关闭弹窗。

编辑成功：

- 保留原有 `id`、`documentCount` 和 `chunkCount`。
- `updatedAt` 更新为当前时间。
- 调用 `updateItem`。
- 关闭弹窗。

---

## 14. 删除确认框

点击卡片删除按钮：

```text
setDeleteTargetId(knowledgeBase.id)
```

删除确认框：

- 标题：`确认删除知识库`
- 正文：包含知识库名称，例如 `确定要删除「产品知识库」吗？此操作不可恢复。`
- 确认按钮：`确认删除`

取消删除：

- 点击右上角关闭图标。
- 点击取消按钮。
- 点击弹窗外部遮罩。

确认删除：

- 调用 `deleteItem(id)`。
- 如果删除的是 `selectedId`，同时清空 `selectedId`、`selected`、`selectedDocs` 和 `selectedChunks`。
- 关闭确认框。

---

## 15. 卡片与统计展示

### 15.1 卡片指标

每张卡片展示：

- 名称
- 描述
- 图标，使用 `icon` 对应的 lucide 图标和浅色样式
- 文档数量
- Chunks 数量
- TopK
- 相似度阈值
- 更新时间
- 状态
- 编辑按钮
- 删除按钮

Phase 1 不展示 `查看知识` 按钮。

卡片布局与交互建议：

- 桌面端使用三列网格，例如 `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`，宽屏下一行 3 张。
- 卡片 padding 保持中等偏紧凑，指标区使用两列或紧凑 grid，避免大面积空白。
- 卡片背景与页面底色做轻微区分，例如白色或浅灰背景、弱边框和轻阴影。
- hover 时使用 `hover:scale-[1.01]`、`hover:shadow-md` 或边框变色，过渡控制在 `duration-200` 左右。
- 编辑和删除按钮使用比小号按钮更大的尺寸，例如 `h-9 px-3`，并保留清晰的图标或文字。
- 删除按钮仍使用危险色语义，不与卡片点击入口混淆。

### 15.2 状态样式

- `active`：显示 `启用`，绿色、加粗，建议使用绿色文字和浅绿色背景。
- `disabled`：显示 `禁用`，红色、加粗，建议使用红色文字和浅红色背景。

### 15.3 统计卡片样式

- `知识库总量` 统计卡片 icon 使用蓝色系。
- `启用知识库` 统计卡片 icon 使用绿色系。
- `禁用知识库` 统计卡片 icon 使用红色系。
- 三张统计卡片应保持相同结构，仅通过 icon 颜色和轻微背景色区分状态。

### 15.4 空状态

全部列表为空：

- `暂无知识库`
- `点击新建按钮创建你的第一个知识库`
- 显示新建按钮。

搜索或筛选无结果：

- `没有找到符合条件的知识库`

---

## 16. 初始化请求与 mock fallback 的建议实现

建议 `KnowledgeBaseManagement` 在 `useEffect` 中初始化：

```ts
useEffect(() => {
  let ignore = false;

  async function loadRagItems() {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchRagItems();
      if (!ignore) {
        setItems(normalizeRagItems(data));
      }
    } catch (error) {
      console.warn("Failed to load knowledge bases, fallback to mock data.", error);
      if (!ignore) {
        setItems(mockRagItems);
        setError("知识库数据加载失败，已使用本地模拟数据");
      }
    } finally {
      if (!ignore) {
        setLoading(false);
      }
    }
  }

  loadRagItems();

  return () => {
    ignore = true;
  };
}, [setError, setItems, setLoading]);
```

设计建议：

- 保留后端请求路径，便于后续接入真实接口。
- mock 数据作为 fallback，而不是唯一数据源。
- 不要在组件里直接写复杂归一化逻辑，统一放在 `utils.ts` 或 `api.ts`。
- 页面初始化不应重复覆盖用户刚创建或编辑的数据；后续实现时可以通过 `hasHydrated` 或初始化标记避免重复请求覆盖。

---

## 17. 验证建议

实现完成后建议运行：

```bash
npm run lint
npm run build
```

人工验证：

- 进入 `/knowledge-bases` 后页面发起初始化请求。
- 后端不可用时页面仍显示 mock 知识库。
- 统计卡片数量正确。
- 搜索只在 Enter 后生效。
- 清空搜索输入后立即展示全部知识库。
- 默认按更新时间倒序展示。
- 排序倒置按钮能反转当前结果。
- 三张统计卡片 icon 分别呈现蓝色、绿色、红色。
- 新建和编辑弹窗可以通过下拉框选择十个预设 icon。
- 保存 icon 后，知识库卡片图标和浅色样式同步更新。
- 卡片列表在桌面端一行三张，内容不显得松散。
- hover 知识库卡片时有轻微放大或阴影变化。
- 知识库卡片右上角启用为绿色，禁用为红色。
- 新建弹窗默认值正确。
- 新建重名时展示错误。
- 编辑时名称重复校验排除当前项。
- 新建和编辑后更新时间变为当前时间。
- 删除确认框文案符合 spec。
- 确认删除后卡片和统计同步更新。
- 取消删除不会移除卡片。

---

## 18. 后续 Phase 2 衔接

Phase 2 将复用：

- `RagListItem`
- `RagDetail`
- `RagDoc`
- `RagChunk`
- Zustand 中的 `items`
- `selectedId`
- `selected`
- `selectedDocs`
- `selectedChunks`

因此 Phase 1 不把 documents/chunks 明细放进主列表状态，但需要预留选中详情状态，便于 Phase 2 按需加载当前 RAG 的文档和分片。
