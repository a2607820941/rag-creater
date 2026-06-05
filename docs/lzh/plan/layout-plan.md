# 管理后台整体布局 Implementation Plan

> **面向 agentic workers：** 必须使用子技能 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务逐步执行本计划。所有步骤使用 checkbox（`- [ ]`）语法追踪进度。

**目标：** 实现管理后台桌面端第一版整体布局，包括 Sidebar、Header、本地收缩状态、基础路由、lucide-react 图标和占位页面。

**架构：** 在 `src/components/layout/` 下新增一组职责清晰的布局组件。`AdminShell` 作为客户端组件持有本地 `sidebarOpen` 状态，根据当前 pathname 派生页面标题，并组合 `AdminSidebar`、`AdminHeader` 和业务页面 `children`。App Router 页面复用 `AdminShell`，根路径 `/` 重定向到 `/knowledge-bases`。

**技术栈：** Next.js 16 App Router、React 19、TypeScript、Tailwind CSS、shadcn/ui 风格 `Button`、`lucide-react` 图标组件、本地 `useState`。

---

## 文件结构

- 新增：`src/components/layout/admin-nav.ts`  
  统一维护后台导航项、页面标题、路由和 lucide-react 图标组件，避免 Header 与 Sidebar 重复写配置。

- 新增：`src/components/layout/admin-header.tsx`  
  渲染顶部 Header、页面标题、标题旁的 Sidebar 收缩/展开按钮，以及右侧用户信息占位区域。

- 新增：`src/components/layout/admin-sidebar.tsx`  
  渲染平台品牌区和三个一级导航项。展开时显示图标和名称，收缩时只显示图标。

- 新增：`src/components/layout/admin-shell.tsx`  
  客户端布局容器，持有 `sidebarOpen` 本地状态，根据 pathname 计算 Header 标题，并组合 Sidebar、Header、Main Content。

- 修改：`src/app/page.tsx`  
  将当前启动页替换为 `/knowledge-bases` 的默认重定向。

- 修改：`src/app/knowledge-bases/page.tsx`  
  在 `AdminShell` 内渲染知识库管理基础占位页。

- 新增：`src/app/documents/page.tsx`  
  在 `AdminShell` 内渲染知识文档基础占位页。

- 新增：`src/app/agents/page.tsx`  
  在 `AdminShell` 内渲染专家 Agent 基础占位页。

---

### Task 1：新增后台导航配置

**文件：**

- 新增：`src/components/layout/admin-nav.ts`

- [ ] **Step 1：创建布局组件目录**

运行：

```bash
New-Item -ItemType Directory -Force src\components\layout
```

预期结果：`src/components/layout` 目录存在。

- [ ] **Step 2：新增后台导航配置**

创建 `src/components/layout/admin-nav.ts`：

```ts
import { Bot, BrainCircuit, FolderKanban, type LucideIcon } from "lucide-react";

export type AdminNavItem = {
  label: string;
  title: string;
  href: string;
  Icon: LucideIcon;
};

export const adminNavItems = [
  {
    label: "知识库",
    title: "知识库管理",
    href: "/knowledge-bases",
    Icon: BrainCircuit,
  },
  {
    label: "知识文档",
    title: "知识文档",
    href: "/documents",
    Icon: FolderKanban,
  },
  {
    label: "专家 Agent",
    title: "专家 Agent",
    href: "/agents",
    Icon: Bot,
  },
] satisfies AdminNavItem[];

export function getAdminPageTitle(pathname: string) {
  return (
    adminNavItems.find((item) => pathname.startsWith(item.href))?.title ??
    "知识库管理"
  );
}
```

- [ ] **Step 3：验证类型和 lint**

运行：

```bash
npm run lint
```

预期结果：命令成功结束，`src/components/layout/admin-nav.ts` 没有 lint 错误。

- [ ] **Step 4：提交本任务**

```bash
git add src/components/layout/admin-nav.ts
git commit -m "feat: add admin navigation config"
```

---

### Task 2：新增 Header 组件

**文件：**

- 新增：`src/components/layout/admin-header.tsx`

- [ ] **Step 1：创建 Header 组件**

创建 `src/components/layout/admin-header.tsx`：

