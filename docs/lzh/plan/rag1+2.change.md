# RAG Phase 1+2 Card Icon And Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 调整 RAG 知识库管理页的卡片图标、状态颜色、卡片布局和查看知识入口，让新建/编辑时可选择十个预设图标，并通过点击卡片打开查看知识弹窗。

**Architecture:** 在 `src/features/knowledge-bases/types.ts` 中收敛 icon 类型，在 `utils.ts` 或同模块配置中维护十个图标的展示配置，表单和卡片共用同一份配置。Phase 1 负责图标选择、统计卡片颜色、卡片样式和按钮尺寸；Phase 2 复用卡片点击事件打开查看知识弹窗，并通过按钮 `stopPropagation()` 避免误触。

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui, Zustand, lucide-react.

---

## File Structure

- Modify: `src/features/knowledge-bases/types.ts`
  - 新增 `RagIconName` 类型，修改 `RagListItem.icon` 和 `KnowledgeBaseFormValues.icon`。
- Modify: `src/features/knowledge-bases/utils.ts`
  - 新增 icon 选项、icon 兜底函数和 icon 样式查找函数。
- Modify: `src/features/knowledge-bases/mock-data.ts`
  - 为 mock RAG 数据补齐十个可选 icon 中的合法值。
- Modify: `src/features/knowledge-bases/knowledge-base-management.tsx`
  - 表单新增 icon 下拉框，卡片使用动态 icon 和颜色，统计卡片 icon 分色，卡片 hover/紧凑布局，移除 `查看知识` 按钮，改为整卡点击打开查看知识。
- Modify: `src/features/knowledge-bases/knowledge-documents-dialog.tsx`
  - 如当前实现仍依赖 `查看知识` 按钮文案，不改弹窗功能，只确保由卡片点击入口打开。
- Verify: `npm run lint`
- Verify: `npm run build`

---

### Task 1: Icon 类型与配置

**Files:**
- Modify: `src/features/knowledge-bases/types.ts`
- Modify: `src/features/knowledge-bases/utils.ts`

- [ ] **Step 1: 更新 icon 类型**

在 `src/features/knowledge-bases/types.ts` 中加入：

```ts
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
```

将 `RagListItem` 中的 icon 调整为：

```ts
icon: RagIconName;
```

将 `KnowledgeBaseFormValues` 中加入：

```ts
icon: RagIconName;
```

- [ ] **Step 2: 新增统一 icon 配置**

在 `src/features/knowledge-bases/utils.ts` 中新增：

```ts
import type { RagIconName } from "./types";

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
] as const satisfies readonly {
  value: RagIconName;
  label: string;
  className: string;
}[];

export function isRagIconName(value: unknown): value is RagIconName {
  return RAG_ICON_OPTIONS.some((option) => option.value === value);
}

export function normalizeRagIcon(value: unknown): RagIconName {
  return isRagIconName(value) ? value : "Database";
}

export function getRagIconOption(icon: unknown) {
  const normalized = normalizeRagIcon(icon);
  return RAG_ICON_OPTIONS.find((option) => option.value === normalized) ?? RAG_ICON_OPTIONS[0];
}
```

- [ ] **Step 3: Run type check through build**

Run:

```bash
npm run build
```

Expected: 如果现有代码还未适配 icon 类型，构建会失败并指出需要更新的文件；继续 Task 2 和 Task 3 修复。

---

### Task 2: Mock 数据与表单默认值

**Files:**
- Modify: `src/features/knowledge-bases/mock-data.ts`
- Modify: `src/features/knowledge-bases/knowledge-base-management.tsx`

- [ ] **Step 1: 补齐 mock icon**

在每个 mock RAG 项上写入合法 icon，例如：

```ts
{
  id: "kb-product",
  name: "产品知识库",
  description: "产品说明、版本记录和常见问题。",
  icon: "BookOpen",
  documentCount: 3,
  chunkCount: 9,
  topK: 5,
  chunkSize: 500,
  similarityThreshold: 0.7,
  status: "active",
  updatedAt: "2026-05-01T10:00:00.000Z",
}
```

