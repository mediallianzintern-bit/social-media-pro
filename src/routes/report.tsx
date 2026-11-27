// The Performance report: the one a client reads (26 Nov 2026).
//
// Plain results for the period: what was published, how much it was seen and
// engaged with, how that compares with the period before, how the follower
// count moved, the best posts and the content that works best. Declines are
// shown as they are; a report that only ever reads "up" is not one a client
// can trust.
//
// The team's working out (the trend in the goal's metric, whether our advice
// moved it, how our suggestions have held up, prediction readiness) is on the
// Technical performance report (routes/technical-report.tsx), from the same
// data. No competitor names and no cost figures on either.
//
// Deliberately outside the _app layout: no navigation and no sync button, so
// the page prints as the report alone.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wordmark } from "@/components/brand";
import { GrowthChart } from "@/components/dashboard/growth-chart";
import { PostCover } from "@/components/dashboard/post-cover";
import { ReportControls, ReportSwitch } from "@/components/report/report-chrome";
import { MonthlyPlatform } from "@/components/report/monthly-report";
import { Stat } from "@/components/report/report-parts";
import { change, FORMAT_NAME, plural } from "@/lib/report-format";
import { reportSearch, useLightPrint } from "@/lib/report-page";
import { GoToLogin } from "@/components/auth/go-to";
import { BackButton } from "@/components/nav/back-button";
import { viewsOf, type ContentFormat, type PostRecord } from "@/lib/analytics-types";
import { reportQueryOptions } from "@/lib/analytics.functions";
import { compactNumber, dateTime, shortDate } from "@/lib/format";
import { PLATFORM_META } from "@/lib/platform-meta";
import type { ClientReportPlatform, ReportPeriod } from "@/lib/report-types";
import type { PlatformId } from "@/lib/analytics-types";
import { cn } from "@/lib/utils";
import { currentStaffEmail } from "@/lib/session";

export const Route = createFileRoute("/report")({
  // Behind the same login as the dashboard: it carries the client's data. A
  // public share link can be added deliberately (a signed, expiring token).
  ssr: false,
  validateSearch: reportSearch,
  beforeLoad: async ({ location }) => ({
    staffEmail: await currentStaffEmail(),
    returnTo: location.href,
  }),
  loaderDeps: ({ search }) => ({
    period: search.period,
    from: search.from,
    to: search.to,
    month: search.month,
  }),
  component: ReportGate,
  loader: ({ context, deps }) =>
    context.staffEmail ? context.queryClient.ensureQueryData(reportQueryOptions(deps)) : null,
});

/** How the period opens a sentence: "Over the last 30 days", "Since tracking began". */
function periodPhrase(period: ReportPeriod, label: string): string {
  if (period === "30d") return "Over the last 30 days";
  if (period === "90d") return "Over the last 90 days";
  if (period === "all") return "Since tracking began";
  return label.startsWith("Since") ? label : `From ${label.replace(" – ", " to ")}`;
}

/** One sentence that says what happened, in words. */
function summary(report: ClientReportPlatform, period: ReportPeriod, label: string): string {
  const { totals } = report;
  const parts: string[] = [];
  const opening = `${periodPhrase(period, label)}, @${report.handle} published ${plural(totals.posts, "post", "posts")}`;
  if (!totals.posts) parts.push(`${opening}.`);
  else {
    const seen = totals.views > 0 ? `, seen ${compactNumber(totals.views)} times,` : "";
    parts.push(
      `${opening}${seen} and earned ${plural(totals.likes, "like", "likes")} and ${plural(totals.comments, "comment", "comments")}.`,
    );
  }
  if (report.periodDays) {
    const gained = report.followersGained;
    parts.push(
      gained === 0
        ? `The follower count held at ${compactNumber(report.followers)}.`
        : `The account ${gained > 0 ? "gained" : "lost"} ${plural(Math.abs(gained), "follower", "followers")} over ${report.periodDays} days, to ${compactNumber(report.followers)}.`,
    );
  }
  return parts.join(" ");
}