```tsx
import { PanelRightClose, PanelRightOpen } from "lucide-react";

import { Button } from "@/components/ui/button";

export type AdminHeaderProps = {
  title: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
};

export function AdminHeader({
  title,
  sidebarOpen,
  onToggleSidebar,
}: AdminHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          aria-label={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
          onClick={onToggleSidebar}
          size="icon"
          type="button"
          variant="ghost"
        >
          {sidebarOpen ? (
            <PanelRightOpen className="size-4" aria-hidden="true" />
          ) : (
            <PanelRightClose className="size-4" aria-hidden="true" />
          )}
        </Button>
        <h1 className="truncate text-base font-semibold text-foreground">
          {title}
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-2 rounded-md border border-border bg-card px-2 py-1">
        <div className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
          管
        </div>
        <span className="text-sm font-medium text-foreground">管理员</span>
      </div>
    </header>
  );
}
```

说明：

- 收缩/展开按钮位于 Header 左侧页面标题旁边。
- `sidebarOpen === true` 时显示 `PanelRightOpen`。
- `sidebarOpen === false` 时显示 `PanelRightClose`。
- 用户信息区域只是占位，不读取真实用户数据。

- [ ] **Step 2：验证 Header 编译和 lint**

运行：

```bash
npm run lint
```

预期结果：命令成功结束，`src/components/layout/admin-header.tsx` 没有 lint 错误。

- [ ] **Step 3：提交本任务**

```bash
git add src/components/layout/admin-header.tsx
git commit -m "feat: add admin header"
```

---

### Task 3：新增 Sidebar 组件

**文件：**

- 新增：`src/components/layout/admin-sidebar.tsx`

- [ ] **Step 1：创建 Sidebar 组件**

创建 `src/components/layout/admin-sidebar.tsx`：

```tsx
import Link from "next/link";
import { LibraryBig } from "lucide-react";

import { adminNavItems } from "@/components/layout/admin-nav";
import { cn } from "@/lib/utils";

export type AdminSidebarProps = {
  sidebarOpen: boolean;
  pathname: string;
};

export function AdminSidebar({ sidebarOpen, pathname }: AdminSidebarProps) {
  return (
    <aside
      className={cn(
        "flex min-h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        sidebarOpen ? "w-60" : "w-[72px]"
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center border-b border-sidebar-border px-4",
          sidebarOpen ? "justify-start gap-2" : "justify-center"
        )}
      >
        <div className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <LibraryBig className="size-4" aria-hidden="true" />
        </div>
        {sidebarOpen ? (
          <span className="truncate text-sm font-semibold">
            AI知识库管理平台
          </span>
        ) : null}
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {adminNavItems.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.Icon;

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center rounded-md text-sm font-medium transition-colors",
                sidebarOpen
                  ? "justify-start gap-2 px-3"
                  : "justify-center px-0",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
              href={item.href}
              key={item.href}
              title={sidebarOpen ? undefined : item.label}
            >
              <Icon className="size-4" aria-hidden="true" />
              {sidebarOpen ? <span>{item.label}</span> : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

说明：

- 展开时显示 `LibraryBig` 图标和 `AI知识库管理平台`。
- 收缩时品牌区只显示 `LibraryBig` 图标。
- 展开时导航显示图标和名称。
- 收缩时导航只显示图标。
- 当前路由对应导航项通过 `aria-current="page"` 和选中样式表达。

- [ ] **Step 2：验证 Sidebar 编译和 lint**

运行：

```bash
npm run lint
```

预期结果：命令成功结束，`src/components/layout/admin-sidebar.tsx` 没有 lint 错误。

- [ ] **Step 3：提交本任务**

```bash
git add src/components/layout/admin-sidebar.tsx
git commit -m "feat: add admin sidebar"
```

---

### Task 4：新增 AdminShell 并维护本地侧边栏状态

**文件：**

- 新增：`src/components/layout/admin-shell.tsx`

- [ ] **Step 1：创建 AdminShell 组件**

创建 `src/components/layout/admin-shell.tsx`：

```tsx
"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { AdminHeader } from "@/components/layout/admin-header";
import { getAdminPageTitle } from "@/components/layout/admin-nav";
import { AdminSidebar } from "@/components/layout/admin-sidebar";

export type AdminShellProps = {
  children: React.ReactNode;
};

