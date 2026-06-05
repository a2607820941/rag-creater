# 技术方案：知识笔记 `/note` 页面基础编辑闭环

## 1. 实现目标

实现后台内的 `知识笔记` 页面 `/note`，支持：

- 笔记目录初始化
- 默认选中最新笔记
- 创建笔记
- 编辑标题
- Markdown 正文编辑与预览
- 保存笔记
- 切换笔记前自动保存
- 删除笔记
- 右侧目录收缩/展开
- 空状态创建笔记

本阶段不实现：

- chunks 生成
- RAG 绑定
- embedding
- 图片上传
- AI 功能
- `/note/[id]` 页面

## 2. 依赖

项目当前已经安装 `@uiw/react-md-editor`，不要重复安装。

如后续发现依赖缺失，再执行：

```bash
npm install @uiw/react-md-editor
```

## 3. 数据库调整

仅修改 `DocumentSource.fileType` 默认值：

```prisma
fileType String @default("file")
```

执行：

```bash
npm run db:generate
npm run db:push
```

不新增表，不新增 Prisma model。

## 4. 路由与目录结构

页面路由使用当前真实路由：

```txt
/note
```

页面入口：

```txt
src/app/note/page.tsx
```

业务模块目录使用当前真实目录：

```txt
src/features/note/
```

推荐文件结构：

```txt
src/features/note/api.ts
src/features/note/index.tsx
src/features/note/types.ts
src/features/note/components/note-topbar.tsx
src/features/note/components/note-editor.tsx
src/features/note/components/note-directory.tsx
src/features/note/components/note-empty-state.tsx
src/features/note/components/delete-note-dialog.tsx
src/features/note/server/schemas.ts
src/features/note/server/note-service.ts
```

说明：

- `src/app/note/page.tsx` 只负责在后台布局内渲染 `<NoteFeature />`。
- `src/features/note/components/feishu-import.tsx` 是现有飞书导入组件，不属于本阶段知识笔记编辑闭环；本阶段不删除、不接入。
- 不使用 `src/features/notes/`。
- 不使用 `src/app/notes/page.tsx`。

## 5. 后端接口

页面路由使用单数 `/note`，API 资源集合保留复数 `/api/notes`。

文件结构：

```txt
src/app/api/notes/route.ts
src/app/api/notes/[id]/route.ts

src/features/note/server/schemas.ts
src/features/note/server/note-service.ts
```

### 5.1 GET `/api/notes`

用途：获取笔记目录摘要。

固定查询：

```ts
sourceType = "markdown";
fileType = "note";
```

排序：

```ts
updatedAt desc
```

返回字段：

```ts
type NoteSummary = {
  id: string;
  title: string;
  fileSize: number;
  sourceType: "markdown";
  fileType: "note";
  status: string;
  activeStatus: string;
  createdAt: string;
  updatedAt: string;
};
```

约束：

- 不得返回 `rawContent`。
- 第一阶段可以不分页。
- 后续笔记数量较多时，再增加 `limit`、分页或目录虚拟滚动。

### 5.2 POST `/api/notes`

创建 `DocumentSource`：

```ts
{
  originalName: title,
  title,
  fileType: "note",
  fileName: `${title}.md`,
  fileUrl: null,
  mimeType: "text/markdown",
  fileSize: Buffer.byteLength(rawContent ?? "", "utf-8"),
  sourceType: "markdown",
  rawContent: rawContent ?? "",
  status: "pending",
  activeStatus: "active",
  chunkCount: 0
}
```

默认值：

```ts
title = "未命名文档";
rawContent = "";
```

返回创建后的笔记详情。

### 5.3 GET `/api/notes/[id]`

返回单篇笔记详情，包括：

```ts
type NoteDetail = NoteSummary & {
  originalName: string;
  rawContent: string | null;
};
```

只允许读取：

```ts
sourceType = "markdown";
fileType = "note";
```

否则返回 404。

### 5.4 PATCH `/api/notes/[id]`

保存标题或正文。

请求体：

```ts
{
  title?: string;
  rawContent?: string;
}
```

保存标题时同步：

```ts
title;
originalName;
fileName;
```

保存正文时同步：

```ts
rawContent;
fileSize;
```

不自动生成 chunks。

### 5.5 DELETE `/api/notes/[id]`

删除当前笔记。

只允许删除：

```ts
sourceType = "markdown";
fileType = "note";
```

返回：

```ts
{
  id: string;
}
```

## 6. Zod Schema

文件：

```txt
src/features/note/server/schemas.ts
```

包含：

```ts
createNoteSchema;
updateNoteSchema;
noteIdSchema;
```

规则：

- `title` trim 后不能为空。
- 创建时 `title` 默认 `未命名文档`。
- 创建时 `rawContent` 默认 `""`。
- 更新时至少包含 `title` 或 `rawContent`。
- `id` 必须是非空字符串。

## 7. 前端 API 封装

