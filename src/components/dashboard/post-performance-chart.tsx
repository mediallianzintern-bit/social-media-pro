import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { compactNumber, shortDate } from "@/lib/format";
import { engagementsOf, type PostRecord, viewsOf } from "@/lib/analytics-types";

/**
 * Per-post performance, oldest to newest. Bars rather than a line: each post is
 * a discrete event, not a continuous measurement, and the gaps between them
 * carry the cadence story.
 *
 * Posts above 3× the median are tinted with the accent so outliers are findable
 * without reading every bar — the label in the tooltip carries the exact value.
 */
export function PostPerformanceChart({
  posts,
  color,
  metric,
}: {
  posts: PostRecord[];
  color: string;
  metric: "views" | "engagements";
}) {
  const rows = [...posts]
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
    .map((post) => ({
      date: post.publishedAt,
      value: metric === "views" ? viewsOf(post) : engagementsOf(post),
      caption: post.caption.slice(0, 70),
    }));

  if (!rows.length) return null;

  const sorted = [...rows.map((row) => row.value)].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const outlierFloor = mid * 3;

  const label = metric === "views" ? "Views" : "Interactions";
  const config: ChartConfig = { value: { label, color } };

  return (
    <ChartContainer
      config={config}
      className="aspect-auto h-[260px] w-full"
      aria-label={`${label} per post`}
    >
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            minTickGap={24}
            tickFormatter={shortDate}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(value: number) => compactNumber(value)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(value) => shortDate(String(value))}
                formatter={(value) => [`${compactNumber(Number(value))}  `, label]}
              />
            }
          />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false}>
            {rows.map((row, index) => (
              <Cell
                key={index}
                fill={color}
                fillOpacity={row.value >= outlierFloor && outlierFloor > 0 ? 1 : 0.55}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
