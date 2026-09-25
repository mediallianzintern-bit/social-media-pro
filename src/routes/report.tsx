// Layer 7 — the client report view.
//
// Deliberately outside the _app layout: no navigation, no sync button, no
// competitor table. This is the shareable artifact, so everything an agency
// would want and a client should not see is absent by construction rather than
// hidden with a flag.
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GrowthChart } from "@/components/dashboard/growth-chart";
import { compactNumber, dateTime } from "@/lib/format";
import { reportQueryOptions } from "@/lib/analytics.functions";
import { GoToLogin } from "@/components/auth/go-to";
import { currentStaffEmail } from "@/lib/session";
import { PLATFORM_META } from "@/lib/platform-meta";
import { trajectoryStatement } from "@/lib/growth";
import type { ClientReportPlatform } from "@/lib/report-types";

export const Route = createFileRoute("/report")({
  // Behind the same login as the dashboard. It was built as a shareable client
  // view, but it carries the client's data; a public share link can be added
  // back deliberately (a signed, expiring token) rather than left open.
  ssr: false,
  beforeLoad: async ({ location }) => ({
    staffEmail: await currentStaffEmail(),
    returnTo: location.href,
  }),
  component: ReportGate,
  loader: ({ context }) =>
    context.staffEmail ? context.queryClient.ensureQueryData(reportQueryOptions) : null,
});

/**
 * Predicted vs actual.
 *
 * The section a client is most likely to read closely, so it is the one that
 * must not overstate. Until the niche graduates there is no numeric prediction
 * to score, and this says exactly that instead of dressing up the directional
 * hit rate as an accuracy percentage.
 */
