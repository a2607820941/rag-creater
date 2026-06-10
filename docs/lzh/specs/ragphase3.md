# RAG Phase 3：知识库标签与卡片配置优化 Spec

## 1. 背景与目标

当前 RAG 知识库列表卡片和编辑弹窗曾突出展示 `similarityThreshold`，但现有底层 RAG 检索并未真正读取知识库级阈值。继续展示该字段会让用户误以为它会影响真实召回。

本阶段目标：

- RAG 卡片不再展示相似度阈值。
- 编辑弹窗不再编辑相似度阈值。
- 新增知识库级标签能力，用于 RAG 卡片识别和分类。
- 标签只属于 RAG 知识库维度，不复用 chunk 的 `suggestedTags` 语义。
- 标签备选栏只展示“至少被一个 RAG 使用”的标签。
- 当某个标签没有任何 RAG 使用时，自动删除，避免备选栏无限膨胀。
- RAG 展示页搜索框同时支持按知识库名称、描述和标签名称搜索。

## 2. RAG 卡片展示

卡片保留：

- 知识库名称。
- 描述。
- 状态。
- 文档数量。
- Chunks 数量。
- TopK。
- 更新时间。
- 知识库标签。

卡片移除：

- 相似度阈值。

卡片密度规则：

- 状态徽章需要比默认 badge 更醒目，使用更高字重和略大的字号。
- 卡片头部、内容区和底部留白应适度收紧，减少管理页卡片的空白感。
- 图标、标题、描述、状态和操作按钮仍保持清晰分区，不为了压缩破坏可读性。

标签展示规则：

- 卡片最多展示 5 个标签。
- 标签区域最多两行，不折叠，不显示 `+N`。
- 标签区域固定高度，避免卡片因为标签数量不同发生明显形变。
- 无标签时展示“暂无标签”。
- 单个标签名称产品规则为最多 4 个中文字符；技术实现兼容英文、数字和混合名称，后端统一限制为最多 8 个字符。

标签视觉规则：

- 标签采用圆角矩形，不使用胶囊形态。
- 标签背景使用标签自身 `color` 实色，默认备选颜色应整体偏浅。
- 如果存量标签颜色较深，前端展示时也应自动浅化，避免老标签和新标签视觉不一致。
- 标签文字固定为黑色。
- 标签边框使用同一标签色。
- 标签高度约 24px，最大宽度约 80px，超长文本省略。

## 3. 编辑弹窗

编辑弹窗保留：

- 名称。
- 描述。
- 图标。
- TopK。
- 启用状态。
- 标签编辑区。

编辑弹窗移除：

- 相似度阈值输入框。

启用状态区域使用紧凑布局，避免占用标签编辑区空间。

## 4. 标签编辑区

标签编辑区结构：

```text
标签                                      [+]

[已选标签 A x] [已选标签 B x]

----------------------------------------

可选标签
[产品] [技术] [内部] [客服]
```

交互规则：

- 点击蓝色小方形 `+` 按钮打开新增标签弹窗。
- 已绑定标签展示在上方。
- 鼠标悬停已绑定标签时显示删除 `x`。
- 点击 `x` 只从当前知识库解绑该标签。
- 可选标签展示系统中至少被一个 RAG 使用、但当前知识库未绑定的标签。
- 点击可选标签后绑定到当前知识库。
- 同一知识库不能重复绑定同一标签。
- 单个知识库最多绑定 10 个标签。
- 卡片只展示前 5 个，编辑弹窗展示完整已绑定标签。

## 5. 新增标签弹窗

字段：

- 标签名称：必填，trim，最多 8 个字符。
- 标签颜色：从固定色板中选择。

推荐色板：

```text
#93C5FD
#86EFAC
#C4B5FD
#FDBA74
#FCA5A5
#67E8F9
#CBD5E1
#F9A8D4
```

确认后：

- 调用 `POST /api/tags` 创建 `KnowledgeTag`。
- 将新标签加入当前编辑表单的已选标签。
- 关闭新增弹窗。

注意：

- 如果用户创建标签后关闭知识库编辑弹窗且不保存，该标签暂时没有 RAG 关联。
- 下一次 RAG 标签备选列表加载时，会按 RAG 使用关系清理孤儿标签，因此该标签不会长期留在备选栏。

## 6. 数据模型

复用已有全局标签表：

```text
KnowledgeTag
- id
- name
- color
- sortOrder
- createdAt
- updatedAt
```

新增知识库标签关联表：

```text
KnowledgeBaseTag
- id
- knowledgeBaseId
- tagId
- createdAt
```

约束：

- `unique(knowledgeBaseId, tagId)`。
- `index(knowledgeBaseId)`。
- `index(tagId)`。
- 删除知识库时级联删除绑定关系。
- 删除标签时级联删除绑定关系。

## 7. 接口需求

### 7.1 标签列表

复用：

```text
GET /api/tags
```

新增查询参数：

