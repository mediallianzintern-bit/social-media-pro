// The content-lane report — every reel in each lane, with its metrics, between
// two dates, and a PDF of it.
//
// Outside the _app layout for the same reason as /report: it is a page that
// leaves the agency as a PDF, so it carries no navigation or sync controls.
// The controls it does have (dates, download) are hidden when printed.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useEffect } from "react";
import { z } from "zod";

import { Wordmark } from "@/components/brand";
import { GoToLogin } from "@/components/auth/go-to";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { compactNumber, dateTime, fullNumber } from "@/lib/format";
import type { LaneReportLane, LaneReportReel } from "@/lib/lane-report";
import { laneReportQueryOptions } from "@/lib/lane-report.functions";
import { PLATFORM_META } from "@/lib/platform-meta";
import { currentStaffEmail } from "@/lib/session";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" for a date `days` before today, in UTC like the stored posts. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
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
  }),
  beforeLoad: async ({ location }) => ({
    staffEmail: await currentStaffEmail(),
    returnTo: location.href,
  }),
  loaderDeps: ({ search }) => search,
  component: LaneReportGate,
  loader: ({ context, deps }) =>
    context.staffEmail ? context.queryClient.ensureQueryData(laneReportQueryOptions(deps)) : null,
});

function LaneReportGate() {
  const { staffEmail, returnTo } = Route.useRouteContext();
  if (!staffEmail) return <GoToLogin returnTo={returnTo} />;
  return <LaneReportPage />;
}

/** "5 Oct 2026": the year matters in a report that can span several. */
function day(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const dash = <span className="text-muted-foreground">–</span>;

function multiple(value: number) {
  const tone =
    value >= 1.5
      ? "text-emerald-700 dark:text-emerald-400"
      : value < 0.75
        ? "text-rose-700 dark:text-rose-400"
        : "";
  return <span className={`font-medium tabular-nums ${tone}`}>{value.toFixed(1)}×</span>;
}

function LaneReportPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/lane-report" });
  const { data } = useSuspenseQuery(laneReportQueryOptions(search));
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

  const measuredLabel = data.measuredBy === "views" ? "views" : "interactions";

  return (
    <main data-report className="mx-auto max-w-5xl space-y-10 px-4 py-10 sm:py-14 print:py-0">
      <header className="space-y-3">
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
            <h2 className="text-lg font-semibold">Lanes at a glance</h2>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Lane</th>
                    <th className="px-3 py-2 text-right font-medium">
                      {unit[0]!.toUpperCase() + unit.slice(1)}s
                    </th>
                    <th className="px-3 py-2 text-right font-medium">Share of output</th>
                    <th className="px-3 py-2 text-right font-medium">Share of interactions</th>
                    <th className="px-3 py-2 text-right font-medium">Median views</th>
                    <th className="px-3 py-2 text-right font-medium">Median interactions</th>
                    <th className="px-3 py-2 text-right font-medium">Median saves</th>
                    <th className="px-3 py-2 text-right font-medium">Median watch</th>
                    <th className="px-3 py-2 text-right font-medium">vs median</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lanes.map((lane) => (
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
                      <td className="px-3 py-2 text-right tabular-nums">
                        {lane.shareOfOutputPct}%
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {lane.shareOfPerformancePct}%
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {compactNumber(lane.medianViews)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {compactNumber(lane.medianInteractions)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {lane.medianSaves !== undefined ? compactNumber(lane.medianSaves) : dash}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {lane.medianWatchSeconds !== undefined
                          ? `${lane.medianWatchSeconds}s`
                          : dash}
                      </td>
                      <td className="px-3 py-2 text-right">{multiple(lane.medianVsMedian)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              &ldquo;vs median&rdquo; compares a lane&rsquo;s typical {unit} with the typical {unit}{" "}
              in these dates, by {measuredLabel}: 1.0× is typical, 2.0× is twice as good. Saves and
              watch time come from Instagram&rsquo;s own figures and are only shown where they were
              measured.
            </p>
          </section>

          {data.lanes.map((lane) => (
            <LaneSection key={lane.lane} lane={lane} unit={unit} />
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

function LaneSection({ lane, unit }: { lane: LaneReportLane; unit: string }) {
  const hasSaves = lane.reels.some((reel) => reel.saves !== undefined);
  const hasReach = lane.reels.some((reel) => reel.reach !== undefined);
  const hasWatch = lane.reels.some((reel) => reel.avgWatchSeconds !== undefined);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold capitalize">{lane.lane}</h2>
        <span className="text-sm text-muted-foreground">
          {lane.postCount} {unit}
          {lane.postCount === 1 ? "" : "s"} · {compactNumber(lane.totalViews)} views ·{" "}
          {compactNumber(lane.totalInteractions)} interactions · typical {unit}{" "}
          {lane.medianVsMedian.toFixed(1)}× median
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
              <th className="px-3 py-2 text-right font-medium">vs median</th>
            </tr>
          </thead>
          <tbody>
            {lane.reels.map((reel) => (
              <ReelRow
                key={reel.postId}
                reel={reel}
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
  hasSaves,
  hasReach,
  hasWatch,
}: {
  reel: LaneReportReel;
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
          {reel.avgWatchSeconds !== undefined ? `${reel.avgWatchSeconds}s` : dash}
        </td>
      ) : null}
      <td className="px-3 py-2 text-right">{multiple(reel.vsMedian)}</td>
    </tr>
  );
}
