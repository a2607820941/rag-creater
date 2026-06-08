# 文档导入管线 技术文档

> **负责模块**：文件上传、格式解析、语义分段、文档管理、飞书集成
> **下游依赖**：成员 D（AI 知识提炼）通过分段数据接口消费
> **最后更新**：2026-06-06

---

## 一、模块概览

### 1.0 业务背景

本项目面向企业中后台的 AI 知识库管理系统，覆盖采购、人事、财务、法务、审批、职场、安全、合规等企业场景。企业内部知识以 PDF、DOCX、XLSX、PPTX 等异构格式分散在文档和飞书中，无法直接用于 AI 知识提炼和检索。

本模块解决的核心问题是：**将这些异构非结构化资料统一解析为纯文本 + 结构化分段，为下游 AI 知识提炼（成员 D）提供干净、完整、语义清晰的输入**。这一环节是知识生产链路的第一道工序，后续所有 AI 提炼、检索、问答都依赖本模块的输出质量。

### 1.1 在系统中的位置

**一句话职责**：将外部非结构化资料（文件、飞书链接）解析为统一纯文本 + 结构化分段，为下游 AI 知识提炼提供较高质量输入。

```text
浏览器上传/飞书链接 → 成员C(文档导入管线)
    → 文件存储 → 文本解析(12种格式 + 图片描述) → 语义分段(TextTiling 山谷检测)
    → 成员D(AI知识提炼) → 知识入库与检索
```

### 1.2 解决的问题

| 问题 | 方案 |
|------|------|
| 文件格式多样（DOCX/PDF/XLSX/PPTX/图片等 12 种） | 统一解析引擎，输出纯文本 + 图片描述 |
| 中文文档编码混乱（GBK/GB2312/BIG5/UTF-8 混合） | 6 级编码检测回退链 |
| 文档过长无法直接送入 LLM 提炼 | 语义分段引擎，按话题边界切分为合适大小的 chunk |
| 分段过碎或过大影响下游检索质量 | TextTiling 山谷检测 + 多层保护机制 |
| 飞书文档无法本地化管理 | 飞书 API 集成，6 种文档类型自动识别导入（docx/docs/wiki/sheets/bitable/minutes） |

### 1.3 关键指标

| 指标 | 数值 |
|------|------|
| 支持文件格式 | 12 种文件 + 6 种飞书文档 |
| API 接口 | 14 个（全部 Zod 校验） |
| 分段策略 | 2 种（语义分段优先 → 机械分段兜底）+ LLM 分段（已实现，待接入） |
| 编码回退链 | 6 种（UTF-8 / GBK / GB2312 / BIG5 / SHIFT_JIS + jschardet 检测） |
| 文档状态机 | 5 状态（uploading → uploaded → parsing → parsed / failed） |
| chunk 大小 | 100-1000 字（语义分段），2000 字（机械兜底） |

---

## 二、技术架构

```text
用户选择文件 → 校验 → createDocument(status: uploading)
    → saveDocumentFile → public/uploads/id → status: uploaded
    → POST /api/documents/id/parse
    → parseDocument() 核心编排:
        txt/md/csv → 编码检测+解码
        xlsx → SheetJS 逐Sheet提取
        docx → mammoth HTML → 自研转 Markdown
        pdf → pdf-parse 三路提取(文本+表格+图片)
        pptx → JSZip 解包XML
        png/jpg → Vision API + OCR兜底
    → rawContent 纯文本
    → splitTextSemantic(含 mergeTableBlocks 原子化)
        → 成功 → 语义分段结果
        → 失败 → splitTextIntoChunks 机械分段兜底
    → replaceTextChunksAndIndex() 事务写入 chunk
    → status: parsed, chunks 就绪
```

### 数据模型

两个核心表：

**DocumentSource** — 文档来源记录

| 关键字段 | 说明 |
|----------|------|
| `fileType` | 扩展名（txt/pdf/docx/...），决定解析路线 |
| `sourceType` | 来源类型（file/url/manual/image/...） |
| `rawContent` | 解析后的全量纯文本 |
| `status` | 状态机（uploading→uploaded→parsing→parsed/failed） |
| `chunkCount` | 分段数量（冗余字段，快速展示） |

**DocumentChunk** — 统一分段模型（text + knowledge 共用）

