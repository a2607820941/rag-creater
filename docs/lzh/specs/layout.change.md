# 管理后台布局调整变更任务

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `docs/lzh/specs/layoutspec.md` 和 `docs/lzh/tecdoc/layout.md` 调整管理后台侧边栏、标题匹配和路由承载关系。

**Architecture:** 继续沿用现有 `AdminShell`、`AdminHeader`、`AdminSidebar`、`admin-nav.ts` 的布局边界。把导航配置升级为支持一级导航、知识库子导航、精确/前缀匹配和统一标题解析，由 `AdminSidebar` 负责渲染父子菜单。

**Tech Stack:** Next.js 16 App Router、React、TypeScript、Tailwind CSS、lucide-react。

## 0. 变更范围

本次只处理管理后台布局导航相关改动。

需要修改：

- `src/components/layout/admin-nav.ts`
- `src/components/layout/admin-sidebar.tsx`
- `src/app/notes/page.tsx`
- `src/app/agents/chat/page.tsx`

需要检查但不一定修改：

- `src/components/layout/admin-shell.tsx`
- `src/components/layout/admin-header.tsx`
- `src/app/page.tsx`
- `src/app/knowledge-bases/page.tsx`
- `src/app/knowledge-bases/[id]/page.tsx`

不修改：

- Prisma schema
- 数据库迁移
- API Route
- 鉴权、权限、多租户逻辑
- `src/generated/prisma/`

## Task 1: 升级导航配置和路由匹配

**Files:**

- Modify: `src/components/layout/admin-nav.ts`

- [ ] **Step 1: 替换导航类型、配置和匹配函数**

将 `src/components/layout/admin-nav.ts` 更新为以下结构：

```ts
import {
  Bot,
  BrainCircuit,
  FolderKanban,
  LayoutDashboard,
  MessageSquareMore,
  NotebookTabs,
  SquareLibrary,
  type LucideIcon,
} from "lucide-react";

export type NavMatchMode = "exact" | "prefix";

export type AdminNavChildItem = {
  label: string;
  title: string;
  href: string;
  Icon: LucideIcon;
  match?: NavMatchMode;
  activePatterns?: string[];
};

export type AdminNavItem = {
  label: string;
  title: string;
  href: string;
  Icon: LucideIcon;
  match?: NavMatchMode;
  activePatterns?: string[];
  children?: AdminNavChildItem[];
};

export const adminNavItems = [
  {
    label: "数据总览",
    title: "Dashboard 数据总览",
    href: "/dashboard",
    Icon: LayoutDashboard,
    match: "prefix",
  },
  {
    label: "知识库",
    title: "知识库管理",
    href: "/knowledge-bases",
    Icon: BrainCircuit,
    activePatterns: ["/knowledge-bases", "/notes"],
    children: [
      {
        label: "知识库管理",
        title: "知识库管理",
        href: "/knowledge-bases",
        Icon: SquareLibrary,
        match: "prefix",
      },
      {
        label: "知识笔记",
        title: "知识笔记",
        href: "/notes",
        Icon: NotebookTabs,
        match: "prefix",
      },
    ],
  },
  {
    label: "知识文档",
    title: "知识文档",
    href: "/documents",
    Icon: FolderKanban,
    match: "prefix",
  },
  {
    label: "专家 Agent",
    title: "专家 Agent",
    href: "/agents",
    Icon: Bot,
    match: "exact",
  },
  {
    label: "专家对话",
    title: "专家对话",
    href: "/agents/chat",
    Icon: MessageSquareMore,
    match: "prefix",
  },
] satisfies AdminNavItem[];
```

- [ ] **Step 2: 保留或实现匹配函数**

需要支持：

- `matchHref(pathname, href, match)`
- `isNavChildActive(child, pathname)`
- `isNavItemActive(item, pathname)`
- `getAdminPageTitle(pathname)`

约束：

- `/agents/chat` 必须匹配 `专家对话`，不能匹配到 `专家 Agent`。
- `/knowledge-bases/[id]` 必须归属 `知识库管理` 子导航。
- `/notes` 必须归属 `知识笔记` 子导航。

- [ ] **Step 3: 快速检查**

Run:

```bash
npm run lint
```

若失败，只修复本任务引入的 lint 或类型问题，不顺手修复无关模块。

## Task 2: 改造 Sidebar 父子导航渲染

**Files:**

- Modify: `src/components/layout/admin-sidebar.tsx`

- [ ] **Step 1: 更新导入**

确保使用：

```ts
import Link from "next/link";
import { LibraryBig } from "lucide-react";

import {
  adminNavItems,
  isNavChildActive,
  isNavItemActive,
} from "@/components/layout/admin-nav";
import { cn } from "@/lib/utils";
```

- [ ] **Step 2: 渲染一级导航和子导航**

要求：

