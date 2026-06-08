# 成员 E - 技术文档

## 1. 负责范围与业务背景

本项目是面向企业中后台的 AI 知识库管理系统，目标是让企业内部知识能够被结构化管理、可检索、可问答，并进一步被平台内专家 Agent 和外部 Agent 工具消费。

成员 E 的工作围绕“知识如何被 Agent 消费”展开，核心可以归纳为两条主线：

- 专家 Agent 配置与生成：面向平台内部用户，提供可配置的专家角色、知识范围、回答风格、引用规则、对话沉淀规则和系统提示词。
- Skill 生产标准化与消费：面向平台内部和外部 Agent，把知识库能力从“绑定某个知识库的 RAG 问答壳”改造成“面向具体业务任务的企业知识能力包”，并补齐生产、校验、发布、安装、运行和管理能力。

业务上，本模块服务于集团信息系统部覆盖的人事、财务、法务、采购、审批、职场、安全、隐私、合规、AIGC 等企业场景。知识库是底层资源，专家 Agent 和 Skill 是面向用户任务的消费入口。

## 2. 总体方案与标准化思路

### 2.1 专家 Agent 与 Skill 的定位

专家 Agent 和 Skill 都是知识消费入口，但解决的问题不同：

| 模块 | 定位 | 使用对象 | 主要能力 |
| --- | --- | --- | --- |
| 专家 Agent | 平台内部专家问答角色 | 平台用户 | 绑定知识范围、生成系统提示词、参与平台内聊天问答 |
| Skill | 面向任务场景的能力包 | 外部 Agent / 平台用户 | 说明书、触发条件、工作流、运行契约、可选脚本和资料 |

专家 Agent 更强调平台内部问答体验，核心是“谁来回答、按什么范围回答、用什么风格回答”。Skill 更强调可分发和可复用，核心是“什么任务应该触发、怎样调用、输出什么、边界在哪里”。

### 2.2 Skill 标准化的背景

早期 Skill 更像“绑定某个知识库的 RAG 壳”，不同 Skill 的差异主要是知识库不同。这会带来两个问题：

- 外部 Agent 很难判断什么时候应该调用某个 Skill，因为每个 Skill 看起来都像“查知识库”。
- 企业知识无法按业务任务分发，采购、审批、法务、人事等场景的边界和输出格式不清晰。

因此本次改造把 Skill 的身份从“知识库绑定”调整为“任务场景”：

```text
知识库是资源依赖，任务场景才是 Skill 的身份。
```

例如采购流程 Skill 不应只描述为“查询采购知识库”，而应描述为：

```text
面向员工和业务运营同学，在采购申请、审批、供应商选择、合同/订单流转等场景中提供流程指引。
```

### 2.3 Skill 的标准化考虑

本项目中的 Skill 标准化主要参考 Anthropic Agent Skills / Claude Code / Codex 等外部 Agent 平台的通用读取方式，同时保留企业知识库平台自身的治理能力。

标准化重点包括：

- 入口标准：以 `SKILL.md` 作为外部 Agent 的主入口，说明什么时候使用、怎么使用、不要什么时候使用、输出规范和边界。
- 任务标准：用业务域、任务类型、目标用户、任务描述、触发样例、不适用场景和输出格式描述 Skill 身份。
- 契约标准：通过 `manifest.json`、`references/api.md`、input schema、output schema 描述运行方式和输入输出结构。
- 资料标准：把详细说明拆到 `references/`，避免 `SKILL.md` 过长，让外部 Agent 按需读取。
- 运行标准：通过 `scripts/run-skill.mjs` 调用平台 Runtime，而不是把企业知识库全文和权限逻辑打包到本地。
- 治理标准：发布前校验 slug、任务描述、知识范围、触发样例、non-goals、schema、runtime contract 和 system prompt。

### 2.4 Package + Runtime 模式

Skill 设计拆分为两个概念：

```text
Skill Package：给外部 Agent 安装和读取的文件夹
Skill Runtime：本平台实际执行 RAG、LLM、引用和日志记录的能力
```

二者在代码逻辑中拆分，但在导出结果中合并。用户拿到的仍然是一个 Skill 文件夹或 zip 包，里面既有说明文件，也有平台调用契约。