function BestPosts({ report }: { report: ClientReportPlatform }) {
  const label = PLATFORM_META[report.platform].label;
  if (!report.topPosts.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Best posts</CardTitle>
        <CardDescription>The posts that reached the most people in this period.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {report.topPosts.map((post: PostRecord) => {
            const views = viewsOf(post);
            return (
              <li
                key={post.postId}
                className="flex gap-3 py-3 first:pt-0 last:pb-0 print:break-inside-avoid"
              >
                <PostCover post={post} className="size-16" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm">{post.caption.trim() || "(no caption)"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {shortDate(post.publishedAt)} · {FORMAT_NAME[post.format][0]}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums">
                    {views > 0 ? (
                      <span>
                        <span className="font-semibold">{compactNumber(views)}</span> views
                      </span>
                    ) : null}
                    <span>
                      <span className="font-semibold">{compactNumber(post.likes)}</span> likes
                    </span>
                    <span>
                      <span className="font-semibold">{compactNumber(post.comments)}</span> comments
                    </span>
                    {post.url ? (
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-0.5 text-muted-foreground underline-offset-2 hover:underline print:hidden"
                      >
                        View on {label}
                        <ExternalLink className="size-3" aria-hidden />
                      </a>
                    ) : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function PlatformSection({
  report,
  period,
  periodLabel,
  previousLabel,
}: {
  report: ClientReportPlatform;
  period: ReportPeriod;
  periodLabel: string;
  previousLabel: string | null;
}) {
  const meta = PLATFORM_META[report.platform];
  const { totals, previous } = report;
  // Only where there is a period before with something in it to compare to.
  const against = previous && previous.posts > 0 ? previousLabel : null;
  const themes = report.lanes
    .filter(
      (lane) =>
        !lane.directional && lane.medianVsMedian > 1 && lane.lane.trim().toLowerCase() !== "other",
    )
    .sort((a, b) => b.medianVsMedian - a.medianVsMedian)
    .slice(0, 3);
  const formats = (Object.entries(totals.formats) as Array<[ContentFormat, number]>)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-lg font-bold tracking-tight">{meta.label}</h2>
        <span className="text-sm text-muted-foreground">@{report.handle}</span>
      </div>

      <p className="text-[15px] leading-relaxed">{summary(report, period, periodLabel)}</p>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          value={compactNumber(report.followers)}
          label={
            report.periodDays
              ? `followers (${report.followersGained >= 0 ? "+" : "−"}${compactNumber(Math.abs(report.followersGained))} this period)`
              : "followers"
          }
          against={null}
        />
        <Stat
          value={totals.posts.toLocaleString()}
          label="posts published"
          pct={change(totals.posts, previous?.posts)}
          against={against}
        />
        {totals.views > 0 ? (
          <Stat
            value={compactNumber(totals.views)}
            label="views"
            pct={change(totals.views, previous?.views)}
            against={against}
          />
        ) : (
          <Stat
            value={compactNumber(totals.likes + totals.comments)}
            label="likes and comments"
            pct={change(
              totals.likes + totals.comments,
              previous ? previous.likes + previous.comments : undefined,
            )}
            against={against}
          />
        )}
        <Stat
          value={compactNumber(totals.interactionsPerPost)}
          label="likes and comments per post"
          pct={change(totals.interactionsPerPost, previous?.interactionsPerPost)}
          against={against}
        />
      </div>

      {report.growth.length > 1 ? (
        <Card className="print:break-inside-avoid">
          <CardHeader>
            <CardTitle className="text-base">Followers</CardTitle>
            <CardDescription>How the follower count moved across the period.</CardDescription>
          </CardHeader>
          <CardContent>
            <GrowthChart points={report.growth} color={meta.color} />
          </CardContent>
        </Card>
      ) : null}

      <BestPosts report={report} />

      {themes.length ? (
        <Card className="print:break-inside-avoid">
          <CardHeader>
            <CardTitle className="text-base">The content that works best</CardTitle>
            <CardDescription>
              Themes whose posts usually earn more likes and comments than this account&rsquo;s
              typical post.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {themes.map((lane) => (
                <li key={lane.lane} className="text-sm">
                  <span className="font-medium capitalize">{lane.lane}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    — usually {lane.medianVsMedian.toFixed(1)}× the typical post, across{" "}
                    {plural(lane.postCount, "post", "posts")}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {formats.length ? (
        <p className="text-sm text-muted-foreground">
          Published this period:{" "}
          {formats.map(([format, count]) => plural(count, ...FORMAT_NAME[format])).join(" · ")}.
        </p>
      ) : null}
    </section>
  );
}

function ReportGate() {
  const { staffEmail, returnTo } = Route.useRouteContext();
  if (!staffEmail) return <GoToLogin returnTo={returnTo} />;
  return <ReportPage />;
}

/** The two reports, one at a time: the Instagram and LinkedIn reports are separate. */
function PlatformSwitch({
  platforms,
  current,
  onChoose,
}: {
  platforms: ClientReportPlatform[];
  current: PlatformId;
  onChoose: (platform: PlatformId) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Account"
      className="grid grid-cols-2 gap-2 rounded-xl border bg-card p-1.5 print:hidden"
    >
      {platforms.map((entry) => {
        const active = entry.platform === current;
        return (
          <button
            key={entry.platform}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChoose(entry.platform)}
            className={cn(
              "flex min-h-12 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors",
              active
                ? "bg-secondary text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <img src={`/logos/${entry.platform}.svg`} alt="" className="size-5" />
            {PLATFORM_META[entry.platform].label} report
          </button>
        );
      })}
    </div>
  );
}

/** The note under each report: what its figures are, per platform. */
const FOOTNOTE: Record<PlatformId, string> = {
  instagram:
    "Followers, views, likes and comments are Instagram's own counts, as of the latest update; reach, saves, shares and watch time are Instagram's own figures for the account. In a monthly report, last month's breakout posts (3× its typical post or more) are left out of the comparison and listed on their own.",
  linkedin:
    "Impressions, members reached, engagements and new followers are LinkedIn's own figures for the account, read from LinkedIn every day; followers and post interactions are the public counts, as of the latest update.",
};

function ReportPage() {
  // Suspense, not useQuery: a plain useQuery returns undefined on the first
  // pass, and the empty state would flash before the report.
  const search = Route.useSearch();
  const { period, from, to, month } = search;
  const navigate = useNavigate({ from: "/report" });
  const { data } = useSuspenseQuery(reportQueryOptions({ period, from, to, month }));
  useLightPrint();

  // One account's report at a time, chosen in the URL so a link or a PDF is
  // one report: the Instagram and LinkedIn reports never mix.
  const entry =
    data.platforms.find((item) => item.platform === search.platform) ?? data.platforms[0] ?? null;
  const choose = (next: Partial<typeof search>) =>
    void navigate({ search: { ...search, ...next }, replace: true });
  const label = entry ? PLATFORM_META[entry.platform].label : "";
  const excluded = entry?.monthly?.excluded.length ?? 0;

  return (
    <main data-report className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:py-16 print:py-0">
      <header className="space-y-3">
        <BackButton fallback="/" label="Back to dashboard" />
        <Wordmark className="mb-5 h-7" />
        {/* The Technical performance report is the admins' (27 Nov 2026). */}
        {data.admin ? <ReportSwitch current="client" search={{ period, from, to, month }} /> : null}
        <ReportControls
          search={{ period, from, to, month }}
          periodLabel={data.periodLabel}
          onChoose={(next) =>
            void navigate({
              search: { ...next, ...(search.platform ? { platform: search.platform } : {}) },
            })
          }
        />
        {data.platforms.length > 1 && entry ? (
          <PlatformSwitch
            platforms={data.platforms}
            current={entry.platform}
            onChoose={(platform) => choose({ platform })}
          />
        ) : null}
        {entry ? (
          <>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight sm:text-3xl">
              <img src={`/logos/${entry.platform}.svg`} alt="" className="size-7" />
              {label} {data.monthly ? "monthly report" : "performance report"}
            </h1>
            <p className="text-sm font-medium">
              {entry.displayName} (@{entry.handle}) · {data.periodLabel}
              {data.monthly && data.previousLabel
                ? ` · Compared with ${data.previousLabel}${excluded ? ` (excluding ${excluded} breakout ${excluded === 1 ? "post" : "posts"})` : ""}`
                : ""}
            </p>
          </>
        ) : (
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Performance report</h1>
        )}
        <p className="text-sm text-muted-foreground">
          Prepared by Mediallianz on {dateTime(data.generatedAt)}.
        </p>
      </header>

      {entry ? (
        entry.monthly ? (
          <MonthlyPlatform key={entry.platform} report={entry} review={entry.monthly} />
        ) : (
          <PlatformSection
            key={entry.platform}
            report={entry}
            period={data.period}
            periodLabel={data.periodLabel}
            previousLabel={data.previousName}
          />
        )
      ) : (
        <p className="text-sm text-muted-foreground">
          No figures yet. This report fills in after the account&rsquo;s first refresh.
        </p>
      )}

      {entry ? (
        <footer className="border-t pt-6">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {FOOTNOTE[entry.platform]} A calendar month is compared with the calendar month before
            it, and any other period with the same length of time just before it.
          </p>
        </footer>
      ) : null}
    </main>
  );
}