- [ ] **Step 2: 更新表单默认值**

在 `knowledge-base-management.tsx` 的默认表单值中加入：

```ts
icon: "Database",
```

编辑已有知识库时，表单草稿使用：

```ts
icon: normalizeRagIcon(item.icon),
```

- [ ] **Step 3: 保存时写入 icon**

新建 RAG 时写入：

```ts
icon: formValues.icon,
```

编辑 RAG 时 patch 写入：

```ts
icon: formValues.icon,
```

---

### Task 3: 表单 icon 下拉框

**Files:**
- Modify: `src/features/knowledge-bases/knowledge-base-management.tsx`

- [ ] **Step 1: 引入图标和配置**

添加 lucide 图标 imports：

```ts
import {
  Archive,
  BookOpen,
  Bot,
  Brain,
  BriefcaseBusiness,
  Database,
  FileText,
  Folder,
  GraduationCap,
  Lightbulb,
} from "lucide-react";
```

添加映射：

```ts
const RAG_ICON_COMPONENTS = {
  Database,
  BookOpen,
  FileText,
  Folder,
  Archive,
  Brain,
  Bot,
  GraduationCap,
  BriefcaseBusiness,
  Lightbulb,
} satisfies Record<RagIconName, React.ComponentType<{ className?: string }>>;
```

- [ ] **Step 2: 在新建/编辑弹窗加入 Select**

在名称和描述字段附近加入：

```tsx
<div className="space-y-2">
  <Label htmlFor="knowledge-base-icon">图标</Label>
  <Select
    value={formValues.icon}
    onValueChange={(value) =>
      setFormValues((current) => ({
        ...current,
        icon: normalizeRagIcon(value),
      }))
    }
  >
    <SelectTrigger id="knowledge-base-icon">
      <SelectValue placeholder="选择图标" />
    </SelectTrigger>
    <SelectContent>
      {RAG_ICON_OPTIONS.map((option) => {
        const Icon = RAG_ICON_COMPONENTS[option.value];

        return (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex items-center gap-2">
              <span className={`flex h-6 w-6 items-center justify-center rounded ${option.className}`}>
                <Icon className="h-4 w-4" />
              </span>
              {option.label}
            </span>
          </SelectItem>
        );
      })}
    </SelectContent>
  </Select>
</div>
```

- [ ] **Step 3: 手工验证**

Run:

```bash
npm run dev
```

Expected:

- 新建弹窗默认显示数据库图标。
- 编辑弹窗显示当前知识库已保存的图标。
- 下拉框包含十个选项。

---

### Task 4: 卡片和统计卡片视觉调整

**Files:**
- Modify: `src/features/knowledge-bases/knowledge-base-management.tsx`

- [ ] **Step 1: 卡片渲染动态 icon**

在知识库卡片左上角使用：

```tsx
const iconOption = getRagIconOption(item.icon);
const KnowledgeBaseIcon = RAG_ICON_COMPONENTS[iconOption.value];
```

渲染：

```tsx
<div className={`flex h-10 w-10 items-center justify-center rounded-md ${iconOption.className}`}>
  <KnowledgeBaseIcon className="h-5 w-5" />
</div>
```

- [ ] **Step 2: 统计卡片 icon 分色**

三张统计卡片分别使用：

```ts
const statCards = [
  { key: "all", label: "知识库总量", iconClassName: "text-blue-600 bg-blue-50" },
  { key: "active", label: "启用知识库", iconClassName: "text-emerald-600 bg-emerald-50" },
  { key: "disabled", label: "禁用知识库", iconClassName: "text-red-600 bg-red-50" },
];
```

- [ ] **Step 3: 卡片列表改为紧凑三列**

卡片容器建议：

```tsx
<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
```

卡片根节点建议：

