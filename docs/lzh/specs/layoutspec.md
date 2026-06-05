# 管理后台整体布局 Spec

## 1. 模块目标

本规范用于定义项目管理后台的整体布局、基础导航和页面承载方式。业务模块页面，例如数据总览、知识库管理、知识笔记、知识文档、专家 Agent 和专家对话，应在该布局内渲染，避免各业务 spec 重复描述通用布局。

当前阶段重点实现：

- 上边栏 Header
- 左侧边栏 Sidebar
- 主体内容 Main Content
- 后台基础路由和默认重定向
- 知识库父子导航
- 专家对话一级导航
- 预留用户信息区域

## 2. 页面整体布局

页面采用三段式管理后台布局：

```text
上边栏 Header
左侧边栏 Sidebar
主体内容 Main Content
```

### 2.1 Header

Header 展示当前功能页面名称。

要求：

- 进入 `/knowledge-bases` 时，标题显示为 `知识库管理`。
- 进入 `/knowledge-bases/[id]` 时，标题仍归属为 `知识库管理`，详情页自身可以在主体区域展示具体知识库名称和返回按钮。
- 进入 `/notes` 时，标题显示为 `知识笔记`。
- 进入 `/agents/chat` 时，标题显示为 `专家对话`。
- 右侧预留用户信息区域，例如用户头像、用户名、设置入口等。
- 当前阶段用户信息区域可以仅保留占位，不要求实现完整用户系统或真实头像数据。

### 2.2 Sidebar

Sidebar 支持收缩和展开。

一级导航包含：

- 数据总览
- 知识库
- 知识文档
- 专家 Agent
- 专家对话

其中 `知识库` 是可展开的父级导航项。

知识库父级项要求：

- 点击 `知识库` 父级项时，默认跳转到 `/knowledge-bases`。
- 当前路由位于 `/knowledge-bases`、`/knowledge-bases/[id]` 或 `/notes` 时，`知识库` 父级项应处于当前上下文。
- `知识库` 展开后展示两个子导航项：
  - `知识库管理`，路由 `/knowledge-bases`，icon 使用 `square-library`。
  - `知识笔记`，路由 `/notes`，icon 使用 `notebook-tabs`。
- `/knowledge-bases/[id]` 属于 `知识库管理` 的详情态，不在 Sidebar 新增独立导航项。
- Sidebar 收缩时，应保留一级导航 icon 的可识别性；子导航的收缩态展示方式可跟随现有 Sidebar 交互实现，但不应破坏当前路由选中状态。

其他一级导航要求：

- 点击 `数据总览` 时，路由跳转到 `/dashboard`。
- 点击 `知识文档` 时，路由跳转到 `/documents`。
- 点击 `专家 Agent` 时，路由跳转到 `/agents`。
- 点击 `专家对话` 时，路由跳转到 `/agents/chat`，icon 使用 `message-square-more`。
- 当前路由对应的导航项应有明确选中状态。
- 当前路由为 `/agents/chat` 时，应选中 `专家对话`，不应只选中 `专家 Agent`。

### 2.3 Main Content

主体内容根据当前路由展示对应页面内容。

点击 Sidebar `知识库` 父级项或其子项 `知识库管理` 时：

- 路由跳转至 `/knowledge-bases`。
- Header 标题变更为 `知识库管理`。
- 主体区域展示知识库管理页面内容，即知识库卡片列表和相关操作。

在知识库管理页面点击某个知识库卡片时：

- 路由进入 `/knowledge-bases/[id]`。
- 页面仍保留在管理后台整体布局内。
- Sidebar 仍保持 `知识库` 父级展开，并将 `知识库管理` 视为当前上下文。
- 主体区域由知识库卡片列表替换为具体知识库详情展示页。
- 该详情页不需要在 Sidebar 新增跳转项，因为页面内部已经提供返回知识库列表的按钮。

点击 Sidebar `知识笔记` 子项时：

- 路由跳转至 `/notes`。
- Header 标题变更为 `知识笔记`。
- 主体区域展示知识笔记页面。知识笔记的具体编辑闭环由 `docs/lzh/specs/spec-notebook.md` 定义。

## 3. 路由设计