| 关键字段 | 说明 |
|----------|------|
| `chunkIndex` | 分段序号，从 0 开始（API 返回 & 前端展示用） |
| `content` | 分段文本 |
| `chunkType` | text（机械/语义分段）或 knowledge（AI 提炼） |
| `charStart/charEnd` | 在原文中的字符偏移量（可追溯） |
| `chunkStatus` | active/disabled（控制是否参与检索） |

---

## 三、核心能力

### 3.1 文件解析引擎

**文件**：`src/lib/file-parser.ts`，入口 `parseFileContent(buffer, fileType)`

#### 支持格式一览

| 类别 | 格式 | 解析方式 | 核心依赖 |
|------|------|---------|----------|
| 纯文本 | txt, md | 编码检测 → 解码 | jschardet + iconv-lite |
| 表格 | csv | 编码检测 → 智能表格识别 → Markdown | 自研 isTableBlock() |
| 表格 | xlsx | SheetJS 逐 Sheet 提取 + 合并单元格填充 | SheetJS (xlsx) |
| 文档 | docx | mammoth 解包 ZIP → XML 文本节点 + 图片提取 | mammoth |
| 文档 | doc | word-extractor 提取正文 | word-extractor |
| 文档 | pdf | pdf-parse v2（文本提取 + 表格提取 + 图片提取 → Vision 描述） | pdf-parse |
| 演示 | pptx | JSZip 解包 → slide XML + notes XML + 图片提取 | jszip |
| 图片 | png, jpg/jpeg, webp, bmp | Vision 多模态描述 → 失败 → Tesseract OCR | OpenAI Vision + tesseract.js |

#### 编码检测链（6 级回退）

编码检测链的 6 级回退顺序：jschardet 检测（置信度≥0.5用结果）→ UTF-8 → GBK → GB2312 → BIG5 → SHIFT_JIS → 兜底返回（乱码也接受）。每一步检查是否含乱码 U+FFFD，无乱码则解码成功。

#### 表格智能识别（CSV）

CSV 文件的难点在于区分"表格数据"和"逗号分隔的普通文本"。判据：
- 至少 2 行、至少 2 列、列数一致
- 平均单元格长度 ≤ 40 字（表格数据短，段落文本长）
- 引号感知解析（`"张三, 经理"` → 1 个单元格，非 2 个）

宽表（>5 列）转为 key-value 格式保证可读性。

#### 图片双层降级

```
Vision API 多模态描述（优先）
  → 5 角度结构化描述：文字提取→主体识别→布局→位置→禁止废话
  → 失败 → Tesseract OCR（chi_sim+eng 中英混合）
  → 全部失败 → "[图片无法识别]"
```

图片描述在 `parseFileContent` 内同步完成（DOCX/PDF/PPTX 均通过 `Promise.all` 并发），确保分段之前图片语义已就位，而非事后异步替换。

---

### 3.2 语义分段引擎

**文件**：`src/lib/semantic-splitter.ts`
**依赖**：DashScope text-embedding-v4, 1024 维中文向量

#### 为什么需要语义分段

传统方案按固定字数（如 500 字）切分文档，会在句子中间截断，破坏语义完整性。语义分段的目标是在**话题自然切换的位置**切断，确保每个 chunk 内部语义凝聚。

#### 当前流水线（7 步）

**7 步流水线**：

1. **步骤1: 结构预处理** — normalizeStructure：4种中文标题前插入 `\n\n`（### / 第X章 / 【...】/ 一、）
2. **步骤2: 细粒度拆句（保留偏移量）** — splitSentences：`\n` 切行 + indexOf 记录位置 → 按 。！？.!? 拆句 → 合并孤立序号 → 合并图片描述 → 合并表格块
3. **步骤3: 向量化** — batchEmbedTexts：DashScope text-embedding-v4, 1024维, 批次大小10，仅用于计算相似度
4. **步骤4: 滑动窗口** — radius=2 低通滤波：左窗口 = avg(句_i-1, 句_i), 右窗口 = avg(句_i+1, 句_i+2), cos(左窗口, 右窗口) → sim_i
5. **步骤5: 四层断点判定**：
   - L1: sim < 0.45 → 绝对兜底断点
   - L2: 局部极小值 + 谷深 ≥ max(0.7σ, 0.04) → TextTiling 语义断点
   - L3: 标题正则匹配 → 结构强制断点
