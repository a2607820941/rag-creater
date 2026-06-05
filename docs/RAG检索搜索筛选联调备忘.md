# RAG 检索、关键词搜索与筛选联调备忘

本文档沉淀本轮对话和代码改动，方便今晚联调时快速确认 RAG 检索链路、知识库详情页搜索/筛选能力，以及需要和其他同学对齐的边界。

## 1. 本轮改动总览

本轮改动主要围绕三块：

- RAG 检索适配新的数据表：从旧的 `KnowledgeChunk` 迁移为读取 `DocumentSource` / `DocumentChunk`。
- RAG 向量维护：使用 `ChunkEmbedding` 作为唯一向量表，chunk 增删改时同步维护向量。
- 知识库详情页管理能力：新增非 RAG 关键词搜索，以及 chunk 级筛选组件。

当前项目里已经不再把 `KnowledgeDocument` / `KnowledgeChunk` 作为 RAG 真实读取对象理解。现在可以这样理解：

| 旧概念 | 当前承接模型 | 说明 |
| --- | --- | --- |
| `KnowledgeDocument` | `DocumentSource` | 一篇文档或一个知识来源 |
| `KnowledgeChunk` | `DocumentChunk` | 文档解析得到的原文 chunk 或 AI 提炼后的知识 chunk |
| 业务向量字段 | `ChunkEmbedding` | RAG 自己维护的本地向量表 |

## 2. 当前 RAG 检索读取范围

RAG 检索接口仍然只需要调用方传：

```ts
type RagRetrieveRequest = {
  query: string;
  scope: {
    knowledgeBaseIds: string[];
  };
};
```

当前不按分类、标签、上传类型做 RAG 检索范围过滤。内部只按知识库 scope 检索。

### 2.1 可进入 RAG 检索的 chunk

只有满足以下条件的 `DocumentChunk` 会进入 RAG 候选集：

- chunk 所属文档绑定在请求传入的 `scope.knowledgeBaseIds` 内。
- `KnowledgeBaseDocument.status = "active"`。
- `KnowledgeBase.status = "active"`。
- `DocumentSource.status = "parsed"`。
- `DocumentSource.activeStatus = "active"`。
- `DocumentChunk.chunkStatus = "active"`。
- `DocumentChunk.content` 非空。
- chunk 类型满足下面任一条件：
  - 原文文本：`DocumentChunk.chunkType = "text"`。
  - AI 知识：`DocumentChunk.chunkType = "knowledge"` 且 `DocumentChunk.reviewStatus = "confirmed"`。

因此，RAG 正式检索范围是：

```text
text chunks + confirmed/active 的 knowledge chunks
```

pending / rejected / disabled 的 AI 候选知识不会进入正式 RAG 检索。

### 2.2 RAG 依赖的核心字段

| 字段 | 来源 | 用途 |
| --- | --- | --- |
| `DocumentSource.id` | 文档表 | 作为来源文档 ID、删除/替换向量时批量定位 |
| `DocumentSource.title` | 文档表 | 结果标题、embedding 输入增强 |
| `DocumentSource.originalName` / `fileName` | 文档表 | 来源展示、搜索展示 |
| `DocumentSource.status` | 文档表 | 只检索 `parsed` 文档 |
| `DocumentSource.activeStatus` | 文档表 | 只检索 `active` 文档 |
| `KnowledgeBaseDocument.knowledgeBaseId` | 关联表 | 按知识库 scope 限定检索范围 |
| `KnowledgeBaseDocument.status` | 关联表 | 只检索 active 绑定关系 |
| `DocumentChunk.id` | chunk 表 | 向量表主键关联、召回结果定位 |
| `DocumentChunk.documentSourceId` | chunk 表 | 关联来源文档 |
| `DocumentChunk.content` | chunk 表 | RAG 正文、embedding 输入 |
| `DocumentChunk.title` | chunk 表 | AI 知识标题、embedding 输入增强 |
| `DocumentChunk.chunkIndex` | chunk 表 | 结果排序、上下文定位 |
| `DocumentChunk.chunkType` | chunk 表 | 区分 `text` / `knowledge` |
| `DocumentChunk.chunkStatus` | chunk 表 | 只检索 `active` chunk |
| `DocumentChunk.reviewStatus` | chunk 表 | AI 知识只检索 `confirmed` |
| `DocumentChunk.suggestedCategory` | chunk 表 | embedding 输入增强、页面筛选 |
| `DocumentChunk.suggestedTags` | chunk 表 | embedding 输入增强、页面筛选 |
| `ChunkEmbedding.chunkId` | 向量表 | 关联 `DocumentChunk.id` |
| `ChunkEmbedding.embedding` | 向量表 | 本地保存的向量 JSON 字符串 |
| `ChunkEmbedding.embeddingModel` | 向量表 | 判断当前向量是否属于当前模型 |
| `ChunkEmbedding.contentHash` | 向量表 | 判断 chunk 内容是否变更、向量是否过期 |