文件：

```txt
src/features/note/api.ts
```

方法：

```ts
listNotes();
getNoteDetail(id);
createNote(input);
updateNote(id, input);
deleteNote(id);
```

所有 API 统一解析项目现有响应格式。

列表异常时可以返回空数组兜底，但必须同时保留错误提示状态，避免用户误以为没有文档。

## 8. 前端状态策略

本阶段不新增 Zustand 笔记 slice。

原因：

- 当前笔记编辑状态只服务 `/note` 页面内部。
- 没有其他业务组件需要订阅笔记草稿。
- `draftRawContent` 是高频输入字段，放入全局 store 容易造成不必要重渲染。

状态放在 `src/features/note/index.tsx` 的本地 state 或 `useReducer` 中。

推荐本地状态：

```ts
type NotePageState = {
  notes: NoteSummary[];
  activeNoteId: string | null;
  activeNote: NoteDetail | null;

  draftTitle: string;
  draftRawContent: string;

  titleEditing: boolean;
  directoryOpen: boolean;

  loading: boolean;
  detailLoading: boolean;
  saving: boolean;
  deleting: boolean;
  error: string | null;
};
```

`setActiveNote(note)` 语义：

```ts
activeNote = note;
activeNoteId = note?.id ?? null;
draftTitle = note?.title ?? "";
draftRawContent = note?.rawContent ?? "";
```

组件拆分时通过 props 传递必要字段和回调：

- `NoteTopbar` 接收标题、更新时间、保存/新建/删除回调。
- `NoteEditor` 接收 `draftRawContent`、`saving`、`onChange`。
- `NoteDirectory` 接收目录摘要、选中 id、目录开关、切换回调。
- `NoteEmptyState` 接收新建回调。

## 9. 页面结构

页面入口：

```txt
src/app/note/page.tsx
```

推荐渲染：

```tsx
import { AdminShell } from "@/components/layout/admin-shell";
import { NoteFeature } from "@/features/note";

export default function NotePage() {
  return (
    <AdminShell>
      <NoteFeature />
    </AdminShell>
  );
}
```

推荐业务组件结构：

```txt
NoteFeature
├── NoteTopbar
├── NoteEditor
├── NoteDirectory
├── NoteEmptyState
└── DeleteNoteDialog
```

## 10. 页面初始化流程

进入 `/note`：

```txt
1. 调用 listNotes()
2. 写入 notes
3. 如果 notes 为空，显示空状态
4. 如果 notes 不为空，选中 updatedAt 最新的一篇
5. 调用 getNoteDetail(id)
6. 写入 activeNote，并初始化 draftTitle / draftRawContent
```

列表接口不返回正文，正文必须由详情接口按 id 加载。

## 11. 保存逻辑

保存当前文档：

```txt
1. 如果 saving = true，直接 return
2. 如果没有 activeNote，return
3. 对比 activeNote 与 draft 判断是否变更
4. 如果未变更，return success
5. 调用 updateNote(activeNote.id, { title, rawContent })
6. 保存成功后 setActiveNote(updatedNote)
7. 刷新 notes 目录，或用 updatedNote 局部更新目录项并重新排序
8. 保存失败则保留当前草稿并显示错误
```

未保存判断：

```ts
const normalizedTitle = draftTitle.trim() || "未命名文档";
const hasUnsavedChanges =
  normalizedTitle !== activeNote.title ||
  draftRawContent !== (activeNote.rawContent ?? "");
```

不单独维护 `dirty` 字段。

## 12. 切换文档逻辑

点击右侧目录项：

```txt
1. 如果 saving = true，忽略
2. 如果点击的是当前文档，忽略
3. 调用 saveCurrentNote()
4. 保存成功后调用 getNoteDetail(nextId)
5. setActiveNote(nextNote)
6. 右侧目录高亮 nextId
7. 保存失败则不切换
```

这是本页面最重要的交互约束。

## 13. 新建逻辑

点击新建：

```txt
1. 如果 saving = true，忽略
2. 先 saveCurrentNote()
3. 保存成功后调用 createNote({ title: "未命名文档", rawContent: "" })
4. 刷新 notes，或把 createdNote 插入目录顶部
5. setActiveNote(createdNote)
6. 编辑器显示空正文
```

空状态中的 `创建新文档` 按钮复用同一逻辑。

## 14. 删除逻辑

点击删除：

```txt
1. 打开删除确认框
2. 用户确认后调用 deleteNote(activeNoteId)
3. 删除成功后刷新 notes
4. 如果还有剩余笔记，选中 updatedAt 最新的一篇
5. 如果没有剩余笔记，setActiveNote(null)，进入空状态
```

删除确认框使用 shadcn `AlertDialog`。

## 15. 标题编辑逻辑

标题默认展示态。

点击标题：

```txt
titleEditing = true
```

保存触发：

- `onBlur`
- `Enter`

保存规则：

