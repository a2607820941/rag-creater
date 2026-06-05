# AGENTS.md

本文件面向在本项目中工作的 AI 编码代理。目标是让代理在修改代码前快速理解项目定位、技术栈、目录结构、运行命令和基本开发约定，减少无关改动。

## 项目概览

- 项目是一个 AI 知识库管理平台。
- 核心业务包括知识生产、知识管理、知识检索和知识消费。
- 知识生产支持手动录入、文件上传、飞书导入和 AI 自动提炼。
- 知识管理支持知识库管理、知识条目 CRUD、审核、状态管理和权限控制。
- 知识消费支持基于知识库的 AI 对话、专家 Agent 和后续 Skill / SDK 扩展。
- 当前项目技术栈为 Next.js、React、TypeScript、Tailwind CSS、shadcn/ui、Zustand、Zod、SQLite 和 Prisma，图标库使用 lucide
- 如果实际代码与本文档不同，应优先遵循仓库现有代码结构和 `package.json` 中的脚本。

## 技术栈约定

- 使用 Next.js App Router 和 React 函数组件。
- 当前使用 Next.js 16；涉及框架 API、路由、缓存、服务端组件或构建行为时，优先查阅 `node_modules/next/dist/docs/` 中的本地文档和废弃提示。
- 使用 TypeScript 编写业务代码、组件、API Route、服务和类型。
- 使用 Tailwind CSS 编写样式，UI 组件优先采用 shadcn/ui 风格和目录约定。
- 使用 Zustand 作为前端状态管理，采用分片模式组织 store。
- 使用 Zod 进行表单、接口入参、服务层边界和环境变量校验。
- 使用 SQLite 作为本地数据库。
- 使用 Prisma 作为数据库 schema、类型生成和数据库访问层。
- 当前 Prisma 使用 Prisma 7，SQLite 客户端初始化应通过 driver adapter，例如 `@prisma/adapter-libsql`。

## 目录约定

当前项目采用 `src/` 目录结构，推荐目录如下：

- `src/app/`：页面路由、布局和 API Route。
- `src/app/api/`：后端接口，例如知识库、上传、RAG、对话、审核等接口。
- `src/components/`：通用 UI 组件和业务组件。
- `src/components/ui/`：shadcn/ui 组件目录。
- `src/features/`：按业务模块拆分的逻辑代码，例如知识库、上传、RAG、对话、审核、Agent。
- `src/lib/`：数据库、鉴权、AI 调用、文件解析、工具函数等基础能力。
- `src/lib/db.ts`：Prisma Client 单例封装。
- `src/store/`：Zustand 全局状态管理。
- `src/store/slices/`：Zustand store 分片。
- `src/types/`：跨模块共享的 TypeScript 类型。
- `src/generated/prisma/`：Prisma 生成客户端，属于生成产物，不要手动修改。
- `prisma/`：Prisma schema 和数据库迁移文件。
- `public/`：静态资源。
- `scripts/`：初始化、数据填充或数据库相关脚本。

不要修改：

- `node_modules/`
- `.next/`
- `dist/`
- `build/`
- `src/generated/prisma/`
- 其他自动生成产物

## 常用命令

在项目根目录执行：

```bash
npm install
npm run dev
npm run build
npm run lint
npm run db:generate
npm run db:push
npm run db:studio
```

常见说明：

- 开发前先查看 `package.json`，确认实际可用脚本。
- 修改 Prisma schema 后运行 `npm run db:generate`。
- 需要把 Prisma schema 同步到本地 SQLite 时运行 `npm run db:push`。
- 修改 TypeScript 类型、路由、数据库 schema、AI 调用逻辑或构建配置后，优先运行 `npm run build`。
- 如果项目没有配置测试脚本，不要声称已经通过测试。
- 如果命令失败，应说明失败命令和关键错误，不要为了通过验证随意放宽规则。

## Prisma 与 SQLite 约定

- 数据模型统一维护在 `prisma/schema.prisma`。
- 本地数据库连接使用 `DATABASE_URL="file:./dev.db"`，示例写入 `.env.example`。
- 不要提交 `.env`、`.env.local`、真实密钥或本地数据库文件。
- 不要手动编辑 `src/generated/prisma/`。
- 服务端数据库访问统一通过 `src/lib/db.ts` 导出的 Prisma Client。
- 修改数据库模型时同步检查 API、服务层、前端类型、表单校验和页面展示。
- 不要删除已有字段或表，除非用户明确要求或任务必须如此。

## Zustand 分片约定

- 全局 store 入口为 `src/store/index.ts`。
- store 类型组合放在 `src/store/types.ts`。
- 每个业务分片放在 `src/store/slices/` 下，例如 `app-slice.ts`、`knowledge-base-slice.ts`。
- 新增状态时优先按业务域新增或扩展 slice，不要把所有状态堆到单个文件。
- React 组件中订阅 Zustand 状态时，优先选择需要的最小字段，避免不必要重渲染。
- 频繁变化、只在组件内部使用的 UI 临时状态优先用组件本地 state，不要无条件放入全局 store。