这种设计的原因是：

- 外部 Agent 适合读取本地说明文件，例如 `SKILL.md`、examples、references。
- 企业知识库检索、权限、引用、日志等能力仍需要由平台执行。
- RAG 检索、LLM 调用、citation 逻辑可以统一升级，不需要每个外部 Agent 重新安装。
- 运行密钥可以由平台统一生成、停用和审计。

最终模式是：

```text
外部 Agent 负责识别任务和组织调用
平台 Runtime 负责真实执行和知识治理
```

## 3. 专家 Agent 配置与生成

### 3.1 功能范围

专家 Agent 面向平台内部专家问答，支持配置：

- Agent 名称和描述。
- 回答风格 `answerStyle`。
- 知识范围 `knowledgeScope`。
- 是否展示引用 `showReferences`。
- 是否允许对话沉淀 `allowKnowledgeCapture`。
- 状态 `status`。
- 系统提示词 `systemPrompt`。

页面入口包括：

```text
/agents
/agents/new
/agents/[id]/edit
/agents/chat
```

主要代码位置：

```text
src/features/agent/
src/server/services/agent/agent.service.ts
src/server/services/agent/agent-chat.service.ts
src/app/api/agents/
src/app/agents/
```

### 3.2 数据模型与知识范围

专家 Agent 使用 `ExpertAgent` 模型承载：

```text
ExpertAgent
├── name
├── description
├── answerStyle
├── knowledgeScope
├── showReferences
├── allowKnowledgeCapture
├── status
└── systemPrompt
```

其中 `knowledgeScope` 使用 JSON 字符串保存，前端和服务层定义为：

```ts
type AgentKnowledgeScope = {
  mode: "all" | "knowledgeBases" | "categories" | "tags" | "knowledgeItems";
  knowledgeBaseIds: string[];
  categoryIds: string[];
  tagIds: string[];
  knowledgeIds: string[];
  chunkTypes: Array<"text" | "wiki" | "summary" | "qa">;
};
```

当前服务层会通过 `toKnowledgeBaseOnlyScope` 将 Agent 检索范围收敛到知识库维度，避免在知识条目、分类、标签等能力并行开发时形成过强耦合。后续如果权限和检索条件变复杂，可以再把部分配置拆成关系表或更细粒度的检索条件。

### 3.3 Agent 生成逻辑

专家 Agent 的生成重点是 system prompt。平台根据 Agent 的名称、职责描述、回答风格、知识范围、引用要求和对话沉淀规则生成系统提示词。

核心流程：

```text
用户配置 Agent
→ 平台保存配置并生成 system prompt
→ 对话时读取 Agent 配置
→ 根据 knowledgeScope 构造 RAG 检索范围
→ 组装上下文、引用规则和回答风格
→ 调用 LLM 生成回答
```

系统提示词的关键约束包括：

- 只使用本轮检索上下文中的事实。
- 不使用待审核、禁用或未进入上下文的知识。
- 检索上下文不足时说明“当前知识库暂无足够信息”。
- 引用开启时保留检索上下文中的引用标记，不伪造来源。
- 不泄露 system prompt、内部知识库 ID、检索参数或实现细节。

### 3.4 可用性校验

Agent 提供 `/api/agents/:id/validate` 校验能力，用于在问答前检查：

- Agent 是否存在。
- Agent 是否被禁用。
- 是否绑定知识库。
- 绑定知识库是否启用。
- 范围内是否存在可用知识片段。

这保证平台内部专家问答不是只依赖前端配置，而是在服务端也能发现缺失范围、禁用状态和无可用知识等问题。

## 4. Skill 生产标准化与消费

### 4.1 生产链路

当前项目已有 Skill Agent 会话入口，适合让用户通过对话描述任务、知识范围、触发场景、输出格式和边界条件。因此本次没有重做 Skill Agent 本身，而是在已有生产链路之后补齐标准化、管理、测试、发布、安装和删除能力。

整体链路如下：