## 3. 向量化与本地向量表维护

当前只使用 `ChunkEmbedding` 作为 RAG 向量表，不再依赖旧的 `DocumentChunk.embedding`。

### 3.1 Voyage 接入方式

默认 provider 是 Voyage REST Embeddings API：

```text
POST https://api.voyageai.com/v1/embeddings
```

配置要求：

```env
VOYAGE_API_KEY=
```

默认模型：

```text
voyage-3.5
```

调用规则：

| 场景 | input_type |
| --- | --- |
| 建库 / chunk 入库向量化 | `document` |
| 用户 query 检索向量化 | `query` |

如果没有配置 `VOYAGE_API_KEY`，或者 Voyage API 调用失败，当前逻辑会明确报错，不会静默降级成 mock 向量。

### 3.2 chunk 新增、修改、删除时的向量维护

当前服务层已经挂上向量维护逻辑：

| 场景 | 当前行为 |
| --- | --- |
| 文档解析产生 text chunks | 先写入 disabled chunks，再调用 Voyage 建向量，成功后改为 active / parsed |
| 文档内容更新 | 删除旧 chunks 和旧向量，写入新 chunks，再重新建向量 |
| 文档 chunks 替换 | 删除旧 chunks 和旧向量，写入新 chunks，再重新建向量 |
| 飞书导入 | 走 `replaceTextChunksAndIndex`，会给新 text chunks 建向量 |
| AI 提炼候选知识生成 | 生成 `knowledge` chunk，状态为 pending / disabled，暂不进入 RAG |
| AI 候选知识确认 | 先给这些 knowledge chunks 建向量，成功后才改为 confirmed / active |
| AI 知识内容更新 | 如果已经 confirmed / active，则重新建向量；失败会删除旧向量并禁用该 chunk |
| AI 候选驳回 / 删除 | 删除对应 `ChunkEmbedding` |
| 删除单个 chunk | 先删除对应 `ChunkEmbedding`，再删除 chunk |
| 删除文档 | 先批量删除该文档所有 chunks 的 `ChunkEmbedding`，再删除文档 |

关键结论：

```text
当前链路里，只要上游同学走现有 service，不直接 Prisma 写 DocumentChunk，
新增 / 修改 / 删除 chunk 都能触发 RAG 向量维护。
```

### 3.3 需要上游同学注意

上游导入、提炼、审核同学需要注意：

- 不要绕过 service 直接 `prisma.documentChunk.create/update/delete`。
- 文档解析、内容替换、飞书导入等原文 chunk 场景应走 `replaceTextChunksAndIndex` 或对应已封装 service。
- AI 候选知识确认应走 `confirmCandidates`。
- 单 chunk 修改应走 `updateChunkService`。
- 单 chunk 删除应走 `deleteChunkService`。
- 文档删除应走 `deleteDocumentSourceService` 或已有删除 service。

如果直接写 `DocumentChunk`，RAG 维护的 `ChunkEmbedding` 可能不会同步，导致：

- 新 chunk 没有向量，向量召回查不到。
- 旧 chunk 删除后向量残留。
- chunk 内容改了但 `contentHash` 过期，向量召回会跳过该 chunk。

