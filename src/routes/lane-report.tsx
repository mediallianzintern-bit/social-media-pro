// The content-lane report — every reel in each lane, with its metrics, between
// two dates, and a PDF of it.
//
// Outside the _app layout for the same reason as /report: it is a page that
// leaves the agency as a PDF, so it carries no navigation or sync controls.
// The controls it does have (dates, download) are hidden when printed.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Download, X } from "lucide-react";
import { useEffect } from "react";
import { z } from "zod";

import { Wordmark } from "@/components/brand";
import { GoToLogin } from "@/components/auth/go-to";
import { BackButton } from "@/components/nav/back-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dateTime, fullNumber, TIME_ZONE } from "@/lib/format";
import {
  LANE_METRIC_LABEL,
  LANE_METRICS,
  metricMedian,
  metricOf,
  vsMedian,
  type LaneMetric,
  type LaneReportLane,
  type LaneReportReel,
} from "@/lib/lane-report";
import { laneReportQueryOptions } from "@/lib/lane-report.functions";
import { PLATFORM_META } from "@/lib/platform-meta";
import { currentStaffEmail } from "@/lib/session";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** IST is UTC+5:30: India has no daylight saving, so a fixed offset is exact. */
const IST_OFFSET_MS = 330 * 60_000;

/** "YYYY-MM-DD" for the day `days` before today, in India. */
function daysAgo(days: number): string {
  return new Date(Date.now() + IST_OFFSET_MS - days * 86_400_000).toISOString().slice(0, 10);
}

/** Far enough back to include every stored post. */
const ALL_TIME = "2015-01-01";

const PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All time", days: null },
] as const;

export const Route = createFileRoute("/lane-report")({
  ssr: false,
  validateSearch: z.object({
    platform: z.enum(["instagram", "linkedin"]).catch("instagram").default("instagram"),
    from: z
      .string()
      .regex(DAY)
      .catch(() => daysAgo(29))
      .default(() => daysAgo(29)),
    to: z
      .string()
      .regex(DAY)
      .catch(() => daysAgo(0))
      .default(() => daysAgo(0)),
    /** What "vs median" compares on. In the URL, so a shared link keeps it. */
    // Absent means the full table, compared by views.
    metric: z.enum(LANE_METRICS).optional().catch(undefined),
  }),
  beforeLoad: async ({ location }) => ({
    staffEmail: await currentStaffEmail(),
    returnTo: location.href,
  }),
  loaderDeps: ({ search }) => ({ platform: search.platform, from: search.from, to: search.to }),
  component: LaneReportGate,
  loader: ({ context, deps }) =>
    context.staffEmail ? context.queryClient.ensureQueryData(laneReportQueryOptions(deps)) : null,
});

function LaneReportGate() {
  const { staffEmail, returnTo } = Route.useRouteContext();
  if (!staffEmail) return <GoToLogin returnTo={returnTo} />;
  return <LaneReportPage />;
}

/**
 * "5 Oct 2026": the year matters in a report that can span several. A bare
 * date is a calendar day; a timestamp is the day it was in India.
 */
function day(iso: string): string {
  const bare = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  return new Date(bare ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: bare ? "UTC" : TIME_ZONE,
  });
}

const dash = <span className="text-muted-foreground">–</span>;

/** A metric's value as the reader sees it in a "÷" sum. */
function metricValue(value: number, metric: LaneMetric): string {
  return metric === "watch" ? `${exact(value)}s` : exact(value);
}

/**
 * A measured figure, never rounded. Every input is a whole count or a whole
 * number of milliseconds, so a median is at most four decimals (half of a
 * thousandth of a second) and this shows it in full, without trailing zeros.
 */
function exact(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
}

/**
 * A share or a multiple: a division, which often never ends (31 ÷ 54 is
 * 0.574074…). Shown to two decimals, with the exact sum written under it.
 */
function ratio(numerator: number, denominator: number, asPercent: boolean) {
  if (denominator <= 0) return dash;
  const value = (numerator / denominator) * (asPercent ? 100 : 1);
  return (
    <>
      {value.toFixed(2)}
      {asPercent ? "%" : "×"}
      <span className="block text-xs tabular-nums text-muted-foreground">
        {exact(numerator)} ÷ {exact(denominator)}
      </span>
    </>
  );
}