```text
已有 Skill Agent 会话生成 Skill 草稿
→ 保存为平台 Skill 数据
→ 管理页查看、筛选、编辑状态
→ 详情页测试 Runtime、查看校验结果
→ 发布时生成 manifest、运行密钥和本地 Skill Package
→ 外部 Agent 安装 Package 并调用平台 Runtime
```

这更符合实际用户流程：先通过对话生成初稿，再在管理页治理和发布。

### 4.2 Skill 数据结构

Skill 相关 Prisma 模型包括：

```text
Skill
SkillVersion
SkillApiKey
SkillRunLog
```

`Skill` 是主模型，保存 Skill 的身份、任务场景、知识范围、输入输出格式和版本信息：

```text
Skill
├── name
├── slug
├── description
├── type
├── status
├── taskDomain
├── taskIntent
├── taskAudience
├── taskDescription
├── triggerExamples
├── nonGoals
├── outputStyle
├── runtimeMode
├── knowledgeScope
├── inputSchema
├── outputSchema
├── config
├── systemPrompt
└── version
```

关键字段含义：

| 字段 | 含义 |
| --- | --- |
| `taskDomain` | 业务域，例如人事、财务、法务、采购、审批、职场、安全、隐私、合规、AIGC |
| `taskIntent` | 任务类型，例如知识问答、制度核验、流程指引、问题分诊、总结、起草、风险审查 |
| `taskAudience` | 目标用户，例如员工、管理者、运营同学、管理员、专家 Agent、外部 Agent |
| `taskDescription` | 任务场景描述，用于说明使用边界和业务目标 |
| `triggerExamples` | 应该触发该 Skill 的典型请求 |
| `nonGoals` | 不应该使用该 Skill 的场景 |
| `outputStyle` | 输出形式，例如引用回答、清单、步骤、风险报告、JSON |
| `knowledgeScope` | 依赖的知识库范围 |
| `runtimeMode` | 平台执行模式，目前为 `platform_rag` |

辅助模型职责：

- `SkillVersion` 保存发布时的 manifest 和 Skill 快照，便于追踪版本。
- `SkillApiKey` 保存外部调用密钥摘要，明文密钥只在发布后展示一次。
- `SkillRunLog` 记录每次 Runtime 调用的输入、输出、引用数量和错误信息，方便审计和排查。

前端类型位于：

```text
src/features/skill/skill.types.ts
```

核心类型包括：

```text
SkillDTO
SkillTaskScenario
SkillRuntimeContract
SkillPackageManifest
SkillRunResult
SkillValidationResult
```

其中 `SkillTaskScenario` 是标准化的核心：

```ts
type SkillTaskScenario = {
  domain: SkillTaskDomain;
  intent: SkillTaskIntent;
  audience: SkillTaskAudience;
  description: string;
  triggerExamples: string[];
  nonGoals: string[];
  outputStyle: SkillOutputStyle;
};
```

这使 Skill 不再只依赖知识库，而是拥有明确的任务身份。

### 4.3 默认模板与生成标准

为了避免用户每次从零补齐标准化信息，服务层在创建 Skill 时加入默认模板：

- 默认描述强调任务触发场景，而不是只写“查询某知识库”。
- 默认 task description 说明业务域、目标用户、任务类型和证据边界。
- 默认 system prompt 要求基于知识库证据回答，必须返回引用，证据不足时说明缺失信息。
- 默认 trigger examples 覆盖典型业务请求。
- 默认 non-goals 避免 Skill 被当作通用聊天或通用知识库搜索工具。
- 默认 runtime mode 为 `platform_rag`。

默认 input schema：

```json
{
  "type": "object",
  "properties": {
    "question": {
      "type": "string",
      "description": "The concrete user question or task request."
    },
    "context": {
      "type": "string",
      "description": "Optional caller-provided context that is not a knowledge-base citation."
    },
    "outputStyle": {
      "type": "string",
      "description": "Optional preferred response style, such as concise, checklist, step_by_step, risk_report, or json."
    }
  },
  "required": ["question"]
}
```

默认 output schema：