## 4. 当前 RAG 检索策略状态

当前 RAG 不是简单 topK 向量检索，而是混合检索：

```text
用户 query
-> query embedding
-> 按知识库 scope 读取可检索 DocumentChunk
-> 向量召回：只读取 fresh ChunkEmbedding
-> BM25 / 精确词召回
-> RRF 融合
-> 规则 rerank / MMR 去重复
-> 上下文扩展与引用组装
-> 返回 contexts / llmContext / references
```

注意：

- 检索时不会临时为 chunk 补建向量。
- 没有向量或向量过期的 chunk 不参与 vector 召回。
- 但 BM25 / 精确词仍可能作为混合召回通道参与。
- 正式 RAG 检索只看知识库 scope，不看页面搜索框和筛选组件。

## 5. 知识库详情页关键词搜索

这是管理页面里的关键词搜索，不是 RAG，不走 Voyage，不走向量。

接口：

```http
GET /api/rag-management/knowledge-bases/:id/search?keyword=xxx&limit=10
```

参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `keyword` | `string` | trim 后 1-50 字 |
| `limit` | `number` | 默认 10，最大 30 |

### 5.1 当前搜索字段

| 搜索字段 | 数据字段 | 返回 `matchedField` |
| --- | --- | --- |
| 文档标题 | `DocumentSource.title` | `documentTitle` |
| 文件名 | `DocumentSource.fileName` / `DocumentSource.originalName` | `fileName` |
| chunk 标题 | `DocumentChunk.title` | `chunkTitle` |
| chunk 正文 | `DocumentChunk.content` | `chunkContent` |

第一版不搜索：

- 分类。
- 标签。
- 审核状态。
- 知识类型。
- 向量语义相似度。

### 5.2 搜索返回结果

搜索会返回两类结果：

```ts
type KnowledgeKeywordSearchResult = {
  id: string;
  type: "document" | "chunk";
  title: string;
  snippet: string;
  score: number;
  matchedField: "documentTitle" | "fileName" | "chunkTitle" | "chunkContent";
  documentId: string;
  documentTitle: string;
  chunkId?: string;
  chunkIndex?: number;
  chunkType?: string;
  reviewStatus?: string | null;
  updatedAt: string;
};
```

排序规则：

```text
文档标题 > 文件名 > chunk 标题 > chunk 正文
```

同类命中再按命中次数和更新时间排序。

### 5.3 搜索交互

- 搜索入口在知识库详情页文档列表上方。
- 搜索结果以面板形式展示在搜索框下方。
- 搜索结果展示类型：文档 / 文本分片 / AI 知识。
- 命中标题和摘要会高亮关键词。
- 点击 document 结果：展开并滚动到对应文档。
- 点击 chunk 结果：展开对应文档，滚动并高亮对应 chunk。

## 6. 知识库详情页筛选组件

筛选是前端基于当前知识库详情页已加载的文档树完成，不新增后端接口，不改数据库 schema。

筛选粒度是 `DocumentChunk`，页面仍然按文档分组展示。

### 6.1 当前筛选字段

```ts
type KnowledgeBaseDetailFilterValue = {
  chunkType: "all" | "text" | "knowledge";
  reviewStatus: "all" | "confirmed" | "pending" | "rejected";
  suggestedCategory: "all" | string;
  suggestedTag: "all" | string;
};
```

| 筛选项 | 对应字段 | 选项来源 |
| --- | --- | --- |
| 内容类型 | `DocumentChunk.chunkType` | 全部 / 原文文本 / AI 知识 |
| 审核状态 | `DocumentChunk.reviewStatus` | 全部 / 已确认 / 待审核 / 已驳回 |
| 分类 | `DocumentChunk.suggestedCategory` | 从当前知识库 chunks 动态提取 |
| 标签 | `DocumentChunk.suggestedTags` | 从当前知识库 chunks 动态解析 |

### 6.2 筛选展示规则