function Accuracy({ report }: { report: ClientReportPlatform }) {
  const { calibration } = report;
  const hasScored = calibration.scored > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">How our suggestions have performed</CardTitle>
        <CardDescription>
          Every idea we suggest is recorded before it is filmed, then checked against what the post
          actually did. Nothing here is an estimate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <span className="block">
            <span className="block text-2xl font-bold tabular-nums">{calibration.made}</span>
            <span className="text-xs text-muted-foreground">ideas suggested</span>
          </span>
          <span className="block">
            <span className="block text-2xl font-bold tabular-nums">{calibration.scored}</span>
            <span className="text-xs text-muted-foreground">filmed and measured</span>
          </span>
          {calibration.calibrated ? (
            <span className="block">
              <span className="block text-2xl font-bold tabular-nums">
                {hasScored ? Math.round((calibration.insideRange / calibration.scored) * 100) : 0}%
              </span>
              <span className="text-xs text-muted-foreground">landed in predicted range</span>
            </span>
          ) : (
            <span className="block">
              <span className="block text-2xl font-bold tabular-nums">
                {hasScored ? `${calibration.directionalHits}/${calibration.scored}` : "—"}
              </span>
              <span className="text-xs text-muted-foreground">beat the account median</span>
            </span>
          )}
        </div>

        {calibration.calibrated ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{calibration.note}</p>
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/30 p-3">
            <p className="text-sm leading-relaxed">
              We do not yet publish numeric predictions for this account.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              A predicted figure is only worth showing once it has been checked against enough real
              results to know it holds. Until then we report what each content lane is measured to
              do, and nothing more. {calibration.note} Accuracy improves as we track more posts.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PlatformSection({ report }: { report: ClientReportPlatform }) {
  const meta = PLATFORM_META[report.platform];
  const strongLanes = report.lanes
    .filter((lane) => !lane.directional && lane.medianVsMedian > 1)
    .sort((a, b) => b.medianVsMedian - a.medianVsMedian)
    .slice(0, 3);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-lg font-bold tracking-tight">{meta.label}</h2>
        <span className="text-sm text-muted-foreground">@{report.handle}</span>
      </div>

      {report.trajectory ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {report.trajectory.trend === "declining"
                ? "Declining"
                : report.trajectory.trend === "slowing"
                  ? "Slowing"
                  : report.trajectory.trend === "accelerating"
                    ? "Accelerating"
                    : "Steady"}
            </CardTitle>
            <CardDescription>
              {/* Dips and plateaus are shown, not hidden — A.6. A report that
                  only ever reads "up" is not one a client can trust. */}
              {trajectoryStatement(report.trajectory)}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <span className="block text-3xl font-bold tabular-nums">
              {compactNumber(report.followers)}
            </span>
            <span className="text-xs text-muted-foreground">followers</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <span className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold tabular-nums">
                {report.followersGained >= 0 ? "+" : ""}
                {compactNumber(report.followersGained)}
              </span>
              {report.followersGained > 0 ? (
                <TrendingUp className="size-4 text-emerald-600" aria-hidden />
              ) : null}
            </span>
            <span className="text-xs text-muted-foreground">
              {report.periodDays ? `over ${report.periodDays} days tracked` : "no history yet"}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <span className="block text-3xl font-bold tabular-nums">{report.postsTracked}</span>
            <span className="text-xs text-muted-foreground">posts analysed</span>
          </CardContent>
        </Card>
      </div>

      {report.growth.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Follower growth</CardTitle>
            <CardDescription>One point per sync, oldest first.</CardDescription>
          </CardHeader>
          <CardContent>
            <GrowthChart points={report.growth} color={meta.color} />
          </CardContent>
        </Card>
      ) : null}

      {strongLanes.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What is working</CardTitle>
            <CardDescription>
              Content lanes clearing this account&rsquo;s own median. Lanes with too few posts to be
              conclusive are left out.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {strongLanes.map((lane) => (
                <li key={lane.lane} className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium capitalize">{lane.lane}</span>
                  <Badge
                    variant="secondary"
                    className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  >
                    {lane.medianVsMedian.toFixed(1)}× median
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {lane.postCount} post{lane.postCount === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {report.topPosts.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Best performing posts</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {report.topPosts.map((post) => (
                <li key={post.postId} className="flex items-baseline gap-3 py-2.5 first:pt-0">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {post.caption.slice(0, 90) || "(no caption)"}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {compactNumber(
                      post.insight?.reach || post.insight?.views || post.views || post.likes,
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {report.goalScore ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Did our advice move the goal?</CardTitle>
            <CardDescription>
              The question the engagement is judged on — not whether a single post did well, but
              whether the metric that matters moved in the weeks we influenced.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.goalScore.comparable ? (
              <div className="grid grid-cols-2 gap-4">
                <span className="block">
                  <span className="block text-2xl font-bold tabular-nums">
                    {(report.goalScore.ratePerWeekInfluenced ?? 0) >= 0 ? "+" : ""}
                    {report.goalScore.ratePerWeekInfluenced}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    a week, in the {report.goalScore.influencedWeeks} weeks we influenced
                  </span>
                </span>
                <span className="block">
                  <span className="block text-2xl font-bold tabular-nums">
                    {(report.goalScore.ratePerWeekOther ?? 0) >= 0 ? "+" : ""}
                    {report.goalScore.ratePerWeekOther}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    a week, across the other {report.goalScore.otherWeeks}
                  </span>
                </span>
              </div>
            ) : null}
            {/* The caveat travels with the number, never as a footnote
                elsewhere — this is a correlation and must always read as one. */}
            <p className="text-sm leading-relaxed text-muted-foreground">
              {report.goalScore.statement}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Accuracy report={report} />
    </section>
  );
}

function ReportGate() {
  const { staffEmail, returnTo } = Route.useRouteContext();
  if (!staffEmail) return <GoToLogin returnTo={returnTo} />;
  return <ReportPage />;
}

function ReportPage() {
  // Suspense, not useQuery: a plain useQuery returns undefined on the server's
  // first pass, so SSR would render the empty state while the client rendered
  // the report — the two disagree and hydration fails.
  const { data } = useSuspenseQuery(reportQueryOptions);

  if (!data.platforms.length) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-sm text-muted-foreground">
          No synced data yet — this report fills in once the first sync has run.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:py-16">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Performance report</h1>
        {data.goal ? (
          <p className="text-sm font-medium">
            Goal: {data.goal.label}
            <span className="font-normal text-muted-foreground">
              {" "}
              — judged on {data.goal.primaryMetric.replace(/_/g, " ")}
            </span>
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {data.platforms.map((entry) => entry.displayName).join(" · ")} — generated{" "}
          {dateTime(data.generatedAt)}
          {data.benchmarkedAgainst
            ? `, benchmarked against ${data.benchmarkedAgainst} accounts in the same field`
            : ""}
          .
        </p>
      </header>

      {data.platforms.map((entry) => (
        <PlatformSection key={entry.platform} report={entry} />
      ))}

      <footer className="border-t pt-6">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Every figure here is measured, not estimated. Follower counts and post performance come
          from the platforms themselves; lane comparisons are each account&rsquo;s own median, so
          they are unaffected by audience size.
        </p>
      </footer>
    </main>
  );
}