6. **步骤6: 长度保护**：≥150字 or ≥3句 or 标题 → 允许切；否则拒绝继续累积；≥15句（L4: 句数强制）→ 强制切断
7. **步骤7: 后处理** — mergeSmallSegments（<100字合并到邻居）→ splitTextIntoChunks（>1000字二次机械切）

#### 关键算法：TextTiling 山谷检测

##### 算法原理

TextTiling 是 Hearst 于 1997 年提出的文本分割算法，核心思想是**在相邻句子的语义相似度曲线上找山谷（局部极小值），谷底即话题切换点**。

具体步骤：把文档拆成句子 → 每句用 Embedding 转成向量 → 计算相邻句对之间的余弦相似度 → 得到一条相似度曲线 → 在曲线上找山谷。

**为什么要看相似度曲线？** 同一话题内的句子，语义相近，相似度维持在高原（0.85-0.95）。当话题切换时，相邻句子的语义差距突然变大，相似度急剧下降，在曲线上形成一个"断崖"——断崖底部就是山谷，即切分点。

##### 为什么不用百分位阈值

百分位阈值法的逻辑是：对所有相邻句对按相似度从低到高排序，取第 N 分位以下的作为断点。例如 40% 分位意味着总是切掉相似度最低的 40% 句对。

**在细粒度拆句背景下，这是结构性缺陷**。我们的拆句引擎将文档拆成数百个句子级单元，其中 90% 以上的相邻句对是同段落内的连贯句子，相似度集中在 0.85-0.98。百分位法不管这些——它总是强制切出约 N% 的"断点"，导致同段落内被切出大量假断点，把连贯的段落切成碎片。

TextTiling 的判断依据不是全局排名，而是**局部结构**：只有当前位置真正形成了山谷（比左右邻居都低，且深度足够），才算断点。同段落内相似度是平坦高原——没有山谷——就不会出假断点。

##### 滑动窗口消噪

直接比较相邻两个句子的相似度容易受单句噪声影响。例如"顺便说一下""请注意"等过渡句与前后都不相似，会产生假谷。

解决方案是**滑动窗口低通滤波**：用窗口半径 k=2 的左右窗口分别计算平均向量，再比较窗口间的余弦相似度。

```
位置 i 的相似度 sim_i = cos(
  avg(句_i-1, 句_i),      // 左窗口（2 句）
  avg(句_i+1, 句_i+2)     // 右窗口（2 句）
)
```

窗口平均相当于对曲线做低通滤波——单句波动被平滑，只有真正的语义趋势变化才会在 sim 上体现。k=2 是平衡点：太大会模糊断点位置，太小消噪不够。

##### 山谷检测与谷深判断

有了相似度曲线后，逐个位置检查是否为山谷：

**Step 1 — 局部极小值检查**：位置 i 必须同时低于左邻居（sim_i-1）和右邻居（sim_i+1）。不满足 → 不是谷，跳过。

**Step 2 — 谷深计算**：找到山谷两侧的峰顶（PEAK_WINDOW=3 范围内取最大值），计算谷深：

```
谷深 = (左侧峰顶 + 右侧峰顶) / 2 - 谷底(sim_i)
```

**Step 3 — 谷深阈值判定**：谷深必须 ≥ `max(0.7 × σ, 0.04)` 才算真正的语义断点。

阈值由两部分组成：
- `0.7 × σ`：自适应部分。σ 是整篇文档相似度的标准差——波动大的文档（话题多），σ 大，阈值自动升高，避免切太碎；均质文档 σ 小，阈值降低，敏感捕获微小话题切换。
- `0.04`：绝对下限。即使文档极度均质（σ 趋近 0），也需要至少 0.04 的谷深来排除随机噪声。

##### 四层断点体系的互补关系

单一检测机制无法覆盖所有场景，因此设计了四层互补体系：

**第一层：绝对兜底（sim < 0.45）**
话题渐变时——两个话题不是突然切换，而是逐步过渡——相似度持续缓慢下降但不形成明显山谷。绝对阈值 0.45 保证即使没有山谷，相似度降到足够低时也会强制切断。0.45 的取值依据：经测试，同段落内相邻句对极少低于此值（通常 ≥ 0.7），而跨话题句对通常低于此值。

**第二层：TextTiling 山谷检测（局部极小值 + 谷深 ≥ max(0.7σ, 0.04)）**
标准"断崖式下跌"话题切换场景。这是最主要的断点来源，覆盖 90% 以上的自然话题切换。对平坦高原不出假断点，对真山谷不遗漏。

