import { prisma } from "@/lib/db";
import { getSourceTypeLabel } from "@/lib/source-type";
import type { UsageLogCreateInput } from "@/features/analytics/analytics.validation";
import { parseAgentKnowledgeScope } from "@/features/agent/agent.validation";

const ACTIVITY_DAYS = 7;
const RECENT_DOCUMENT_LIMIT = 5;
const RECENT_KNOWLEDGE_LIMIT = 5;
const RECENT_AGENT_LIMIT = 3;
const RECENT_USAGE_DAYS = 7;
const UNCATEGORIZED_CATEGORY_ID = "__uncategorized__";

export type AnalyticsOverview = Awaited<ReturnType<typeof getAnalyticsOverview>>;

type StatusCount = {
  status: string;
  count: number;
};

type ActivityDay = {
  date: string;
  count: number;
};

type UsageTrendDay = {
  date: string;
  questionCount: number;
  knowledgeCount: number;
};

type RecentDocumentItem = {
  id: string;
  originalName: string;
  fileType: string;
  status: string;
  chunkCount: number;
  candidatePending: number;
  candidateConfirmed: number;
  createdAt: string;
};

export type DashboardAgent = {
  id: string;
  name: string;
  description: string | null;
  answerStyle: string;
  status: string;
  knowledgeBaseCount: number;
  conversationCount: number;
  updatedAt: string;
};

export type DashboardInsight = {
  id: string;
  title: string;
  description: string;
  tone: "warning" | "positive" | "neutral";
  variant?: "empty";
};

export type SourceDistributionItem = {
  sourceType: string;
  label: string;
  count: number;
};

export type PendingWorkload = {
  pendingDocuments: number;
  failedDocuments: number;
  pendingKnowledge: number;
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  manual: "手动",
  file: "文件",
  url: "链接",
  text: "文本",
  markdown: "Markdown",
  image: "图片",
};

function toReferenceKey(reference: {
  knowledgeBaseId: string;
  knowledgeId: string;
  chunkId: string;
}) {
  return [
    reference.knowledgeBaseId,
    reference.knowledgeId,
    reference.chunkId,
  ].join(":");
}

function normalizeReferences(input: UsageLogCreateInput) {
  const references =
    input.references.length > 0
      ? input.references
      : input.contexts.map((context) => ({
          knowledgeBaseId: context.knowledgeBaseId,
          knowledgeId: context.knowledgeId,
          chunkId: context.chunkId,
          title: context.title,
          chunkType: context.chunkType,
        }));

  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = toReferenceKey(reference);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildActivityDays(documents: { createdAt: Date }[]): ActivityDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const counts = new Map<string, number>();
  for (const document of documents) {
    const key = toDateKey(document.createdAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from({ length: ACTIVITY_DAYS }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (ACTIVITY_DAYS - 1 - index));
    const key = toDateKey(date);

    return {
      date: key,
      count: counts.get(key) ?? 0,
    };
  });
}

function buildUsageTrendDays(input: {
  usageLogs: { createdAt: Date }[];
  knowledgeChunks: { updatedAt: Date }[];
}): UsageTrendDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const questionCounts = new Map<string, number>();
  for (const log of input.usageLogs) {
    const key = toDateKey(log.createdAt);
    questionCounts.set(key, (questionCounts.get(key) ?? 0) + 1);
  }

  const knowledgeCounts = new Map<string, number>();
  for (const chunk of input.knowledgeChunks) {
    const key = toDateKey(chunk.updatedAt);
    knowledgeCounts.set(key, (knowledgeCounts.get(key) ?? 0) + 1);
  }

  return Array.from({ length: ACTIVITY_DAYS }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (ACTIVITY_DAYS - 1 - index));
    const key = toDateKey(date);

    return {
      date: key,
      questionCount: questionCounts.get(key) ?? 0,
      knowledgeCount: knowledgeCounts.get(key) ?? 0,
    };
  });
}

function normalizeStatusCounts(
  values: Array<{ status: string; _count: { status: number } }>
): StatusCount[] {
  return values.map((item) => ({
    status: item.status,
    count: item._count.status,
  }));
}

function fallbackKnowledgeTitle(chunk: {
  title: string | null;
  content: string;
}): string {
  return chunk.title ?? chunk.content.slice(0, 40);
}