```tsx
<Card className="cursor-pointer border-slate-200 bg-white shadow-sm transition duration-200 hover:scale-[1.01] hover:border-slate-300 hover:shadow-md">
```

卡片内容使用：

```tsx
<CardContent className="space-y-4 p-4">
```

- [ ] **Step 4: 状态 badge 分色**

状态样式：

```ts
const statusClassName =
  item.status === "active"
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : "bg-red-50 text-red-700 border-red-200";
```

- [ ] **Step 5: 放大编辑和删除按钮**

按钮建议：

```tsx
<Button size="sm" className="h-9 px-3" variant="outline">
  编辑
</Button>
<Button size="sm" className="h-9 px-3" variant="destructive">
  删除
</Button>
```

---

### Task 5: Phase 2 查看知识入口改为整卡点击

**Files:**
- Modify: `src/features/knowledge-bases/knowledge-base-management.tsx`
- Modify: `src/features/knowledge-bases/knowledge-documents-dialog.tsx`

- [ ] **Step 1: 移除卡片底部 `查看知识` 按钮**

删除卡片底部操作区中的 `查看知识` 按钮 JSX，只保留 `编辑` 和 `删除`。

- [ ] **Step 2: 卡片主体绑定打开文档弹窗**

在卡片根节点或主体区域绑定：

```tsx
onClick={() => handleOpenDocuments(item)}
role="button"
tabIndex={0}
onKeyDown={(event) => {
  if (event.key === "Enter") {
    handleOpenDocuments(item);
  }
}}
```

打开逻辑：

```ts
function handleOpenDocuments(item: RagListItem) {
  setSelectedId(item.id);
  setSelected(item);
  setSelectedDocs([]);
  setSelectedChunks([]);
  setDocumentsDialogOpen(true);
}
```

- [ ] **Step 3: 阻止编辑和删除冒泡**

编辑按钮：

```tsx
onClick={(event) => {
  event.stopPropagation();
  handleEdit(item);
}}
```

删除按钮：

```tsx
onClick={(event) => {
  event.stopPropagation();
  setDeleteTargetId(item.id);
}}
```

- [ ] **Step 4: 验证事件边界**

Run:

```bash
npm run dev
```

Expected:

- 点击卡片空白区域打开查看知识弹窗。
- 点击编辑只打开编辑弹窗。
- 点击删除只打开删除确认框。
- 页面上没有 `查看知识` 按钮。

---

### Task 6: Final Verification

**Files:**
- Verify only.

- [ ] **Step 1: Lint**

Run:

```bash
npm run lint
```

Expected: 命令通过；如果失败，只修复本次修改直接引入的问题。

- [ ] **Step 2: Build**

Run:

```bash
npm run build
```

Expected: 命令通过；如果失败，记录关键错误并修复与本次改动相关的问题。

- [ ] **Step 3: Manual UI checklist**

在 `/knowledge-bases` 页面验证：

- 三张统计卡片 icon 分别为蓝色、绿色、红色。
- 新建和编辑弹窗都有 icon 下拉框。
- icon 下拉框包含十个指定图标。
- 保存后卡片 icon 和浅色配色同步变化。
- 卡片一行三张，内容紧凑。
- hover 卡片时有轻微放大或阴影变化。
- 卡片右上角启用为绿色，禁用为红色。
- 页面没有 `查看知识` 按钮。
- 点击卡片打开查看知识弹窗。
- 点击编辑或删除不会打开查看知识弹窗。

---

## Self-Review

- Spec coverage: 已覆盖十个 icon、图标颜色同步、统计卡片颜色、卡片紧凑布局、hover 样式、编辑/删除按钮尺寸、移除 `查看知识` 按钮、整卡点击打开查看知识。
- Placeholder scan: 已检查，计划中没有未决占位。
- Type consistency: `RagIconName`、`RAG_ICON_OPTIONS`、`normalizeRagIcon`、`getRagIconOption` 在各任务中命名一致。