```json
{
  "type": "object",
  "properties": {
    "answer": {
      "type": "string",
      "description": "The knowledge-grounded answer for the configured task scenario."
    },
    "citations": {
      "type": "array",
      "description": "Knowledge-base citations returned by the runtime."
    },
    "confidence": {
      "type": "string",
      "enum": ["high", "medium", "low"],
      "description": "Evidence confidence based on retrieved knowledge coverage."
    },
    "followups": {
      "type": "array",
      "description": "Optional missing information, next questions, or recommended owner/process."
    }
  },
  "required": ["answer", "citations", "confidence"]
}
```

这套默认配置降低了生产门槛，同时保证外部 Agent 有足够信息判断是否调用该 Skill。

### 4.4 Skill Package 结构

导出的 Skill 包结构如下：

```text
skill-slug/
├── SKILL.md
├── manifest.json
├── INSTALL.md
├── references/
│   ├── api.md
│   ├── knowledge-scope.md
│   ├── task-scenario.md
│   ├── examples.md
│   └── runtime.md
└── scripts/
    ├── run-skill.mjs
    ├── install-skill.mjs
    └── set-runtime-key.mjs
```

各文件职责：

| 文件 | 作用 |
| --- | --- |
| `SKILL.md` | 外部 Agent 的主入口，说明什么时候使用、怎么使用、不要什么时候使用、输出规范 |
| `manifest.json` | 平台自己的元信息和 Runtime 契约 |
| `INSTALL.md` | 安装和运行说明 |
| `references/api.md` | HTTP endpoint、鉴权方式、输入输出 schema |
| `references/knowledge-scope.md` | 该 Skill 依赖的知识范围 |
| `references/task-scenario.md` | 任务场景、目标用户和业务边界 |
| `references/examples.md` | 应触发、不应触发、边界问题样例 |
| `references/runtime.md` | Package 与 Runtime 的关系说明 |
| `scripts/run-skill.mjs` | 让外部 Agent 通过 Node.js 调用平台 API |
| `scripts/install-skill.mjs` | 一键安装到 Codex / Claude Code 的本地 skills 目录 |
| `scripts/set-runtime-key.mjs` | 写入运行密钥，解决桌面端或已启动进程无法读取 export 环境变量的问题 |

### 4.5 发布前校验

为了保证 Skill 不是泛化的知识库查询工具，发布前通过 `validateSkillForPackage` 进行质量校验。

校验内容包括：

- slug 是否可安装、是否足够简洁。
- description 是否能区分任务场景。
- taskDescription 是否具体。
- 是否绑定知识范围。
- 是否有 trigger examples。
- 是否有 non-goals。
- 是否生成边界样例。
- 是否有测试样例。
- input schema 是否清晰。
- output schema 是否包含 answer、citations、confidence。
- 是否选择输出格式。
- 是否有外部调用契约。
- 是否导出运行脚本。
- system prompt 是否包含证据约束和证据不足处理。

校验结果结构：

```ts
type SkillValidationResult = {
  valid: boolean;
  reasons: string[];
  warnings: string[];
  summary: {
    blockingCount: number;
    warningCount: number;
    passedCount: number;
    totalCount: number;
    message: string;
  };
  checks: SkillValidationCheck[];
};
```

这样前端可以展示具体风险和修复建议，而不是只返回简单的 schema 错误。

### 4.6 Skill 管理功能

Skill 管理入口：

```text
/skills
/skills/[id]
```

列表页能力：

- 搜索名称、slug、描述、任务场景。
- 按状态筛选。
- 按业务域筛选。
- 按任务类型筛选。
- 展示全部 Skill、已发布、草稿、已停用统计。
- 展示任务场景、状态、版本、知识范围、更新时间。
- 支持查看详情、下载 zip、启用、停用、删除。

详情页能力：

| 页签 | 功能 |
| --- | --- |
| 概览 | 查看任务身份、发布质量、状态、知识范围 |
| 安装 | 下载 zip，查看 Codex / Claude Code 安装命令和运行密钥写入方式 |
| 测试 | 输入问题，调用 Skill Runtime 进行测试 |
| 任务场景 | 查看触发样例、不适用场景、任务描述和系统提示词 |
| 平台调用 | 查看接口地址、鉴权方式、输入格式、输出格式 |
| 校验 | 查看发布前质量校验结果 |

主要代码位置：

