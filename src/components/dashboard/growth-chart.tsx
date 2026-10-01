import {
  Area,
  AreaChart,
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
import { compactNumber, fullNumber, shortDate } from "@/lib/format";
import type { GrowthPoint } from "@/lib/analytics-types";
import { eraMarkers } from "@/lib/eras";
import { EraCaption } from "@/components/dashboard/era-caption";

/**
 * Follower growth, one point per stored sync. The y-axis is deliberately NOT
 * zero-based: follower counts move by tens against a base of thousands, and a
 * zero baseline would flatten every real change into a straight line.
 */
export function GrowthChart({
  points,
  color,
  eras = [],
}: {
  points: GrowthPoint[];
  color: string;
  /** T58 — confirmed eras, drawn as dashed lines where they begin. */
  eras?: Array<{ startsAt: string; label: string }>;
}) {
  if (points.length < 2) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm font-medium">The growth curve starts here</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
          Scraping returns today&rsquo;s follower count, not history. Each sync stores one point
          &mdash; after a few days of two-hourly syncs this becomes a real trend line.
          {points.length === 1 ? " One point recorded so far." : " No points recorded yet."}
        </p>
      </div>
    );
  }

  const config: ChartConfig = { followers: { label: "Followers", color } };
  const values = points.map((point) => point.followers);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(Math.round((max - min) * 0.15), 5);
  const { markers, spansWhole } = eraMarkers(
    points.map((point) => point.capturedAt),
    eras,
  );

  return (
    <>
      <ChartContainer
        config={config}
        className="aspect-auto h-[240px] w-full"
        aria-label="Follower growth"
      >
        <ResponsiveContainer>
          <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="growth-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="capturedAt"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              minTickGap={28}
              tickFormatter={shortDate}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={56}
              domain={[Math.max(0, min - pad), max + pad]}
              tickFormatter={(value: number) => compactNumber(value)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => shortDate(String(value))}
                  formatter={(value) => [`${fullNumber(Number(value))}  `, "Followers"]}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="followers"
              stroke={color}
              strokeWidth={2}
              fill="url(#growth-fill)"
              isAnimationActive={false}
            />
            {markers.map((marker) => (
              <ReferenceLine
                key={marker.startsAt}
                x={marker.x}
                stroke="currentColor"
                strokeOpacity={0.45}
                strokeDasharray="4 4"
                label={{
                  value: marker.label,
                  position: "insideTopRight",
                  fontSize: 11,
                  fill: "currentColor",
                  opacity: 0.7,
                }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </ChartContainer>
      <EraCaption markers={markers} spansWhole={spansWhole} />
    </>
  );
}
