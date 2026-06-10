# RAG Debug 召回测试模块技术文档

## 1. 技术定位

RAG Debug 是知识库详情页内的前端调试视图，用于解释一次 RAG 召回。第一版采用“兼容已有接口优先”的方案：

```text
DebugPanel
-> POST /api/rag/retrieve
-> 前端转换为 Debug 展示模型
-> PATCH /api/rag-management/knowledge-bases/[id] 保存 TopK
```

设计原则：

- 不新增 Debug API Route。
- 不新增 Debug Service。
- 不新增数据库表。
- 不修改 `retrieveRagContexts`。
- 不修改 Agent 对话检索链路。
- Debug 状态保存在组件本地，不进入 Zustand。

## 2. 组件结构

入口文件：

```text
src/features/knowledge-bases/components/knowledge-base-detail-feature.tsx
```

新增/使用组件：

```text
src/features/knowledge-bases/components/debug-panel.tsx
src/features/knowledge-bases/components/debug-result-card.tsx
src/features/knowledge-bases/components/debug-prompt-dialog.tsx
```

职责：

- `debug-panel.tsx`：维护 Debug 本地状态、请求流程、参数面板、错误和结果。
- `debug-result-card.tsx`：展示单条 chunk。
- `debug-prompt-dialog.tsx`：展示 `llmContext` 和 references。

## 3. 本地状态

```ts
type DebugState = {
  query: string;
  queryRewriteEnabled: boolean;
  mode: "fast" | "balanced" | "detailed";
  topK: number;
  similarityThreshold: number; // 只读兼容字段，不在 UI 中展示
  loading: boolean;
  saving: boolean;
  error: string | null;
  result: RagDebugViewResult | null;
  promptDialogOpen: boolean;
};
```

说明：

- `query`、`queryRewriteEnabled`、`mode`、`result` 都是临时调试状态。
- `topK` 可在左侧参数栏编辑并保存。
- `similarityThreshold` 仅从详情数据读取，用于兼容旧展示模型和 Prompt 弹窗，不再暴露为可编辑控件。
- 不使用全局 store，避免 Debug 高频临时状态造成无关重渲染。

## 4. 请求流程

### 4.1 执行 Debug

```text
用户输入 query
-> 点击 Debug
-> 校验 query 非空
-> debugKnowledgeBase(knowledgeBaseId, request)
-> POST /api/rag/retrieve
-> 前端转换 RagRetrieveResponse
-> setResult
```

前端封装：

```ts
export async function debugKnowledgeBase(
  knowledgeBaseId: string,
  payload: RagDebugRequest
) {
  return requestJson<RagRetrieveResponse>("/api/rag/retrieve", {
    method: "POST",
    body: JSON.stringify({
      query: payload.query,
      mode: payload.mode,
      scope: {
        knowledgeBaseIds: [knowledgeBaseId],
      },
    }),
  });
}
```

不传：

- `topK`
- `similarityThreshold`
- `queryRewriteEnabled`

这些字段不改变现有 RAG 后端行为。

### 4.2 结果转换

```text
retrieve.contexts
-> 按 score 倒序
-> slice(0, topK)
-> map<RagDebugHit>
-> 生成 summary / diagnostics
```

第一版不再按相似度阈值过滤展示结果，避免 Debug 页和真实后端返回不一致。若需要提示低分结果，只作为诊断文案，不隐藏后端实际返回的 chunk。

### 4.3 保存配置

保存配置只提交 TopK：

```ts
await updateKnowledgeBase(knowledgeBaseId, {
  topK,
});
```

不再提交 `similarityThreshold`，因为 RAG 卡片和 Debug 页都不再暴露该字段，且当前底层检索没有读取知识库级阈值。

## 5. Query Rewrite 兼容策略

第一版保留 Query Rewrite 开关作为前端入口：

- 关闭时不展示只读框。
- 开启时展示只读说明框。
- 不向 `/api/rag/retrieve` 传递 `queryRewriteEnabled`。
- 不伪造 rewritten query。
- 底层是否 rewrite 仍由现有 RAG 服务决定。

后续如果 retriever 支持请求级 rewrite 开关，再扩展请求体和返回体。

## 6. 参数面板

左侧参数面板展示：

- `mode`：Select，值为 `fast | balanced | detailed`。
- `topK`：number input，范围 `1-20`。
- 保存配置按钮。

不展示：

- `similarityThreshold`

检索模式切换时同步设置 TopK：

```ts
fast -> 较小 TopK
balanced -> 默认 TopK
detailed -> 较大 TopK
```

模式本身不持久化。

## 7. Prompt 预览

Prompt 弹窗使用现有返回值：

```ts
retrieve.llmContext
retrieve.references
```

注意：

- 右侧卡片数量由前端 TopK 控制。
- `llmContext` 来自后端原始 RAG 返回。
- 因此前端卡片数量和 Prompt 上下文数量可能不完全一致。
- 第一版接受该差异，并在后续需要完全一致时再新增 Debug Service。

## 8. 错误处理

前端处理：

- query 为空：不发请求，展示错误。
- Debug 请求失败：保留输入和参数，展示错误。
- 保存失败：保留 TopK 草稿，展示错误。
- 返回结果为空：显示空状态。

后端处理：

- 复用 `/api/rag/retrieve` 的现有校验和错误响应。
- 复用知识库更新接口的现有错误响应。

## 9. 验证方式

建议运行：

```bash
npx eslint src/features/knowledge-bases/components/debug-panel.tsx src/features/knowledge-bases/components/debug-result-card.tsx src/features/knowledge-bases/components/debug-prompt-dialog.tsx
npm run build
```

人工验证：

1. 进入 `/knowledge-bases/[id]`。
2. 点击 `Debug` tab。
3. 确认左侧只有检索模式、TopK 和保存配置，没有相似度阈值。
4. 输入问题后点击 Debug。
5. 确认右侧展示 chunk 卡片。
6. 打开 Prompt 预览。
7. 修改 TopK 并保存，刷新后确认 TopK 生效。
