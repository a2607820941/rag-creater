# 成员 E 专家 Agent 工作内容与协作对接

## 1. 当前已完成

已完成 Agent 配置侧基础能力：

- Agent 数据模型：`ExpertAgent`
- Agent 创建、列表、详情、编辑、删除
- Agent system prompt 生成
- Agent 可用性检查
- Agent 列表页：`/agents`
- Agent 新建页：`/agents/new`
- Agent 编辑页：`/agents/[id]/edit`
- 知识范围配置：`knowledgeScope`
- 引用开关：`showReferences`
- 对话沉淀开关：`allowKnowledgeCapture`

主要文件：

```text
prisma/schema.prisma
src/features/agent/
src/server/services/agent/agent.service.ts
src/app/api/agents/
src/app/agents/
```

## 2. knowledgeScope 重点说明

`knowledgeScope` 表示：这个 Agent 被允许检索哪些知识。

它不是知识内容，也不是检索结果，只是检索范围配置。

当前结构：

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

当前 `knowledgeScope` 使用 JSON 字符串保存，没有直接建外键。

原因：

- 知识库、分类、标签、知识条目等基础模块还在并行开发
- RAG 检索和 LLM Wiki 入库格式可能还会调整

所以当前做法是：

```text
先保存通用 knowledgeScope 配置
后续等知识库 / 分类 / 标签 / RAG 稳定后再接真实选择器
```

未来可能需要调整：

- 手动填写 ID 改成知识库多选
- 分类、标签改成真实选择器
- 指定知识改成知识搜索选择
- `chunkTypes` 与 LLM Wiki / RAG 入库结果对齐
- 可用性检查进一步接真实知识片段状态

## 3. E 对外提供的功能有：

- Agent 配置
- Agent system prompt
- Agent knowledgeScope
- Agent 可用性检查
- 是否展示引用
- 是否允许对话沉淀

## 4. F 如何调用 E 的能力

### 前端页面可以调 API

如果前端，可以使用：

```http
GET  /api/agents/[id]
POST /api/agents/[id]/validate
POST /api/agents/[id]/system-prompt
```

### 后端逻辑可以直接调用 service

```text
POST /api/agents/[id]/chat
```

调用 service 的方法：

```ts
import {
  getAgentById,
  validateAgentAvailability,
} from "@/server/services/agent/agent.service";
import { toRagRetrieveScope } from "@/features/agent/agent.validation";

const agent = await getAgentById(agentId);
const validation = await validateAgentAvailability(agentId);
const scope = toRagRetrieveScope(agent.knowledgeScope);
```

## 5. 当前待接入点

- 知识范围选择器还没有接真实知识库、分类、标签接口
- RAG `/api/rag/retrieve` 完成后，需要把 `knowledgeScope` 接入真实检索
- LLM Wiki 可能带来的兼容步骤