```text
scope=all | rag
```

规则：

- `scope=all` 或不传：返回全量标签，兼容通用标签管理。
- `scope=rag`：只返回至少存在一条 `KnowledgeBaseTag` 关联的标签。
- `scope=rag` 查询前可清理没有任何 RAG 关联的孤儿标签。

RAG 管理页使用：

```text
GET /api/tags?scope=rag
```

### 7.2 标签创建

复用：

```text
POST /api/tags
```

规则：

- `name` 最多 8 个字符。
- `name` 全局唯一。
- `color` 为合法 hex 色值。

### 7.3 知识库创建与编辑

扩展：

```text
POST  /api/rag-management/knowledge-bases
PATCH /api/rag-management/knowledge-bases/[id]
```

请求体新增：

```ts
{
  tagIds?: string[];
}
```

规则：

- `tagIds` 可选。
- 未传 `tagIds` 时不修改标签绑定。
- 传入 `[]` 表示清空当前知识库标签。
- 后端校验 tag 是否存在。
- 后端对 tagIds 去重。
- 编辑时采用全量替换绑定关系。
- 保存后清理本次被移除且已没有任何 RAG 使用的标签。

### 7.4 删除知识库

删除知识库后：

- 原有 `KnowledgeBaseTag` 关联被删除。
- 后端检查原来关联过的标签。
- 如果某个标签已没有任何 RAG 使用，则删除该 `KnowledgeTag`。

## 8. 前端状态

RAG 管理页维护：

```ts
const [allTags, setAllTags] = useState<KnowledgeTagDto[]>([]);
const [tagsLoading, setTagsLoading] = useState(false);
const [tagDialogOpen, setTagDialogOpen] = useState(false);
const [tagSubmitting, setTagSubmitting] = useState(false);
const [tagError, setTagError] = useState<string | null>(null);
```

表单新增：

```ts
tagIds: string[];
```

派生数据：

```ts
selectedTags = allTags.filter(tag => selectedTagIds.includes(tag.id));
availableTags = allTags.filter(tag => !selectedTagIds.includes(tag.id));
```

标签列表加载：

```ts
fetchTags({ scope: "rag" });
```

## 9. 搜索规则

RAG 展示页沿用现有单个搜索框，不新增独立标签筛选器。

关键词匹配范围：

- 知识库名称。
- 知识库描述。
- 知识库已绑定标签名称。

前端本地过滤和后端列表查询都需要支持标签名匹配，保证当前全量加载模式和后续服务端搜索模式行为一致。

## 10. 非目标

本阶段不做：

- 不让标签参与 RAG 检索过滤。
- 不支持按标签筛选知识库列表。
- 不从 chunk `suggestedTags` 自动生成知识库标签。
- 不删除 `KnowledgeBase.similarityThreshold` 数据库字段。
- 不修改 Debug 页和 Agent 对话的底层检索策略。

## 11. 验收标准

功能验收：

1. RAG 卡片不再展示相似度阈值。
2. 编辑弹窗不再出现相似度阈值输入框。
3. RAG 卡片最多两行展示 5 个标签，不折叠。
4. 标签为实色背景、黑色文字。
5. 无标签时展示“暂无标签”。
6. 编辑弹窗可以创建、绑定、解绑标签。
7. 新建标签成功后自动加入当前表单已选标签。
8. 可选标签只展示至少被一个 RAG 使用的标签。
9. 某个标签从所有 RAG 中解绑后，会被自动删除，不再出现在备选栏。
10. 删除 RAG 后，原来只被该 RAG 使用的标签会被自动删除。
11. 在搜索框输入标签名称时，绑定该标签的 RAG 卡片会出现在搜索结果中。

数据验收：

1. 新增 `KnowledgeBaseTag` 表。
2. 同一知识库不能重复绑定同一标签。
3. 知识库列表接口返回 `tags`。
4. 知识库详情接口返回 `tags`。
5. 创建/编辑知识库接口支持 `tagIds`。
6. 未传 `tagIds` 的旧调用不受影响。

兼容验收：

1. 现有无标签知识库正常展示。
2. `/api/tags` 不传 `scope` 时仍返回全量标签。
3. RAG 检索、Debug、Agent 对话行为不受标签影响。
4. `similarityThreshold` 字段仍保留在数据库和后端类型中。

## 12. 需求闭环检查

该 spec 覆盖：

- 数据结构：`KnowledgeTag` + `KnowledgeBaseTag`。
- 数据写入：创建标签、保存 `tagIds`。
- 数据读取：RAG 标签备选栏、知识库列表/详情 `tags`。
- 搜索读取：名称、描述和标签名称均可命中 RAG。
- 数据清理：无 RAG 使用的标签自动删除。
- 前端展示：卡片两行最多 5 个实色标签。
- 前端编辑：绑定、解绑、新建标签。
- 兼容策略：不改变 RAG 检索，不删除 `similarityThreshold`。
