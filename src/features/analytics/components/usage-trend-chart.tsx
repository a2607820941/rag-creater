"use client";

import { useMemo, useState } from "react";

type UsageTrendDay = {
  date: string;
  questionCount: number;
  knowledgeCount: number;
};

type UsageTrendChartProps = {
  days: UsageTrendDay[];
};

type ChartPoint = UsageTrendDay & {
  x: number;
  questionY: number;
  knowledgeY: number;
};

const CHART_WIDTH = 640;
const CHART_HEIGHT = 220;
const PADDING_X = 28;
const PADDING_Y = 24;

function formatDateLabel(date: string): string {
  return new Date(date).toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}

function toPolyline(points: ChartPoint[], key: "questionY" | "knowledgeY") {
  return points.map((point) => `${point.x},${point[key]}`).join(" ");
}

export function UsageTrendChart({ days }: UsageTrendChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const points = useMemo<ChartPoint[]>(() => {
    const maxValue = Math.max(
      ...days.flatMap((day) => [day.questionCount, day.knowledgeCount]),
      1
    );
    const innerWidth = CHART_WIDTH - PADDING_X * 2;
    const innerHeight = CHART_HEIGHT - PADDING_Y * 2;
    const denominator = Math.max(days.length - 1, 1);

    return days.map((day, index) => {
      const x = PADDING_X + (innerWidth / denominator) * index;
      const questionY =
        PADDING_Y + innerHeight * (1 - day.questionCount / maxValue);
      const knowledgeY =
        PADDING_Y + innerHeight * (1 - day.knowledgeCount / maxValue);

      return {
        ...day,
        x,
        questionY,
        knowledgeY,
      };
    });
  }, [days]);

  const activePoint = activeIndex === null ? null : points[activeIndex];
  const totalQuestions = days.reduce((total, day) => total + day.questionCount, 0);
  const totalKnowledge = days.reduce((total, day) => total + day.knowledgeCount, 0);

  return (
    <section className="relative h-full min-h-[320px] rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">使用趋势</h2>
          <p className="mt-1 text-sm text-zinc-500">
            近 7 天提问次数与新增知识变化
          </p>
        </div>
        <div className="flex shrink-0 gap-3 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-600" />
            提问 {totalQuestions.toLocaleString("zh-CN")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-cyan-500" />
            知识 {totalKnowledge.toLocaleString("zh-CN")}
          </span>
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="h-[220px] w-full overflow-visible"
          role="img"
          aria-label="近 7 天使用趋势"
        >
          {[0, 1, 2].map((line) => {
            const y = PADDING_Y + ((CHART_HEIGHT - PADDING_Y * 2) / 2) * line;
            return (
              <line
                key={line}
                x1={PADDING_X}
                x2={CHART_WIDTH - PADDING_X}
                y1={y}
                y2={y}
                stroke="#e4e4e7"
                strokeDasharray="4 6"
              />
            );
          })}

          <polyline
            points={toPolyline(points, "questionY")}
            fill="none"
            stroke="#2563eb"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
          <polyline
            points={toPolyline(points, "knowledgeY")}
            fill="none"
            stroke="#06b6d4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />

          {points.map((point, index) => (
            <g key={point.date}>
              <line
                x1={point.x}
                x2={point.x}
                y1={PADDING_Y}
                y2={CHART_HEIGHT - PADDING_Y}
                stroke={activeIndex === index ? "#a1a1aa" : "transparent"}
              />
              <circle
                cx={point.x}
                cy={point.questionY}
                r={activeIndex === index ? 5 : 4}
                fill="#2563eb"
                stroke="#fff"
                strokeWidth="2"
              />
              <circle
                cx={point.x}
                cy={point.knowledgeY}
                r={activeIndex === index ? 5 : 4}
                fill="#06b6d4"
                stroke="#fff"
                strokeWidth="2"
              />
              <rect
                x={point.x - 24}
                y={0}
                width={48}
                height={CHART_HEIGHT}
                fill="transparent"
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
              />
            </g>
          ))}
        </svg>

        {activePoint ? (
          <div
            className="pointer-events-none absolute z-10 min-w-36 rounded-xl border border-zinc-200 bg-zinc-950 px-3 py-2 text-sm text-white shadow-lg"
            style={{
              left: `${(activePoint.x / CHART_WIDTH) * 100}%`,
              top: `${Math.min(activePoint.questionY, activePoint.knowledgeY)}px`,
              transform: "translate(-50%, -110%)",
            }}
          >
            <p className="font-semibold">{formatDateLabel(activePoint.date)}</p>
            <p className="mt-1 text-blue-200">
              提问次数：{activePoint.questionCount.toLocaleString("zh-CN")} 次
            </p>
            <p className="mt-1 text-cyan-200">
              新增知识：{activePoint.knowledgeCount.toLocaleString("zh-CN")} 条
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-1 flex items-center justify-between text-xs text-zinc-400">
        {days.map((day) => (
          <span key={day.date}>{formatDateLabel(day.date)}</span>
        ))}
      </div>
    </section>
  );
}