**第三层：标题强制（HEADER_PATTERN 正则匹配）**
标题和正文在语义上可能高度相关——例如"## 3.2 语义分段引擎"紧随的正文大量使用"语义""分段""Embedding"等词——相似度可能高达 0.8+，山谷检测会漏过。但标题是天然的结构边界，通过正则强制在标题前切断。匹配 4 种中文标题模式：`#` Markdown 标题、`第X章/节`、`【...】`、`一、二、三...` 中文数字编号。

**第四层：句数强制（≥ 15 句）**
纯均质文本——如一篇全是同一主题的叙述性文章——所有相邻句对相似度都在 0.9 以上，山谷不存在，绝对阈值也不触发。如果不强制切，整篇文章会变成一个巨型 chunk，完全破坏检索精度。15 句的上限确保即使所有检测都失效，也能产生合理大小的 chunk。

| 层级 | 触发条件 | 覆盖场景 |
|------|----------|-------------|
| 绝对兜底 | `sim < 0.45` | 话题渐变持续下降，不形成山谷 |
| TextTiling 山谷检测 | 局部极小值 + 谷深 ≥ `max(0.7σ, 0.04)` | 标准"断崖式下跌"话题切换（≈90% 断点来源） |
| 标题强制 | 下一句匹配 `HEADER_PATTERN` | 结构边界——标题与正文语义高度相关，山谷检测可能漏过 |
| 句数强制 | 同段累积 ≥ 15 句 | 纯均质文本——所有相似度都高，四种检测全不触发 |

#### 关键参数

| 参数 | 值 | 作用 |
|------|:--:|------|
| `WINDOW_RADIUS` | 2 | 滑动窗口半径，k=2 消噪不模糊 |
| `PEAK_WINDOW` | 3 | 山谷两侧峰顶估算窗口 |
| `DEPTH_SIGMA` | 0.7 | 谷深阈值倍数（自适应文档波动） |
| `MIN_DEPTH` | 0.04 | 最小谷深（过滤噪声） |
| `ABSOLUTE_BREAK` | 0.45 | 绝对相似度下限 |
| `MIN_SEGMENT_CHARS` | 150 | 最小段字数（防碎片） |
| `MAX_SEGMENT_SENTENCES` | 15 | 最大段句数（防巨型段） |
| `maxChunkSize` | 1000 | 最终 chunk 字数上限 |

#### 兜底策略

**分段路径决策**：

1. 图片文件 → 单 chunk，内容 = Vision 描述，不拆分
2. 非图片文件 → splitTextSemantic 语义分段先试 → 成功则用结果，失败则 `splitTextIntoChunks` 机械兜底（2000 字/段 + 200 字重叠）
3. 所有路径最终 → replaceTextChunksAndIndex 事务写入 DocumentChunk

**保护机制**：

| 机制 | 说明 |
|------|------|
| 语义分段失败兜底 | `splitTextSemantic` 返回 `null` → 自动退回 `splitTextIntoChunks` 机械分段，用户无感知 |
| 表格原子化保护 | 语义分段内部 `mergeTableBlocks()` 将连续表格行合并为原子 Frag，避免 TextTiling 在表格内部产生断点 |
| 表格合并保护 | 机械分段内部 `mergeTableParagraphs()` 合并表格块，`splitOversizedTable()` 超大表格分块时自动重复表头 |
| LLM 分段备用 | `splitTextByLLM()` 已完整实现（LLM 插入 ---SECTION--- 标记切分），当前 parseDocument 未接入，作为第三路备用策略 |

#### 设计决策小结

| 设计点 | 决策 | 理由 |
|--------|------|------|
| 为什么语义分段优先于机械分段 | 语义先试，失败退机械 | 语义分段话题边界更准确，但依赖外部 Embedding API；机械分段 100% 可用，精度降低但不阻塞用户 |
| 为什么图片处理同步而非异步 | Promise.all 并发同步 | 分段前必须图片语义已就位，否则分段结果缺少图片上下文；异步替换会导致 chunk 内容和检索结果不一致 |
| 为什么 embedding 只算不存 | 临时向量化 | Embedding 仅用于句子间相似度比较，不参与最终检索；入库向量由成员 D 在知识提炼确认后另行生成 |

---

### 3.3 文档管理

**文件**：`src/server/services/document.service.ts`

#### 核心服务函数

