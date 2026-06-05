# RAG 知识库管理 Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `/knowledge-bases` 知识库管理 Phase 1：初始化加载轻量知识库列表，支持搜索、排序、状态筛选、新建、编辑、删除，并通过 Zustand 共享状态。

**Architecture:** 页面入口继续由 `src/app/knowledge-bases/page.tsx` 挂载到 `AdminShell`。业务逻辑集中在 `src/features/knowledge-bases/`，全局数据放入 `src/store/slices/knowledge-base-slice.ts`，UI 临时状态保留在页面容器组件本地。Phase 1 主列表只保存轻量对象数组，不保存 documents/chunks 明细；`selected`、`selectedDocs`、`selectedChunks` 仅作为 Phase 2 预留状态。

**Tech Stack:** Next.js App Router、React、TypeScript、Tailwind CSS、shadcn/ui、lucide-react、Zustand。

---

## 文件结构

本次实现涉及以下文件：

- Create: `src/features/knowledge-bases/types.ts`
- Create: `src/features/knowledge-bases/mock-data.ts`
- Create: `src/features/knowledge-bases/utils.ts`
- Create: `src/features/knowledge-bases/api.ts`
- Create: `src/features/knowledge-bases/knowledge-base-management.tsx`
- Modify: `src/store/slices/knowledge-base-slice.ts`
- Modify: `src/app/knowledge-bases/page.tsx`
- Create if missing: `src/components/ui/input.tsx`
- Create if missing: `src/components/ui/textarea.tsx`
- Create if missing: `src/components/ui/dialog.tsx`
- Create if missing: `src/components/ui/alert-dialog.tsx`
- Create if missing: `src/components/ui/select.tsx`
- Create if missing: `src/components/ui/switch.tsx`
- Create if missing: `src/components/ui/card.tsx`
- Create if missing: `src/components/ui/badge.tsx`
- Create if missing: `src/components/ui/label.tsx`

不修改 `src/generated/prisma/`、Prisma schema、真实 API Route、权限、多租户、文档管理和分片管理。

---

### Task 1: 准备 shadcn/ui 通用组件

**Files:**
- Create if missing: `src/components/ui/input.tsx`
- Create if missing: `src/components/ui/textarea.tsx`
- Create if missing: `src/components/ui/dialog.tsx`
- Create if missing: `src/components/ui/alert-dialog.tsx`
- Create if missing: `src/components/ui/select.tsx`
- Create if missing: `src/components/ui/switch.tsx`
- Create if missing: `src/components/ui/card.tsx`
- Create if missing: `src/components/ui/badge.tsx`
- Create if missing: `src/components/ui/label.tsx`

- [ ] **Step 1: 检查已有 UI 组件**

Run:

```bash
rg --files src/components/ui
```

Expected: 至少存在 `src/components/ui/button.tsx`。如果上面列出的组件不存在，执行下一步。

- [ ] **Step 2: 通过 shadcn CLI 新增缺失组件**

Run:

```bash
npx shadcn@latest add input textarea dialog alert-dialog select switch card badge label
```

Expected: 在 `src/components/ui/` 下生成对应组件文件；命令不应修改业务文件。

- [ ] **Step 3: 检查生成结果**

Run:

```bash
rg --files src/components/ui
```

Expected: 输出包含 `button.tsx`、`input.tsx`、`textarea.tsx`、`dialog.tsx`、`alert-dialog.tsx`、`select.tsx`、`switch.tsx`、`card.tsx`、`badge.tsx`、`label.tsx`。

- [ ] **Step 4: 提交 UI 组件准备**

```bash
git add src/components/ui
git commit -m "chore: add knowledge base ui primitives"
```

---

### Task 2: 定义知识库类型、mock 数据和纯工具函数

**Files:**
- Create: `src/features/knowledge-bases/types.ts`
- Create: `src/features/knowledge-bases/mock-data.ts`
- Create: `src/features/knowledge-bases/utils.ts`

- [ ] **Step 1: 创建类型文件**

Create `src/features/knowledge-bases/types.ts`:

