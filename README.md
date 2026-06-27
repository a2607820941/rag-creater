# RAG Creater - AI 知识库管理平台

一个基于 Next.js App Router 的全栈 AI 知识库管理平台，支持知识生产、知识管理、知识检索和知识消费的完整闭环。

## 项目状态与分支说明

> **当前阶段**：项目主体功能开发已完成，进入 **发布后维护与修复阶段**。

| 分支 | 用途 |
|------|------|
| `main` | 稳定可演示版本，阶段性集成后合并 |
| `fix/post-release-maintenance` | **当前维护分支** — Bug 修复、安全加固、性能优化、文档完善 |
| `feature/*` | 各成员功能开发分支（开发完成后已合并） |

### 维护分支主要工作

- [ ] 补充认证/授权中间件（当前 API 无鉴权保护）
- [ ] 引入单元测试框架（vitest）和核心逻辑测试覆盖
- [ ] AI 提供商抽象层（当前 Embedding 硬编码 DashScope，LLM 需统一配置入口）
- [ ] `.env.example` 模板已提供，确保新开发者可快速上手
- [ ] 向量存储优化（当前为 SQLite 字符串字段，需评估迁移至专用向量数据库）
- [ ] CI/CD 与容器化部署支持
- [ ] API 请求速率限制
- [ ] 全局错误边界与结构化日志

### 已知限制

1. **认证缺失**：所有 API 接口无鉴权保护，任何人可直接调用
2. **SQLite 单机**：仅适用于开发和小规模使用，不支持并发写入
3. **零测试覆盖**：295 个源文件无任何自动化测试
4. **AI 提供商耦合**：Embedding 仅支持阿里云 DashScope，LLM 配置入口分散

## 项目介绍

RAG Creater 是一个功能完整的 AI 知识库管理系统，旨在帮助企业和团队高效管理知识资产。平台提供从知识生产到消费的全流程支持，包括：

- **知识生产**：支持手动录入、文件上传、飞书导入和 AI 自动提炼等多种知识来源
- **知识管理**：提供知识库管理、知识条目 CRUD、审核、状态管理和权限控制
- **知识检索**：支持关键词检索、语义检索、多知识库聚合检索
- **知识消费**：基于知识库的 AI 对话、专家 Agent 和后续 Skill/SDK 扩展

平台采用现代化技术栈，具备良好的可扩展性和可维护性，适合中小型团队快速搭建智能知识管理系统。

## 主要功能

### 1. 知识库管理
- 创建、编辑、删除知识库
- 知识库配置管理（分块大小、相似度阈值、TopK 等）
- 知识库状态管理（活跃、禁用）
- 标签和分类管理

### 2. 知识条目管理
- 知识条目的完整生命周期管理（创建、编辑、删除、详情查看）
- 知识状态管理：可用、不可用、待确认
- 知识来源追踪：手动录入、文档导入、AI 提炼、对话沉淀
- 批量启用、批量停用能力
- 使用次数统计和热度排行

### 3. 文档导入管线
- 支持多种文件格式：TXT、Markdown、DOCX、文本型 PDF、图片（OCR）
- 文件上传和解析状态管理
- 解析文本预览
- 文档状态机管理（上传中、解析中、已解析、失败）

### 4. AI 知识提炼
- 从文档解析文本中提炼候选知识
- 从用户粘贴材料中提炼候选知识
- AI 输出结构化校验（Zod）
- 候选知识预览、编辑、批量确认、拒绝
- 审核流程管理

### 5. 专家 Agent 配置
- Agent 创建、编辑、删除、列表
- 配置 Agent 角色、回答风格（严谨、简洁、教学、客服等）
- 配置知识范围（全部知识、指定分类、指定标签、指定知识条目）
- 自动生成 Agent system prompt
- 引用展示配置

### 6. AI 对话消费
- 多轮对话消息展示
- 用户问题输入和 AI 回答生成
- 引用知识展示和详情查看
- 对话历史记录
- 流式输出支持

### 7. 知识闭环与数据分析
- 从对话回答沉淀为新知识
- 知识被检索次数和引用次数统计
- Dashboard 数据总览
- 热门知识排行
- 分类知识数量统计
- 知识缺口识别

### 8. RAG 检索能力
- 关键词检索
- 语义检索
- 多知识库聚合检索
- Prompt 组装
- 大模型调用
- 引用来源返回

### 9. 审核流程
- AI 自动生成知识默认进入待审核状态
- 管理员审核通过后进入正式知识库
- 审核状态管理（待审核、已通过、已驳回）

## 开发技术栈

### 前端技术
- **Next.js 16.2.6** - React 全栈框架（App Router）
- **React 19.2.4** - 用户界面库
- **TypeScript** - 类型安全的 JavaScript
- **Tailwind CSS 4** - 实用优先的 CSS 框架
- **shadcn/ui** - UI 组件库
- **Zustand 5.0.14** - 前端状态管理
- **Lucide React** - 图标库