export function AdminShell({ children }: AdminShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = React.useState(true);

  const title = getAdminPageTitle(pathname);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AdminSidebar pathname={pathname} sidebarOpen={sidebarOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          sidebarOpen={sidebarOpen}
          title={title}
        />
        <main className="min-h-0 flex-1 overflow-auto bg-muted/30 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

说明：

- `sidebarOpen` 使用 `React.useState(true)` 维护在 `AdminShell` 本地。
- 不使用 Zustand 管理布局收缩状态。
- Header 负责触发 `onToggleSidebar`。
- Sidebar 根据 `sidebarOpen` 决定展开或收缩显示。
- Main Content 只承载业务页面内容，不写业务逻辑。

- [ ] **Step 2：验证 AdminShell 编译和 lint**

运行：

```bash
npm run lint
```

预期结果：命令成功结束，`src/components/layout/admin-shell.tsx` 没有 lint 错误。

- [ ] **Step 3：提交本任务**

```bash
git add src/components/layout/admin-shell.tsx
git commit -m "feat: compose admin shell"
```

---

### Task 5：接入默认重定向和三个后台页面入口

**文件：**

- 修改：`src/app/page.tsx`
- 修改：`src/app/knowledge-bases/page.tsx`
- 新增：`src/app/documents/page.tsx`
- 新增：`src/app/agents/page.tsx`

- [ ] **Step 1：将根路径改为默认重定向**

修改 `src/app/page.tsx`：

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/knowledge-bases");
}
```

- [ ] **Step 2：新增知识库管理占位页内容**

修改 `src/app/knowledge-bases/page.tsx`：

```tsx
import { AdminShell } from "@/components/layout/admin-shell";

export default function KnowledgeBasesPage() {
  return (
    <AdminShell>
      <section className="max-w-4xl">
        <div className="rounded-lg border border-border bg-card p-6 text-card-foreground">
          <p className="text-sm font-medium text-muted-foreground">
            知识库管理
          </p>
          <h2 className="mt-2 text-xl font-semibold">知识库管理占位页</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            当前阶段只验证后台布局、路由跳转和页面承载能力。真实知识库列表、卡片和数据请求将在后续知识库模块中实现。
          </p>
        </div>
      </section>
    </AdminShell>
  );
}
```

- [ ] **Step 3：新增知识文档占位页路由**

创建目录：

```bash
New-Item -ItemType Directory -Force src\app\documents
```

创建 `src/app/documents/page.tsx`：

```tsx
import { AdminShell } from "@/components/layout/admin-shell";

export default function DocumentsPage() {
  return (
    <AdminShell>
      <section className="max-w-4xl">
        <div className="rounded-lg border border-border bg-card p-6 text-card-foreground">
          <p className="text-sm font-medium text-muted-foreground">知识文档</p>
          <h2 className="mt-2 text-xl font-semibold">知识文档占位页</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            后续将在此管理知识文档、导入内容和查看解析结果。当前阶段不接入真实业务数据、表单或接口。
          </p>
        </div>
      </section>
    </AdminShell>
  );
}
```

- [ ] **Step 4：新增专家 Agent 占位页路由**

创建目录：

```bash
New-Item -ItemType Directory -Force src\app\agents
```

创建 `src/app/agents/page.tsx`：

```tsx
import { AdminShell } from "@/components/layout/admin-shell";

export default function AgentsPage() {
  return (
    <AdminShell>
      <section className="max-w-4xl">
        <div className="rounded-lg border border-border bg-card p-6 text-card-foreground">
          <p className="text-sm font-medium text-muted-foreground">
            专家 Agent
          </p>
          <h2 className="mt-2 text-xl font-semibold">专家 Agent 占位页</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            后续将在此配置专家 Agent
            并关联知识库。当前阶段不接入真实业务数据、表单或接口。
          </p>
        </div>
      </section>
    </AdminShell>
  );
}
```

- [ ] **Step 5：验证路由页面编译和 lint**

运行：

```bash
npm run lint
```

预期结果：命令成功结束，路由文件和布局组件 import 没有 lint 错误。

- [ ] **Step 6：提交本任务**

```bash
git add src/app/page.tsx src/app/knowledge-bases/page.tsx src/app/documents/page.tsx src/app/agents/page.tsx
git commit -m "feat: add admin layout routes"
```

---

### Task 6：完整验证和桌面端人工检查

**文件：**

- 验证：`src/components/layout/*`
- 验证：`src/app/page.tsx`
- 验证：`src/app/knowledge-bases/page.tsx`
- 验证：`src/app/documents/page.tsx`
- 验证：`src/app/agents/page.tsx`

- [ ] **Step 1：运行 lint**

运行：

```bash
npm run lint
```

预期结果：命令退出码为 `0`。

- [ ] **Step 2：运行生产构建**

运行：

```bash
npm run build
```

预期结果：命令退出码为 `0`，Next.js 输出生产构建成功。

- [ ] **Step 3：启动开发服务**

运行：

```bash
npm run dev
```

预期结果：开发服务启动，并输出本地访问地址，通常是 `http://localhost:3000`。

- [ ] **Step 4：人工验证根路径重定向**

打开：

```text
http://localhost:3000/
```

预期结果：

```text
浏览器最终停留在 /knowledge-bases。
Header 标题显示 知识库管理。
主体区域显示 知识库管理占位页。
```

- [ ] **Step 5：人工验证 Sidebar 导航**

依次打开：

```text
http://localhost:3000/knowledge-bases
http://localhost:3000/documents
http://localhost:3000/agents
```

预期结果：

```text
/knowledge-bases 高亮 知识库，Header 显示 知识库管理。
/documents 高亮 知识文档，Header 显示 知识文档。
/agents 高亮 专家 Agent，Header 显示 专家 Agent。
```

- [ ] **Step 6：人工验证 Sidebar 收缩和展开**

在桌面端宽度下，点击 Header 页面标题旁边的按钮。

Sidebar 打开时的预期结果：

```text
按钮图标是 PanelRightOpen。
Sidebar 品牌区显示 LibraryBig + AI知识库管理平台。
Sidebar 导航显示 BrainCircuit + 知识库、FolderKanban + 知识文档、Bot + 专家 Agent。
```

Sidebar 关闭时的预期结果：

```text
按钮图标是 PanelRightClose。
Sidebar 品牌区只显示 LibraryBig。
Sidebar 导航项只显示图标。
导航仍然可以点击。
页面元素没有重叠，文字没有挤压到不可读状态。
```

- [ ] **Step 7：提交验证中产生的修复**

如果 Step 1 或 Step 2 发现问题并修改了代码，提交修复：

```bash
git add src/components/layout src/app
git commit -m "fix: polish admin layout verification"
```

如果 Step 1 和 Step 2 均通过且没有代码修改，本步骤不需要提交。

---

## 自查

**Spec 覆盖情况：**

- `/` 重定向到 `/knowledge-bases`：Task 5。
- `/knowledge-bases`、`/documents`、`/agents` 三个路由可访问：Task 5。
- 统一 AdminShell，包含 Header、Sidebar、Main Content：Task 4。
- Sidebar 状态使用本地 `useState`：Task 4。
- 布局状态不使用 Zustand：Task 4 代码没有导入 store。
- 使用 shadcn/ui 风格 `Button`：Task 2。
- 使用当前已安装的 `lucide-react` 图标组件：Task 1、Task 2、Task 3。
- Sidebar 品牌文案 `AI知识库管理平台`：Task 3。
- Sidebar 收缩时只显示图标：Task 3。
- Header 标题旁按钮使用 `PanelRightOpen` 和 `PanelRightClose`：Task 2。
- 三个页面均为占位页且不请求接口：Task 5。
- 第一版只做桌面端人工验收：Task 6。

**占位内容扫描：**

- 计划中没有未解决的占位标记。
- 所有代码步骤都提供了明确文件路径和完整代码。
- 验证命令和预期结果已经写明。

**类型一致性：**

- `AdminSidebarProps.sidebarOpen` 与 `AdminHeaderProps.sidebarOpen` 都是 `boolean`。
- `AdminHeaderProps.onToggleSidebar` 由 `AdminShell` 传入。
- `adminNavItems.Icon` 使用 `lucide-react` 的 `LucideIcon` 类型。
- `getAdminPageTitle(pathname: string)` 接收 `usePathname()` 返回的 pathname。
