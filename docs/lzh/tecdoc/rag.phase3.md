# RAG Phase 3：知识库标签与卡片配置优化技术文档

## 1. 技术目标

本阶段在 RAG 知识库管理模块中新增知识库级标签能力，并调整卡片/编辑弹窗：

- 卡片隐藏 `similarityThreshold`。
- 编辑弹窗隐藏 `similarityThreshold`。
- 卡片展示最多 5 个知识库标签。
- 标签使用偏浅实色背景、黑色文字和圆角矩形形态。
- 编辑弹窗支持绑定、解绑、新建标签。
- 标签备选栏只展示至少被一个 RAG 使用的标签。
- 当标签没有任何 RAG 使用时，后端自动删除。
- RAG 展示页搜索框支持按知识库名称、描述和标签名称搜索。
- 保留 `KnowledgeBase.similarityThreshold` 字段，兼容旧接口和 Debug 内部只读引用。

## 2. 数据库设计

新增关系表：

```prisma
model KnowledgeBaseTag {
  id              String @id @default(cuid())
  knowledgeBaseId String
  tagId           String

  createdAt DateTime @default(now())

  knowledgeBase KnowledgeBase @relation(fields: [knowledgeBaseId], references: [id], onDelete: Cascade)
  tag           KnowledgeTag  @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@unique([knowledgeBaseId, tagId])
  @@index([knowledgeBaseId])
  @@index([tagId])
}
```

扩展关系：

```prisma
model KnowledgeBase {
  tags KnowledgeBaseTag[]
}

model KnowledgeTag {
  knowledgeBases KnowledgeBaseTag[]
}
```

修改 schema 后运行：

```bash
npm run db:generate
npm run db:push
```

## 3. 标签校验

文件：

```text
src/features/knowledge/tag.validation.ts
```

调整：

- `tagCreateSchema.name` 最大 8 个字符。
- `tagListQuerySchema` 新增 `scope`：

```ts
scope: z.enum(["all", "rag"]).optional().default("all")
```

说明：

- 8 字符是技术上限，用于兼容英文、数字和混合标签。
- 产品文案仍可提示“最多 4 个中文字符”。

## 4. 标签列表接口

文件：

```text
src/app/api/tags/route.ts
src/server/services/knowledge/tag.service.ts
src/features/knowledge/api/tags.ts
```

前端参数：

```ts
export type TagListParams = {
  keyword?: string;
  scope?: "all" | "rag";
};
```

服务层行为：

```ts
if (query.scope === "rag") {
  await prisma.knowledgeTag.deleteMany({
    where: {
      knowledgeBases: { none: {} },
    },
  });

  where.knowledgeBases = { some: {} };
}
```

效果：

- `/api/tags`：保持全量标签列表，兼容旧功能。
- `/api/tags?scope=rag`：清理并返回 RAG 使用中的标签。

RAG 管理页使用：

```ts
fetchTags({ scope: "rag" });
```

## 5. 知识库服务层

文件：

```text
src/features/knowledge-bases/server/knowledge-base-service.ts
```

### 5.1 校验 tagIds

新增 helper：

```ts
async function assertTagIdsExist(
  tx: Prisma.TransactionClient,
  tagIds: string[] | undefined
) {
  const uniqueTagIds = [...new Set(tagIds ?? [])];
  if (uniqueTagIds.length === 0) return uniqueTagIds;

  const tags = await tx.knowledgeTag.findMany({
    where: { id: { in: uniqueTagIds } },
    select: { id: true },
  });

  if (tags.length !== uniqueTagIds.length) {
    throw badRequest("some tags do not exist", {
      tagIds: uniqueTagIds.filter((id) => !tags.some((tag) => tag.id === id)),
    });
  }

  return uniqueTagIds;
}
```

### 5.2 清理孤儿 RAG 标签

新增 helper：

```ts
async function deleteUnusedKnowledgeBaseTags(
  tx: Prisma.TransactionClient,
  tagIds: string[]
) {
  const uniqueTagIds = [...new Set(tagIds)];
  if (uniqueTagIds.length === 0) return;

  await tx.knowledgeTag.deleteMany({
    where: {
      id: { in: uniqueTagIds },
      knowledgeBases: { none: {} },
    },
  });
}
```

该逻辑只以 RAG 关联作为保留条件：只要标签仍被任意一个 RAG 使用，就保留；没有任何 RAG 使用就删除。

### 5.3 创建知识库