## Zod 约定

- 表单输入、API 请求体、查询参数、环境变量和服务层边界优先使用 Zod 校验。
- Zod schema 应尽量放在对应 feature、API 或 lib 模块附近，避免无边界的全局 schema 文件。
- API Route 不应信任前端类型，后端必须重新校验输入。
- Prisma 模型类型不等同于外部接口类型，接口输入输出需要按场景定义或校验。

## shadcn/ui 与 Tailwind CSS 约定

- UI 组件优先复用 `src/components/ui/` 中的 shadcn/ui 组件。
- 不要无故引入新的 UI 库、状态管理库、请求库或格式化工具。
- Tailwind class 应保持可读，复杂变体可使用项目已有的工具函数封装。
- 管理后台页面应保持清晰、简洁、信息密度适中。
- 表格页面应考虑搜索、筛选、分页、空状态和加载状态。
- 表单页面应包含必要校验和错误提示。
- AI 对话页面应保证问题输入、回答展示、引用来源和会话切换清晰可用。
- 审核页面应清楚区分待审核、已通过、已驳回状态。
- 不要为了视觉效果引入大范围无关重构。

## 编码风格

- 使用 TypeScript 编写代码。
- React 组件优先使用函数组件。
- 保持页面组件轻量，复杂业务逻辑应拆到 `features/`、`lib/`、`store/` 或独立组件中。
- 新增代码应尽量沿用项目已有写法、命名和目录风格。
- 只在代码不够直观时添加必要注释，避免大段解释性注释。
- 不要擅自修改 TypeScript、ESLint、Prettier、Next.js 等全局配置。

## 业务模块约定

### 知识库模块

知识库相关功能应集中在知识库模块中，包括：

- 知识库创建、编辑、删除
- 知识条目创建、编辑、删除
- 知识状态管理，例如待审核、可用、不可用
- 标签、分类、来源等元数据管理

### 上传与解析模块

上传相关功能应覆盖：

- 文件上传
- 文本抽取
- 内容切分
- AI 摘要生成
- 标签生成
- 向量化入库

文件解析逻辑不要直接堆在页面组件中，应放入独立服务或工具函数中。

### RAG 与检索模块

RAG 相关逻辑应尽量独立，包括：

- 关键词检索
- 语义检索
- 多知识库聚合检索
- Prompt 组装
- 大模型调用
- 引用来源返回

不要在聊天页面中直接写复杂检索逻辑。

### AI 对话模块

对话模块应支持：

- 用户输入问题
- 选择知识库
- 调用 RAG 流程
- 展示 AI 回答
- 展示引用来源
- 保存会话记录

涉及流式输出时，应保证 loading、错误状态和中断状态可处理。

### 审核模块

AI 自动生成或自动提炼的知识，默认不应直接进入正式知识库。

推荐流程：

```text
AI 生成知识草稿
→ 进入待审核状态
→ 管理员审核
→ 通过后进入正式知识库
```

## API 与异步请求

- 前端请求应优先复用项目已有请求封装。
- 不要在多个组件中重复创建请求实例。
- 接口错误应给出用户可见提示。
- 异步交互应处理 loading、error 和 empty 状态。
- 涉及鉴权的接口应考虑 token 失效、未登录跳转和权限不足情况。
- 不要提交真实 token、密钥、Cookie 或本地环境配置。

## 权限与安全

- 登录、权限和知识库访问控制相关逻辑应谨慎修改。
- 普通用户不应看到或调用管理员专属操作，例如删除知识库、审核知识、修改权限。
- 后端接口也应校验权限，不能只依赖前端隐藏按钮。
- 不要把密钥、模型 API Key 或数据库连接信息写入代码。
- 本地配置应放在 `.env.local` 或 `.env` 等环境文件中，并确保不会提交到仓库。

## 测试与验证

- 当前项目如果没有测试脚本，不要新增复杂测试体系，除非用户明确要求。
- 文案、样式、小范围 UI 改动至少检查相关页面是否受影响。
- 涉及类型、路由、数据库 schema、AI 调用、RAG 流程或构建配置时，应运行构建命令。
- 修改 Prisma schema 后应运行 `npm run db:generate`，必要时运行 `npm run db:push`。
- 如果验证失败且是既有问题，应在结果中说明，不要扩大改动范围修复无关问题。

## 变更边界

- 修改前先理解用户需求，不要做额外重构。
- 保持改动聚焦在当前任务范围内。
- 不要删除已有页面、接口、类型、数据库模型或工具函数，除非用户明确要求。
- 不要覆盖用户已有未提交改动。
- 修改 README、AGENTS.md 或其他文档时，应确保内容与实际目录和脚本一致。
- 完成任务后，应简要说明修改了哪些内容、是否运行了验证命令，以及是否存在未解决问题。