```ts
export type RagStatus = "active" | "disabled";

export type RagListItem = {
  id: string;
  name: string;
  description: string;
  icon?: string;
  documentCount: number;
  chunkCount: number;
  topK: number;
  chunkSize: number;
  similarityThreshold: number;
  status: RagStatus;
  updatedAt: string;
};

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

export type KnowledgeBaseFormValues = {
  name: string;
  description: string;
  topK: number;
  chunkSize: number;
  similarityThreshold: number;
  status: RagStatus;
};

export type SortField = "updatedAt" | "documentCount";
export type SortDirection = "desc" | "asc";
export type StatusFilter = "all" | "active" | "disabled" | null;

export const DEFAULT_KNOWLEDGE_BASE_FORM_VALUES = {
  name: "",
  description: "",
  topK: 5,
  chunkSize: 500,
  similarityThreshold: 0.7,
  status: "active",
} satisfies KnowledgeBaseFormValues;
```

- [ ] **Step 2: 创建 mock 数据**

Create `src/features/knowledge-bases/mock-data.ts`:

```ts
import type { RagListItem } from "./types";

export const mockRagItems: RagListItem[] = [
  {
    id: "kb-product",
    name: "产品知识库",
    description: "沉淀产品功能、版本说明和常见问题。",
    icon: "database",
    documentCount: 12,
    chunkCount: 186,
    topK: 5,
    chunkSize: 500,
    similarityThreshold: 0.7,
    status: "active",
    updatedAt: "2026-05-28T10:30:00.000Z",
  },
  {
    id: "kb-sales",
    name: "销售话术库",
    description: "用于销售场景的问答、异议处理和行业案例。",
    icon: "database",
    documentCount: 8,
    chunkCount: 94,
    topK: 6,
    chunkSize: 450,
    similarityThreshold: 0.72,
    status: "active",
    updatedAt: "2026-05-26T09:15:00.000Z",
  },
  {
    id: "kb-support-disabled",
    name: "客服归档库",
    description: "历史客服知识归档，当前暂停使用。",
    icon: "database",
    documentCount: 20,
    chunkCount: 260,
    topK: 5,
    chunkSize: 500,
    similarityThreshold: 0.68,
    status: "disabled",
    updatedAt: "2026-05-20T14:00:00.000Z",
  },
  {
    id: "kb-empty-active",
    name: "新业务知识库",
    description: "用于新业务资料准备，暂未上传文档。",
    icon: "database",
    documentCount: 0,
    chunkCount: 0,
    topK: 5,
    chunkSize: 500,
    similarityThreshold: 0.7,
    status: "active",
    updatedAt: "2026-05-29T08:00:00.000Z",
  },
];
```

- [ ] **Step 3: 创建工具函数**

Create `src/features/knowledge-bases/utils.ts`:

```ts
import type {
  KnowledgeBaseFormValues,
  RagListItem,
  RagStatus,
  SortDirection,
  SortField,
  StatusFilter,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toStringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function toNumberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toStatus(value: unknown): RagStatus {
  return value === "active" || value === "disabled" ? value : "disabled";
}

export function createClientId() {
  return `kb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeRagItem(input: unknown): RagListItem {
  const item = isRecord(input) ? input : {};

  return {
    id: toStringValue(item.id, createClientId()),
    name: toStringValue(item.name, "未命名知识库"),
    description: toStringValue(item.description, "暂无描述"),
    icon: typeof item.icon === "string" ? item.icon : undefined,
    documentCount: toNumberValue(item.documentCount, 0),
    chunkCount: toNumberValue(item.chunkCount, 0),
    topK: toNumberValue(item.topK, 0),
    chunkSize: toNumberValue(item.chunkSize, 0),
    similarityThreshold: toNumberValue(item.similarityThreshold, 0),
    status: toStatus(item.status),
    updatedAt: toStringValue(item.updatedAt, "--"),
  };
}

export function normalizeRagItems(input: unknown): RagListItem[] {
  const list = Array.isArray(input)
    ? input
    : isRecord(input) && Array.isArray(input.data)
      ? input.data
      : [];

  return list.map(normalizeRagItem);
}

