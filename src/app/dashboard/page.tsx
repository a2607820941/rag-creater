import { AdminShell } from "@/components/layout/admin-shell";
import { InsightCard } from "@/features/analytics/components/insight-card";
import { KnowledgeProductionActivity } from "@/features/analytics/components/knowledge-production-activity";
import { MyAgents } from "@/features/analytics/components/my-agents";
import { PendingWorkloadCard } from "@/features/analytics/components/pending-workload-card";
import { PlaceholderPanel } from "@/features/analytics/components/placeholder-panel";
import { SourceDistributionPie } from "@/features/analytics/components/source-distribution-pie";
import { UsageTrendChart } from "@/features/analytics/components/usage-trend-chart";
import { getAnalyticsOverview } from "@/server/services/analytics.service";

export const dynamic = "force-dynamic";

function getGreeting() {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 11) return "早上好";
  if (hour >= 11 && hour < 14) return "中午好";
  if (hour >= 14 && hour < 18) return "下午好";
  return "晚上好";
}

export default async function DashboardPage() {
  const overview = await getAnalyticsOverview();
  const greeting = getGreeting();
  const hotKnowledgeItems = overview.hotKnowledge.map((item) => ({
    id: item.knowledgeId,
    title: item.title,
    meta: `${item.hitCount.toLocaleString("zh-CN")} 次命中`,
  }));
  const knowledgeGapItems = overview.knowledgeGaps.slice(0, 3).map((item) => ({
    id: item.query,
    title: item.query,
    meta: `${item.count.toLocaleString("zh-CN")} 次未命中`,
  }));

  return (
    <AdminShell>
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
            {greeting}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">今天想探索什么知识呢</p>
        </div>

        <InsightCard items={overview.insights} />

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <KnowledgeProductionActivity
            documents={overview.recentDocuments}
            knowledge={overview.recentKnowledge}
          />
          <MyAgents agents={overview.recentAgents} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <UsageTrendChart days={overview.usageTrend} />
          <PlaceholderPanel
            title="热门知识排行"
            emptyText="暂无热门知识数据"
            items={hotKnowledgeItems}
          />
        </div>

        <div className="mt-6 grid items-start gap-6 lg:h-[560px] lg:grid-cols-[1.35fr_1fr] lg:items-stretch">
          <SourceDistributionPie items={overview.sourceDistribution} />
          <div className="grid gap-6 lg:h-full lg:grid-rows-[minmax(0,1fr)_auto]">
            <PlaceholderPanel
              title="知识缺口"
              emptyText="暂无知识缺口数据"
              items={knowledgeGapItems}
              className="lg:h-full lg:overflow-hidden"
            />
            <PendingWorkloadCard
              workload={overview.pendingWorkload}
              className="lg:overflow-hidden"
            />
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
