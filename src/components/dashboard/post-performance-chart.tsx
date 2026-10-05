import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { compactNumber, shortDate } from "@/lib/format";
import { engagementsOf, type PostRecord, viewsOf } from "@/lib/analytics-types";
import { eraMarkers } from "@/lib/eras";
import { EraCaption } from "@/components/dashboard/era-caption";

/**
 * Per-post performance, oldest to newest. Bars rather than a line: each post is
 * a discrete event, not a continuous measurement, and the gaps between them
 * carry the cadence story.
 *
 * Posts above 3× the median are tinted with the accent so outliers are findable
 * without reading every bar — the label in the tooltip carries the exact value.
 *
 * T68a — a bar is clickable: it opens the post it stands for. Finding the spike
 * and then not being able to reach the reel behind it was the gap; the whole
 * point of spotting an outlier is going and looking at it. Bars for posts with
 * no stored permalink stay unclickable rather than looking live and doing
 * nothing. Clicking a chart is mouse-only, so it is an addition to the posts
 * table below, which lists every post with a link and is reachable by keyboard.
 */
export function PostPerformanceChart({
  posts,
  color,
  metric,
  eras = [],
}: {
  posts: PostRecord[];
  color: string;
  metric: "views" | "engagements";
  /** T58 — confirmed eras, drawn between the posts either side of each boundary. */
  eras?: Array<{ startsAt: string; label: string }>;
}) {
  const rows = [...posts]
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
    .map((post) => ({
      date: post.publishedAt,
      value: metric === "views" ? viewsOf(post) : engagementsOf(post),
      caption: post.caption.slice(0, 70),
      url: post.url ?? null,
    }));

  if (!rows.length) return null;

  const sorted = [...rows.map((row) => row.value)].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const outlierFloor = mid * 3;

  const label = metric === "views" ? "Views" : "Interactions";
  const openable = rows.some((row) => row.url);

  /** Opens the post a bar stands for. Noop for a post with no stored link. */
  const openPost = (entry: unknown) => {
    const url = (entry as { url?: string | null } | undefined)?.url;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };
  const config: ChartConfig = { value: { label, color } };
  const { markers, spansWhole } = eraMarkers(
    rows.map((row) => row.date),
    eras,
  );

  return (
    <>
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
                  formatter={(value, _name, item) => [
                    `${compactNumber(Number(value))}  `,
                    (item?.payload as { url?: string | null } | undefined)?.url
                      ? `${label} — click to open`
                      : label,
                  ]}
                />
              }
            />
            <Bar
              dataKey="value"
              radius={[3, 3, 0, 0]}
              maxBarSize={28}
              isAnimationActive={false}
              onClick={openPost}
              className={openable ? "cursor-pointer" : ""}
            >
              {rows.map((row, index) => (
                <Cell
                  key={index}
                  fill={color}
                  fillOpacity={row.value >= outlierFloor && outlierFloor > 0 ? 1 : 0.55}
                />
              ))}
            </Bar>
            {markers.map((marker) => (
              <ReferenceLine
                key={marker.startsAt}
                x={marker.x}
                stroke="currentColor"
                strokeOpacity={0.45}
                strokeDasharray="4 4"
                label={{
                  value: marker.label,
                  position: "insideTopLeft",
                  fontSize: 11,
                  fill: "currentColor",
                  opacity: 0.7,
                }}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
      <EraCaption markers={markers} spansWhole={spansWhole} />
    </>
  );
}