- `chunkType = "knowledge"` 表示 AI 提炼知识。
- `chunkType = "text"` 表示原文文本 chunk。
- 选择非全部审核状态 / 分类 / 标签时，字段为空的 text chunk 自然不会命中。
- 某篇文档筛选后没有任何命中 chunk，则整篇文档隐藏。
- 页面显示筛选后的文档数和 chunk 数。
- 清空搜索不会清空筛选。
- 重置筛选不会清空搜索。
- 如果点击的搜索结果被当前筛选隐藏，页面会先重置筛选，再展开定位。

## 7. 今晚联调检查清单

### 7.1 环境检查

需要确认：

- Node.js 版本满足 Next.js 要求：`>=20.9.0`。
- `.env` 或 `.env.local` 中配置了 `DATABASE_URL`。
- `.env` 或 `.env.local` 中配置了 `VOYAGE_API_KEY`。
- 本地数据库已经同步 Prisma schema。

建议命令：

```bash
npm run db:generate
npm run db:push
npx tsc --noEmit
npm run build
npm run dev
```

如果启动页面报数据库表不存在，例如 `no such table: KnowledgeBase`，通常说明本地 SQLite 还没有执行 schema 同步或初始化。

### 7.2 文档入库联调

建议按下面顺序验证：

1. 新建或导入一个文档，并绑定到某个知识库。
2. 文档解析成功后确认：
   - `DocumentSource.status = "parsed"`。
   - 原文 `DocumentChunk.chunkType = "text"`。
   - 原文 chunks 的 `chunkStatus = "active"`。
   - 对应 `ChunkEmbedding` 记录已生成。
3. 修改文档内容后确认：
   - 旧 text chunks 删除。
   - 旧 `ChunkEmbedding` 删除。
   - 新 text chunks 生成。
   - 新 `ChunkEmbedding` 生成。
4. 删除文档后确认：
   - 文档下所有 chunks 删除。
   - 文档下所有 `ChunkEmbedding` 删除。

### 7.3 AI 提炼候选知识联调

建议按下面顺序验证：

1. 文档解析完成后触发 AI 提炼。
2. 提炼出的候选知识应是：
   - `DocumentChunk.chunkType = "knowledge"`。
   - `DocumentChunk.reviewStatus = "pending"`。
   - `DocumentChunk.chunkStatus = "disabled"`。
3. 确认候选知识入库后：
   - 先成功生成 `ChunkEmbedding`。
   - 再更新为 `reviewStatus = "confirmed"`。
   - 再更新为 `chunkStatus = "active"`。
4. 如果 Voyage 失败：
   - 候选知识应保持 pending / disabled。
   - 不进入正式 RAG 检索。
   - 不应留下脏向量。

### 7.4 RAG 检索联调

请求示例：

```http
POST /api/rag/retrieve
Content-Type: application/json
```

```json
{
  "query": "这里换成用户问题",
  "scope": {
    "knowledgeBaseIds": ["kb_xxx"]
  }
}
```

需要确认：

- 只返回指定知识库下的内容。
- 原文 text chunks 可以被召回。
- confirmed / active 的 AI knowledge chunks 可以被召回。
- pending / rejected / disabled 的 AI knowledge chunks 不进入正式 RAG 检索。
- 没有 fresh `ChunkEmbedding` 的 chunk 不参与向量召回。

### 7.5 搜索与筛选联调

关键词搜索：

- 搜文档标题，能返回 document 结果。
- 搜文件名，能返回 document 结果。
- 搜 chunk 正文，能返回 chunk 结果。
- 搜 AI 知识标题，能返回 chunk 结果。
- 当前知识库外的文档不返回。
- 点击结果能展开并定位。

筛选：

- 选择“原文文本”只展示 text chunks。
- 选择“AI 知识”只展示 knowledge chunks。
- 选择“已确认 / 待审核 / 已驳回”能按 `reviewStatus` 过滤。
- 分类下拉只展示当前知识库已有 `suggestedCategory`。
- 标签下拉只展示当前知识库已有 `suggestedTags`。
- 重置筛选恢复完整文档树。
- 搜索和筛选同时存在时，搜索面板不被筛选影响，下面文档树按筛选条件展示。

