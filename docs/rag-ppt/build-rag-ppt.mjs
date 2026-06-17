import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const skillRoot = path.join(root, ".agents", "skills", "guizang-ppt-skill");
const templatePath = path.join(skillRoot, "assets", "template.html");
const outDir = here;
const assetsDir = path.join(outDir, "assets");
const imagesDir = path.join(outDir, "images");

fs.mkdirSync(assetsDir, { recursive: true });
fs.mkdirSync(imagesDir, { recursive: true });
fs.copyFileSync(path.join(skillRoot, "assets", "motion.min.js"), path.join(assetsDir, "motion.min.js"));

const slides = String.raw`
<section class="slide hero dark">
  <div class="chrome">
    <div>RAG Retrieval · Knowledge Positioning</div>
    <div>Indigo Porcelain · 01 / 08</div>
  </div>
  <div class="frame" style="display:grid;gap:4vh;align-content:center;min-height:80vh">
    <div class="kicker">Training Camp Project · Tech Brief</div>
    <h1 class="h-hero" style="font-size:8.2vw;line-height:1.02">RAG 检索<br>与知识定位</h1>
    <h2 class="h-sub" style="max-width:68vw">把知识库里的 chunk 组织成 Agent 可以直接使用、可以追踪来源的上下文。</h2>
    <p class="lead" style="max-width:60vw">
      负责完整 RAG 检索链路、本地 chunk 向量索引维护，以及知识库详情页搜索、筛选、高亮和跳转定位能力。
    </p>
    <div class="meta-row">
      <span>Vector + BM25 + Exact</span><span>·</span><span>RRF + Voyage Reranker + Rules</span><span>·</span><span>Context Builder</span>
    </div>
  </div>
  <div class="foot">
    <div class="title">5 分钟技术汇报 · 初版</div>
    <div>RAG MODULE</div>
  </div>
</section>

<section class="slide light">
  <div class="chrome">
    <div>RAG Positioning · 背景与目标</div>
    <div>02 / 08</div>
  </div>
  <div class="frame" style="padding-top:5vh">
    <div class="kicker">RAG 是什么，为什么需要 RAG</div>
    <h2 class="h-xl" style="font-size:5.1vw">基于指定知识范围生成回答</h2>
    <p class="lead" style="max-width:74vw;margin-top:2vh">
      RAG（Retrieval-Augmented Generation）是在大模型生成回答之前，先从指定知识范围中检索相关证据，再把问题、上下文和引用来源一起交给模型。它适用于项目知识库、团队知识库或个人知识库，让回答基于可追踪的外部知识，而不只依赖模型参数中的通用记忆。
    </p>
    <div class="grid-4" style="margin-top:5vh;gap:3vh 4vw">
      <div class="stat-card">
        <div class="stat-label">01 · Retrieve</div>
        <div class="stat-nb" style="font-family:var(--serif-zh);font-size:3vw">检索</div>
        <div class="stat-note">先明确要在哪些知识范围内查找，把用户问题转成可检索的表达。</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">02 · Recall</div>
        <div class="stat-nb" style="font-family:var(--serif-zh);font-size:3vw">召回</div>
        <div class="stat-note">从知识片段中找出可能相关的候选内容，先保证问题附近的证据被覆盖。</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">03 · Rerank</div>
        <div class="stat-nb" style="font-family:var(--serif-zh);font-size:3vw">重排</div>
        <div class="stat-note">对候选内容重新排序，优先保留与当前问题更相关、更可用于回答的证据。</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">04 · Augment</div>
        <div class="stat-nb" style="font-family:var(--serif-zh);font-size:3vw">输出</div>
        <div class="stat-note">把证据组织成可消费上下文，并保留引用来源，支撑后续回答生成。</div>
      </div>
    </div>
  </div>
  <div class="foot">
    <div class="title">我的职责：RAG 检索完整链路、本地向量索引维护、知识库详情页搜索筛选定位</div>
    <div>WHY RAG</div>
  </div>
</section>

<section class="slide light" data-animate="pipeline">
  <div class="chrome">
    <div>Retrieval Pipeline · 项目落地实现</div>
    <div>03 / 08</div>
  </div>
  <div class="frame">
    <div class="kicker">项目实现：从用户 query 到 Agent 可消费上下文</div>
    <h2 class="h-xl" style="font-size:4.55vw">RAG 编排主链路</h2>
    <p class="lead" style="max-width:78vw;margin-top:1.6vh">
      在这个项目里，我负责把通用 RAG 流程落到可调用的检索接口：接收上游传入的 query 和知识库范围，读取可检索 chunk，完成 query 改写、多路召回、融合重排、上下文质量控制和引用输出。
    </p>

    <div class="pipeline-section" style="margin-top:3vh;padding-top:0;border-top:0">
      <div class="pipeline-label">Core Flow · Retrieval, rerank and augmentation</div>
      <div class="pipeline" data-cols="6">
        <div class="step" data-anim="step"><div class="step-nb">01</div><div class="step-title">范围过滤</div><div class="step-desc">根据传入的 knowledgeBaseIds 读取可检索 chunk，并映射为 RAG 内部 KnowledgeChunk。</div></div>
        <div class="step" data-anim="step"><div class="step-nb">02</div><div class="step-title">Query 改写</div><div class="step-desc">标准化原始问题，合并规则改写和 LLM 改写，扩展更适合召回的检索表达。</div></div>
        <div class="step" data-anim="step"><div class="step-nb">03</div><div class="step-title">多路召回</div><div class="step-desc">Vector、BM25、Exact-term 并行召回，分别覆盖语义、关键词和精确词场景。</div></div>
        <div class="step" data-anim="step"><div class="step-nb">04</div><div class="step-title">融合重排</div><div class="step-desc">RRF 融合多路候选，再结合 Voyage reranker 与 rules rerank 提升排序质量。</div></div>
        <div class="step" data-anim="step"><div class="step-nb">05</div><div class="step-title">质量控制</div><div class="step-desc">使用阈值过滤、fallback、MMR 去重和邻近 chunk 扩展，控制最终上下文质量。</div></div>
        <div class="step" data-anim="step"><div class="step-nb">06</div><div class="step-title">组装输出</div><div class="step-desc">Context Builder 生成 contexts、llmContext、references，交给 Agent/Chat 消费。</div></div>
      </div>
    </div>

    <div class="callout" style="margin-top:3vh;padding:2vh 2vw">
      这一页展示的是项目中的主链路编排；后续页面再展开多路召回、融合重排、上下文控制等关键策略。
      <span class="cite">retrieveRagContexts · src/server/services/rag/retriever.ts</span>
    </div>
  </div>
  <div class="foot">
    <div class="title">核心编排：src/server/services/rag/retriever.ts</div>
    <div>PIPELINE</div>
  </div>
</section>

<section class="slide light">
  <div class="chrome">
    <div>Query Rewrite & Hybrid Recall · 多路召回设计</div>
    <div>04 / 08</div>
  </div>
  <div class="frame" style="padding-top:5vh">
    <div class="kicker">从自然语言问题到可召回候选</div>
    <h2 class="h-xl" style="font-size:5vw">Query Rewrite + 多路召回</h2>
    <div class="grid-2-6-6" style="margin-top:4.4vh;gap:4.2vw">
      <div>
        <h3 class="h-md">Query Rewrite：提高问题表达的可检索性</h3>
        <p class="body-zh" style="margin-top:2vh">
          用户输入通常是自然语言问题，而不是稳定的搜索关键词。这里会保留原始 query，同时生成少量等价或近义的检索表达：规则改写负责高频稳定问法，LLM 改写补足更灵活的自然语言表达。改写结果只用于扩大召回覆盖，不替代原始问题；失败时直接回退原始 query，不影响主链路。
        </p>
        <div class="callout" style="margin-top:2.8vh">
          <span class="q-big">本地向量索引作为语义召回支撑</span><br>
          考虑训练营项目的部署和联调成本，当前使用 SQLite 中的 ChunkEmbedding 维护 chunk 向量、模型名和 contentHash；向量读写封装在 repository 中，后续可以替换为真实向量数据库。
          <span class="cite">query-processor.ts · llm-query-rewriter.ts · vector-index-repository.ts</span>
        </div>
      </div>
      <div style="display:grid;grid-template-rows:repeat(3,1fr);gap:2vh">
        <div class="stat-card"><div class="stat-label">Vector Recall</div><div class="stat-nb" style="font-family:var(--serif-zh);font-size:2.55vw">语义召回</div><div class="stat-note">用于处理“表达不同但含义接近”的问题，例如用户问法和 chunk 原文措辞不一致时，通过 query embedding 与 fresh chunk embedding 的相似度补充候选。</div></div>
        <div class="stat-card"><div class="stat-label">BM25 Recall</div><div class="stat-nb" style="font-family:var(--serif-zh);font-size:2.55vw">关键词召回</div><div class="stat-note">用于补强标题、AI 总结、正文里的词面相关性，尤其适合权限、配置、接口名称这类在文档中明确出现的关键词。</div></div>
        <div class="stat-card"><div class="stat-label">Exact-term Recall</div><div class="stat-nb" style="font-family:var(--serif-zh);font-size:2.55vw">精确词召回</div><div class="stat-note">用于保证 API 路径、DATABASE_URL、chunkIndex、文件名等专有词不会被语义匹配稀释，提升工程类知识的命中稳定性。</div></div>
      </div>
    </div>
  </div>
  <div class="foot">
    <div class="title">代码：query-processor.ts · bm25.ts · exact-term.ts · vector-store.ts</div>
    <div>RECALL</div>
  </div>
</section>

<section class="slide dark">
  <div class="chrome">
    <div>Fusion & Rerank · 融合重排设计</div>
    <div>05 / 08</div>
  </div>
  <div class="frame" style="padding-top:5vh">
    <div class="kicker">从多个候选列表到最终排序</div>
    <h2 class="h-xl" style="font-size:5vw">RRF 融合 + 语义重排</h2>
    <div class="grid-2-6-6" style="margin-top:4.4vh;gap:4.2vw">
      <div>
        <h3 class="h-md">排序层的核心思路</h3>
        <p class="body-zh" style="margin-top:2vh">
          多路召回会得到 Vector、BM25、Exact 等不同候选列表，但这些召回器的 score 含义并不一致。这里先用 RRF 按“排名位置”融合候选，避免直接比较不可同尺度的原始分数；再通过 Voyage reranker 和 rules rerank 对候选做二次排序，让更能回答当前 query 的 chunk 排到前面。
        </p>
        <div class="callout" style="margin-top:2.8vh">
          <span class="q-big">召回阶段保证覆盖，融合阶段统一候选，重排阶段提升前排质量。</span><br>
          finalScore = 0.65 × voyageScore + 0.25 × ruleScore + 0.10 × rrfScore
          <span class="cite">hybrid.ts · candidate-reranker.ts · voyage-reranker.ts</span>
        </div>
      </div>
      <div style="display:grid;grid-template-rows:repeat(3,1fr);gap:2vh">
        <div class="stat-card"><div class="stat-label">RRF Fusion</div><div class="stat-nb" style="font-family:var(--serif-zh);font-size:2.55vw">排名融合</div><div class="stat-note">RRF 关注每个 chunk 在各路召回中的排名，而不是原始分数大小。同一个 chunk 如果在多路结果里都靠前，融合后会获得更高排序。</div></div>
        <div class="stat-card"><div class="stat-label">Voyage Reranker</div><div class="stat-nb" style="font-family:var(--serif-zh);font-size:2.55vw">语义重排</div><div class="stat-note">在 RRF 候选池上判断 query 与 chunk 的语义相关性，把真正围绕用户问题、可用于回答的片段排到更靠前的位置。</div></div>
        <div class="stat-card"><div class="stat-label">Rules Rerank</div><div class="stat-nb" style="font-family:var(--serif-zh);font-size:2.55vw">规则补充</div><div class="stat-note">叠加 title、summary、metadata、chunkType、来源等可解释信号，补足模型分数之外的业务判断，也便于调试命中原因。</div></div>
      </div>
    </div>
  </div>
  <div class="foot">
    <div class="title">Voyage 不可用时回退 rules rerank，保证检索链路稳定返回</div>
    <div>RERANK</div>
  </div>
</section>

<section class="slide light">
  <div class="chrome">
    <div>Context Quality · 上下文质量控制</div>
    <div>06 / 08</div>
  </div>
  <div class="frame" style="padding-top:5vh">
    <div class="kicker">重排之后，继续处理上下文可用性</div>
    <h2 class="h-xl" style="font-size:5vw">从命中 chunk 到可消费证据</h2>
    <div class="grid-2-6-6" style="margin-top:4.4vh;gap:4.2vw">
      <div>
        <h3 class="h-md">质量控制的核心思路</h3>
        <p class="body-zh" style="margin-top:2vh">
          重排解决的是“谁更相关”，但最终给 Agent/Chat 的上下文还要处理相关性边界、重复内容和片段连续性。因此在排序之后继续做阈值过滤、MMR 去重、邻近 chunk 扩展和 context builder，把候选结果整理成可直接消费的上下文。
        </p>
        <div class="callout" style="margin-top:2.8vh">
          <span class="q-big">输出不只是一组 chunk id，而是 contexts、llmContext 和 references。</span><br>
          contexts 保留结构化字段，llmContext 可直接拼进 Prompt，references 与 [ref_n] 对齐用于来源追踪。
          <span class="cite">score-threshold.ts · mmr.ts · context-expander.ts · context-builder.ts</span>
        </div>
      </div>
      <div style="display:grid;grid-template-rows:repeat(3,1fr);gap:2vh">
        <div class="stat-card"><div class="stat-label">01 · Threshold Filtering</div><div class="stat-nb" style="font-family:var(--serif-zh);font-size:2.55vw">阈值过滤</div><div class="stat-note">用 minScore 过滤低相关候选；当结果接近边界时，通过 fallback top1 保留最可能有用的一条证据。</div></div>
        <div class="stat-card"><div class="stat-label">02 · MMR Deduplication</div><div class="stat-nb" style="font-family:var(--serif-zh);font-size:2.55vw">MMR 去重</div><div class="stat-note">结合相关性和 chunk embedding 相似度选择 anchor chunk，减少相似片段重复占用上下文窗口。</div></div>
        <div class="stat-card"><div class="stat-label">03 · Adjacent Expansion</div><div class="stat-nb" style="font-family:var(--serif-zh);font-size:2.55vw">邻近 chunk 扩展</div><div class="stat-note">围绕命中 chunk 补充前后文，再由 Context Builder 合并连续片段并生成 references。</div></div>
      </div>
    </div>
  </div>
  <div class="foot">
    <div class="title">最终输出从“检索候选”整理为“可消费、可追踪的上下文”</div>
    <div>CONTEXT</div>
  </div>
</section>

<section class="slide dark">
  <div class="chrome">
    <div>Knowledge Detail · 管理端知识定位</div>
    <div>07 / 08</div>
  </div>
  <div class="frame" style="padding-top:5vh">
    <div class="kicker">知识组织简单带过，但它服务联调和维护</div>
    <h2 class="h-xl" style="font-size:5.1vw">搜索、筛选、高亮、跳转</h2>
    <p class="lead" style="max-width:78vw;margin-top:2vh">
      详情页搜索和筛选不是正式问答链路，但能帮助团队快速定位某个关键词是否入库、命中了哪个 chunk、分类和标签是否符合预期。
    </p>
    <div class="grid-4" style="margin-top:5vh;gap:3vh 5vw">
      <div class="stat-card"><div class="stat-label">Search Box</div><div class="stat-nb" style="font-family:var(--serif-zh);font-size:2.8vw">当前知识库内搜索</div><div class="stat-note">搜索文档标题、文件名、chunk title、chunk content。</div></div>
      <div class="stat-card"><div class="stat-label">Highlight</div><div class="stat-nb" style="font-family:var(--serif-zh);font-size:2.8vw">关键词高亮</div><div class="stat-note">搜索结果和 chunk 原文中持续高亮命中词。</div></div>
      <div class="stat-card"><div class="stat-label">Jump</div><div class="stat-nb" style="font-family:var(--serif-zh);font-size:2.8vw">点击定位 chunk</div><div class="stat-note">点击结果自动展开文档或 chunk 弹窗，滚动到对应位置。</div></div>
      <div class="stat-card"><div class="stat-label">Filter Bar</div><div class="stat-nb" style="font-family:var(--serif-zh);font-size:2.8vw">条件筛选</div><div class="stat-note">按内容类型、审核状态、AI 分类、AI 标签筛选，并高亮命中 badge。</div></div>
    </div>
  </div>
  <div class="foot">
    <div class="title">代码：knowledge-search-box.tsx · search-highlight.tsx · knowledge-base-detail-filter-bar.tsx</div>
    <div>UI POSITIONING</div>
  </div>
</section>

<section class="slide hero light">
  <div class="chrome">
    <div>Takeaways · 贡献总结与未来展望</div>
    <div>08 / 08</div>
  </div>
  <div class="frame" style="padding-top:5.2vh">
    <div class="kicker">Closing</div>
    <h2 class="h-xl" style="font-size:5.2vw">贡献总结与未来展望</h2>
    <p class="lead" style="max-width:82vw;margin-top:2vh">
      我的工作主要围绕 RAG 检索与知识定位：把上游生产出的知识 chunk 经过 query rewrite、多路召回、RRF 融合、Voyage + rules 重排、阈值过滤、MMR 去重和邻近扩展，组织成下游 Agent/Chat 可以消费的 contexts、llmContext 和 references。
      <br>同时维护本地 ChunkEmbedding 向量索引，并在知识库详情页提供搜索、筛选、关键词高亮和点击跳转，辅助团队检查知识入库质量和检索命中情况。
    </p>
    <div style="margin-top:3.6vh">
      <h3 class="h-md">可优化空间与后续方向</h3>
      <div class="rowline" style="margin-top:2.4vh"><div class="k">索引规模</div><div>当前 SQLite 本地向量表适合训练营部署；后续可接入 PGVector、Qdrant 或 Milvus，并补充异步重算、失败重试和索引状态监控</div><div class="meta">scale</div></div>
      <div class="rowline"><div class="k">效果评估</div><div>当前主要通过接口和手工 case 验证链路；后续沉淀标准 eval cases，用 Hit@K、Recall@K、MRR@K 量化比较不同策略效果</div><div class="meta">eval</div></div>
      <div class="rowline"><div class="k">上下文预算</div><div>当前主要按字符长度和固定窗口控制上下文；后续可引入 token 级预算、上下文压缩和更细粒度的 block 合并策略</div><div class="meta">context</div></div>
      <div class="rowline"><div class="k">策略闭环</div><div>当前参数以配置化为主；后续可结合真实 query 日志、命中反馈和检索 trace，动态调优召回权重、rerank 权重、阈值与扩展窗口</div><div class="meta">tuning</div></div>
    </div>
  </div>
  <div class="foot">
    <div class="title">完整 RAG pipeline · 向量索引生命周期维护 · 管理端知识定位体验</div>
    <div>NEXT</div>
  </div>
</section>
`;