```text
src/app/skills/page.tsx
src/app/skills/[id]/page.tsx
src/features/skill/components/skill-management-page.tsx
src/features/skill/components/skill-detail-page.tsx
src/features/skill/skill-labels.ts
```

### 4.7 平台内部消费

平台内部仍然保留 Skill 消费能力。聊天执行时可以扫描已安装 Skill，根据 Skill 描述和任务场景判断是否适合调用。

相关服务：

```text
src/server/services/skill/skill-registry.service.ts
src/server/services/chat/chat-executor.ts
```

内部消费过程：

```text
用户在平台聊天中提问
→ Chat Executor 判断是否命中已安装 Skill
→ 调用 Skill Registry
→ Skill Runtime 执行 RAG 检索和 LLM 生成
→ 返回 answer 与 citations
```

`skill-registry.service.ts` 会扫描本地 `skills/` 目录，读取 `SKILL.md` 和 `manifest.json`，再由 LLM 在已安装 Skill 中选择最匹配的一个。命中后通过 `runInstalledSkill` 调用平台 Runtime。

### 4.8 外部 Agent 消费

外部 Agent 消费是 Skill 标准化的重点。

外部消费流程：

```text
平台发布 Skill
→ 生成 Skill 文件夹或 zip 包
→ 用户安装到 Codex / Claude Code 的本地 skills 目录
→ 外部 Agent 读取 SKILL.md 判断是否使用
→ 需要执行时运行 scripts/run-skill.mjs
→ 脚本调用 /api/public/skills/:slug/run
→ 平台执行 RAG、LLM、引用和日志记录
→ 外部 Agent 获得回答结果
```

外部 Runtime 接口：

```http
POST /api/public/skills/:slug/run
Authorization: Bearer <SKILL_API_KEY>
```

输入结构：

```json
{
  "input": {
    "question": "采购申请流程是什么？",
    "context": "用户所在业务线或补充上下文",
    "outputStyle": "step_by_step"
  }
}
```

输出结构：

```json
{
  "answer": "回答内容",
  "citations": [],
  "skill": {
    "id": "skill id",
    "slug": "skill slug",
    "version": "0.1.0"
  }
}
```

公开运行接口通过 Bearer 运行密钥鉴权，避免任何人直接调用企业知识库能力。

## 5. API 设计

### 5.1 专家 Agent API

```http
GET    /api/agents
POST   /api/agents
GET    /api/agents/:id
PATCH  /api/agents/:id
DELETE /api/agents/:id
POST   /api/agents/:id/validate
POST   /api/agents/:id/system-prompt
POST   /api/agents/:id/chat
GET    /api/agents/:id/conversations
```

### 5.2 Skill API

```http
GET    /api/skills
POST   /api/skills
GET    /api/skills/:id
PATCH  /api/skills/:id
DELETE /api/skills/:id
POST   /api/skills/:id/publish
GET    /api/skills/:id/validate
POST   /api/skills/:id/test
GET    /api/skills/:id/export-package
```

### 5.3 外部公开 Skill API

```http
GET  /api/public/skills/:slug/manifest
POST /api/public/skills/:slug/run
```

## 6. 技术抉择

### 6.1 为什么使用 JSON 保存配置

Agent 的 `knowledgeScope` 和 Skill 的 `inputSchema`、`outputSchema`、`config`、`triggerExamples`、`nonGoals` 等字段使用 JSON 字符串保存。

原因：

- 项目处于多模块并行开发阶段，知识库、分类、标签、RAG 结构可能变化。
- JSON 配置可以快速支持不同 Agent 和 Skill 的差异化配置。
- 对于 Skill Package 来说，导出时也需要 JSON schema 和 manifest，天然适合结构化 JSON。

后续如果权限、统计、检索条件变复杂，可以再将部分字段拆成关系表。

### 6.2 为什么 Skill 要面向任务场景

如果 Skill 只绑定知识库，外部 Agent 无法判断何时使用它。面向任务场景后，Skill 有了更清晰的身份：

```text
业务域 + 任务类型 + 目标用户 + 触发样例 + 不适用场景 + 输出格式
```