## 8. 今晚需要和其他同学对齐的内容

### 8.1 和入库 / 文档解析同学对齐

需要明确：

- 新增、替换、删除 chunks 不要直接 Prisma 写 `DocumentChunk`。
- 必须走当前 service，确保 `ChunkEmbedding` 同步维护。
- 文档解析成功但 Voyage 失败时，文档会进入 failed，chunks 保持 disabled，这是当前 RAG 正确性优先的设计。
- 如果他们希望“文档可先入库，向量异步补建”，需要后续单独改成异步索引队列。

### 8.2 和 AI 提炼 / 审核同学对齐

需要明确：

- AI 提炼生成的是 pending / disabled 的 `knowledge` chunks。
- 只有确认入库时才会建向量。
- 向量成功后才标记 confirmed / active。
- confirmed / active 的 AI 知识如果被修改，需要重新建向量。
- rejected / disabled 不进入正式 RAG 检索。

### 8.3 和 Agent / 问答消费同学对齐

需要明确：

- 调用 RAG 只传 `query + scope.knowledgeBaseIds`。
- 不需要传分类、标签、chunkType、topK 等复杂检索参数。
- RAG 返回的是上下文和引用，不直接保证生成最终回答。
- 如果需要答案生成，由 Agent 侧把 `llmContext` 拼入 prompt。

### 8.4 和前端页面同学对齐

需要明确：

- 知识库详情页搜索是关键词搜索，不是 RAG 搜索。
- 搜索字段只有文档标题、文件名、chunk 标题、chunk 正文。
- 筛选是 chunk 级筛选，不是文档级筛选。
- 文档只是作为 chunk 的分组展示容器。
- 搜索面板和筛选组件互不覆盖，交互上可以同时存在。

## 9. 已知边界与后续改进

当前为了训练营交付，优先保证主链路可用。后续可以逐步增强：

### 9.1 RAG 效果评测

可以先做轻量评测，不建议现在投入大量时间调参。

优先指标：

- `Hit@5`：top5 中是否命中相关 chunk。
- `Recall@5`：top5 覆盖了多少应召回证据。
- `MRR@5`：第一个相关 chunk 排得是否靠前。
- `Average Latency`：平均耗时。
- `P95 Latency`：高分位耗时。
- `Duplicate Rate`：返回上下文重复率。

训练营项目可以先准备 20-50 条 eval case，后续再扩到 100-200 条。

### 9.2 Reranker

当前先不接 reranker，继续使用规则 rerank / MMR。

后续如果要接：

- 可以使用 Voyage rerank、Cohere rerank 或 BGE reranker。
- 多数云端 rerank API 是付费能力。
- 接入成本不高，但需要评测集证明收益，否则容易只增加延迟和成本。

### 9.3 向量索引工程化

后续可以考虑：

- 把向量化从同步调用改成异步任务队列。
- 增加失败重试。
- 增加批量补索引接口。
- 增加索引状态字段，例如 indexing / indexed / failed。
- 增加索引健康检查页面。

### 9.4 搜索与筛选增强

后续可以考虑：

- 关键词搜索增加状态筛选参数。
- 搜索结果支持分页。
- 搜索字段增加分类、标签，但第一版先不加，避免匹配噪声。
- 页面组件进一步拆分，降低知识库详情页组件体积。

### 9.5 构建环境

当前 build 依赖 Next/font 拉取 Google Fonts。联调环境如果网络受限，可能会出现字体下载失败。后续可以改成本地字体或系统字体，减少构建时外网依赖。

## 10. 最重要的结论

今晚联调时优先盯住三句话：

```text
1. RAG 现在读 DocumentSource / DocumentChunk，不再读旧 KnowledgeChunk。
2. RAG 向量只维护在 ChunkEmbedding，chunk 增删改必须走 service 才能同步向量。
3. 搜索框是管理页关键词搜索，筛选是前端 chunk 级筛选，二者都不是正式 RAG 检索。
```