创建时：

- 校验 `input.tagIds`。
- nested create 写入 `KnowledgeBaseTag`。
- 返回值 include tags。

### 5.4 编辑知识库

编辑时：

1. 如果未传 `tagIds`，不修改标签关系。
2. 如果传了 `tagIds`，先记录旧 tagIds。
3. 删除当前知识库旧关系。
4. createMany 写入新关系。
5. 调用 `deleteUnusedKnowledgeBaseTags(tx, previousTagIds)` 清理被移除后无人使用的标签。
6. 返回 include tags 的知识库详情。

注意：

- RAG 编辑弹窗不再提交 `similarityThreshold`。
- 后端 schema 仍保留 `similarityThreshold` optional，兼容旧调用。

### 5.5 删除知识库

删除时：

1. 查询该知识库原有关联 tagIds。
2. 删除知识库。
3. 级联删除 `KnowledgeBaseTag`。
4. 调用 `deleteUnusedKnowledgeBaseTags(tx, tagIds)` 清理只被该 RAG 使用的标签。

## 6. 知识库 schema 与 mapper

文件：

```text
src/features/knowledge-bases/server/schemas.ts
src/features/knowledge-bases/server/mappers.ts
```

schema：

```ts
const tagIdsSchema = z.array(z.string().min(1)).max(10).optional();
```

创建/编辑接口都支持：

```ts
tagIds: tagIdsSchema
```

mapper 返回：

```ts
tags: Array<{
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}>
```

列表和详情查询都 include：

```ts
tags: {
  include: { tag: true },
  orderBy: { createdAt: "asc" },
}
```

## 7. 前端类型与工具

文件：

```text
src/features/knowledge-bases/types.ts
src/features/knowledge-bases/utils.ts
```

新增：

```ts
export type RagTag = {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};
```

扩展：

```ts
type RagListItem = {
  tags: RagTag[];
};

type KnowledgeBaseFormValues = {
  tagIds: string[];
};
```

normalize：

- `item.tags` 非数组时兜底为 `[]`。
- 过滤缺少 `id` 或 `name` 的异常标签。
- `DEFAULT_KNOWLEDGE_BASE_FORM_VALUES.tagIds = []`。
- `validateKnowledgeBaseForm` 不再校验 `similarityThreshold`，新增 `tagIds.length <= 10` 校验。

## 8. RAG 管理页实现

文件：

```text
src/features/knowledge-bases/index.tsx
```

新增状态：

```ts
const [allTags, setAllTags] = useState<KnowledgeTagDto[]>([]);
const [tagsLoading, setTagsLoading] = useState(false);
const [tagDialogOpen, setTagDialogOpen] = useState(false);
const [tagSubmitting, setTagSubmitting] = useState(false);
const [tagError, setTagError] = useState<string | null>(null);
```

初始化加载：

```ts
const data = await fetchTags({ scope: "rag" });
setAllTags(data);
```

保存 payload：

```ts
const payload = {
  name: formValues.name.trim(),
  description: formValues.description.trim() || undefined,
  icon: formValues.icon,
  topK: formValues.topK,
  status: formValues.status,
  tagIds: formValues.tagIds,
};
```

不提交：

```ts
similarityThreshold
```

## 9. 搜索实现

当前 RAG 管理页仍使用单个搜索框。

前端本地过滤文件：

```text
src/features/knowledge-bases/utils.ts
```

过滤条件：

```ts
item.name.toLowerCase().includes(keyword) ||
item.description.toLowerCase().includes(keyword) ||
item.tags.some((tag) => tag.name.toLowerCase().includes(keyword))
```

后端列表查询文件：

```text
src/features/knowledge-bases/server/knowledge-base-service.ts
```

`getKnowledgeBaseListService` 的 `keyword` OR 条件同时匹配：

```ts
{ name: { contains: params.keyword } }
{ description: { contains: params.keyword } }
{
  tags: {
    some: {
      tag: {
        name: { contains: params.keyword },
      },
    },
  },
}
```

这样可以保证当前前端本地搜索和后续服务端搜索行为一致。

## 10. 组件

### 9.1 Tag Badge

文件：

```text
src/features/knowledge-bases/components/knowledge-base-tag-badge.tsx
```

规则：