```txt
1. 标题 trim 后为空时使用上一次有效标题，或 `未命名文档`
2. 调用 updateNote(id, { title })
3. 成功后 setActiveNote(updatedNote)，titleEditing = false
4. 失败时 titleEditing 保持 true，并显示错误
5. Esc 无特殊行为
```

## 16. 编辑器实现

`note-editor.tsx` 必须是 Client Component。

示例：

```tsx
"use client";

import MDEditor from "@uiw/react-md-editor";

type NoteEditorProps = {
  value: string;
  saving: boolean;
  onChange: (value: string) => void;
};

export function NoteEditor({ value, saving, onChange }: NoteEditorProps) {
  return (
    <div data-color-mode="light" className="h-full">
      <MDEditor
        value={value}
        onChange={(nextValue) => onChange(nextValue ?? "")}
        preview="live"
        height="100%"
        textareaProps={{
          disabled: saving,
          placeholder: "开始编写 Markdown 知识笔记...",
        }}
      />
    </div>
  );
}
```

## 17. 右侧目录

目录组件：

```txt
NoteDirectory
```

使用 shadcn：

- `Button`
- `ScrollArea`
- `Separator`
- `Tooltip`

展开状态：

- 显示目录面板。
- 顶部标题：`文档目录`。
- 收缩按钮使用 lucide `IndentIncrease`。

收缩状态：

- 目录隐藏。
- 页面右侧贴边显示展开按钮。
- 展开按钮使用 lucide `IndentDecrease`。

目录项展示：

```txt
title
updatedAt
```

当前选中项高亮。

## 18. 空状态

当 `notes.length === 0` 时显示：

```txt
当前还没有文档哦，来创建一个吧
```

下方显示 lucide `Inbox` 图标。

再下方显示蓝色按钮：

```txt
创建新文档
```

点击后执行新建逻辑。

## 19. 使用的 shadcn 组件

建议使用：

```txt
Button
Input
ScrollArea
Separator
AlertDialog
Tooltip
Skeleton
```

不需要使用 `Sheet`，右侧目录是页面内部布局，不是弹层。

## 20. 错误处理

| 场景           | 行为                           |
| -------------- | ------------------------------ |
| 列表加载失败   | 显示错误，notes 置空           |
| 详情加载失败   | 刷新目录，提示文档不存在       |
| 保存失败       | 不切换文档，保留草稿           |
| 标题保存失败   | 保持标题编辑态                 |
| 删除失败       | 保持当前文档                   |
| API 返回非数组 | notes 兜底为空数组，并显示错误 |

## 21. 性能注意事项

- 列表接口不返回 `rawContent`，避免一次性拉取全部正文。
- `draftRawContent` 使用业务本地 state，不放入 Zustand。
- 目录组件只接收摘要字段，不订阅正文。
- 第一阶段保存后可重新请求列表；后续可局部更新目录项以减少请求。
- 第一阶段目录可不分页；如果笔记数量超过可感知阈值，再引入分页或 `@tanstack/react-virtual`。

## 22. 实现顺序

1. 确认 `@uiw/react-md-editor` 已安装。
2. 修改 Prisma `DocumentSource.fileType` 默认值。
3. 运行 `npm run db:generate`。
4. 运行 `npm run db:push`。
5. 创建 note Zod schema。
6. 创建 note service。
7. 创建 `/api/notes`。
8. 创建 `/api/notes/[id]`。
9. 创建 `src/features/note/api.ts`。
10. 创建 `src/features/note/index.tsx` 和组件。
11. 确认 Sidebar 子导航指向 `/note`。
12. 实现初始化加载。
13. 实现编辑器。
14. 实现保存。
15. 实现切换前保存。
16. 实现新建。
17. 实现删除。
18. 实现右侧目录收缩/展开。
19. 实现空状态。
20. 运行 `npm run build`。

## 23. 验收标准

- `/note` 能在后台布局内打开。
- 知识笔记出现在左侧 Sidebar 的知识库子导航下。
- 首次进入会加载笔记目录。
- 有笔记时默认选中最新笔记。
- 无笔记时显示空状态。
- 可以创建新笔记。
- 可以编辑 Markdown 正文。
- 可以保存正文到 `DocumentSource.rawContent`。
- 可以编辑标题。
- 标题保存同步更新 `title` 和 `originalName`。
- 右侧目录可以切换文档。
- 切换前会自动保存当前文档。
- 保存失败不切换。
- 可以删除当前文档。
- 删除后自动选中最新剩余文档。
- 右侧目录可以收缩和展开。
- 列表接口不返回 `rawContent`。
- 详情接口返回 `rawContent`。
- 只读取和操作 `sourceType = "markdown"` 且 `fileType = "note"` 的记录。
- 本阶段不出现 chunks、RAG 绑定、embedding 相关功能。
- TypeScript 无明显类型错误。
- 不破坏现有知识库、知识文档、专家 Agent 页面。