| 函数 | 职责 |
|------|------|
| `parseDocument(id)` | **核心编排**：读文件→解析文本→语义分段→事务写入 chunk，含幂等性检查 |
| `replaceTextChunksAndIndex()` | 原子事务：只删 chunkType="text" 的旧 chunk → 建新 chunk → 更新文档状态 |
| `updateDocumentContent(id, rawContent)` | 编辑全文内容后重新分段（触发语义分段 + 索引更新） |
| `deleteDocument(id)` | 级联删除：磁盘文件 + Embeddings + Chunks + DocumentSource |
| `listDocuments(options)` | 分页列表 + 状态筛选 + 候选知识计数 |

#### 文档状态机

状态流转路径：

```
[*] → uploading(创建记录) → uploaded(文件保存到磁盘)
    → parsing(触发解析)
        → parsed(chunks+embedding写入成功)
        → failed(解析异常)
    failed → parsing(重新解析)
    parsed → parsing(重新解析-内容变更)
    uploaded/parsed/failed → [*](删除)
```

- **状态即真相**：前端根据 status 控制按钮显隐（解析/预览/提炼/重试）
- **幂等性**：相同内容重复解析直接复用已有 chunks
- **可恢复性**：failed 记录 error 信息，支持重新解析

#### 编辑后重新分段（PATCH → updateDocumentContent）

用户在预览页修改文档内容后的完整链路：

```
前端预览弹窗（DocumentPreview）编辑 rawContent
  → PATCH /api/documents/[id]  { content: "修改后的全文" }
  → updateDocumentContent(id, rawContent):
      1. 内容未变 → 直接返回（无操作）
      2. 内容有变 → 重新执行全部分段逻辑:
         a. 图片文件 → 单 chunk = 新 rawContent
         b. 非图片文件 → splitTextSemantic 语义分段先试
            → 成功 → 新语义分段结果
            → 失败 → splitTextIntoChunks 机械兜底
      3. replaceTextChunksAndIndex(id, newChunks, { rawContent }):
         → 只删 chunkType="text" 的旧分段
         → 保留 knowledge 类型 chunk（AI 提炼结果不丢失）
         → 写入新 text chunk（chunkIndex 重新编号，ID 全新）
         → chunkCount 可能变化（取决于内容变化幅度）
      4. 返回更新后的完整文档
```

**关键行为**：
- 每次编辑都会触发完整重分段，不是增量更新
- knowledge chunk（AI 提炼的知识条目）不受影响，只替换 text chunk
- chunkCount、chunkIndex、chunk ID 都可能变化
- 内容完全相同则跳过（幂等），不产生数据库写操作

#### API 接口（14 个，全部 Zod 校验）

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/documents` | 列表（分页 + 状态/hasCandidates 筛选） |
| POST | `/api/documents` | 上传（multipart，多文件） |
| GET | `/api/documents/[id]` | 详情（含全文 + chunks） |
| PATCH | `/api/documents/[id]` | 编辑全文 + 重新分段 |
| DELETE | `/api/documents/[id]` | 级联删除 |
| POST | `/api/documents/[id]/parse` | 触发解析 |
| GET | `/api/documents/[id]/chunks` | 获取分段列表（成员 D 消费） |
| GET | `/api/documents/[id]/download` | 下载原始文件 |
| POST | `/api/documents/batch-parse` | 批量解析 |
| POST | `/api/documents/batch-delete` | 批量删除 |
| GET | `/api/documents/parse-progress` | 查询解析进度（SSE polling，支持批量文档 ID） |
| POST | `/api/documents/resumable` | 大文件分片上传（2MB/chunk，断点续传） |
| POST | `/api/feishu/import` | 导入飞书链接 → 创建文档 → 分段 → parsed |
| POST | `/api/feishu/debug` | 飞书调试（测试鉴权和文档访问） |

---

### 3.4 飞书集成

**文件**：`src/lib/feishu.ts`

飞书集成支持通过粘贴链接直接导入飞书文档，无需手动下载再上传。

#### 支持的飞书文档类型（6 种）

| 类型 | URL 模式 | 说明 |
|------|---------|------|
| docx | `feishu.cn/docx/{token}` | 新版飞书文档 |
| docs | `feishu.cn/docs/{token}` | 旧版文档 |
| wiki | `feishu.cn/wiki/{token}` | 知识库（含二次路由） |
| sheets | `feishu.cn/sheets/{token}` | 电子表格 |
| bitable | `feishu.cn/bitable/{token}` | 多维表格 |
| minutes | `feishu.cn/minutes/{token}` | 会议纪要（妙记） |

#### 导入流程

```
粘贴飞书链接 → identifyFeishuUrl(url) 识别类型
    → 获取 tenant_access_token（App ID + App Secret）
    → 调用飞书 API 获取文档内容
        docx: GET /docx/v1/documents/{id}/raw_content
        其他类型: 对应 API 文本提取
    → createDocument({ sourceType: "url", fileType: "md" })
    → status: uploaded（rawContent 写入 DB）
    → parseDocument(id) 统一解析路径:
        rawContent 已就位 → 跳过读磁盘
        → splitTextSemantic 语义分段先试
        → 失败 → splitTextIntoChunks 机械兜底
    → status: parsed
