# RAG Creater

这是一个基于 Next.js App Router 的全栈 RAG 应用项目，用于后续构建 RAG 生成、管理与 Agent 消费相关能力。

## 技术栈

- Next.js 16.2.6
- React 19.2.4
- TypeScript
- Tailwind CSS 4
- ESLint

## 项目启动

首次拉取项目后安装依赖：

```bash
npm install
```

启动本地开发服务：

```bash
npm run dev
```

默认访问地址：

```txt
http://localhost:3000
```

Next.js 开发服务默认使用 `3000` 端口。如果该端口被占用，Next.js 会提示或切换到其他可用端口，请以终端输出为准。

## 常用命令

```bash
npm run dev
```

启动开发环境。

```bash
npm run build
```

构建生产版本，并执行 TypeScript 与 Next.js 构建检查。

```bash
npm run start
```

启动生产构建后的服务。使用前需要先执行 `npm run build`。

```bash
npm run lint
```

运行 ESLint 代码检查。

## 目录结构

```txt
src/
  app/          # Next.js App Router 路由层
  components/   # 项目通用组件
  features/     # 按业务领域拆分的功能模块
  lib/          # 通用工具函数、适配器、SDK 封装
  server/       # 服务端代码，例如数据库、鉴权、业务服务
  types/        # 全局 TypeScript 类型
  config/       # 应用配置、常量
public/         # 静态资源目录
```

## 目录说明

### `src/app`

Next.js App Router 的路由目录。页面、布局、加载状态、错误边界和 API Route Handler 都放在这里。

常见文件约定：

- `page.tsx`：页面入口
- `layout.tsx`：布局组件
- `loading.tsx`：加载状态
- `error.tsx`：错误边界
- `not-found.tsx`：404 页面
- `route.ts`：API 接口

示例：

```txt
src/app/page.tsx                # /
src/app/documents/page.tsx      # /documents
src/app/api/rag-management/documents/route.ts  # /api/rag-management/documents
```

### `src/components`

项目级通用组件目录。这里放多个页面或多个功能模块都会复用的组件。

本项目计划使用外部组件库，因此不单独创建 `ui/` 目录来维护基础 UI 组件。

### `src/features`

业务功能模块目录。建议按业务领域拆分，例如：

```txt
src/features/documents/
src/features/agents/
src/features/rag/
```

页面入口应尽量保持轻量，复杂业务组件和业务逻辑优先放到对应的 `features` 模块中。

### `src/lib`

通用工具与基础封装目录，例如：

- 字符串、日期、格式化工具
- 第三方 SDK 初始化
- 通用 fetch/client 封装
- 与具体业务无关的辅助函数

### `src/server`

服务端专用代码目录，例如：

- 数据库连接
- 鉴权逻辑
- 服务端业务服务
- 只能在服务端运行的工具函数

不要把需要在浏览器中运行的代码放进这里。

### `src/types`

全局 TypeScript 类型目录。适合放跨模块共享的类型定义。

### `src/config`

应用配置和常量目录，例如站点名称、分页配置、模型配置、环境变量读取封装等。

### `public`

静态资源目录。放在这里的文件可以通过站点根路径访问。

示例：

```txt
public/logo.png
```

访问路径：

```txt
/logo.png
```

## 路由说明

本项目使用 Next.js 的 App Router，不使用旧的 `pages` 路由目录。

App Router 的核心规则是：

- `src/app` 下的文件夹决定 URL 路径
- `page.tsx` 让该路径成为页面
- `route.ts` 让该路径成为 API 接口
- `layout.tsx` 为当前目录及其子目录提供共享布局

例如：

```txt
src/app/projects/page.tsx
```

对应页面：

```txt
/projects
```

动态路由使用方括号：

```txt
src/app/projects/[id]/page.tsx
```

对应：

```txt
/projects/1
/projects/abc
```

## 数据库的修改

```
# 1. 修改 prisma/schema.prisma

# 2. 创建并执行数据库迁移
npx prisma migrate dev --name 本次修改的名字

# 3. 重新生成 Prisma Client
npx prisma generate

# 4. 重启 Next.js 开发服务
npm run dev
```
