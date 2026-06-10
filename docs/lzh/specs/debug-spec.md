# RAG Debug 召回测试模块 Spec

## 1. 背景

RAG Debug 用于在知识库详情页解释一次 RAG 召回过程。它不是 Agent 对话页，不生成最终回答，而是帮助管理员观察：

- 输入问题在当前知识库中能召回哪些 chunk。
- 每条 chunk 的排序、得分、来源和是否进入 Prompt。
- 当前 TopK、检索模式、Query Rewrite 开关对展示结果的影响。
- 最终拼接给模型的 RAG 上下文是什么。

该能力用于补足 Agent 对话的可观测性：Agent 对话负责“消费知识并回答”，Debug 负责“解释知识为什么这样被召回”。

## 2. 阶段目标

在 `/knowledge-bases/[id]` 详情页新增 `Debug` tab，位于 `知识条目`、`文档管理` 旁边。

本阶段实现：

- Debug tab 切换，不离开当前详情页路由。
- 顶部问题输入框。
- Query Rewrite 开关，以及开启后的只读说明/展示框。
- Debug 按钮，触发当前知识库范围内的召回测试。
- 左侧参数面板：检索模式、TopK、保存配置。
- 右侧召回结果列表，按相关度得分展示 chunk。
- Debug 成功后展示 Prompt 预览入口。
- loading、error、empty 状态。

本阶段不实现：

- 不新增 Debug 专用数据库表。
- 不保存 Debug 历史记录。
- 不新增 Debug 专用后端 API。
- 不修改 `/api/rag/retrieve`、`retrieveRagContexts` 或 Agent 对话检索逻辑。
- 不在 Debug 页面展示或编辑相似度阈值。
- 不调用大模型生成最终回答。

## 3. 页面结构

```text
知识条目 | 文档管理 | Debug

顶部测试区
- 问题输入框
- Query Rewrite 开关
- Debug 按钮
- Query Rewrite 开启后的只读展示框

下方调试区
- 左栏：检索模式、TopK、保存配置
- 右栏：召回结果列表、Prompt 预览入口
```

桌面端左栏较窄、右栏较宽；移动端上下排列。

## 4. 顶部测试区

### 4.1 问题输入

- 支持多行输入。
- trim 后不能为空。
- 为空时不能触发 Debug，并展示错误提示。
- Debug 请求中保留当前输入，不因失败清空。

### 4.2 Query Rewrite 开关

第一版保留前端交互入口，但底层仍复用现有 RAG 接口。

关闭时：

- 不展示只读改写框。
- Debug 请求仍调用现有 `/api/rag/retrieve`。

开启时：

- 输入框下方展示只读说明框。
- 当前版本不伪造“改写后的问题”。
- 不向 `/api/rag/retrieve` 额外传递 `queryRewriteEnabled`。
- 底层是否 rewrite 由现有 RAG 服务决定。

### 4.3 Debug 按钮

- 触发 `POST /api/rag/retrieve`。
- 请求期间显示 loading 并避免重复提交。
- 成功后刷新右侧结果。
- 失败时保留输入、参数和上一次结果，展示错误。

## 5. 左侧参数面板

左侧参数面板只展示当前 Debug 页需要用户直接操作的参数：

| 参数 | 作用 | 是否持久化 |
| --- | --- | --- |
| 检索模式 | `fast` / `balanced` / `detailed`，用于前端请求现有 RAG 接口 | 否 |
| TopK | 控制 Debug 结果展示数量 | 是 |

相似度阈值不再展示、不再编辑，避免继续强化一个当前底层未真实使用的配置概念。

### 5.1 检索模式

检索模式用于快速切换测试粒度，并同步调整 TopK：

- `fast`：较少结果，适合快速检查。
- `balanced`：默认模式。
- `detailed`：更多结果，适合排查漏召回。

模式本身不保存到数据库。

### 5.2 TopK

- 默认读取当前知识库 `detail.topK`。
- 取值范围建议为 `1-20`。
- Debug 结果在前端按 TopK 截取展示。
- 保存配置时写回当前知识库的 `topK` 字段。

### 5.3 保存配置

保存按钮复用现有知识库更新接口：

```text
PATCH /api/rag-management/knowledge-bases/[id]
```

提交内容：

```ts
{
  topK: number;
}
```

不提交：

- `similarityThreshold`
- `mode`
- `queryRewriteEnabled`
- `query`

## 6. 右侧召回结果

Debug 成功后，右侧展示 chunk 卡片列表。

结果处理规则：

```text
retrieve.contexts
-> 按 score 从高到低排序
-> slice(0, topK)
-> 生成卡片列表
```

卡片展示：

- 排名。
- chunk 标题。
- chunk 内容摘要。
- 所属知识库或文档相关标识。
- chunk ID。
- chunk 类型。
- 相关度得分。
- refId。
- 是否进入 Prompt。

文案使用“相关度得分”，不写成“向量相似度”，因为底层可能融合 BM25、rerank、MMR 等策略。

## 7. Prompt 预览

Debug 成功后显示 `Prompt 预览` 按钮。

弹窗展示：

- 原始问题。
- 当前 RAG 名称。
- 当前模式和 TopK。
- `llmContext`。
- references。

Prompt 预览直接使用 `/api/rag/retrieve` 返回的 `llmContext` 和 `references`。由于第一版 TopK 是前端展示层截取，Prompt 预览中的上下文可能与右侧卡片数量不完全一致，需要在技术文档中说明。

## 8. 后端接口

第一版不新增 Debug API，直接复用：

```text
POST /api/rag/retrieve
```

请求体：

```ts
{
  query: string;
  mode: "fast" | "balanced" | "detailed";
  scope: {
    knowledgeBaseIds: string[];
  };
}
```

返回体沿用现有 `RagRetrieveResponse`。

## 9. 与现有功能关系

| 能力 | Agent 对话 | RAG Debug |
| --- | --- | --- |
| 生成最终回答 | 是 | 否 |
| 展示引用来源 | 是 | 是 |
| 展示 chunk 得分 | 否 | 是 |
| 展示完整 RAG 上下文 | 否 | 是 |
| 保存 RAG 配置 | 否 | 仅 TopK |

Debug 不改变 Agent 对话和公共 RAG API 的真实检索策略。

## 10. 验收标准

1. 详情页存在 `Debug` tab。
2. 点击 `Debug` 后不跳转路由。
3. 页面顶部存在问题输入框、Query Rewrite 开关和 Debug 按钮。
4. Query Rewrite 开启后展示只读说明/展示框。
5. 左侧参数栏展示检索模式、TopK 和保存配置按钮。
6. 左侧参数栏不展示相似度阈值。
7. 切换检索模式会同步调整 TopK。
8. 点击 Debug 后调用现有 RAG retrieve 接口。
9. 结果区按相关度得分展示 chunk 卡片。
10. Debug 成功后可以打开 Prompt 预览。
11. 保存配置只持久化 TopK。
12. 本阶段不新增数据库表、不新增 Debug API、不修改底层检索服务。