```

#### 设计决策

- **统一解析路径**：飞书导入和普通文件走同一个 `parseDocument()` 入口，语义分段优先、机械兜底。rawContent 直接写入 DB（无磁盘文件），parseDocument 检测到 rawContent 已就位后跳过文件读盘步骤。
- **Token 管理**：使用飞书 tenant_access_token（有效期 2h），当前未缓存，每次请求重新获取。高频使用场景建议改为内存缓存 + 过期前刷新。
- **兜底识别**：6 种模式都未匹配但域名是 `feishu.cn` 时，从 URL 末尾提取 token（20+ 位字母数字），尝试作为 docx 类型获取内容。

#### 前端入口

```
src/app/documents/page.tsx
  └── FeishuImport  粘贴飞书链接 → 自动识别类型 → 一键导入
```

---

## 四、技术选型

### 4.1 解析引擎选型

| 格式 | 选型 | 选型理由 | 备选对比 |
|------|------|---------|----------|
| 编码检测 | jschardet + iconv-lite | 纯 JS 零编译依赖，置信度输出支持分级决策 | chardet（已停维）、iconv（需 node-gyp 编译） |
| DOCX | mammoth | 将 ZIP+XML 转为 HTML → 自研 `mammothHtmlToMarkdown()` 转 Markdown 含 pipe table，`convertImage` 回调在原位触发图片占位符 |
| PDF | pdf-parse v2 | pdf.js 高层封装，一个 API 拿文本+表格+图片，支持分页对齐 | pdf.js 裸用太底层、pdf2json 维护差 |
| XLSX | SheetJS (xlsx) | 行业标准，`!merges` 提供合并单元格信息 | exceljs（重格式化，体积更大） |
| PPTX | JSZip + XML 正则 | PPTX = ZIP of XML，JSZip 是 ZIP 操作标准库 | pptx-parser（社区库质量参差） |
| 图片 | Vision API + Tesseract | 双层降级：Vision 理解图文关系，OCR 兜底 | 纯 OCR 处理架构图输出无意义碎片 |

### 4.2 分段引擎选型

#### 为什么用 TextTiling 而不是百分位阈值

| 维度 | 百分位阈值 | TextTiling 山谷检测 |
|------|---------------------------------------|----------------------------------|
| 断点逻辑 | 相似度 < 第 N 分位 → 断点 | 局部极小值 + 谷深足够 → 断点 |
| 同段落行为 | **总强制切出约 N% 假断点** | 平坦高原无山谷 → **零断点** |
| 细粒度拆句 | 不适合（数百个高相似度对中强制取 N%） | 适合（只有真正的语义低谷触发） |
| 均质文档 | 切得太碎 | 不切（靠句数强制兜底） |
| 话题渐变 | 可能漏切 | 绝对兜底 + 山谷一起覆盖 |
| 自适应能力 | 按排名自适应（缺陷：排名低≠语义切换） | 按分布自适应（σ×0.7）+ 绝对下限 |

选用 TextTiling 的决定性原因是：**细粒度拆句后，90% 以上的相邻句对是同段落连贯句（sim > 0.85），百分位法在此区间内强制切出断点是结构性缺陷，无法通过调参修复。**

#### Embedding 模型选择

| 维度 | DashScope text-embedding-v4 | OpenAI text-embedding-3 |
|------|---------------------------|-------------------------|
| 中文优化 | 专为中文训练 | 多语言通用 |
| 维度 | 1024（够用） | 3072（过剩） |
| 成本 | 免费额度覆盖开发 | 按 token 计费 |
| 可替换性 | 接口隔离，任意替换 | 同左 |

注：这里的 Embedding 调用仅用于语义分段中的句子相似度计算，不持久化存储。向量化入库（知识检索用）由成员 D 在知识提炼确认后执行。

---

## 五、协作接口

### 上下游关系

```
成员C(文档导入管线)
    → GET /api/documents/:id/chunks (分段数据)
    → 成员D(AI知识提炼)
        → 提炼后的知识 → 成员A(知识生命周期管理)