export function getKnowledgeBaseStats(items: RagListItem[]) {
  return {
    total: items.length,
    active: items.filter((item) => item.status === "active").length,
    disabled: items.filter((item) => item.status === "disabled").length,
  };
}

export function filterAndSortRagItems(params: {
  items: RagListItem[];
  keyword: string;
  statusFilter: StatusFilter;
  sortField: SortField;
  sortDirection: SortDirection;
}) {
  const keyword = params.keyword.trim().toLowerCase();

  const filtered = params.items
    .filter((item) => {
      if (!keyword) return true;

      return (
        item.name.toLowerCase().includes(keyword) ||
        item.description.toLowerCase().includes(keyword)
      );
    })
    .filter((item) => {
      if (!params.statusFilter || params.statusFilter === "all") return true;
      return item.status === params.statusFilter;
    });

  return [...filtered].sort((left, right) => {
    const factor = params.sortDirection === "desc" ? -1 : 1;

    if (params.sortField === "documentCount") {
      return (left.documentCount - right.documentCount) * factor;
    }

    return (
      (new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime()) *
      factor
    );
  });
}

export function validateKnowledgeBaseForm(params: {
  values: KnowledgeBaseFormValues;
  items: RagListItem[];
  editingId?: string | null;
}) {
  const name = params.values.name.trim();

  if (!name) return "知识库名称不能为空";
  if (!Number.isInteger(params.values.topK) || params.values.topK <= 0) {
    return "TopK 必须为正整数";
  }
  if (!Number.isInteger(params.values.chunkSize) || params.values.chunkSize <= 0) {
    return "分片大小必须为正整数";
  }
  if (
    params.values.similarityThreshold < 0 ||
    params.values.similarityThreshold > 1
  ) {
    return "相似度阈值必须在 0 到 1 之间";
  }

  const duplicated = params.items.some(
    (item) => item.id !== params.editingId && item.name.trim() === name
  );

  if (duplicated) return "知识库名称不能重复";

  return null;
}
```

- [ ] **Step 4: 运行类型检查入口**

Run:

```bash
npm run lint
```

Expected: 新增文件没有 ESLint 错误。若出现格式或类型问题，只修复本任务新增文件。

- [ ] **Step 5: 提交类型和工具函数**

```bash
git add src/features/knowledge-bases/types.ts src/features/knowledge-bases/mock-data.ts src/features/knowledge-bases/utils.ts
git commit -m "feat: add knowledge base data utilities"
```

---

### Task 3: 封装 Phase 1 初始化请求

**Files:**
- Create: `src/features/knowledge-bases/api.ts`

- [ ] **Step 1: 创建 API 封装**

Create `src/features/knowledge-bases/api.ts`:

```ts
export async function fetchRagItems() {
  const response = await fetch("/api/knowledge-bases", {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch knowledge bases: ${response.status}`);
  }

  return response.json();
}
```

- [ ] **Step 2: 验证导出**

Run:

```bash
npm run lint
```

Expected: `api.ts` 没有 lint 错误。

- [ ] **Step 3: 提交 API 封装**

```bash
git add src/features/knowledge-bases/api.ts
git commit -m "feat: add knowledge base list api client"
```

---

### Task 4: 改造 Zustand 知识库 slice

**Files:**
- Modify: `src/store/slices/knowledge-base-slice.ts`
- Read: `src/store/index.ts`
- Read: `src/store/types.ts`

- [ ] **Step 1: 替换 slice 类型和实现**

Update `src/store/slices/knowledge-base-slice.ts`:

```ts
import type { StateCreator } from "zustand";
import type {
  RagChunk,
  RagDetail,
  RagDoc,
  RagListItem,
} from "@/features/knowledge-bases/types";

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
  setItems: (items: RagListItem[]) => void;
  setSelectedId: (id: string | null) => void;
  setSelected: (detail: RagDetail | null) => void;
  setSelectedDocs: (docs: RagDoc[]) => void;
  setSelectedChunks: (chunks: RagChunk[]) => void;
  addItem: (item: RagListItem) => void;
  updateItem: (id: string, patch: Partial<RagListItem>) => void;
  deleteItem: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
};

export const createKnowledgeBaseSlice: StateCreator<
  KnowledgeBaseSlice,
  [],
  [],
  KnowledgeBaseSlice
> = (set) => ({
  items: [],
  selectedId: null,
  selected: null,
  selectedDocs: [],
  selectedChunks: [],
  loading: false,
  error: null,
  setItems: (items) => set({ items }),
  setSelectedId: (selectedId) => set({ selectedId }),
  setSelected: (selected) => set({ selected }),
  setSelectedDocs: (selectedDocs) => set({ selectedDocs }),
  setSelectedChunks: (selectedChunks) => set({ selectedChunks }),
  addItem: (item) =>
    set((state) => ({
      items: [item, ...state.items],
    })),
  updateItem: (id, patch) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
      selected:
        state.selected?.id === id ? { ...state.selected, ...patch } : state.selected,
    })),
  deleteItem: (id) =>
    set((state) => {
      const isSelected = state.selectedId === id;

      return {
        items: state.items.filter((item) => item.id !== id),
        selectedId: isSelected ? null : state.selectedId,
        selected: isSelected ? null : state.selected,
        selectedDocs: isSelected ? [] : state.selectedDocs,
        selectedChunks: isSelected ? [] : state.selectedChunks,
      };
    }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
});
```

- [ ] **Step 2: 确认 store 入口无需改名**

检查 `src/store/types.ts` 仍然是：

```ts
import type { AppSlice } from "./slices/app-slice";
import type { KnowledgeBaseSlice } from "./slices/knowledge-base-slice";

export type StoreState = AppSlice & KnowledgeBaseSlice;
```

Expected: 类型名继续沿用 `KnowledgeBaseSlice`，不做无意义重命名。

- [ ] **Step 3: 运行 lint**

Run:

```bash
npm run lint
```

Expected: Zustand slice 没有类型或 lint 错误。

- [ ] **Step 4: 提交 Zustand 改造**

```bash
git add src/store/slices/knowledge-base-slice.ts src/store/types.ts src/store/index.ts
git commit -m "feat: add knowledge base zustand state"
```

---

### Task 5: 实现页面业务容器的数据加载和本地状态

**Files:**
- Create: `src/features/knowledge-bases/knowledge-base-management.tsx`

- [ ] **Step 1: 创建客户端业务容器骨架**

Create `src/features/knowledge-bases/knowledge-base-management.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Database,
  Plus,
  Search,
  SortAsc,
  SortDesc,
  XCircle,
} from "lucide-react";
import { fetchRagItems } from "./api";
import { mockRagItems } from "./mock-data";
import { DEFAULT_KNOWLEDGE_BASE_FORM_VALUES } from "./types";
import type {
  KnowledgeBaseFormValues,
  RagListItem,
  SortDirection,
  SortField,
  StatusFilter,
} from "./types";
import {
  filterAndSortRagItems,
  getKnowledgeBaseStats,
  normalizeRagItems,
} from "./utils";
import { useAppStore } from "@/store";

export function KnowledgeBaseManagement() {
  const items = useAppStore((state) => state.items);
  const loading = useAppStore((state) => state.loading);
  const error = useAppStore((state) => state.error);
  const setItems = useAppStore((state) => state.setItems);
  const setLoading = useAppStore((state) => state.setLoading);
  const setError = useAppStore((state) => state.setError);

  const [searchInput, setSearchInput] = useState("");
  const [submittedSearchKeyword, setSubmittedSearchKeyword] = useState("");
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
  const [formDialogMode, setFormDialogMode] = useState<"create" | "edit" | null>(
    null
  );
  const [editingItem, setEditingItem] = useState<RagListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RagListItem | null>(null);
  const [formValues, setFormValues] = useState<KnowledgeBaseFormValues>(
    DEFAULT_KNOWLEDGE_BASE_FORM_VALUES
  );
  const [formError, setFormError] = useState<string | null>(null);

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
      } catch (loadError) {
        console.warn(
          "Failed to load knowledge bases, fallback to mock data.",
          loadError
        );
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

    if (items.length === 0) {
      loadRagItems();
    }

    return () => {
      ignore = true;
    };
  }, [items.length, setError, setItems, setLoading]);

  const stats = useMemo(() => getKnowledgeBaseStats(items), [items]);
  const visibleItems = useMemo(
    () =>
      filterAndSortRagItems({
        items,
        keyword: submittedSearchKeyword,
        statusFilter,
        sortField,
        sortDirection,
      }),
    [items, sortDirection, sortField, statusFilter, submittedSearchKeyword]
  );

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-6 text-card-foreground">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Database className="size-4" />
          知识库管理
        </div>
        <h2 className="mt-2 text-xl font-semibold">RAG 知识库</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          管理知识库基础信息、检索参数和启用状态。
        </p>
      </div>

      <div className="text-sm text-muted-foreground">
        {loading ? "正在加载知识库..." : error}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <button type="button" className="rounded-lg border border-border p-4 text-left">
          <div className="text-sm text-muted-foreground">知识库总量</div>
          <div className="mt-2 text-2xl font-semibold">{stats.total}</div>
        </button>
        <button type="button" className="rounded-lg border border-border p-4 text-left">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-600" />
            启用知识库
          </div>
          <div className="mt-2 text-2xl font-semibold">{stats.active}</div>
        </button>
        <button type="button" className="rounded-lg border border-border p-4 text-left">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <XCircle className="size-4 text-red-600" />
            禁用知识库
          </div>
          <div className="mt-2 text-2xl font-semibold">{stats.disabled}</div>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Search className="size-4 text-muted-foreground" />
        <input
          className="h-9 min-w-64 rounded-md border border-input bg-background px-3 text-sm"
          value={searchInput}
          placeholder="搜索知识库名称或描述"
          onChange={(event) => {
            const value = event.target.value;
            setSearchInput(value);
            if (!value) {
              setSubmittedSearchKeyword("");
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              setSubmittedSearchKeyword(searchInput.trim());
            }
          }}
        />
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-sm"
          onClick={() =>
            setSortDirection((current) => (current === "desc" ? "asc" : "desc"))
          }
        >
          {sortDirection === "desc" ? (
            <SortDesc className="size-4" />
          ) : (
            <SortAsc className="size-4" />
          )}
          排序倒置
        </button>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm text-primary-foreground"
          onClick={() => {
            setFormDialogMode("create");
            setEditingItem(null);
            setFormValues(DEFAULT_KNOWLEDGE_BASE_FORM_VALUES);
            setFormError(null);
          }}
        >
          <Plus className="size-4" />
          新建知识库
        </button>
      </div>

      <div className="text-sm text-muted-foreground">
        当前展示 {visibleItems.length} 个知识库
      </div>

      <div className="hidden">
        {sortField}
        {statusFilter}
        {formDialogMode}
        {editingItem?.id}
        {deleteTarget?.id}
        {formValues.name}
        {formError}
      </div>
    </section>
  );
}
```

该骨架需要通过编译，并在后续任务中逐步替换为完整的 shadcn/ui 筛选栏、卡片和弹窗。

- [ ] **Step 2: 运行 lint**

Run:

```bash
npm run lint
```

Expected: 组件没有未使用变量或类型错误。若 `sortField`、`statusFilter` 等临时变量触发 lint，保留隐藏调试区直到后续任务接入 UI。

- [ ] **Step 3: 提交业务容器骨架**

```bash
git add src/features/knowledge-bases/knowledge-base-management.tsx
git commit -m "feat: add knowledge base management container"
```

---

### Task 6: 接入 `/knowledge-bases` 页面入口

**Files:**
- Modify: `src/app/knowledge-bases/page.tsx`

- [ ] **Step 1: 替换占位页**

Update `src/app/knowledge-bases/page.tsx`:

```tsx
import { AdminShell } from "@/components/layout/admin-shell";
import { KnowledgeBaseManagement } from "@/features/knowledge-bases/knowledge-base-management";

export default function KnowledgeBasesPage() {
  return (
    <AdminShell>
      <KnowledgeBaseManagement />
    </AdminShell>
  );
}
```

- [ ] **Step 2: 运行 lint**

Run:

```bash
npm run lint
```

Expected: 页面入口导入路径正确，没有 lint 错误。

- [ ] **Step 3: 提交页面接入**

```bash
git add src/app/knowledge-bases/page.tsx
git commit -m "feat: render knowledge base management page"
```

---

### Task 7: 完成筛选栏、统计卡片和知识库卡片展示

**Files:**
- Modify: `src/features/knowledge-bases/knowledge-base-management.tsx`

- [ ] **Step 1: 替换筛选栏为 shadcn/ui 控件**

Use imports:

```tsx
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
```

Controls behavior:

```tsx
<Input
  value={searchInput}
  placeholder="搜索知识库名称或描述"
  onChange={(event) => {
    const value = event.target.value;
    setSearchInput(value);
    if (!value) setSubmittedSearchKeyword("");
  }}
  onKeyDown={(event) => {
    if (event.key === "Enter") {
      setSubmittedSearchKeyword(searchInput.trim());
    }
  }}
/>

<Select
  value={sortField}
  onValueChange={(value) => setSortField(value as SortField)}
>
  <SelectTrigger className="w-40">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="updatedAt">更新时间</SelectItem>
    <SelectItem value="documentCount">包含文档数量</SelectItem>
  </SelectContent>
</Select>

<Button
  type="button"
  variant="outline"
  onClick={() =>
    setSortDirection((current) => (current === "desc" ? "asc" : "desc"))
  }
>
  {sortDirection === "desc" ? <SortDesc /> : <SortAsc />}
  排序倒置
</Button>
```

- [ ] **Step 2: 完成统计卡片筛选**

Use click behavior:

```tsx
function toggleStatusFilter(nextFilter: StatusFilter) {
  setStatusFilter((current) => (current === nextFilter ? null : nextFilter));
}
```

Expected behavior:

- 点击总量卡片：`toggleStatusFilter("all")`
- 点击启用卡片：`toggleStatusFilter("active")`
- 点击禁用卡片：`toggleStatusFilter("disabled")`
- 再次点击已高亮卡片：`statusFilter` 变回 `null`

- [ ] **Step 3: 完成知识库卡片渲染**

For every `visibleItems.map((item) => ...)`, card must show:

```tsx
<Card key={item.id}>
  <CardHeader>
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-md bg-muted">
          <Database className="size-5" />
        </div>
        <div>
          <CardTitle className="text-base">{item.name}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {item.description}
          </p>
        </div>
      </div>
      <Badge variant={item.status === "active" ? "secondary" : "destructive"}>
        {item.status === "active" ? "启用" : "禁用"}
      </Badge>
    </div>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="grid gap-3 text-sm md:grid-cols-4">
      <div>文档：{item.documentCount}</div>
      <div>Chunks：{item.chunkCount}</div>
      <div>TopK：{item.topK}</div>
      <div>阈值：{item.similarityThreshold}</div>
    </div>
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">
        更新时间：{item.updatedAt === "--" ? "--" : new Date(item.updatedAt).toLocaleString()}
      </span>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm">编辑</Button>
        <Button type="button" variant="destructive" size="sm">删除</Button>
      </div>
    </div>
  </CardContent>
</Card>
```

- [ ] **Step 4: 完成空状态**

Rules:

- `items.length === 0 && !loading`：展示 `暂无知识库`、`点击新建按钮创建你的第一个知识库` 和新建按钮。
- `items.length > 0 && visibleItems.length === 0`：展示 `没有找到符合条件的知识库`。

- [ ] **Step 5: 运行 lint**

Run:

```bash
npm run lint
```

Expected: 无未使用变量，无 JSX 类型错误。

- [ ] **Step 6: 提交列表 UI**

```bash
git add src/features/knowledge-bases/knowledge-base-management.tsx
git commit -m "feat: add knowledge base list interface"
```

---

### Task 8: 实现新建和编辑弹窗

**Files:**
- Modify: `src/features/knowledge-bases/knowledge-base-management.tsx`

- [ ] **Step 1: 引入表单组件**

Use imports:

```tsx
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createClientId,
  validateKnowledgeBaseForm,
} from "./utils";
```

- [ ] **Step 2: 新建弹窗打开逻辑**

Use:

```ts
function openCreateDialog() {
  setFormDialogMode("create");
  setEditingItem(null);
  setFormValues(DEFAULT_KNOWLEDGE_BASE_FORM_VALUES);
  setFormError(null);
}
```

New button must call `openCreateDialog()`.

- [ ] **Step 3: 编辑弹窗打开逻辑**

Use:

```ts
function openEditDialog(item: RagListItem) {
  setFormDialogMode("edit");
  setEditingItem(item);
  setFormValues({
    name: item.name,
    description: item.description,
    topK: item.topK,
    chunkSize: item.chunkSize,
    similarityThreshold: item.similarityThreshold,
    status: item.status,
  });
  setFormError(null);
}
```

Card edit button must call `openEditDialog(item)`.

- [ ] **Step 4: 保存逻辑**

Use store actions:

```tsx
const addItem = useAppStore((state) => state.addItem);
const updateItem = useAppStore((state) => state.updateItem);
```

Use save function:

```ts
function saveForm() {
  const validationError = validateKnowledgeBaseForm({
    values: formValues,
    items,
    editingId: editingItem?.id ?? null,
  });

  if (validationError) {
    setFormError(validationError);
    return;
  }

  const now = new Date().toISOString();

  if (formDialogMode === "create") {
    addItem({
      id: createClientId(),
      name: formValues.name.trim(),
      description: formValues.description.trim() || "暂无描述",
      documentCount: 0,
      chunkCount: 0,
      topK: formValues.topK,
      chunkSize: formValues.chunkSize,
      similarityThreshold: formValues.similarityThreshold,
      status: formValues.status,
      updatedAt: now,
    });
  }

  if (formDialogMode === "edit" && editingItem) {
    updateItem(editingItem.id, {
      name: formValues.name.trim(),
      description: formValues.description.trim() || "暂无描述",
      topK: formValues.topK,
      chunkSize: formValues.chunkSize,
      similarityThreshold: formValues.similarityThreshold,
      status: formValues.status,
      updatedAt: now,
    });
  }

  setFormDialogMode(null);
  setEditingItem(null);
  setFormError(null);
}
```

- [ ] **Step 5: 渲染 Dialog**

Dialog requirements:

- Title is `新建知识库` when creating.
- Title is `编辑知识库` when editing.
- Fields: `name`、`description`、`topK`、`chunkSize`、`similarityThreshold`、`status`。
- Validation error appears above footer buttons in red text.
- Cancel closes dialog without saving.
- Confirm calls `saveForm()`.

- [ ] **Step 6: 运行 lint**

Run:

```bash
npm run lint
```

Expected: 表单相关代码无 lint 错误。

- [ ] **Step 7: 提交新建编辑能力**

```bash
git add src/features/knowledge-bases/knowledge-base-management.tsx
git commit -m "feat: add knowledge base create and edit dialogs"
```

---

### Task 9: 实现删除确认框

**Files:**
- Modify: `src/features/knowledge-bases/knowledge-base-management.tsx`

- [ ] **Step 1: 引入 AlertDialog**

Use imports:

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
```

- [ ] **Step 2: 接入删除按钮**

Card delete button:

```tsx
<Button
  type="button"
  variant="destructive"
  size="sm"
  onClick={() => setDeleteTarget(item)}
>
  删除
</Button>
```

- [ ] **Step 3: 实现确认删除逻辑**

Use store action:

```tsx
const deleteItem = useAppStore((state) => state.deleteItem);
```

Use handler:

```ts
function confirmDelete() {
  if (!deleteTarget) return;
  deleteItem(deleteTarget.id);
  setDeleteTarget(null);
}
```

- [ ] **Step 4: 渲染确认框**

Use:

```tsx
<AlertDialog
  open={Boolean(deleteTarget)}
  onOpenChange={(open) => {
    if (!open) setDeleteTarget(null);
  }}
>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>确认删除知识库</AlertDialogTitle>
      <AlertDialogDescription>
        确定要删除「{deleteTarget?.name}」吗？此操作不可恢复。
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>取消</AlertDialogCancel>
      <AlertDialogAction onClick={confirmDelete}>确认删除</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

Expected behavior:

- 点击取消不删除。
- 点击弹窗外部不删除。
- 只有点击 `确认删除` 才删除。
- 删除后统计卡片和列表同步更新。

- [ ] **Step 5: 运行 lint**

Run:

```bash
npm run lint
```

Expected: 删除确认框代码无 lint 错误。

- [ ] **Step 6: 提交删除能力**

```bash
git add src/features/knowledge-bases/knowledge-base-management.tsx
git commit -m "feat: add knowledge base delete confirmation"
```

---

### Task 10: 完成构建验证和人工验收

**Files:**
- Verify: `src/features/knowledge-bases/*`
- Verify: `src/store/slices/knowledge-base-slice.ts`
- Verify: `src/app/knowledge-bases/page.tsx`

- [ ] **Step 1: 运行 lint**

Run:

```bash
npm run lint
```

Expected: 命令成功退出，输出无错误。

- [ ] **Step 2: 运行 build**

Run:

```bash
npm run build
```

Expected: Next.js build 成功。

- [ ] **Step 3: 启动开发服务器**

Run:

```bash
npm run dev
```

Expected: 开发服务器启动，通常为 `http://localhost:3000`。如果 3000 被占用，Next.js 会提示其他端口。

- [ ] **Step 4: 人工验收 `/knowledge-bases`**

Check:

- 页面在后台布局 Main Content 中渲染。
- 后端接口不存在时，页面显示 mock 知识库，并展示错误提示 `知识库数据加载失败，已使用本地模拟数据`。
- 默认按 `updatedAt` 倒序展示，最新知识库在前。
- 搜索输入时不实时过滤，按 Enter 后过滤。
- 清空搜索输入后立即恢复全部列表。
- 排序下拉框支持 `更新时间` 和 `包含文档数量`。
- 排序倒置按钮能切换正序和倒序。
- 三个统计卡片数量基于全部 `items` 计算。
- 点击统计卡片可筛选全部、启用、禁用，再次点击取消筛选。
- 新建弹窗默认值为 `topK=5`、`chunkSize=500`、`similarityThreshold=0.7`、`status=active`。
- 新建重名时显示错误，不关闭弹窗。
- 编辑重名时排除当前知识库 id。
- 新建和编辑成功后 `updatedAt` 变为当前时间。
- 删除确认框标题是 `确认删除知识库`，正文包含知识库名称，确认按钮是 `确认删除`。
- 取消删除不会移除卡片。
- 确认删除后卡片和统计同步更新。

- [ ] **Step 5: 提交最终验证修正**

If verification required small fixes:

```bash
git add src
git commit -m "fix: polish knowledge base phase one behavior"
```

If no fixes were needed, do not create an empty commit.

---

## 自检清单

- [ ] spec 中的 Phase 1 范围均有任务覆盖：列表、搜索、排序、统计、新建、编辑、删除、mock fallback、Zustand 状态。
- [ ] 主列表没有保存 `documents` 或 `chunks` 明细。
- [ ] 列表展示使用 `documentCount` 和 `chunkCount`。
- [ ] `selected`、`selectedDocs`、`selectedChunks` 只作为 Phase 2 预留状态，Phase 1 页面不消费详情。
- [ ] 新建、编辑、删除不调用真实 POST / PATCH / DELETE。
- [ ] 状态字段使用 `items`、`selectedId`、`selected`、`selectedDocs`、`selectedChunks`、`loading`、`error`。
- [ ] slice 类型名沿用 `KnowledgeBaseSlice`。
- [ ] 所有验证命令的结果已记录在最终回复中。
