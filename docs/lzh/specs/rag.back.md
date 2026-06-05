# SPEC：AI 知识库管理平台后端服务实现

## 1. 项目背景

当前项目是一个 AI 知识库管理平台，技术栈为：

- Next.js App Router
- TypeScript
- SQLite
- Prisma
- Zod
- shadcn/ui + Tailwind CSS

当前前端页面主要使用 mock 数据。现在需要实现后端 API 服务，将知识库、文档、知识切片相关数据接入 SQLite 数据库，并通过 Prisma 进行读写。

本阶段只实现 RAG 知识库管理相关的数据服务，不实现真实 embedding、LLM 调用、文件解析、图片 OCR、用户登录、权限系统、多租户系统。

当前项目已经存在：

- `src/lib/db.ts`：Prisma 7 + `@prisma/adapter-libsql` 的 Prisma Client 单例。
- `src/features/knowledge-bases/`：RAG 知识库前端页面、类型、工具函数和前端请求封装。
- `prisma/migrations/`：已有正式迁移历史，不应在本任务中随意删除。

后端实现必须兼容这些现有目录和约定。

---

## 2. 当前阶段采用的核心方案

本项目当前采用 **方案 A：一个 KnowledgeDocument 只生成一套 KnowledgeChunk**。

核心规则：

- `KnowledgeBase` 表示一个 RAG 知识库。
- `KnowledgeDocument` 表示一个独立源文档。
- `KnowledgeDocument` 可以被多个 `KnowledgeBase` 复用。
- `KnowledgeChunk` 属于 `KnowledgeDocument`。
- 同一个 `KnowledgeDocument` 只生成一套 `KnowledgeChunk`。
- 多个 `KnowledgeBase` 复用同一个 `KnowledgeDocument` 时，也共享该文档下的同一套 `KnowledgeChunk`。
- `chunkSize` 和 `chunkOverlap` 属于 `KnowledgeDocument`，不属于 `KnowledgeBase`，也不属于 `KnowledgeBaseDocument`。
- `topK` 和 `similarityThreshold` 属于 `KnowledgeBase`，因为它们描述的是该知识库的检索策略。
- `KnowledgeBaseDocument` 是知识库和文档之间的多对多关联表。

---

## 3. 核心数据关系

最终核心表为四张：

```txt
KnowledgeBase
KnowledgeDocument
KnowledgeBaseDocument
KnowledgeChunk
```

关系如下：

```txt
KnowledgeBase n - n KnowledgeDocument
KnowledgeDocument 1 - n KnowledgeChunk
```

通过中间表实现多对多：

```txt
KnowledgeBase
  └── KnowledgeBaseDocument
        └── KnowledgeDocument
              └── KnowledgeChunk
```

业务含义：

- 一个知识库可以包含多个文档。
- 一个文档可以被多个知识库复用。
- 一个文档可以产生多个知识切片。
- 可以通过知识库找到目标 documents，再通过 documents 找到 chunks。
- 也可以单独管理 documents。
- 删除知识库时，不删除文档和 chunks。
- 删除文档时，删除该文档下的 chunks，并解除它和所有知识库的绑定关系。

---

## 4. Prisma 数据库结构

请修改 `prisma/schema.prisma`，采用以下结构。

### 4.1 KnowledgeBase

```prisma
model KnowledgeBase {
  id          String  @id @default(cuid())
  name        String  @unique
  description String?

  icon  String @default("Database")
  color String @default("blue")

  similarityThreshold Float @default(0.7)
  topK                Int   @default(5)

  status String @default("active")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  documents KnowledgeBaseDocument[]

  @@index([status])
}
```

说明：

- `KnowledgeBase` 不再保存 `chunkSize` 和 `chunkOverlap`。
- `similarityThreshold` 和 `topK` 仍然属于 `KnowledgeBase`。
- `documents` 表示该知识库绑定的文档关系。
- `icon` 需要兼容当前前端十个 PascalCase 图标值：`Database`、`BookOpen`、`FileText`、`Folder`、`Archive`、`Brain`、`Bot`、`GraduationCap`、`BriefcaseBusiness`、`Lightbulb`。
- `color` 暂时保留用于兼容旧字段，后端可以返回该字段，但创建/更新接口不应主推它，前端也不应依赖它决定卡片颜色。

---

### 4.2 KnowledgeDocument

```prisma
model KnowledgeDocument {
  id    String @id @default(cuid())
  title String

  sourceType String @default("manual")

  fileName String?
  fileUrl  String?
  mimeType String?
  fileSize Int?

  rawContent String?

  chunkSize    Int @default(800)
  chunkOverlap Int @default(100)

  parseStatus String @default("pending")
  status      String @default("active")
  error       String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  knowledgeBases KnowledgeBaseDocument[]
  chunks         KnowledgeChunk[]

  @@index([sourceType])
  @@index([parseStatus])
  @@index([status])
}
```