### 后端技术
- **Next.js API Routes** - 后端接口
- **Prisma 7.8.0** - 数据库 ORM 和类型生成
- **SQLite** - 本地数据库
- **Zod 4.4.3** - 数据校验

### AI 与文档处理
- **pdf-parse** - PDF 文档解析
- **mammoth** - DOCX 文档解析
- **tesseract.js** - OCR 图片文字识别
- **xlsx** - Excel 文件处理
- **iconv-lite & jschardet** - 字符编码处理

### 开发工具
- **ESLint** - 代码检查
- **PostCSS** - CSS 处理工具
- **TypeScript** - 类型检查

## 快速开始

### 环境要求

- Node.js 18.0 或更高版本
- npm 9.0 或更高版本
- 操作系统：Windows、macOS 或 Linux

### 1. 克隆项目

```bash
git clone <项目仓库地址>
cd rag-creater-main
```

### 2. 安装依赖

```bash
npm install
```

### 3. 环境配置

项目根目录已提供 `.env.example` 模板文件，复制并重命名为 `.env`，然后填写实际值：

```bash
cp .env.example .env
```

**必填环境变量：**

```env
# 数据库连接（SQLite）
DATABASE_URL="file:./dev.db"

# LLM 大模型 — 默认接口（兼容 OpenAI 格式）
LLM_API_KEY="your_api_key"
LLM_MODEL="gpt-4o-mini"
LLM_BASE_URL="https://api.openai.com/v1"

# Embedding 向量化 — 阿里云 DashScope
DASHSCOPE_API_KEY="your_dashscope_api_key"
```

**可选变量：** `OPENAI_API_KEY` / `VOYAGE_API_KEY` / `FEISHU_APP_ID` 等，详见 `.env.example`。

### 4. 数据库初始化

```bash
# 生成 Prisma Client
npm run db:generate

# 同步数据库 schema 到本地 SQLite
npm run db:push
```

### 5. 启动开发服务器

```bash
npm run dev
```

默认访问地址：http://localhost:3000

如果端口 3000 被占用，Next.js 会自动切换到其他可用端口，请以终端输出为准。

## 常用命令

```bash
# 开发环境
npm run dev

# 构建生产版本
npm run build

# 启动生产服务
npm run start

# 代码检查
npm run lint

# 数据库相关
npm run db:generate    # 生成 Prisma Client
npm run db:push        # 同步 schema 到数据库
npm run db:studio      # 打开 Prisma Studio 数据库管理界面
```

## 目录结构

```txt
rag-creater-main/
├── src/
│   ├── app/                    # Next.js App Router 路由层
│   │   ├── agents/             # 专家 Agent 页面
│   │   ├── api/                # API 接口
│   │   ├── candidates/         # 候选知识页面
│   │   ├── dashboard/          # 数据看板页面
│   │   ├── documents/          # 文档管理页面
│   │   ├── extraction/         # 知识提炼页面
│   │   ├── knowledge-bases/    # 知识库管理页面
│   │   ├── note/               # 笔记页面
│   │   ├── skills/             # 技能管理页面
│   │   ├── layout.tsx          # 根布局
│   │   ├── page.tsx            # 首页
│   │   └── globals.css         # 全局样式
│   ├── components/             # 通用 UI 组件
│   │   └── ui/                 # shadcn/ui 组件
│   ├── features/               # 业务功能模块
│   │   ├── agent/              # 专家 Agent 模块
│   │   ├── analytics/          # 数据分析模块
│   │   ├── chat/               # 对话模块
│   │   ├── document/           # 文档模块
│   │   ├── extraction/         # 知识提炼模块
│   │   ├── feishu/             # 飞书导入模块
│   │   ├── knowledge/          # 知识管理模块
│   │   ├── knowledge-bases/    # 知识库模块
│   │   ├── note/               # 笔记模块
│   │   ├── rag/                # RAG 检索模块
│   │   └── skill/              # 技能模块
│   ├── lib/                    # 通用工具函数和基础能力
│   ├── server/                 # 服务端代码
│   ├── store/                  # Zustand 状态管理
│   ├── types/                  # TypeScript 类型定义
│   └── generated/              # Prisma 生成的客户端（勿手动修改）
├── prisma/
│   ├── schema.prisma           # 数据库 schema
│   └── dev.db                  # 本地 SQLite 数据库
├── public/                     # 静态资源
├── docs/                       # 项目文档
├── package.json                # 项目配置
├── tsconfig.json               # TypeScript 配置
├── next.config.ts              # Next.js 配置
└── README.md                   # 项目说明
```

## 参与协作者

本项目由 7 位成员协作开发，每位成员负责一个独立的功能模块：