async function getSourceDistribution(): Promise<SourceDistributionItem[]> {
  const groups = await prisma.documentSource.groupBy({
    by: ["sourceType"],
    _count: {
      sourceType: true,
    },
    orderBy: {
      _count: {
        sourceType: "desc",
      },
    },
  });

  return groups.map((group) => ({
    sourceType: group.sourceType,
    label: getSourceTypeLabel(group.sourceType),
    count: group._count.sourceType,
  }));
}

async function getRecentAgents(limit = RECENT_AGENT_LIMIT): Promise<DashboardAgent[]> {
  const items = await prisma.expertAgent.findMany({
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      name: true,
      description: true,
      answerStyle: true,
      knowledgeScope: true,
      status: true,
      updatedAt: true,
    },
  });
  const conversationGroups = await prisma.chatConversation.groupBy({
    by: ["agentId"],
    where: {
      agentId: { in: items.map((agent) => agent.id) },
      status: "active",
    },
    _count: {
      agentId: true,
    },
  });
  const conversationCountByAgentId = new Map(
    conversationGroups
      .filter((group) => group.agentId)
      .map((group) => [group.agentId, group._count.agentId])
  );

  return items.map((agent) => {
    const scope = parseAgentKnowledgeScope(agent.knowledgeScope);

    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      answerStyle: agent.answerStyle,
      status: agent.status,
      knowledgeBaseCount: scope.knowledgeBaseIds.length,
      conversationCount: conversationCountByAgentId.get(agent.id) ?? 0,
      updatedAt: agent.updatedAt.toISOString(),
    };
  });
}

async function getRecentDocuments(
  limit = RECENT_DOCUMENT_LIMIT
): Promise<RecentDocumentItem[]> {
  const documents = await prisma.documentSource.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      originalName: true,
      fileType: true,
      status: true,
      chunkCount: true,
      createdAt: true,
    },
  });

  const candidateGroups = await prisma.documentChunk.groupBy({
    by: ["documentSourceId", "reviewStatus"],
    where: {
      chunkType: "knowledge",
      reviewStatus: {
        not: null,
      },
      documentSourceId: {
        in: documents.map((document) => document.id),
      },
    },
    _count: {
      reviewStatus: true,
    },
  });

  const candidateMap = new Map<
    string,
    { candidatePending: number; candidateConfirmed: number }
  >();

  for (const group of candidateGroups) {
    if (!group.documentSourceId) {
      continue;
    }

    const current = candidateMap.get(group.documentSourceId) ?? {
      candidatePending: 0,
      candidateConfirmed: 0,
    };

    if (group.reviewStatus === "pending") {
      current.candidatePending = group._count.reviewStatus;
    }

    if (group.reviewStatus === "confirmed") {
      current.candidateConfirmed = group._count.reviewStatus;
    }

    candidateMap.set(group.documentSourceId, current);
  }

  return documents.map((document) => {
    const candidateCounts = candidateMap.get(document.id) ?? {
      candidatePending: 0,
      candidateConfirmed: 0,
    };

    return {
      ...document,
      ...candidateCounts,
      createdAt: document.createdAt.toISOString(),
    };
  });
}