说明：

- `KnowledgeDocument` 是独立资源。
- `KnowledgeDocument` 不再包含 `knowledgeBaseId`。
- `chunkSize` 和 `chunkOverlap` 属于 `KnowledgeDocument`。
- `chunks` 是该文档唯一的一套切片结果。
- 当前阶段主要支持 `manual`、`text`、`markdown` 类型。
- `image` 类型可以预留，但本阶段不做 OCR。

---

### 4.3 KnowledgeBaseDocument

```prisma
model KnowledgeBaseDocument {
  id              String @id @default(cuid())
  knowledgeBaseId String
  documentId      String

  status    String @default("active")
  sortOrder Int    @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  knowledgeBase KnowledgeBase     @relation(fields: [knowledgeBaseId], references: [id], onDelete: Cascade)
  document      KnowledgeDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@unique([knowledgeBaseId, documentId])
  @@index([knowledgeBaseId])
  @@index([documentId])
  @@index([status])
}
```

说明：

- 这是知识库和文档之间的关联表。
- 用于支持一个 document 被多个 knowledgeBase 复用。
- `status` 表示该文档在某个知识库中的绑定状态。
- `sortOrder` 表示该文档在知识库中的展示排序。
- `@@unique([knowledgeBaseId, documentId])` 防止同一个知识库重复绑定同一文档。

---

### 4.4 KnowledgeChunk

```prisma
model KnowledgeChunk {
  id         String @id @default(cuid())
  documentId String

  content    String
  chunkIndex Int

  embedding String?

  status String @default("active")

  startIndex Int?
  endIndex   Int?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  document KnowledgeDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@index([documentId])
  @@index([status])
  @@index([documentId, status])
}
```

说明：

- `KnowledgeChunk` 只属于 `KnowledgeDocument`。
- `KnowledgeChunk` 不包含 `knowledgeBaseId`。
- 一个 document 只有一套 chunks。
- 多个 knowledgeBase 复用同一个 document 时，也共享该 document 下的 chunks。

---

## 5. 数据库迁移要求

当前项目已经存在 `prisma/migrations/`，说明数据库迁移历史已经正式建立。本任务不应删除 `prisma/migrations/`，除非用户明确要求重置开发数据库。

如果本次实现需要继续修改 `prisma/schema.prisma`，优先执行：

```bash
npx prisma migrate dev --name refactor_document_reuse
npm run db:generate
```

如果只是根据当前 schema 重新生成 Prisma Client，执行：

```bash
npm run db:generate
```

如果 schema 已经改好但不准备新增 migration，仅需要把当前 schema 同步到本地 SQLite，可以执行：

```bash
npm run db:push
```

如果当前 SQLite 开发数据不重要，且遇到 drift、data loss、migration failed，可以在确认后重置开发数据库：

```bash
npx prisma migrate reset
npm run db:generate
```

不要默认执行以下破坏性操作；只有用户明确要求清空迁移历史时才允许：

```powershell
Remove-Item -Recurse -Force prisma/migrations
Remove-Item -Force prisma/dev.db
npx prisma migrate dev --name init
npm run db:generate
```

如果数据库文件不在 `prisma/dev.db`，请根据 `.env` 里的 `DATABASE_URL` 删除对应的 SQLite 文件。

---

## 5.1 依赖要求

本 spec 要求所有接口使用 Zod 校验入参。当前 `package.json` 尚未包含 `zod`，实现前需要安装：

```bash
npm install zod
```

安装后继续执行：

```bash
npm run build
```

确认依赖和类型解析正常。

---

## 6. 后端目录结构要求

请尽量按照以下结构实现：

```txt
src/
  app/
    api/
      knowledge-bases/
        route.ts
        [id]/
          route.ts
          tree/
            route.ts
          documents/
            route.ts

      documents/
        route.ts
        [id]/
          route.ts
          chunks/
            route.ts

      chunks/
        [id]/
          route.ts

  lib/
    db.ts
    api-response.ts

  features/
    knowledge-bases/
      api.ts
      server/
        schemas.ts
        mappers.ts
        knowledge-base-service.ts
        knowledge-document-service.ts
        knowledge-chunk-service.ts
```

说明：