- 一级导航根据 `adminNavItems` 渲染。
- `知识库` 支持展开和收回。
- 展开后显示 `知识库管理` 和 `知识笔记`。
- Sidebar 收缩时只显示一级导航 icon。
- 当前路由对应项需要高亮。

- [ ] **Step 3: 手动检查收缩态行为**

开发服务器启动后检查：

- Sidebar 展开时，`知识库` 下能看到 `知识库管理` 和 `知识笔记`。
- `知识库` 展开后可以再次收回。
- Sidebar 收缩时，只显示一级导航 icon。
- `/agents/chat` 只选中 `专家对话`，不选中 `专家 Agent`。

## Task 3: 确认知识笔记页面在布局内可用

**Files:**

- Modify if needed: `src/app/notes/page.tsx`

- [ ] **Step 1: 检查页面文件**

Run:

```bash
Get-Content -Encoding utf8 -Path src/app/notes/page.tsx
```

Expected: 文件存在，导出默认 React 页面组件。

- [ ] **Step 2: 如果页面缺失或仍使用旧命名，则迁移为 `/notes` 页面**

最小预留实现可以是：

```tsx
export default function NotesPage() {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">知识笔记</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          用于后续创建和编辑 Markdown 知识笔记。
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: 检查页面不脱离布局**

确认 `/notes` 在 `AdminShell` 内渲染，进入页面后：

- Header 显示 `知识笔记`。
- Sidebar 展开 `知识库`。
- Sidebar 选中 `知识笔记` 子项。

## Task 4: 确认专家对话页面在布局内可用

**Files:**

- Inspect or modify: `src/app/agents/chat/page.tsx`

- [ ] **Step 1: 检查页面是否在 AdminShell 内渲染**

进入 `/agents/chat` 后应满足：

- Header 显示 `专家对话`。
- Sidebar 选中 `专家对话`。
- Sidebar 不选中 `专家 Agent`。
- 页面不脱离后台布局。

- [ ] **Step 2: 如页面脱离布局，则包裹或迁移到统一布局**

遵循现有 `AdminShell` 使用方式，不重写专家对话业务内容。

## Task 5: 检查知识库详情页布局归属

**Files:**

- Inspect: `src/app/knowledge-bases/[id]/page.tsx`
- Inspect: `src/features/knowledge-bases/index.tsx`

- [ ] **Step 1: 确认知识库卡片跳转到详情页**

Run:

```bash
rg "knowledge-bases/\\$\\{|/knowledge-bases/\\$\\{" src/features/knowledge-bases src/app/knowledge-bases
```

- [ ] **Step 2: 确认详情页内部有返回列表按钮**

Run:

```bash
rg "router.push\\(\"/knowledge-bases\"\\)|返回" src/app/knowledge-bases/[id]/page.tsx
```

- [ ] **Step 3: 不为详情页新增 Sidebar 项**

确认 `src/components/layout/admin-nav.ts` 中没有 `/knowledge-bases/[id]` 独立导航项。详情页应由 `知识库管理` 子项的 `match: "prefix"` 归属。

## Task 6: 构建验证和人工验收

- [ ] **Step 1: 运行 lint**

```bash
npm run lint
```

- [ ] **Step 2: 运行 build**

```bash
npm run build
```

- [ ] **Step 3: 启动开发服务器**

```bash
npm run dev
```

- [ ] **Step 4: 手动检查路由和标题**

浏览器检查：

- 访问 `/`，确认跳转到 `/knowledge-bases`。
- 访问 `/knowledge-bases`，Header 显示 `知识库管理`，Sidebar 展开 `知识库` 并选中 `知识库管理`。
- 访问 `/knowledge-bases/[id]`，Header 显示 `知识库管理`，Sidebar 不出现详情页独立导航项。
- 访问 `/notes`，Header 显示 `知识笔记`，Sidebar 展开 `知识库` 并选中 `知识笔记`。
- 访问 `/agents`，Header 显示 `专家 Agent`，Sidebar 选中 `专家 Agent`。
- 访问 `/agents/chat`，Header 显示 `专家对话`，Sidebar 选中 `专家对话`，不选中 `专家 Agent`。

## 任务覆盖自检

- `专家对话` 是一级导航，路由 `/agents/chat`，icon `MessageSquareMore`。
- `知识库` 是可展开父级导航，默认跳转 `/knowledge-bases`。
- `知识库管理` 子导航路由 `/knowledge-bases`，icon `SquareLibrary`。
- `知识笔记` 子导航路由 `/notes`，icon `NotebookTabs`。
- `/knowledge-bases/[id]` 归属 `知识库管理`，不新增 Sidebar 项。
- `/notes` 归属 `知识笔记`，不脱离布局。
- `/agents/chat` 不被 `/agents` 错误匹配。
- Header 标题由当前路由派生。
- Sidebar 展开/收缩由 `AdminShell` 本地状态控制。
- 本布局任务不修改 Prisma schema，不接入真实鉴权。