function buildDashboardInsights(input: {
  totalDocuments: number;
  documentChunks: number;
  agents: number;
  failedDocuments: number;
  knowledgeGaps: Array<{ query: string; count: number }>;
  pendingKnowledge: number;
  topAgent: { name: string; count: number } | null;
  hotKnowledge: Array<{ title: string; hitCount: number }>;
  usageLogs: number;
}): DashboardInsight[] {
  const hasNoInsightSource =
    input.totalDocuments === 0 &&
    input.documentChunks === 0 &&
    input.agents === 0 &&
    input.usageLogs === 0 &&
    input.knowledgeGaps.length === 0 &&
    input.pendingKnowledge === 0 &&
    input.hotKnowledge.length === 0;

  if (hasNoInsightSource) {
    return [
      {
        id: "empty-insights",
        title: "还没有足够数据生成洞察",
        description:
          "导入文档或开始检索后，系统会自动分析待处理事项、知识缺口和热门内容。",
        tone: "neutral",
        variant: "empty",
      },
    ];
  }

  const actionInsight: DashboardInsight =
    input.failedDocuments > 0
      ? {
          id: "failed-documents",
          title: "发现解析失败文档",
          description: `有 ${input.failedDocuments.toLocaleString("zh-CN")} 个文档解析失败，建议先检查解析错误并重新处理。`,
          tone: "warning",
        }
      : input.knowledgeGaps.length > 0
        ? {
            id: "knowledge-gap",
            title: "发现知识缺口",
            description: `“${input.knowledgeGaps[0].query}”近期出现 ${input.knowledgeGaps[0].count.toLocaleString("zh-CN")} 次未命中，建议补充相关知识。`,
            tone: "warning",
          }
        : input.pendingKnowledge > 0
          ? {
              id: "pending-knowledge",
              title: "候选知识待确认",
              description: `有 ${input.pendingKnowledge.toLocaleString("zh-CN")} 条候选知识等待确认，审核后即可进入正式知识库。`,
              tone: "warning",
            }
          : {
              id: "clear-action",
              title: "暂无明显待处理事项",
              description: "当前没有解析失败、知识缺口或待审核知识。",
              tone: "neutral",
            };

  const usageInsight: DashboardInsight = input.topAgent
    ? {
        id: "top-agent",
        title: "热门 Agent",
        description: `“${input.topAgent.name}”近期使用最频繁，可以优先维护它的知识范围。`,
        tone: "positive",
      }
    : input.hotKnowledge.length > 0
      ? {
          id: "hot-knowledge",
          title: "热门知识",
          description: `“${input.hotKnowledge[0].title}”近期被多次引用，是当前高价值知识。`,
          tone: "positive",
        }
      : input.usageLogs > 0
        ? {
            id: "knowledge-usage",
            title: "知识库正在被使用",
            description: `近期已有 ${input.usageLogs.toLocaleString("zh-CN")} 次检索记录，可以继续关注命中情况。`,
            tone: "positive",
          }
        : {
            id: "no-usage-highlight",
            title: "暂无使用亮点",
            description: "产生 Agent 对话或知识检索后，这里会自动展示热门内容。",
            tone: "neutral",
          };

  return [actionInsight, usageInsight];
}

export async function createUsageLog(
  input: UsageLogCreateInput & {
    source?: string;
    noHit?: boolean;
  }
) {
  const references = normalizeReferences(input);
  const noHit =
    input.noHit ?? (input.contexts.length === 0 && references.length === 0);

  return prisma.usageLog.create({
    data: {
      source: input.source ?? "rag_retrieve",
      query: input.query,
      mode: input.mode,
      scope: JSON.stringify(input.scope),
      hitCount: references.length,
      noHit,
      references: {
        create: references.map((reference) => ({
          knowledgeBaseId: reference.knowledgeBaseId,
          knowledgeId: reference.knowledgeId,
          chunkId: reference.chunkId,
          title: reference.title,
          chunkType: reference.chunkType,
        })),
      },
    },
    include: {
      references: true,
    },
  });
}

export async function getHotKnowledge(limit = 10) {
  // Source: UsageReference. One row means one retrieved knowledge reference.
  const items = await prisma.usageReference.groupBy({
    by: ["knowledgeBaseId", "knowledgeId", "title"],
    _count: {
      knowledgeId: true,
    },
    orderBy: {
      _count: {
        knowledgeId: "desc",
      },
    },
    take: limit,
  });

  return items.map((item) => ({
    knowledgeBaseId: item.knowledgeBaseId,
    knowledgeId: item.knowledgeId,
    title: item.title,
    hitCount: item._count.knowledgeId,
  }));
}

export async function getRecentKnowledge(limit = 10) {
  // KnowledgeDocument was merged into DocumentSource/DocumentChunk.
  // Recent knowledge now comes from knowledge-type DocumentChunk rows.
  const chunks = await prisma.documentChunk.findMany({
    where: {
      chunkType: "knowledge",
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      content: true,
      suggestedCategory: true,
      suggestedTags: true,
      knowledgeType: true,
      reviewStatus: true,
      chunkStatus: true,
      createdAt: true,
      documentSource: {
        select: {
          knowledgeBaseId: true,
          sourceType: true,
          status: true,
        },
      },
    },
  });

  return chunks.map((chunk) => ({
    id: chunk.id,
    knowledgeBaseId: chunk.documentSource?.knowledgeBaseId ?? null,
    title: fallbackKnowledgeTitle(chunk),
    content: chunk.content,
    suggestedCategory: chunk.suggestedCategory,
    suggestedTags: (() => {
      try {
        return chunk.suggestedTags ? JSON.parse(chunk.suggestedTags) : [];
      } catch {
        return [];
      }
    })(),
    type: chunk.knowledgeType ?? "concept",
    sourceType: chunk.documentSource?.sourceType ?? "manual",
    status: chunk.reviewStatus ?? chunk.chunkStatus,
    parseStatus: chunk.documentSource?.status ?? "parsed",
    createdAt: chunk.createdAt.toISOString(),
  }));
}