- `src/app/api/**/route.ts` 是 Next.js Route Handler 请求入口。
- `src/features/knowledge-bases/server/schemas.ts` 放 Zod 校验规则。
- `src/features/knowledge-bases/server/*-service.ts` 放 RAG 知识库业务的服务端逻辑。
- `src/features/knowledge-bases/server/mappers.ts` 放 Prisma 模型到接口响应 DTO 的转换逻辑。
- `src/lib/db.ts` 是当前项目已有 Prisma Client 单例，后端 service 必须从 `@/lib/db` 导入 `prisma`。
- `src/lib/api-response.ts` 放统一响应封装。
- `src/features/knowledge-bases/api.ts` 是当前前端 fetch 封装。可以继续使用该文件，也可以在后续重命名为 `client-api.ts`，但本阶段不强制重命名。
- Route Handler 不要写大量业务逻辑，只负责解析请求、调用 Zod、调用 Service、返回响应。

---

## 7. Prisma Client 单例

当前项目已经存在 Prisma Client 单例：

```txt
src/lib/db.ts
```

该文件已经使用 Prisma 7 driver adapter：

```ts
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

实现要求：

- 不新建第二套 `src/lib/prisma.ts`。
- 除 `src/lib/db.ts` 之外，业务代码和 Route Handler 不从 `@prisma/client`、`@/generated/prisma` 或 `@/generated/prisma/client` 直接初始化新的 Prisma Client。
- 后端 service 统一从 `@/lib/db` 导入：

```ts
import { prisma } from "@/lib/db";
```

---

## 8. API 统一响应格式

所有接口统一返回以下格式。

### 8.1 成功响应

```ts
{
  success: true,
  data: unknown
}
```

### 8.2 失败响应

```ts
{
  success: false,
  message: string,
  details?: unknown
}
```

请创建或复用：

```txt
src/lib/api-response.ts
```

建议包含：

```ts
successResponse(data, init?)
errorResponse(message, status?, details?)
handleRouteError(error)
```

错误处理规则：

| 场景           | HTTP 状态码      |
| -------------- | ---------------- |
| 参数校验失败   | 400              |
| 知识库不存在   | 404              |
| 文档不存在     | 404              |
| chunk 不存在   | 404              |
| 知识库名称重复 | 409              |
| 重复绑定文档   | 可忽略或返回 200 |
| 服务端未知错误 | 500              |

---

## 9. Zod Schema 要求

### 9.1 `src/features/knowledge-bases/server/schemas.ts` 中的知识库 schema

创建知识库：

```ts
{
  name: string
  description?: string
  icon?: string
  similarityThreshold?: number
  topK?: number
  status?: "active" | "disabled"
  documentIds?: string[]
  documents?: CreateKnowledgeDocumentInput[]
}
```

规则：

- `name` 必填，不能为空，最大 50 字符。
- `description` 可选，最大 500 字符。
- `icon` 默认 `"Database"`，并限制为当前前端支持的十个图标值：`Database`、`BookOpen`、`FileText`、`Folder`、`Archive`、`Brain`、`Bot`、`GraduationCap`、`BriefcaseBusiness`、`Lightbulb`。
- `color` 是数据库兼容旧字段，不作为创建知识库接口的主推入参；如果请求体包含 `color`，可以忽略或按默认值 `"blue"` 写入，不应影响前端展示。
- `similarityThreshold` 默认 `0.7`，范围 `0 - 1`。
- `topK` 默认 `5`，范围 `1 - 20`。
- `status` 默认 `"active"`。
- `documentIds` 表示创建知识库时绑定已有文档。
- `documents` 表示创建知识库时同时创建新文档。
- `documentIds` 和 `documents` 都是可选。

更新知识库：

```ts
{
  name?: string
  description?: string
  icon?: string
  similarityThreshold?: number
  topK?: number
  status?: "active" | "disabled"
}
```

说明：

- 更新知识库基础信息时，不在该接口中直接更新 document 和 chunk。
- 更新接口不主推 `color` 字段；如果保留兼容处理，也不应让前端依赖该字段。
- document 绑定和解绑使用独立接口。

---

### 9.2 `src/features/knowledge-bases/server/schemas.ts` 中的文档 schema

创建文档：

```ts
{
  title: string
  sourceType?: "manual" | "file" | "url" | "text" | "markdown" | "image"
  fileName?: string
  fileUrl?: string
  mimeType?: string
  fileSize?: number
  rawContent?: string

  chunkSize?: number
  chunkOverlap?: number

  parseStatus?: "pending" | "processing" | "success" | "failed"
  status?: "active" | "disabled"
  error?: string

  chunks?: CreateKnowledgeChunkInput[]
  knowledgeBaseIds?: string[]
}
```

规则：

- `title` 必填，不能为空。
- `sourceType` 默认 `"manual"`。
- 当前阶段主要支持 `manual`、`text`、`markdown`。
- `image` 类型可以预留，但本阶段不做 OCR。
- `chunkSize` 默认 `800`，范围建议 `100 - 5000`。
- `chunkOverlap` 默认 `100`，必须小于 `chunkSize`。
- `parseStatus` 默认 `"pending"`。
- `status` 默认 `"active"`。
- `chunks` 可选，表示创建 document 时同时创建 chunks。
- `knowledgeBaseIds` 可选，表示创建 document 时同时绑定到已有知识库。

更新文档：

```ts
{
  title?: string
  sourceType?: "manual" | "file" | "url" | "text" | "markdown" | "image"
  fileName?: string
  fileUrl?: string
  mimeType?: string
  fileSize?: number
  rawContent?: string

  chunkSize?: number
  chunkOverlap?: number

  parseStatus?: "pending" | "processing" | "success" | "failed"
  status?: "active" | "disabled"
  error?: string
}
```

说明：

- 更新 `rawContent`、`chunkSize`、`chunkOverlap` 时，不自动重建 chunks。
- 后续可通过独立接口重新生成或替换 chunks。

---

### 9.3 `src/features/knowledge-bases/server/schemas.ts` 中的 chunk schema

创建 chunk：

```ts
{
  content: string
  chunkIndex: number
  embedding?: string
  status?: "active" | "disabled"
  startIndex?: number
  endIndex?: number
}
```

规则：

- `content` 必填，不能为空。
- `chunkIndex` 必须是大于等于 0 的整数。
- `status` 默认 `"active"`。
- 如果同时存在 `startIndex` 和 `endIndex`，则 `endIndex >= startIndex`。
- `embedding` 当前阶段可以为空或普通 JSON 字符串，不要求真实向量。

批量替换 chunks：

```ts
{
  chunks: CreateKnowledgeChunkInput[]
}
```

---

## 10. API 设计

## 10.1 获取知识库列表

```txt
GET /api/knowledge-bases
```

查询参数：

```ts
keyword?: string
status?: "active" | "disabled" | "all"
```

返回：

```ts
{
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color?: string;
  similarityThreshold: number;
  topK: number;
  status: string;
  documentCount: number;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}
