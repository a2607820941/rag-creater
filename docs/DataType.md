# 数据库数据结构

本文档根据 `prisma/schema.prisma` 维护，用 TypeScript 类型形式说明当前数据库表结构。  
说明：SQLite 层面的 `String` 状态字段没有枚举约束，下面的联合类型表示当前业务代码约定值。

## KnowledgeBase 知识库表

存储知识库的基础信息、检索参数和启用状态。

```ts
type KnowledgeBase = {
  id: string; // 主键，cuid 自动生成
  name: string; // 知识库名称，唯一
  description?: string | null; // 知识库描述
  icon: string; // 知识库图标，默认 Database
  similarityThreshold: number; // 相似度阈值，默认 0.7
  topK: number; // 检索时返回的最大条数，默认 5
  status: "active" | "disabled" | string; // 知识库状态，默认 active
  createdAt: Date; // 创建时间
  updatedAt: Date; // 更新时间，自动更新
  documents: KnowledgeBaseDocument[]; // 关联的知识库-文档关系
};
```

索引：

```prisma
@@index([status])
```

## KnowledgeDocument 知识文档表

存储知识来源文档、文件元信息、解析配置、解析状态和原始文本。

```ts
type KnowledgeDocument = {
  id: string; // 主键，cuid 自动生成
  title: string; // 文档标题
  sourceType:
    | "manual"
    | "file"
    | "url"
    | "text"
    | "markdown"
    | "image"
    | string; // 来源类型，默认 manual
  fileName?: string | null; // 文件名
  fileUrl?: string | null; // 文件访问地址或导入来源地址
  mimeType?: string | null; // 文件 MIME 类型
  fileSize?: number | null; // 文件大小，单位为字节
  rawContent?: string | null; // 解析后的原始文本内容
  maxchunkSize?: number; // 文本切片大小，默认 800
  chunkOverlap: number; // 切片重叠长度，默认 100
  parseStatus? "pending" | "processing" | "success" | "failed" | string; // 解析状态，默认 pending
  status: "active" | "disabled" | string; // 文档状态，默认 active
  error?: string | null; // 解析或处理失败时的错误信息
  createdAt: Date; // 创建时间
  updatedAt: Date; // 更新时间，自动更新
  knowledgeBases: KnowledgeBaseDocument[]; // 关联的知识库关系
  chunks: KnowledgeChunk[]; // 文档下的知识分片
};
```

索引：

```prisma
@@index([sourceType])
@@index([parseStatus])
@@index([status])
```

## KnowledgeBaseDocument 知识库文档关联表

存储知识库和文档之间的多对多关系。一个知识库可以绑定多个文档，一个文档也可以被多个知识库复用。

```ts
type KnowledgeBaseDocument = {
  id: string; // 主键，cuid 自动生成
  knowledgeBaseId: string; // 知识库 ID
  documentId: string; // 文档 ID
  status: "active" | "disabled" | string; // 关联状态，默认 active
  sortOrder: number; // 文档在知识库中的排序，默认 0
  createdAt: Date; // 创建时间
  updatedAt: Date; // 更新时间，自动更新
  knowledgeBase: KnowledgeBase; // 关联的知识库，知识库删除时级联删除关系
  document: KnowledgeDocument; // 关联的文档，文档删除时级联删除关系
};
```

约束和索引：

```prisma
@@unique([knowledgeBaseId, documentId])
@@index([knowledgeBaseId])
@@index([documentId])
@@index([status])
```

## KnowledgeChunk 知识分片表

存储文档切分后的知识片段，以及可选的向量内容和原文位置。

```ts
type KnowledgeChunk = {
  id: string; // 主键，cuid 自动生成
  documentId: string; // 所属文档 ID
  content: string; // 分片正文
  chunkIndex: number; // 分片在文档中的顺序
  embedding: string | null; // 向量数据或向量序列化结果
  status: "active" | "disabled" | string; // 分片状态，默认 active
  startIndex?: number | null; // 分片在原文中的开始位置
  endIndex?: number | null; // 分片在原文中的结束位置
  createdAt: Date; // 创建时间
  updatedAt: Date; // 更新时间，自动更新
};
```

索引：

```prisma
@@index([documentId])
@@index([status])
@@index([documentId, status])
```

## ExpertAgent 专家 Agent 表

成员 E 负责的专家 Agent 配置表，用于保存一个可被问答模块消费的 Agent。  
该表只保存 Agent 的角色配置、知识范围、回答策略和 system prompt，不负责保存真实对话消息或检索结果。

```ts
type ExpertAgent = {
  id: string; // 主键，cuid 自动生成
  name: string; // Agent 名称
  description?: string | null; // Agent 描述
  answerStyle: "strict" | "concise" | "teaching" | "support" | string; // 回答风格，默认 strict
  knowledgeScope: string; // JSON 字符串，保存 Agent 允许检索的知识范围
  showReferences: boolean; // 是否展示引用来源，默认 true
  allowKnowledgeCapture: boolean; // 是否允许从对话中沉淀新知识，默认 false
  status: "draft" | "active" | "disabled" | string; // Agent 状态，默认 draft
  systemPrompt?: string | null; // 根据 Agent 配置生成的 system prompt
  createdAt: Date; // 创建时间
  updatedAt: Date; // 更新时间，自动更新
  conversations?: AgentConversation[]; // 关联的对话记录，由成员 F 的问答模块使用
};
```

索引：

```prisma
@@index([status])
@@index([answerStyle])
@@index([createdAt])
```
