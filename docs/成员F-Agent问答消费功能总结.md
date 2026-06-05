# 成员 F：Agent 问答消费功能总结

## 1. 功能定位

本模块负责知识消费侧的聊天问答能力，核心是：

```text
发送问题 -> 选择聊天模式 -> 组装上下文 -> 调用大模型 -> 流式展示回答 -> 展示引用来源
```

对应分工：**上下文组装、多轮对话、引用回答**。

## 2. 页面入口

新增聊天页面：

```text
/agents/chat
```

在 `/agents` 页面也新增了进入对话的入口。

## 3. 聊天模式

发送框左侧新增一个模式菜单，包含四种模式：

| 模式 | 是否需要 Agent | 是否使用 RAG | 说明 |
| --- | --- | --- | --- |
| OpenAI | 否 | 否 | 直接调用 OpenAI 兼容接口聊天 |
| Agent | 是 | 否 | 使用 Agent 人设 Prompt 聊天 |
| RAG + OpenAI | 否 | 是 | 检索知识后交给大模型回答 |
| RAG + Agent | 是 | 是 | 使用 Agent 配置 + RAG 知识上下文回答 |

其中 `OpenAI` 模式不需要知识库 ID，也不需要 Agent 配置。

## 4. 后端接口

新增通用聊天接口：

```http
POST /api/chat
```

用于：

- `OpenAI`
- `Agent`
- `RAG + OpenAI`

保留并扩展 Agent 知识库问答接口：

```http
POST /api/agents/[id]/chat
```

用于：

- `RAG + Agent`

接口返回 `text/event-stream`，前端可以流式展示回答。

## 5. 会话与消息

新增数据模型：

```text
AgentConversation
AgentMessage
```

实现能力：

- 保存会话
- 保存用户消息
- 保存 AI 回答
- 保存回答引用来源
- 支持多轮对话
- 支持历史消息读取

相关接口：

```http
GET /api/agents/[id]/conversations
GET /api/conversations/[id]/messages
```

## 6. 上下文组装

根据不同模式组装不同上下文：

- `OpenAI`：只发送用户问题和通用 system prompt。
- `Agent`：加入 Agent 的 `systemPrompt`。
- `RAG + OpenAI`：加入 RAG 返回的 `llmContext`。
- `RAG + Agent`：加入 Agent 配置、历史记忆、最近对话和 RAG 上下文。

RAG 检索复用当前项目已有的：

```ts
retrieveRagContexts()
```

## 7. 引用回答

RAG 模式会展示引用来源：

- 引用编号
- 知识标题
- chunk 内容
- 相关性分数

引用数据会保存到消息中，历史会话打开后仍可展示。

## 8. Memory 压缩

`RAG + Agent` 模式支持对话 Memory 压缩：

- 近期消息直接参与上下文
- 较早消息压缩为 `memorySummary`
- 压缩失败时使用 fallback，避免历史信息丢失

## 9. 环境变量

OpenAI 兼容接口配置：

```env
OPENAI_BASE_URL="https://api.deepseek.com"
OPENAI_API_KEY=""
OPENAI_MODEL=""
```

默认接口配置：

```env
LLM_BASE_URL=""
LLM_API_KEY=""
LLM_MODEL=""
```

本地模型配置：

```env
LOCAL_LLM_BASE_URL=""
LOCAL_LLM_API_KEY=""
LOCAL_LLM_MODEL=""
```

修改 `.env` 后需要重启 `npm run dev`。

## 10. 主要文件

```text
src/app/agents/chat/page.tsx
src/app/api/chat/route.ts
src/app/api/agents/[id]/chat/route.ts
src/app/api/agents/[id]/conversations/route.ts
src/app/api/conversations/[id]/messages/route.ts
src/server/services/agent/agent-chat.service.ts
src/server/services/agent/llm-client.ts
src/features/agent/agent-chat.types.ts
src/features/agent/agent-chat.validation.ts
prisma/schema.prisma
```

## 11. 验证

已通过：

```bash
npm run lint
npm run build
```