let html = fs.readFileSync(templatePath, "utf8");

html = html
  .split(/\r?\n/)
  .filter((line) => {
    return !line.includes("fonts.googleapis.com")
      && !line.includes("fonts.gstatic.com")
      && !line.includes("unpkg.com/lucide")
      && !line.includes("lucide.createIcons()");
  })
  .join("\n");

html = html.replace(/<title>[\s\S]*?<\/title>/, "<title>RAG 检索与知识定位 · 靛蓝瓷版</title>");
html = html.replace(
  /--ink:#[0-9a-fA-F]+;\s*--ink-rgb:[^;]+;\s*--paper:#[0-9a-fA-F]+;\s*--paper-rgb:[^;]+;\s*--paper-tint:#[0-9a-fA-F]+;\s*--ink-tint:#[0-9a-fA-F]+;/,
  "--ink:#0a1f3d;\n    --ink-rgb:10,31,61;\n    --paper:#f1f3f5;\n    --paper-rgb:241,243,245;\n    --paper-tint:#e4e8ec;\n    --ink-tint:#152a4a;"
);
html = html.replace("<!-- SLIDES_HERE -->", slides);
html = html.replace(/let motion;\s*try \{[\s\S]*?\}\s*\n\s*if\(motion\)\{/, "let motion = null;\nif(motion){");

if (html.includes("[必填]")) {
  throw new Error("Deck still contains required placeholders.");
}

fs.writeFileSync(path.join(outDir, "index.html"), html, "utf8");
console.log(path.join(outDir, "index.html"));