| 成员 | 负责模块 | 主要职责 |
|------|----------|----------|
| **成员 曾不遗忘四月风** | 知识生命周期管理 | 知识条目的创建、编辑、删除、状态流转、来源追踪 |
| **成员 Camille** | 轻量知识检索与组织 | 分类管理、标签管理、关键词搜索、LLM 重排 |
| **成员 zsh** | 文档导入管线 | 文件上传、文档解析、状态机管理、文本预览 |
| **成员 慕云离秋** | AI 知识提炼与审核流 | AI 提炼 Prompt 设计、候选知识生成、审核流程 |
| **成员 Paxton** | 专家 Agent 配置与生成 | Agent 角色配置、知识范围约束、Prompt 编排 |
| **成员 半个西瓜** | Agent 问答消费与引用 | 多轮对话、上下文组装、引用展示 |
| **成员 五张📃** | 知识闭环与数据分析 | 对话沉淀、热度统计、Dashboard 可视化 |

### 协作分工原则

1. **功能导向分工**：每位成员负责一个可独立演示的功能模块
2. **全栈覆盖**：每个模块都包含前端页面、后端接口、数据模型和联调
3. **清晰协作**：模块之间有明确的接口约定和数据流转
4. **知识闭环**：从知识生产到消费再到沉淀的完整循环

### 核心依赖链

```text
知识管理（成员 A、B）
    ↓
知识生产（成员 C、D）
    ↓
知识消费（成员 E、F）
    ↓
知识沉淀（成员 G）
```

## 数据库模型

项目使用 Prisma 管理数据库，主要数据模型包括：

- **KnowledgeBase** - 知识库
- **DocumentSource** - 文档来源
- **DocumentChunk** - 文档分块
- **KnowledgeCategory** - 知识分类
- **KnowledgeTag** - 知识标签
- **ExpertAgent** - 专家 Agent
- **ChatConversation** - 对话会话
- **ChatMessage** - 对话消息
- **Skill** - 技能配置
- **UsageLog** - 使用日志

详细的数据库结构请查看 `prisma/schema.prisma` 文件。

## API 接口

项目提供 RESTful API 接口，主要包括：

- `/api/knowledge-bases` - 知识库管理
- `/api/documents` - 文档管理
- `/api/knowledge` - 知识条目管理
- `/api/agents` - 专家 Agent 管理
- `/api/chat` - 对话接口
- `/api/rag` - RAG 检索接口
- `/api/analytics` - 数据分析接口
- `/api/ai` - AI 提炼接口

详细的 API 文档请查看 `docs/` 目录下的相关文档。

## 注意事项

### 开发注意事项

1. **数据库修改**：修改 Prisma schema 后，需要运行 `npm run db:generate` 和 `npm run db:push`
2. **环境变量**：不要提交 `.env`、`.env.local` 等包含敏感信息的文件
3. **生成代码**：不要手动修改 `src/generated/prisma/` 目录下的文件
4. **类型安全**：所有业务代码使用 TypeScript 编写，确保类型安全
5. **代码规范**：使用 ESLint 进行代码检查，遵循项目编码规范

### 架构约定

1. **App Router**：使用 Next.js App Router，不使用旧的 `pages` 路由
2. **状态管理**：使用 Zustand 分片模式组织全局状态
3. **数据校验**：使用 Zod 进行表单、接口入参和环境变量校验
4. **UI 组件**：优先使用 shadcn/ui 组件，保持风格统一
5. **业务逻辑**：复杂业务逻辑放在 `features/` 目录，保持页面组件轻量

### 安全注意事项

1. **权限控制**：后端接口必须校验权限，不能只依赖前端隐藏按钮
2. **敏感信息**：不要在代码中硬编码 API Key、数据库密码等敏感信息
3. **输入校验**：所有用户输入必须进行校验和过滤
4. **知识审核**：AI 生成的知识默认进入待审核状态，避免错误知识污染知识库

### 性能优化

1. **数据库索引**：Prisma schema 中已为常用查询字段添加索引
2. **分页查询**：列表接口支持分页，避免一次性加载大量数据
3. **缓存策略**：合理使用 Next.js 缓存机制
4. **流式输出**：AI 对话支持流式输出，提升用户体验

## 常见问题

### Q: 如何添加新的知识来源？

A: 在 `features/` 目录下创建新的模块，实现对应的解析逻辑，并在文档导入管线中集成。

### Q: 如何修改 AI 提炼的 Prompt？

A: 在 `features/extraction/` 目录下找到对应的 Prompt 模板进行修改。

### Q: 如何添加新的 Agent 回答风格？

A: 在 Agent 配置模块中添加新的风格选项，并在 Prompt 生成逻辑中处理。

### Q: 数据库迁移如何处理？

A: 使用 Prisma 的迁移命令：
```bash
npx prisma migrate dev --name 迁移名称
```

## 相关文档

- [分工报告](docs/分工.md) - 详细的 7 人分工说明
- [技术文档](docs/) - 各模块技术文档
- [API 对接文档](docs/) - 接口对接说明

## 许可证

本项目仅供学习和内部使用。

## 联系方式

如有问题或建议，请联系项目维护者。