- 背景色：`tag.color` 偏浅实色。
- 边框色：`tag.color`。
- 文本色：固定 `text-black`。
- 形态：`rounded-md` 圆角矩形。
- 展示时对任意合法 hex 色做混白浅化处理，保证存量深色标签和新建浅色色板显示风格一致；不修改数据库中的原始 `tag.color`。
- 高度：`h-6`。
- 最大宽度：`max-w-20`。
- 支持 `removable` 和 `onRemove`。

### 9.2 Tag Editor

文件：

```text
src/features/knowledge-bases/components/knowledge-base-tag-editor.tsx
```

Props：

```ts
type KnowledgeBaseTagEditorProps = {
  allTags: KnowledgeTagDto[];
  selectedTagIds: string[];
  disabled?: boolean;
  onChange: (tagIds: string[]) => void;
  onCreateClick: () => void;
};
```

行为：

- 已选标签从 `selectedTagIds` 派生。
- 可选标签为 `allTags - selectedTags`。
- 点击可选标签追加绑定。
- 点击已选标签删除入口解绑。
- 超过 10 个时阻止继续添加。

### 9.3 Create Tag Dialog

文件：

```text
src/features/knowledge-bases/components/create-knowledge-base-tag-dialog.tsx
```

行为：

- 输入标签名。
- 固定色板选择颜色。
- 提交 `POST /api/tags`。
- 成功后加入 `allTags` 并自动加入 `formValues.tagIds`。

## 11. UI 约束

卡片整体：

- 状态 badge 使用 `h-7`、`text-[13px]`、`font-semibold`，增强“启用/禁用”的可见性。
- 卡片 header 使用 `px-4 pt-4 pb-2`，content 使用 `px-4 pb-3 pt-0`，footer 使用 `px-4 pb-4 pt-0`。
- 图标尺寸使用 `size-9`，减少标题区留白。
- 描述使用较小字号和紧凑行高，保持两行截断。

卡片标签区：

```text
display: flex
flex-wrap: wrap
gap: 6px
height: 52px
overflow: hidden
align-content: flex-start
```

卡片只渲染：

```ts
item.tags.slice(0, 5)
```

编辑弹窗：

- 展示完整已选标签。
- 展示当前可选标签。
- 启用状态使用紧凑行内布局。
- 不展示相似度阈值输入。

## 12. 兼容性

保留：

- `KnowledgeBase.similarityThreshold`
- 后端 schema optional 接收 `similarityThreshold`
- mapper 返回 `similarityThreshold`
- Debug 内部可只读引用该字段

不修改：

- `/api/rag/retrieve`
- `retrieveRagContexts`
- Agent 对话
- chunk 检索、rerank、Prompt 拼接

标签不参与 RAG 检索过滤。

## 13. 验证方式

命令：

```bash
npm run db:generate
npm run db:push
npx eslint src/features/knowledge/tag.validation.ts src/app/api/tags/route.ts src/features/knowledge/api/tags.ts src/server/services/knowledge/tag.service.ts src/features/knowledge-bases/server/knowledge-base-service.ts src/features/knowledge-bases/index.tsx
npx eslint src/features/knowledge-bases/utils.ts src/features/knowledge-bases/server/knowledge-base-service.ts
npm run build
```

人工验证：

1. RAG 卡片不显示相似度阈值。
2. 编辑弹窗不显示相似度阈值。
3. 创建标签后可绑定到当前 RAG。
4. 保存后卡片展示标签。
5. 标签为实色背景、黑色文字。
6. 可选标签只展示被至少一个 RAG 使用的标签。
7. 某标签从所有 RAG 解绑后不再出现在备选栏。
8. 删除 RAG 后，只有该 RAG 使用的标签被自动删除。
9. `/api/tags` 不传 scope 时仍返回全量标签。
10. Debug 和 Agent 对话仍可正常检索。
11. 搜索框输入标签名时，可命中绑定该标签的 RAG 卡片。

## 14. 技术闭环

该方案形成闭环：

- 数据结构：`KnowledgeBaseTag` 表。
- 写入路径：创建/编辑知识库保存 `tagIds`。
- 读取路径：列表/详情返回 `tags`，RAG 管理页拉取 `scope=rag` 标签。
- 搜索路径：前端过滤和后端 keyword 查询都支持标签名。
- 清理路径：编辑/删除知识库后清理无人使用标签，`scope=rag` 查询时也兜底清理。
- UI 路径：卡片展示实色标签，编辑弹窗绑定/解绑/新建标签。
- 兼容路径：不改变 RAG 检索，不删除阈值字段。