建议路由如下：

| 页面 | 路由 | 说明 |
| --- | --- | --- |
| 默认入口 | `/` | 重定向到 `/knowledge-bases` |
| 数据总览 | `/dashboard` | 数据总览页面 |
| 知识库父级入口 | `/knowledge-bases` | 点击父级 `知识库` 默认进入的子路由 |
| 知识库管理 | `/knowledge-bases` | 展示知识库卡片列表 |
| 知识库详情 | `/knowledge-bases/[id]` | 在知识库管理布局上下文内展示具体知识库详情，不新增 Sidebar 项 |
| 知识笔记 | `/notes` | 知识库父级下的子路由 |
| 知识文档 | `/documents` | 预留或已实现页面 |
| 专家 Agent | `/agents` | 专家 Agent 管理页面 |
| 专家对话 | `/agents/chat` | 专家对话页面，与专家 Agent、知识库等属于同一级导航 |

根路径 `/` 应重定向到 `/knowledge-bases`，进入系统后默认展示知识库管理页面。

## 4. 预留页面要求

当前阶段重点实现管理后台布局和知识库相关导航关系。`/documents` 等未完整开发的页面可以先作为预留页面。`/notes` 是否仅预留或实现完整业务，以知识笔记模块 spec 和计划为准。

预留页面至少应满足：

- 在管理后台布局内展示。
- Header 标题与当前页面一致。
- 主体区域展示简洁的占位内容。
- 不要求实现真实业务数据、表单或接口联调。

## 5. 当前阶段实现范围

当前阶段需要实现：

- 管理后台整体布局
- Header 标题展示
- 右侧用户信息占位区域
- 可收缩左侧 Sidebar
- Sidebar 一级导航项和选中状态
- 知识库父级导航展开和子导航展示
- `/` 到 `/knowledge-bases` 的默认重定向
- `/dashboard`、`/knowledge-bases`、`/knowledge-bases/[id]`、`/notes`、`/documents`、`/agents`、`/agents/chat` 路由入口
- 专家对话作为一级导航项展示
- 知识库详情页在知识库管理布局上下文内替换主体内容
- 业务页面在 Main Content 中渲染

## 6. 当前阶段暂不实现

当前阶段暂不要求实现：

- 真实用户系统
- 真实头像数据
- 权限控制
- 多租户隔离
- 复杂面包屑
- 除知识库父级外的复杂多级菜单

以上能力可以在后续版本中逐步接入。

## 7. 验收标准

1. 页面采用 Header、Sidebar、Main Content 的管理后台布局。
2. 访问 `/` 后，能够重定向到 `/knowledge-bases`。
3. Sidebar 包含 `数据总览`、`知识库`、`知识文档`、`专家 Agent`、`专家对话` 这些一级导航。
4. `专家对话` 与 `专家 Agent`、`知识库` 等属于同一级导航，路由为 `/agents/chat`，icon 使用 `message-square-more`。
5. 点击 Sidebar `知识库` 父级项后，默认进入 `/knowledge-bases`。
6. `知识库` 父级项可以展开，并展示 `知识库管理` 和 `知识笔记` 两个子导航。
7. `知识库管理` 子导航路由为 `/knowledge-bases`，icon 使用 `square-library`。
8. `知识笔记` 子导航路由为 `/notes`，icon 使用 `notebook-tabs`。
9. 点击知识库卡片进入 `/knowledge-bases/[id]` 后，页面仍在管理后台布局内展示。
10. `/knowledge-bases/[id]` 不在 Sidebar 新增独立导航项，主体区域替换知识库卡片列表展示详情内容，并通过页面内返回按钮回到知识库列表。
11. 进入 `/knowledge-bases` 或 `/knowledge-bases/[id]` 时，Header 标题显示 `知识库管理`。
12. 进入 `/notes` 时，Header 标题显示 `知识笔记`。
13. 进入 `/agents/chat` 时，Header 标题显示 `专家对话`。
14. Sidebar 支持收缩和展开。
15. 当前路由对应的 Sidebar 导航项有明确选中状态；`/agents/chat` 应选中 `专家对话`。
16. 右侧用户信息区域保留占位，不要求接入真实用户系统。
