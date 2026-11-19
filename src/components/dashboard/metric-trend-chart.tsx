// The chart under an account's Summary cards (18 Nov 2026): clicking a card
// (typical views, engagement rate, posts a week) shows that figure over the
// period, one bar per post or per week, with the card's own number drawn as
// a dashed line so the bars read against it. Followers keep GrowthChart.
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { shortDate } from "@/lib/format";

export interface TrendRow {
  date: string;
  value: number;
  /** Shown in the tooltip: a post's opening words, or "Week of 21 Oct". */
  label: string;
  url?: string | null;
}

export function MetricTrendChart({
  rows,
  color,
  name,
  format,
  reference,
}: {
  rows: TrendRow[];
  color: string;
  /** What a bar is, for the tooltip and screen readers: "Views". */
  name: string;
  format: (value: number) => string;
  /** The card's own figure, drawn as a dashed line. */
  reference?: { value: number; label: string } | undefined;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No posts in this period.
      </div>
    );
  }
  const config: ChartConfig = { value: { label: name, color } };
  const openable = rows.some((row) => row.url);
  const openPost = (entry: unknown) => {
    const url = (entry as { url?: string | null } | undefined)?.url;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <ChartContainer config={config} className="aspect-auto h-[240px] w-full" aria-label={name}>
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
            width={56}
            tickFormatter={(value: number) => format(value)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_value, payload) =>
                  (payload?.[0]?.payload as TrendRow | undefined)?.label ?? ""
                }
                formatter={(value, _name, item) => [
                  `${format(Number(value))}  `,
                  (item?.payload as TrendRow | undefined)?.url ? `${name}, click to open` : name,
                ]}
              />
            }
          />
          <Bar
            dataKey="value"
            fill={color}
            fillOpacity={0.75}
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
            isAnimationActive={false}
            onClick={openPost}
            className={openable ? "cursor-pointer" : ""}
          />
          {reference ? (
            <ReferenceLine
              y={reference.value}
              stroke="currentColor"
              strokeOpacity={0.55}
              strokeDasharray="4 4"
              label={{
                value: reference.label,
                position: "insideTopRight",
                fontSize: 11,
                fill: "currentColor",
                opacity: 0.8,
              }}
            />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