export async function getCategoryDistribution() {
  // The new schema stores AI-suggested category text on DocumentChunk.
  // There is no formal categoryId relation yet, so distribution is grouped by
  // suggestedCategory and unmatched knowledge chunks are counted as uncategorized.
  const [categories, categoryGroups, uncategorizedCount] = await Promise.all([
    prisma.knowledgeCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.documentChunk.groupBy({
      by: ["suggestedCategory"],
      where: {
        chunkType: "knowledge",
        suggestedCategory: {
          not: null,
        },
      },
      _count: {
        suggestedCategory: true,
      },
      orderBy: {
        _count: {
          suggestedCategory: "desc",
        },
      },
    }),
    prisma.documentChunk.count({
      where: {
        chunkType: "knowledge",
        suggestedCategory: null,
      },
    }),
  ]);

  const categoryMeta = new Map(
    categories.map((category) => [category.name, category])
  );

  const items = categoryGroups.map((group) => {
    const name = group.suggestedCategory ?? "Uncategorized";
    const category = categoryMeta.get(name);

    return {
      categoryId: category?.id ?? name,
      name,
      color: category?.color ?? null,
      count: group._count.suggestedCategory,
    };
  });

  if (uncategorizedCount > 0) {
    items.push({
      categoryId: UNCATEGORIZED_CATEGORY_ID,
      name: "Uncategorized",
      color: null,
      count: uncategorizedCount,
    });
  }

  return items;
}

export async function getKnowledgeGaps(limit = 10) {
  // Source: UsageLog. noHit=true means retrieval found no knowledge.
  const items = await prisma.usageLog.groupBy({
    by: ["query"],
    where: {
      noHit: true,
    },
    _count: {
      query: true,
    },
    orderBy: {
      _count: {
        query: "desc",
      },
    },
    take: limit,
  });

  return items.map((item) => ({
    query: item.query,
    count: item._count.query,
  }));
}