[];
```

实现要求：

- 使用 Prisma `findMany`。
- 默认按 `updatedAt desc` 排序。
- 支持 keyword 模糊搜索 `name` 和 `description`。
- 支持 status 筛选。
- `documentCount` 统计该知识库绑定的文档数量。
- `chunkCount` 统计该知识库绑定的所有文档下的 chunk 总数。
- 注意：由于 chunk 属于 document，不属于 knowledgeBase，chunkCount 需要通过关联文档统计。

---

## 10.2 获取某个知识库完整 tree

```txt
GET /api/knowledge-bases/[id]/tree
```

返回结构：

```ts
{
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color?: string;
  similarityThreshold: number;
  topK: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  documents: {
    relationId: string;
    relationStatus: string;
    sortOrder: number;

    id: string;
    title: string;
    sourceType: string;
    fileName: string | null;
    fileUrl: string | null;
    mimeType: string | null;
    fileSize: number | null;
    rawContent: string | null;

    chunkSize: number;
    chunkOverlap: number;

    parseStatus: string;
    status: string;
    error: string | null;
    createdAt: string;
    updatedAt: string;

    chunks: {
      id: string;
      documentId: string;
      content: string;
      chunkIndex: number;
      embedding: string | null;
      status: string;
      startIndex: number | null;
      endIndex: number | null;
      createdAt: string;
      updatedAt: string;
    }
    [];
  }
  [];
}
```

实现要求：

- 根据 `knowledgeBaseId` 查询。
- include `KnowledgeBaseDocument`。
- include 每个关联关系下的 `document`。
- include document 下的 `chunks`。
- chunks 按 `chunkIndex asc` 排序。
- documents 可按 `sortOrder asc` 排序。
- 如果知识库不存在，返回 404。

---

## 10.3 创建知识库

```txt
POST /api/knowledge-bases
```

支持两种方式。

### 方式一：创建知识库并绑定已有文档

请求体：

```json
{
  "name": "企业制度知识库",
  "description": "用于管理员工制度、报销规则、考勤政策等内部知识。",
  "icon": "BriefcaseBusiness",
  "similarityThreshold": 0.7,
  "topK": 5,
  "documentIds": ["doc_1", "doc_2"]
}
```

### 方式二：创建知识库并同时创建新文档和 chunks

请求体：

```json
{
  "name": "企业制度知识库",
  "description": "用于管理员工制度、报销规则、考勤政策等内部知识。",
  "icon": "BriefcaseBusiness",
  "similarityThreshold": 0.7,
  "topK": 5,
  "documents": [
    {
      "title": "员工报销制度.md",
      "sourceType": "markdown",
      "mimeType": "text/markdown",
      "rawContent": "员工出差期间，住宿费按照城市等级进行报销……",
      "chunkSize": 800,
      "chunkOverlap": 100,
      "parseStatus": "success",
      "chunks": [
        {
          "content": "员工出差期间，住宿费按照城市等级进行报销。",
          "chunkIndex": 0,
          "startIndex": 0,
          "endIndex": 100
        }
      ]
    }
  ]
}
```

实现要求：

- 使用 Zod 校验。
- 检查知识库名称是否重复。
- 使用 Prisma transaction。
- 先创建 `KnowledgeBase`。
- 如果传入 `documentIds`，校验这些文档是否存在，并创建 `KnowledgeBaseDocument` 关联。
- 如果传入 `documents`，先创建 `KnowledgeDocument`，再创建其 `KnowledgeChunk`，最后创建 `KnowledgeBaseDocument` 关联。
- 创建成功后返回完整 tree 数据。
- 如果部分操作失败，整个事务回滚。

---

## 10.4 更新知识库基础信息

```txt
PATCH /api/knowledge-bases/[id]
```

请求体：

```ts
{
  name?: string
  description?: string
  icon?: string
  similarityThreshold?: number
  topK?: number
  status?: "active" | "disabled"
}
```

实现要求：

- 只更新 `KnowledgeBase` 自身字段。
- 不在该接口中修改 documents 和 chunks。
- 修改 name 时检查是否与其他知识库重名。
- 如果知识库不存在，返回 404。
- 更新成功后返回更新后的知识库基础信息。

---

## 10.5 删除知识库

```txt
DELETE /api/knowledge-bases/[id]
```

实现要求：

- 删除指定 `KnowledgeBase`。
- 级联删除该知识库下的 `KnowledgeBaseDocument` 关联关系。
- 不删除 `KnowledgeDocument`。
- 不删除 `KnowledgeChunk`。
- 如果知识库不存在，返回 404。
- 删除成功返回：

```ts
{
  id: string;
}
```

---

## 10.6 给知识库绑定已有文档

```txt
POST /api/knowledge-bases/[id]/documents
```

请求体：

```ts
{
  documentIds: string[]
}
```

实现要求：

- 校验知识库存在。
- 校验传入的 documents 存在。
- 批量创建 `KnowledgeBaseDocument` 关联。
- 如果某个 document 已经绑定过，不重复创建。
- 使用 `@@unique([knowledgeBaseId, documentId])` 防止重复绑定。
- 重复绑定可以忽略，不应导致整个请求失败。
- 返回更新后的完整 tree 数据。

---

## 10.7 解除知识库和文档绑定

```txt
DELETE /api/knowledge-bases/[id]/documents
```

请求体：

```ts
{
  documentIds: string[]
}
```

实现要求：

- 删除对应的 `KnowledgeBaseDocument` 关联关系。
- 不删除 `KnowledgeDocument`。
- 不删除 `KnowledgeChunk`。
- 如果知识库不存在，返回 404。
- 返回更新后的完整 tree 数据。

---

## 10.8 获取文档列表

```txt
GET /api/documents
```

查询参数：

```ts
keyword?: string
sourceType?: "manual" | "file" | "url" | "text" | "markdown" | "image" | "all"
status?: "active" | "disabled" | "all"
parseStatus?: "pending" | "processing" | "success" | "failed" | "all"
```

返回：

```ts
{
  id: string;
  title: string;
  sourceType: string;
  fileName: string | null;
  fileUrl: string | null;
  mimeType: string | null;
  fileSize: number | null;
  rawContent: string | null;
  chunkSize: number;
  chunkOverlap: number;
  parseStatus: string;
  status: string;
  error: string | null;
  chunkCount: number;
  knowledgeBaseCount: number;
  createdAt: string;
  updatedAt: string;
}
[];
```

实现要求：

- 支持单独管理 documents。
- 默认按 `updatedAt desc` 排序。
- 支持 keyword 搜索 `title`、`fileName`、`rawContent`。
- 支持 sourceType、status、parseStatus 筛选。
- 返回每个 document 的 chunkCount。
- 返回每个 document 被多少个 knowledgeBase 复用。

---

## 10.9 创建文档及 chunks

```txt
POST /api/documents
```

请求体：

```ts
{
  title: string
  sourceType?: "manual" | "file" | "url" | "text" | "markdown" | "image"
  fileName?: string
  fileUrl?: string
  mimeType?: string
  fileSize?: number
  rawContent?: string

  chunkSize?: number
  chunkOverlap?: number

  parseStatus?: "pending" | "processing" | "success" | "failed"
  status?: "active" | "disabled"
  error?: string

  chunks?: CreateKnowledgeChunkInput[]
  knowledgeBaseIds?: string[]
}
```

实现要求：

- 创建独立 `KnowledgeDocument`。
- 如果传入 chunks，则同时创建 `KnowledgeChunk`。
- 如果传入 knowledgeBaseIds，则同时绑定到这些知识库。
- 使用 transaction。
- 返回创建后的 document 详情。

---

## 10.10 获取文档详情

```txt
GET /api/documents/[id]
```

返回：

```ts
{
  id: string
  title: string
  sourceType: string
  fileName: string | null
  fileUrl: string | null
  mimeType: string | null
  fileSize: number | null
  rawContent: string | null
  chunkSize: number
  chunkOverlap: number
  parseStatus: string
  status: string
  error: string | null
  createdAt: string
  updatedAt: string
  chunks: KnowledgeChunk[]
  knowledgeBases: {
    relationId: string
    id: string
    name: string
    status: string
  }[]
}
```

实现要求：

- 返回文档本身。
- 返回文档下的 chunks。
- 返回该文档绑定到哪些知识库。
- 如果 document 不存在，返回 404。

---

## 10.11 更新文档

```txt
PATCH /api/documents/[id]
```

请求体：

```ts
{
  title?: string
  sourceType?: "manual" | "file" | "url" | "text" | "markdown" | "image"
  fileName?: string
  fileUrl?: string
  mimeType?: string
  fileSize?: number
  rawContent?: string

  chunkSize?: number
  chunkOverlap?: number

  parseStatus?: "pending" | "processing" | "success" | "failed"
  status?: "active" | "disabled"
  error?: string
}
```

实现要求：

- 只更新 document 本身。
- 不自动重建 chunks。
- 如果 rawContent、chunkSize、chunkOverlap 改变，暂时只更新字段。
- 后续可通过单独接口重新生成或替换 chunks。
- 如果 document 不存在，返回 404。

---

## 10.12 删除文档

```txt
DELETE /api/documents/[id]
```

实现要求：

- 删除 `KnowledgeDocument`。
- 级联删除该 document 下的 `KnowledgeChunk`。
- 级联删除该 document 和所有 knowledgeBase 的 `KnowledgeBaseDocument` 关联关系。
- 删除前检查 document 是否存在。
- 返回：

```ts
{
  id: string;
}
```

---

## 10.13 获取某个文档的 chunks

```txt
GET /api/documents/[id]/chunks
```

实现要求：

- 返回指定 document 下的所有 chunks。
- 按 `chunkIndex asc` 排序。
- 如果 document 不存在，返回 404。

返回：

```ts
{
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  embedding: string | null;
  status: string;
  startIndex: number | null;
  endIndex: number | null;
  createdAt: string;
  updatedAt: string;
}
[];
```

---

## 10.14 替换某个文档的 chunks

```txt
PUT /api/documents/[id]/chunks
```

请求体：

```ts
{
  chunks: {
    content: string
    chunkIndex: number
    embedding?: string
    status?: "active" | "disabled"
    startIndex?: number
    endIndex?: number
  }[]
}
```

实现要求：

- 检查 document 是否存在。
- 使用 transaction。
- 删除该 document 下旧的 chunks。
- 批量创建新的 chunks。
- 返回替换后的 chunks。
- 本阶段不自动根据 rawContent 切片，chunks 由请求体传入。

---

## 10.15 删除单个 chunk

```txt
DELETE /api/chunks/[id]
```

实现要求：

- 删除指定 chunk。
- 如果 chunk 不存在，返回 404。
- 删除成功返回：

```ts
{
  id: string;
}
```

---

## 11. Service 设计

请在：

```txt
src/features/knowledge-bases/server
```

中实现以下服务。

### 11.1 `src/features/knowledge-bases/server/knowledge-base-service.ts`

```ts
getKnowledgeBaseListService(params);
getKnowledgeBaseTreeService(id);
createKnowledgeBaseService(input);
updateKnowledgeBaseService(id, input);
deleteKnowledgeBaseService(id);
bindDocumentsToKnowledgeBaseService(id, documentIds);
unbindDocumentsFromKnowledgeBaseService(id, documentIds);
```

说明：

- 知识库 service 主要处理 knowledgeBase 自身和 document 绑定关系。
- 不直接管理 chunk 内容。
- 创建知识库时可以同时创建 document 和 chunk，但 chunk 本质上仍归属 document。

---

### 11.2 `src/features/knowledge-bases/server/knowledge-document-service.ts`

```ts
getDocumentListService(params);
getDocumentDetailService(id);
createDocumentService(input);
updateDocumentService(id, input);
deleteDocumentService(id);
getDocumentChunksService(id);
replaceDocumentChunksService(id, chunks);
```

说明：

- 文档 service 处理 document 自身、document 下 chunks、document 和 knowledgeBase 的绑定。
- 修改 document 不自动重建 chunks。

---

### 11.3 `src/features/knowledge-bases/server/knowledge-chunk-service.ts`

```ts
deleteChunkService(id);
```

说明：

- 当前阶段 chunk 操作较少，主要支持删除单个 chunk。
- 批量替换 chunks 放在 document service 中处理即可。

---

## 12. Route Handler 文件要求

### 12.1 `src/app/api/knowledge-bases/route.ts`

导出：

```ts
export async function GET(request: Request);
export async function POST(request: Request);
```

职责：

- GET 调用 `getKnowledgeBaseListService`
- POST 调用 `createKnowledgeBaseService`

---

### 12.2 `src/app/api/knowledge-bases/[id]/route.ts`

导出：

```ts
export async function PATCH(request: Request, context);
export async function DELETE(request: Request, context);
```

职责：

- PATCH 调用 `updateKnowledgeBaseService`
- DELETE 调用 `deleteKnowledgeBaseService`

---

### 12.3 `src/app/api/knowledge-bases/[id]/tree/route.ts`

导出：

```ts
export async function GET(request: Request, context);
```

职责：

- GET 调用 `getKnowledgeBaseTreeService`

---

### 12.4 `src/app/api/knowledge-bases/[id]/documents/route.ts`

导出：

```ts
export async function POST(request: Request, context);
export async function DELETE(request: Request, context);
```

职责：

- POST 调用 `bindDocumentsToKnowledgeBaseService`
- DELETE 调用 `unbindDocumentsFromKnowledgeBaseService`

---

### 12.5 `src/app/api/documents/route.ts`

导出：

```ts
export async function GET(request: Request);
export async function POST(request: Request);
```

职责：

- GET 调用 `getDocumentListService`
- POST 调用 `createDocumentService`

---

### 12.6 `src/app/api/documents/[id]/route.ts`

导出：

```ts
export async function GET(request: Request, context);
export async function PATCH(request: Request, context);
export async function DELETE(request: Request, context);
```

职责：

- GET 调用 `getDocumentDetailService`
- PATCH 调用 `updateDocumentService`
- DELETE 调用 `deleteDocumentService`

---

### 12.7 `src/app/api/documents/[id]/chunks/route.ts`

导出：

```ts
export async function GET(request: Request, context);
export async function PUT(request: Request, context);
```

职责：

- GET 调用 `getDocumentChunksService`
- PUT 调用 `replaceDocumentChunksService`

---

### 12.8 `src/app/api/chunks/[id]/route.ts`

导出：

```ts
export async function DELETE(request: Request, context);
```

职责：

- DELETE 调用 `deleteChunkService`

---

## 13. 前端兼容要求

当前前端仍可能使用 mock 数据。实现后端时不要破坏现有页面。

当前前端请求封装位于：

```txt
src/features/knowledge-bases/api.ts
```

本阶段优先改造并复用该文件，不新增重复的 `src/api/**` 请求封装。后续如果要重命名，可以改为 `src/features/knowledge-bases/client-api.ts`，但需要同步更新引用。

封装函数建议：

```ts
getKnowledgeBases();
getKnowledgeBaseTree(id);
createKnowledgeBase(input);
updateKnowledgeBase(id, input);
deleteKnowledgeBase(id);
bindDocumentsToKnowledgeBase(id, documentIds);
unbindDocumentsFromKnowledgeBase(id, documentIds);

getDocuments();
getDocumentDetail(id);
createDocument(input);
updateDocument(id, input);
deleteDocument(id);
getDocumentChunks(id);
replaceDocumentChunks(id, chunks);

deleteChunk(id);
```

现有封装需要调整：

- `fetchRagItems()` 继续请求 `GET /api/knowledge-bases`。
- `fetchRagDetail(id)` 应改为请求 `GET /api/knowledge-bases/${id}/tree`。
- `fetchDocumentChunks(params)` 应改为请求 `GET /api/documents/${params.documentId}/chunks`，不再请求 `/api/knowledge-bases/${knowledgeBaseId}/documents/${documentId}/chunks`。

前端兜底要求：

- 如果知识库列表接口返回的 data 不是数组，使用空数组兜底。
- 如果文档列表接口返回的 data 不是数组，使用空数组兜底。
- 如果 chunks 接口返回的 data 不是数组，使用空数组兜底。
- tree 接口失败时页面不应崩溃。
- 不要在页面组件中到处直接写 fetch，统一通过 api 封装调用。

### 13.1 知识库表单兼容调整

后端模型明确 `chunkSize` 和 `chunkOverlap` 属于 `KnowledgeDocument`，不属于 `KnowledgeBase`。因此接入真实后端时，前端 RAG 知识库新建/编辑表单应移除 `chunkSize` 字段。

调整后：

- 知识库表单只维护 `name`、`description`、`icon`、`topK`、`similarityThreshold`、`status`。
- 文档创建、上传或后续文档编辑流程再维护 `chunkSize` 和 `chunkOverlap`。
- 如果短期内前端仍保留 `chunkSize` 字段，后端不应把它写入 `KnowledgeBase`，只能忽略该字段或在前端适配层移除。

---

## 14. 本阶段不做的事情

本阶段不要实现：

- 真实 embedding
- 真实 LLM 问答
- RAG search
- 图片 OCR
- 文件上传
- 文件解析
- 自动 markdown 解析
- 自动 chunk 切分
- 用户登录
- 权限系统
- 多租户
- 文档版本管理
- chunk 版本管理
- 同一 document 在不同 knowledgeBase 下生成不同 chunk 集合

当前阶段 chunks 可以直接由请求体传入。

---

## 15. 验收标准

完成后应满足：

1. `KnowledgeDocument` 可以独立存在，不依赖某个 `KnowledgeBase`。
2. 一个 `KnowledgeBase` 可以绑定多个 `KnowledgeDocument`。
3. 一个 `KnowledgeDocument` 可以绑定到多个 `KnowledgeBase`。
4. 一个 `KnowledgeDocument` 只生成一套 `KnowledgeChunk`。
5. 多个 `KnowledgeBase` 复用同一 `KnowledgeDocument` 时，共享该 document 下的 chunks。
6. `chunkSize` 和 `chunkOverlap` 存在于 `KnowledgeDocument` 表。
7. `KnowledgeBase` 表中不再存在 `chunkSize` 和 `chunkOverlap`。
8. `KnowledgeChunk` 表中不再存在 `knowledgeBaseId`。
9. `GET /api/knowledge-bases` 可以返回知识库列表，并包含 documentCount、chunkCount。
10. `GET /api/knowledge-bases/[id]/tree` 可以查到该知识库关联的 documents 和 chunks。
11. `POST /api/knowledge-bases` 可以创建知识库，并可选绑定已有文档或创建新文档。
12. `PATCH /api/knowledge-bases/[id]` 只更新知识库基础信息。
13. `DELETE /api/knowledge-bases/[id]` 删除知识库时，不删除 documents 和 chunks。
14. `POST /api/knowledge-bases/[id]/documents` 可以给知识库绑定已有文档。
15. `DELETE /api/knowledge-bases/[id]/documents` 可以解除知识库和文档绑定。
16. `GET /api/documents` 可以单独查看全部 documents。
17. `POST /api/documents` 可以创建独立文档，并可选创建 chunks、绑定知识库。
18. `GET /api/documents/[id]` 可以查看文档详情、chunks 和关联知识库。
19. `PATCH /api/documents/[id]` 可以更新文档基础信息。
20. `DELETE /api/documents/[id]` 删除文档时，会删除其 chunks，并解除和知识库的关联。
21. `GET /api/documents/[id]/chunks` 可以获取某文档的 chunks。
22. `PUT /api/documents/[id]/chunks` 可以整体替换某文档的 chunks。
23. `DELETE /api/chunks/[id]` 可以删除单个 chunk。
24. 所有多表写入操作使用 Prisma transaction。
25. 所有接口使用 Zod 校验入参。
26. 所有接口返回统一响应格式。
27. TypeScript 不应出现明显类型错误。
28. 不要引入 Express、Koa 等额外后端框架。
29. 不要重构与本任务无关的前端页面。
30. 前端知识库表单不再把 `chunkSize` 写入 `KnowledgeBase`，文档相关流程负责维护 `chunkSize` 和 `chunkOverlap`。
31. 执行以下命令应能通过：

```bash
npm install zod
npm run db:generate
npm run db:push
npm run build
```

---

## 16. 实现优先级

请按以下顺序实现：

1. 修改 `prisma/schema.prisma`
2. 安装 `zod`
3. 基于当前已有 migrations 状态执行 Prisma migration 或 `db:push`，并执行 generate
4. 复用并检查 `src/lib/db.ts`
5. 创建或修正 `src/lib/api-response.ts`
6. 在 `src/features/knowledge-bases/server/schemas.ts` 创建 Zod schemas
7. 实现 `src/features/knowledge-bases/server/knowledge-base-service.ts`
8. 实现 `src/features/knowledge-bases/server/knowledge-document-service.ts`
9. 实现 `src/features/knowledge-bases/server/knowledge-chunk-service.ts`
10. 实现 knowledge-bases route handlers
11. 实现 documents route handlers
12. 实现 chunks route handlers
13. 修正 `src/features/knowledge-bases/api.ts` 的前端请求路径
14. 从前端知识库表单移除 `chunkSize`，并保留文档级 `chunkSize` / `chunkOverlap`
15. 检查 TypeScript 类型错误
16. 启动项目并手动测试主要接口