成员C → 文档统计数据 → 成员G(数据分析)
```

### C → D 数据格式

```json
// GET /api/documents/:id/chunks 返回
{
  "chunks": [
    {
      "id": "clx...",
      "content": "分段文本内容...",
      "chunkIndex": 0,
      "charStart": 0,
      "charEnd": 856,
      "chunkType": "text",
      "chunkStatus": "active"
    }
  ]
}
```

---

## 六、前端页面

**路由**：`/documents`

```
src/app/documents/page.tsx
  ├── DocumentUploader    拖拽/点击多文件上传
  ├── FeishuImport        飞书链接导入
  ├── DocumentList        表格列表 + 状态筛选 + 批量操作
  └── DocumentPreview     模态弹窗（原文 / 分段 / 提炼知识 3 Tab）
```

**DocumentList 功能**：
- 状态筛选：全部 / 待解析 / 解析中 / 已解析 / 失败
- 批量操作：全选/反选、批量解析、批量删除
- 状态覆盖：loading / empty / error 均有对应 UI

---

## 七、已知限制与改进方向

| 限制 | 当前状态 | 改进方向 |
|------|---------|----------|
| 扫描版 PDF 无 OCR | pdf-parse 只能提取文本层，扫描版返回空 | 增加文本过短时的 OCR 回退（Tesseract 已就绪） |
| LLM 分段未接入 | `splitTextByLLM()` 已完整实现（含 ---SECTION--- 标记切分），parseDocument 尚未调用 | 作为非结构化文档（会议纪要、访谈记录等）的主分段策略，当前 parseDocument 只使用语义+机械两路 |
| 旧 .ppt 不支持 | 抛错提示转换 | 增加对.ppt 的支持 |
| 飞书 token 未缓存 | 每次请求重新获取 | 增加内存缓存（2h 有效期） |
| 无 chunk 元数据 | 只有 charStart/charEnd/chunkIndex | 增加页码、章节路径等元数据支持 filtered retrieval |

---

## 八、关键文件

```
核心解析引擎：
  src/lib/file-parser.ts                   ← 12 种文件格式解析 + 6 级编码检测链
  src/lib/semantic-splitter.ts             ← TextTiling 山谷检测语义分段（7 步流水线）
  src/lib/text-splitter.ts                 ← 机械分段 + 表格保护 + LLM 分段（splitTextByLLM）
  src/lib/embedding.ts                     ← DashScope text-embedding-v4 向量化（临时，不存库）
  src/lib/feishu.ts                        ← 飞书 6 种文档类型 API 客户端（鉴权 + 内容获取）

服务层：
  src/server/services/document.service.ts  ← 文档 CRUD + parseDocument 编排 + 事务写入

API 接口：
  src/app/api/documents/route.ts           ← 列表 + 上传
  src/app/api/documents/[id]/route.ts      ← 详情 + 编辑 + 删除
  src/app/api/documents/[id]/parse/        ← 触发解析
  src/app/api/documents/[id]/chunks/       ← 分段数据（成员 D 消费）
  src/app/api/documents/[id]/download/     ← 下载原始文件
  src/app/api/documents/batch-parse/       ← 批量解析
  src/app/api/documents/batch-delete/      ← 批量删除
  src/app/api/documents/parse-progress/    ← 解析进度查询（SSE polling）
  src/app/api/documents/resumable/         ← 大文件分片上传（2MB/chunk）
  src/app/api/feishu/import/              ← 飞书链接导入
  src/app/api/feishu/debug/               ← 飞书调试接口

前端页面：
  src/app/documents/page.tsx               ← 文档管理主页面
  src/features/document/components/        ← DocumentUploader / DocumentList / DocumentPreview / FeishuImport
  src/store/slices/document-slice.ts       ← Zustand 状态管理

数据库：
  prisma/schema.prisma                     ← DocumentSource + DocumentChunk 模型定义
```