function multiple(value: number | null) {
  if (value === null) return dash;
  const tone =
    value >= 1.5
      ? "text-emerald-700 dark:text-emerald-400"
      : value < 0.75
        ? "text-rose-700 dark:text-rose-400"
        : "";
  return <span className={`font-medium tabular-nums ${tone}`}>{value.toFixed(2)}×</span>;
}

/** The columns of "Lanes at a glance", besides the lane, its count and vs median. */
type GlanceColumn = "output" | "interactionShare" | LaneMetric;

const COLUMN_LABEL: Record<GlanceColumn, string> = {
  output: "Share of output",
  interactionShare: "Share of interactions",
  views: "Median views",
  interactions: "Median interactions",
  saves: "Median saves",
  watch: "Median watch",
};

/** No metric picked: every column, as the table has always been. */
const ALL_COLUMNS: GlanceColumn[] = [
  "output",
  "interactionShare",
  "views",
  "interactions",
  "saves",
  "watch",
];

/** A metric picked: only the columns that belong with it. */
const FOCUS_COLUMNS: Record<LaneMetric, GlanceColumn[]> = {
  views: ["output", "views", "watch"],
  interactions: ["output", "interactionShare", "interactions"],
  saves: ["output", "saves"],
  watch: ["output", "watch", "views"],
};

function LaneReportPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/lane-report" });
  const { data } = useSuspenseQuery(
    laneReportQueryOptions({ platform: search.platform, from: search.from, to: search.to }),
  );
  // What the person picked, if anything; and what vs median compares on,
  // which is views until they pick something else.
  const chosen = search.metric;
  const metric: LaneMetric = chosen ?? "views";
  const columns = chosen ? FOCUS_COLUMNS[chosen] : ALL_COLUMNS;
  const setMetric = (next: LaneMetric | undefined) =>
    void navigate({ search: (prev) => ({ ...prev, metric: next }), replace: true });
  // The typical reel across every lane in these dates, on the chosen metric:
  // the one number every "vs median" below is divided by.
  const allReels = data.lanes.flatMap((lane) => lane.reels);
  const allInteractions = allReels.reduce(
    (sum, reel) => sum + (metricOf(reel, "interactions") ?? 0),
    0,
  );
  const typical = metricMedian(allReels, metric);
  const meta = PLATFORM_META[search.platform];
  const unit = search.platform === "instagram" ? "reel" : "post";

  // Printed in light mode whatever the screen uses, as /report does.
  useEffect(() => {
    const root = document.documentElement;
    let wasDark = false;
    const before = () => {
      wasDark = root.classList.contains("dark");
      if (wasDark) root.classList.remove("dark");
    };
    const after = () => {
      if (wasDark) root.classList.add("dark");
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  const setDates = (from: string, to: string) =>
    void navigate({ search: (prev) => ({ ...prev, from, to }) });

  const metricWord = LANE_METRIC_LABEL[metric].toLowerCase();

  return (
    <main data-report className="mx-auto max-w-5xl space-y-10 px-4 py-10 sm:py-14 print:py-0">
      <header className="space-y-3">
        <BackButton fallback={`/${search.platform}`} label="Back to dashboard" />
        <Wordmark className="mb-5 h-7" />
        <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
          <div className="flex flex-wrap items-end gap-2">
            <div
              role="group"
              aria-label="Reporting period"
              className="inline-flex items-center gap-1 rounded-lg border bg-card p-1"
            >
              {PRESETS.map((preset) => {
                // Today counts, as on the dashboard: 7 days is today and the 6 before.
                const from = preset.days === null ? ALL_TIME : daysAgo(preset.days - 1);
                const active = search.from === from && search.to === daysAgo(0);
                return (
                  <Button
                    key={preset.label}
                    size="sm"
                    variant={active ? "secondary" : "ghost"}
                    aria-pressed={active}
                    onClick={() => setDates(from, daysAgo(0))}
                  >
                    {preset.label}
                  </Button>
                );
              })}
            </div>
            <label className="grid gap-1 text-xs text-muted-foreground">
              From
              <Input
                type="date"
                className="h-9 w-40"
                value={search.from}
                max={search.to}
                onChange={(event) =>
                  DAY.test(event.target.value) && setDates(event.target.value, search.to)
                }
              />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              To
              <Input
                type="date"
                className="h-9 w-40"
                value={search.to}
                min={search.from}
                onChange={(event) =>
                  DAY.test(event.target.value) && setDates(search.from, event.target.value)
                }
              />
            </label>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.print()}>
            <Download className="size-3.5" aria-hidden />
            Download PDF
          </Button>
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Content lane report</h1>
        <p className="text-sm font-medium">
          @{data.handle} on {meta.label} · {day(data.from)} to {day(data.to)}
        </p>
        <p className="text-sm text-muted-foreground">
          {data.reelCount} {unit}
          {data.reelCount === 1 ? "" : "s"} published in these dates, across {data.lanes.length}{" "}
          lane{data.lanes.length === 1 ? "" : "s"}. Generated {dateTime(data.generatedAt)}.
        </p>
        {data.unlabelled ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {data.unlabelled} {unit}
            {data.unlabelled === 1 ? " has" : "s have"} no lane yet, so{" "}
            {data.unlabelled === 1 ? "it is" : "they are"} not counted below. Press Sync on the
            dashboard to file {data.unlabelled === 1 ? "it" : "them"} into a lane.
          </p>
        ) : null}
      </header>

      {data.lanes.length ? (
        <>
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Lanes at a glance</h2>
              <div className="flex items-center gap-1 text-sm text-muted-foreground print:hidden">
                <span className="mr-1">Compare by</span>
                <Select
                  value={chosen ?? ""}
                  onValueChange={(value) => setMetric(value as LaneMetric)}
                >
                  <SelectTrigger className="h-9 w-40" aria-label="Compare by">
                    <SelectValue placeholder="All metrics" />
                  </SelectTrigger>
                  <SelectContent>
                    {LANE_METRICS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {LANE_METRIC_LABEL[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {chosen ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-9"
                    onClick={() => setMetric(undefined)}
                    aria-label="Clear Compare by and show every metric"
                    title="Clear: show every metric"
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                ) : null}
              </div>
            </div>
            <p className="text-sm">
              Compared by <span className="font-medium">{metricWord}</span>.{" "}
              {typical !== null ? (
                <>
                  The typical {unit} in these dates has{" "}
                  <span className="font-medium tabular-nums">
                    {metricValue(typical, metric)}
                    {metric === "watch" ? " of watch time" : ` ${metricWord}`}
                  </span>
                  , so &ldquo;vs median&rdquo; is each lane&rsquo;s typical {unit} ÷{" "}
                  {metricValue(typical, metric)}.
                </>
              ) : (
                <>No {unit} in these dates has this measured, so there is nothing to compare.</>
              )}
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Lane</th>
                    <th className="px-3 py-2 text-right font-medium">
                      {unit[0]!.toUpperCase() + unit.slice(1)}s
                    </th>
                    {columns.map((column) => (
                      <th key={column} className="px-3 py-2 text-right font-medium">
                        {COLUMN_LABEL[column]}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium">
                      vs median
                      <span className="block font-normal">({metricWord})</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.lanes.map((lane) => {
                    const laneTypical = metricMedian(lane.reels, metric);
                    const laneInteractions = lane.reels.reduce(
                      (sum, reel) => sum + (metricOf(reel, "interactions") ?? 0),
                      0,
                    );
                    const medianOf = (which: LaneMetric) => {
                      const value = metricMedian(lane.reels, which);
                      return value === null ? dash : metricValue(value, which);
                    };
                    return (
                      <tr key={lane.lane} className="border-t">
                        <td className="px-3 py-2 font-medium capitalize">
                          {lane.lane}
                          {lane.directional ? (
                            <Badge variant="outline" className="ml-2 font-normal">
                              few {unit}s
                            </Badge>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{lane.postCount}</td>
                        {columns.map((column) => (
                          <td key={column} className="px-3 py-2 text-right tabular-nums">
                            {column === "output"
                              ? ratio(lane.reels.length, allReels.length, true)
                              : column === "interactionShare"
                                ? ratio(laneInteractions, allInteractions, true)
                                : medianOf(column)}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right">
                          {multiple(vsMedian(laneTypical, typical))}
                          {laneTypical !== null && typical ? (
                            <span className="block text-xs tabular-nums text-muted-foreground">
                              {metricValue(laneTypical, metric)} ÷ {metricValue(typical, metric)}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              &ldquo;Typical&rdquo; is the median: the middle {unit} when they are put in order, or
              the average of the middle two. 1.0× is typical, 2.0× is twice the typical {unit}.
              Interactions are likes + comments + shares. Saves and watch time come from
              Instagram&rsquo;s own figures and only count the {unit}s they were measured on.
            </p>
          </section>

          {data.lanes.map((lane) => (
            <LaneSection
              key={lane.lane}
              lane={lane}
              unit={unit}
              metric={metric}
              typical={typical}
            />
          ))}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No {unit}s with a lane were published in these dates. Try a wider range.
        </p>
      )}

      <footer className="border-t pt-6">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Every figure is measured, not estimated: views, likes, comments and shares as the platform
          reports them, at the last sync. Pinned posts are left out, because they collect views for
          months and would distort every comparison.
        </p>
      </footer>
    </main>
  );
}

function LaneSection({
  lane,
  unit,
  metric,
  typical,
}: {
  lane: LaneReportLane;
  unit: string;
  metric: LaneMetric;
  typical: number | null;
}) {
  const laneVs = vsMedian(metricMedian(lane.reels, metric), typical);
  const hasSaves = lane.reels.some((reel) => reel.saves !== undefined);
  const hasReach = lane.reels.some((reel) => reel.reach !== undefined);
  const hasWatch = lane.reels.some((reel) => reel.avgWatchSeconds !== undefined);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold capitalize">{lane.lane}</h2>
        <span className="text-sm text-muted-foreground">
          {lane.postCount} {unit}
          {lane.postCount === 1 ? "" : "s"} · {fullNumber(lane.totalViews)} views ·{" "}
          {fullNumber(lane.totalInteractions)} interactions
          {laneVs !== null
            ? ` · typical ${unit} ${laneVs.toFixed(2)}× median ${LANE_METRIC_LABEL[metric].toLowerCase()}`
            : ""}
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">{unit[0]!.toUpperCase() + unit.slice(1)}</th>
              <th className="px-3 py-2 text-right font-medium">Views</th>
              <th className="px-3 py-2 text-right font-medium">Likes</th>
              <th className="px-3 py-2 text-right font-medium">Comments</th>
              <th className="px-3 py-2 text-right font-medium">Shares</th>
              {hasSaves ? <th className="px-3 py-2 text-right font-medium">Saves</th> : null}
              {hasReach ? <th className="px-3 py-2 text-right font-medium">Reach</th> : null}
              {hasWatch ? <th className="px-3 py-2 text-right font-medium">Avg watch</th> : null}
              <th className="px-3 py-2 text-right font-medium">
                vs median
                <span className="block font-normal">
                  ({LANE_METRIC_LABEL[metric].toLowerCase()})
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lane.reels.map((reel) => (
              <ReelRow
                key={reel.postId}
                reel={reel}
                metric={metric}
                typical={typical}
                hasSaves={hasSaves}
                hasReach={hasReach}
                hasWatch={hasWatch}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReelRow({
  reel,
  metric,
  typical,
  hasSaves,
  hasReach,
  hasWatch,
}: {
  reel: LaneReportReel;
  metric: LaneMetric;
  typical: number | null;
  hasSaves: boolean;
  hasReach: boolean;
  hasWatch: boolean;
}) {
  return (
    <tr className="border-t align-top [break-inside:avoid]">
      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
        {day(reel.publishedAt)}
      </td>
      <td className="px-3 py-2">
        {reel.url ? (
          <a
            href={reel.url}
            target="_blank"
            rel="noreferrer"
            className="underline-offset-2 hover:underline"
          >
            {reel.title}
          </a>
        ) : (
          reel.title
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {reel.views ? fullNumber(reel.views) : dash}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{fullNumber(reel.likes)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fullNumber(reel.comments)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fullNumber(reel.shares)}</td>
      {hasSaves ? (
        <td className="px-3 py-2 text-right tabular-nums">
          {reel.saves !== undefined ? fullNumber(reel.saves) : dash}
        </td>
      ) : null}
      {hasReach ? (
        <td className="px-3 py-2 text-right tabular-nums">
          {reel.reach !== undefined ? fullNumber(reel.reach) : dash}
        </td>
      ) : null}
      {hasWatch ? (
        <td className="px-3 py-2 text-right tabular-nums">
          {reel.avgWatchSeconds !== undefined ? `${exact(reel.avgWatchSeconds)}s` : dash}
        </td>
      ) : null}
      <td className="px-3 py-2 text-right">
        {multiple(vsMedian(metricOf(reel, metric) ?? null, typical))}
      </td>
    </tr>
  );
}