这对于外部 Agent 自动选择 Skill 非常重要，也符合企业中后台“按业务任务消费知识”的模式。

### 6.3 为什么保留平台 Runtime

外部 Agent 只负责读取 Skill 包并发起调用，不直接保存完整知识库。这样可以保证：

- 知识统一由平台维护。
- 引用来源统一生成。
- 运行日志可追踪。
- 密钥可控。
- RAG 和 LLM 能统一升级。

### 6.4 为什么新建 Skill 仍然走已有 Skill Agent

Skill 生产需要用户描述任务、知识范围、触发场景、输出格式和边界条件。项目中已有 Skill Agent 会话入口适合承担这类对话式生成工作，纯表单则容易让用户从零填写，门槛较高。

因此当前模式是：

```text
已有 Skill Agent 会话负责生产
Skill 标准化与管理页负责治理
```

## 7. 业务链路总结

本模块形成了一条从企业知识到外部 Agent 能力包的链路：

```text
企业知识库
→ 专家 Agent / Skill 绑定知识范围
→ 已有 Skill Agent 根据任务场景生成 Skill 草稿
→ Skill 草稿标准化为可导出的 Skill 包
→ 用户下载并安装到 Codex / Claude Code
→ 外部 Agent 识别任务并调用平台 Runtime
→ 平台返回带引用的知识回答
```

对应业务价值：

- 企业知识不只停留在平台内问答，也可以被外部 Agent 工具使用。
- Skill 以任务场景为身份，适合采购、审批、法务、财务、人事等企业流程。
- 通过 Runtime 保留企业知识治理能力，避免知识散落到外部 Agent 本地。
- 通过管理页提升可运维性，方便发布、停用、删除和测试。

## 8. 当前限制与后续优化

当前仍有一些可继续优化的方向：

- Skill 草稿生成仍依赖已有 Skill Agent 会话中用户对任务的描述，后续可以加入更多企业默认模板。
- Skill 测试样例可以从 trigger examples 自动生成一键测试计划。
- Skill 与知识库权限还可以进一步结合用户身份和组织权限。
- Skill Runtime 目前主要是 HTTP + RAG，后续可以扩展更多执行类型。
- 可以增加 Skill 安装状态检测，例如判断用户是否已经安装到 Codex 或 Claude Code。
- Skill 发布版本可以进一步支持回滚和版本对比。
- 外部 Agent 的兼容范围当前聚焦 Codex 和 Claude Code，后续可按需求扩展更多平台。

## 9. 主要代码清单

专家 Agent：

```text
prisma/schema.prisma
src/features/agent/agent.types.ts
src/features/agent/agent.validation.ts
src/features/agent/agent-prompt.ts
src/features/agent/components/agent-form.tsx
src/features/agent/components/agent-list.tsx
src/server/services/agent/agent.service.ts
src/server/services/agent/agent-chat.service.ts
src/app/api/agents/
src/app/agents/
```

Skill：

```text
prisma/schema.prisma
src/features/skill/skill.types.ts
src/features/skill/skill.validation.ts
src/features/skill/skill-labels.ts
src/features/skill/components/skill-management-page.tsx
src/features/skill/components/skill-detail-page.tsx
src/server/services/skill/skill.service.ts
src/server/services/skill/skill-registry.service.ts
src/app/api/skills/
src/app/api/public/skills/
src/app/skills/
```

Skill Agent 会话衔接与发布弹窗：

```text
src/app/agents/chat/page.tsx
src/app/agents/chat/_components/skill-publish-dialog.tsx
src/app/agents/chat/_lib/chat-types.ts
```

## 10. 总结

成员 E 负责的工作可以概括为：先完成平台内部专家 Agent 的配置与生成，再把 Skill 从“知识库问答壳”标准化为可安装、可调用、可治理的企业任务能力包。

该方案的核心判断是：企业知识库是底层资源，真正能被用户和 Agent 理解的是任务场景。因此 Skill 的标准化重点不只是导出文件，而是明确任务身份、触发条件、边界、输出格式和平台调用契约。通过这种方式，项目能够把集团信息系统部覆盖的复杂业务知识转化为内部专家 Agent 和外部 Agent 都能消费的企业 AI 能力。