export async function getAnalyticsOverview() {
  const activityStart = new Date();
  activityStart.setHours(0, 0, 0, 0);
  activityStart.setDate(activityStart.getDate() - (ACTIVITY_DAYS - 1));

  const recentUsageStart = new Date();
  recentUsageStart.setHours(0, 0, 0, 0);
  recentUsageStart.setDate(recentUsageStart.getDate() - (RECENT_USAGE_DAYS - 1));

  const [
    totalDocuments,
    parsedDocuments,
    failedDocuments,
    pendingDocuments,
    documentChunks,
    knowledgeBases,
    knowledgeDocuments,
    knowledgeChunks,
    agents,
    activeAgents,
    usageLogs,
    noHitQueries,
    documentStatusGroups,
    agentStatusGroups,
    recentDocuments,
    activityDocuments,
    trendUsageLogs,
    trendKnowledgeChunks,
    hotKnowledge,
    knowledgeGaps,
    pendingKnowledge,
    recentKnowledge,
    sourceDistribution,
    recentAgents,
    topAgentUsageGroups,
  ] = await Promise.all([
    // Document total: unified DocumentSource table.
    prisma.documentSource.count(),
    // Parsed documents: DocumentSource.status.
    prisma.documentSource.count({ where: { status: "parsed" } }),
    // Failed documents can directly drive a next-step insight.
    prisma.documentSource.count({ where: { status: "failed" } }),
    // Pending documents are still moving through import / parsing.
    prisma.documentSource.count({
      where: {
        status: {
          in: ["uploading", "uploaded", "pending", "parsing"],
        },
      },
    }),
    // Document chunks: unified DocumentChunk table.
    prisma.documentChunk.count(),
    // Knowledge bases: KnowledgeBase table.
    prisma.knowledgeBase.count(),
    // Knowledge documents: KnowledgeDocument was merged into DocumentSource.
    prisma.documentSource.count(),
    // Knowledge chunks: knowledge-type rows in unified DocumentChunk.
    prisma.documentChunk.count({ where: { chunkType: "knowledge" } }),
    // Agents: ExpertAgent table.
    prisma.expertAgent.count(),
    // Active agents: ExpertAgent.status.
    prisma.expertAgent.count({ where: { status: "active" } }),
    // Retrieval logs: UsageLog table.
    prisma.usageLog.count(),
    // Knowledge gaps: UsageLog.noHit.
    prisma.usageLog.count({ where: { noHit: true } }),
    // Document status breakdown: DocumentSource.status.
    prisma.documentSource.groupBy({
      by: ["status"],
      _count: { status: true },
      orderBy: { status: "asc" },
    }),
    // Agent status breakdown: ExpertAgent.status.
    prisma.expertAgent.groupBy({
      by: ["status"],
      _count: { status: true },
      orderBy: { status: "asc" },
    }),
    // Recent documents: newest DocumentSource rows.
    getRecentDocuments(RECENT_DOCUMENT_LIMIT),
    // 7-day activity trend: DocumentSource.createdAt.
    prisma.documentSource.findMany({
      where: {
        createdAt: {
          gte: activityStart,
        },
      },
      select: {
        createdAt: true,
      },
    }),
    // 7-day usage trend: one UsageLog row means one user question/retrieval.
    prisma.usageLog.findMany({
      where: {
        createdAt: {
          gte: activityStart,
        },
      },
      select: {
        createdAt: true,
      },
    }),
    // 7-day knowledge trend: only confirmed + active knowledge is counted as usable.
    prisma.documentChunk.findMany({
      where: {
        chunkType: "knowledge",
        reviewStatus: "confirmed",
        chunkStatus: "active",
        updatedAt: {
          gte: activityStart,
        },
      },
      select: {
        updatedAt: true,
      },
    }),
    getHotKnowledge(5),
    getKnowledgeGaps(3),
    // Pending knowledge: pending knowledge-type DocumentChunk rows.
    prisma.documentChunk.count({
      where: {
        chunkType: "knowledge",
        reviewStatus: "pending",
      },
    }),
    getRecentKnowledge(RECENT_KNOWLEDGE_LIMIT),
    getSourceDistribution(),
    getRecentAgents(RECENT_AGENT_LIMIT),
    prisma.chatConversation.groupBy({
      by: ["agentId"],
      where: {
        agentId: { not: null },
        updatedAt: {
          gte: recentUsageStart,
        },
      },
      _count: {
        agentId: true,
      },
      orderBy: {
        _count: {
          agentId: "desc",
        },
      },
      take: 1,
    }),
  ]);

  const topAgentGroup = topAgentUsageGroups[0];
  const topAgentRecord = topAgentGroup?.agentId
    ? await prisma.expertAgent.findUnique({
        where: {
          id: topAgentGroup.agentId,
        },
        select: {
          name: true,
        },
      })
    : null;
  const topAgent =
    topAgentGroup && topAgentRecord
      ? {
          name: topAgentRecord.name,
          count: topAgentGroup._count.agentId,
        }
      : null;

  return {
    totals: {
      documents: totalDocuments,
      parsedDocuments,
      documentChunks,
      knowledgeBases,
      knowledgeDocuments,
      knowledgeChunks,
      agents,
      activeAgents,
      usageLogs,
      noHitQueries,
      pendingKnowledge,
    },
    pendingWorkload: {
      pendingDocuments,
      failedDocuments,
      pendingKnowledge,
    },
    statusBreakdown: {
      documents: normalizeStatusCounts(documentStatusGroups),
      agents: normalizeStatusCounts(agentStatusGroups),
    },
    recentDocuments,
    documentActivity: buildActivityDays(activityDocuments),
    usageTrend: buildUsageTrendDays({
      usageLogs: trendUsageLogs,
      knowledgeChunks: trendKnowledgeChunks,
    }),
    insights: buildDashboardInsights({
      totalDocuments,
      documentChunks,
      agents,
      failedDocuments,
      knowledgeGaps,
      pendingKnowledge,
      topAgent,
      hotKnowledge,
      usageLogs,
    }),
    hotKnowledge,
    knowledgeGaps,
    recentKnowledge,
    sourceDistribution,
    recentAgents,
  };
}
