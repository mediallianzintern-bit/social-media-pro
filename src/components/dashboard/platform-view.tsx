import { Link, useSearch } from "@tanstack/react-router";
import { AlertTriangle, ArrowDown, ArrowUp, ExternalLink, FileText, Info } from "lucide-react";
import { useMemo } from "react";

import { AiPanel } from "@/components/dashboard/ai-panel";
import { CompetitorTable, type BenchmarkRow } from "@/components/dashboard/competitor-table";
import { followersForPeriod } from "@/lib/followers";
import { GrowthChart } from "@/components/dashboard/growth-chart";
import { InsightsPanels } from "@/components/dashboard/insights-panels";
import { CadenceNudge } from "@/components/dashboard/cadence-nudge";
import { DeriveLanes } from "@/components/dashboard/derive-lanes";
import { LearningPanel } from "@/components/dashboard/learning-panel";
import { LinkedInOwnerMetrics } from "@/components/dashboard/linkedin-owner-metrics";
import { PostLessons } from "@/components/dashboard/post-lessons";
import { POST_REVIEW_DAYS } from "@/lib/reel-learning-types";
import { LockedPanel } from "@/components/dashboard/locked-panel";
import { PublicEngagement } from "@/components/dashboard/public-engagement";
import { MetricBars, type BarRow } from "@/components/dashboard/metric-bars";
import { PostPerformanceChart } from "@/components/dashboard/post-performance-chart";
import { TopicCards } from "@/components/dashboard/topic-cards";
import { PostCover } from "@/components/dashboard/post-cover";
import { PostsBrowser } from "@/components/dashboard/posts-browser";
import { SectionHeading } from "@/components/dashboard/section-heading";
import { InfoTip } from "@/components/dashboard/info-tip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fullNumber, percent } from "@/lib/format";
import {
  accountSummary,
  changeSentence,
  compact,
  doMoreAndLess,
  postTitle,
  type Finding,
} from "@/lib/account-summary";
import { dayMonth } from "@/lib/date-range";
import { cn } from "@/lib/utils";
import { PLATFORM_META } from "@/lib/platform-meta";
import { computeInsights } from "@/lib/insights";
import { buildRecommendations } from "@/lib/recommendations";
import {
  cadence,
  engagementRate,
  engagementsOf,
  median,
  medianViews,
  organicPosts,
  type PlatformData,
  viewsOf,
} from "@/lib/analytics-types";
import { toInputValue, type ResolvedRange } from "@/lib/date-range";

type Tab = "summary" | "posts" | "audience" | "competitors" | "ideas";

/** Sections from the original spec that public data cannot fill, per platform. */
const LOCKED = {
  instagram: [
    {
      title: "Audience demographics",
      description: "Age range and gender split",
      rows: ["13–17", "18–24", "25–34", "35–44", "45–54", "55–64", "65+"],
      unlock:
        "Instagram renders these only inside the account owner's own Insights. Switching @priteshpatel.co to a Business or Creator account and linking a Facebook Page makes them available through the Meta Graph API, free.",
    },
    {
      title: "Reach, impressions and saves",
      description: "The rows a full post funnel needs",
      rows: ["Accounts reached", "Impressions", "Saves", "Shares", "Profile visits", "New follows"],
      unlock:
        "Never rendered on a public profile — only the owner sees them. Same unlock as above: a Business/Creator account plus a Meta app token.",
    },
  ],
  linkedin: [
    {
      title: "Impressions and members reached",
      description: "Per-post distribution figures",
      rows: ["Impressions", "Members reached", "In-network vs out-of-network", "Saves and sends"],
      unlock:
        "Never shown on a public post, so no scraper can read them. They come from the Export on Pritesh's own LinkedIn analytics screen, or from LinkedIn's Member Post Analytics API (free, once LinkedIn approves the app and Pritesh connects it).",
    },
    {
      title: "Who you reach vs who follows you",
      description: "Industry, seniority and top companies",
      rows: ["Industry breakdown", "Seniority breakdown", "Top companies in reach"],
      unlock:
        "Owner-only: shown only in Pritesh's own LinkedIn audience analytics, never on a public profile.",
    },
  ],
} as const;

export function PlatformView({
  data,
  range,
  allPosts,
}: {
  data: PlatformData;
  range: ResolvedRange;
  /** Every stored post, unfiltered: for comparisons with the previous period. */
  allPosts?: PlatformData["posts"];
}) {
  // One tab at a time (13 Nov 2026, UI review): the page was 17 sections and
  // about 25 screens long. The tab is in the URL, so Home can link to one.
  const { tab = "summary" } = useSearch({ from: "/_app" });
  const meta = PLATFORM_META[data.platform];
  const color = meta.color;
  const isInstagram = data.platform === "instagram";

  const insights = useMemo(() => computeInsights(data.posts), [data.posts]);
  const recommendations = useMemo(
    () => buildRecommendations(data.platform, insights, organicPosts(data.posts)),
    [data.platform, insights, data.posts],
  );

  if (data.status === "unconfigured") {
    return (
      <Alert>
        <Info className="size-4" aria-hidden />
        <AlertTitle>Not connected yet</AlertTitle>
        <AlertDescription>
          {data.missingEnv?.join(", ")} still needs adding. See Settings, Data sources.
        </AlertDescription>
      </Alert>
    );
  }

  if (data.status === "error") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-destructive" aria-hidden />
            {meta.label} could not be read
          </CardTitle>
          <CardDescription className="whitespace-pre-wrap">{data.error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (data.status === "empty" || !data.latest) {
    return (
      <Alert>
        <Info className="size-4" aria-hidden />
        <AlertTitle>No snapshot stored yet</AlertTitle>
        <AlertDescription>
          Press Refresh to collect {meta.label}&apos;s figures for the first time.
        </AlertDescription>
      </Alert>
    );
  }

  const { latest, posts } = data;
  const organic = organicPosts(posts);
  const hasViews = insights.useViews;
  const metric = hasViews ? ("views" as const) : ("engagements" as const);
  const primaryOf = (post: (typeof posts)[number]) =>
    hasViews ? viewsOf(post) : engagementsOf(post);

  const ranked = [...organic].sort((a, b) => primaryOf(b) - primaryOf(a));
  const best = ranked[0];
  // On the followers the period had, not today's.
  const rate = engagementRate(posts, followersForPeriod(data) ?? latest.followers);

  // Best-performer funnel: only the rows public data actually supports. The
  // missing rows are named in the locked panel rather than shown as zeroes.
  const funnel: BarRow[] = best
    ? [
        ...(hasViews ? [{ label: "Views", value: viewsOf(best) }] : []),
        { label: "Likes", value: best.likes },
        { label: "Comments", value: best.comments },
        ...(best.shares ? [{ label: "Reposts", value: best.shares }] : []),
      ]
    : [];

  const formatRows: BarRow[] = insights.formats.map((bucket) => ({
    label: bucket.label,
    value: bucket.medianPrimary,
    sub: `${bucket.count} post${bucket.count === 1 ? "" : "s"}`,
    muted: bucket.confidence === "insufficient",
  }));

  const dayRows: BarRow[] = insights.weekdays.map((entry) => ({
    label: entry.day,
    value: entry.medianPrimary,
    sub: `${entry.count} post${entry.count === 1 ? "" : "s"}`,
  }));

  const benchmark: BenchmarkRow[] = [
    {
      handle: latest.handle,
      displayName: latest.displayName,
      followers: latest.followers,
      medianViews: hasViews ? medianViews(organic) : 0,
      medianEngagements: median(organic.map((post) => engagementsOf(post))),
      postsPerWeek: cadence(posts),
      engagementRate: rate,
      isYou: true,
      gap: { label: "baseline", tone: "neutral" },
    },
    ...data.competitors.map((rival): BenchmarkRow => {
      const followerRatio = latest.followers > 0 ? rival.followers / latest.followers : 0;
      const rateRatio = rate > 0 ? rival.engagementRate / rate : 0;
      const gap: BenchmarkRow["gap"] =
        rateRatio >= 1.25
          ? // Ahead of you is not "bad" (13 Nov 2026, UI review: every rival
            // was labelled bad). It is something to learn from.
            { label: `Engages ${rateRatio.toFixed(1)}× more than you`, tone: "warn" }
          : rateRatio > 0 && rateRatio <= 0.8
            ? { label: "You engage better", tone: "good" }
            : followerRatio >= 2
              ? { label: `${followerRatio.toFixed(1)}× your audience`, tone: "warn" }
              : { label: "Comparable", tone: "neutral" };
      return { ...rival, gap };
    }),
  ];

  const summary = accountSummary(data, range);
  const findings = doMoreAndLess(data);
  const change = changeSentence(summary);
  const unit = hasViews ? "views" : "interactions";
  const handle = latest.handle.startsWith("@") ? latest.handle : `@${latest.handle}`;
  const firstPoint = data.growth[0];
  const lastPoint = data.growth.at(-1);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "summary", label: "Summary" },
    { id: "posts", label: `Posts · ${posts.length}` },
    { id: "audience", label: "Audience" },
    { id: "competitors", label: `Competitors · ${data.competitors.length}` },
    { id: "ideas", label: "Ideas" },
  ];

  return (
    <div className="space-y-6">
      <div className="-mt-2 flex flex-wrap items-center justify-between gap-2 border-b">
        <nav aria-label={`${meta.label} sections`} className="flex gap-1 overflow-x-auto">
          {tabs.map((entry) => (
            <Link
              key={entry.id}
              to="."
              search={(prev) => ({ ...prev, tab: entry.id === "summary" ? undefined : entry.id })}
              aria-current={tab === entry.id ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center border-b-2 px-3 text-sm whitespace-nowrap",
                tab === entry.id
                  ? "border-primary font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {entry.label}
            </Link>
          ))}
        </nav>
        <a
          href={data.profileUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex min-h-11 items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
        >
          {handle}
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>

      {tab === "summary" ? (
        <>
          <h2 className="text-2xl leading-tight font-bold">
            {change
              ? `Followers are ${summary.change! < 0 ? "down" : summary.change! > 0 ? "up" : "unchanged"}${summary.change ? ` ${fullNumber(Math.abs(summary.change))}` : ""} ${summary.since}.`
              : `${fullNumber(summary.followers ?? latest.followers)} followers.`}{" "}
            Your typical post gets {compact(summary.typical)} {unit}.
          </h2>

          <section
            aria-label="Headline numbers"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <Stat
              label="Followers"
              value={summary.followers == null ? "—" : fullNumber(summary.followers)}
              sub={
                summary.change == null
                  ? undefined
                  : summary.change === 0
                    ? "No change"
                    : `${summary.change < 0 ? "Down" : "Up"} ${fullNumber(Math.abs(summary.change))}`
              }
              tone={summary.change == null ? undefined : summary.change < 0 ? "bad" : "good"}
            />
            <Stat
              label={hasViews ? "Typical views per post" : "Typical interactions per post"}
              value={compact(summary.typical)}
              sub={`Middle value of ${summary.posts} post${summary.posts === 1 ? "" : "s"}`}
              tip="Half your posts did better than this and half did worse, so one viral post does not move it."
            />
            <Stat
              label="Engagement rate"
              value={percent(rate, 2)}
              sub={
                hasViews
                  ? "Of viewers who liked, commented or reposted"
                  : "Interactions for every follower who could see a post"
              }
            />
            <Stat
              label="Posts a week"
              value={summary.postsPerWeek.toFixed(1)}
              sub={`${summary.posts} posts in this period`}
            />
          </section>

          <Card>
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold">Followers over time</h3>
                {firstPoint && lastPoint ? (
                  <p className="text-[13px] text-muted-foreground tabular-nums">
                    {dayMonth(new Date(firstPoint.capturedAt))}: {fullNumber(firstPoint.followers)}{" "}
                    → {dayMonth(new Date(lastPoint.capturedAt))}: {fullNumber(lastPoint.followers)}
                  </p>
                ) : null}
              </div>
              <GrowthChart points={data.growth} color={color} eras={data.eras ?? []} />
            </CardContent>
          </Card>

          {findings.more.length || findings.less.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              <FindingCard title="Do more of" findings={findings.more} tone="good" />
              <FindingCard title="Do less of" findings={findings.less} tone="bad" />
            </div>
          ) : null}

          {ranked.length ? (
            <section className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold">Top posts</h3>
                <Link
                  to="."
                  search={(prev) => ({ ...prev, tab: "posts" as const })}
                  className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
                >
                  See all {posts.length} posts
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {ranked.slice(0, 4).map((post) => (
                  <a
                    key={post.postId}
                    href={post.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex gap-3 rounded-xl border bg-card p-3 hover:bg-muted/40"
                  >
                    {isInstagram ? <PostCover post={post} className="h-16 w-12" /> : null}
                    <div className="min-w-0">
                      <p className="text-base font-bold tabular-nums">
                        {compact(primaryOf(post))} {unit}
                      </p>
                      <p className="line-clamp-2 text-[13px] text-muted-foreground">
                        {postTitle(post.caption, 60)} · {dayMonth(new Date(post.publishedAt))}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {tab === "posts" ? (
        <>
          <PostsBrowser posts={posts} platform={data.platform} />
          {data.learning && (data.learning.lanes.length || data.learning.suggestions) ? (
            <>
              <SectionHeading
                title="How each topic performs"
                note={`${range.label} · against your typical post`}
                action={
                  <div className="flex flex-wrap items-baseline gap-1">
                    <Button asChild variant="ghost" className="h-11 gap-1.5 px-3 text-[13px]">
                      {/* The report opens on the dates being viewed here; it has
                          its own date picker for any other window. */}
                      <Link
                        to="/lane-report"
                        search={{
                          platform: data.platform,
                          from: toInputValue(range.from) || "2015-01-01",
                          to: toInputValue(
                            range.to ? new Date(range.to.getTime() - 1) : new Date(),
                          ),
                        }}
                      >
                        <FileText className="size-3.5" aria-hidden />
                        Topic report
                      </Link>
                    </Button>
                    <DeriveLanes platform={data.platform} mode="refresh" />
                  </div>
                }
              />
              <LearningPanel learning={data.learning} />
            </>
          ) : organic.length ? (
            <>
              <SectionHeading
                title="How each topic performs"
                note="Topics are read from the account's own captions"
              />
              <DeriveLanes platform={data.platform} />
            </>
          ) : null}
        </>
      ) : null}

      {tab === "audience" ? (
        <>
          <CadenceNudge platform={data.platform} />
          {organic.length ? (
            <>
              <SectionHeading title={hasViews ? "Views per post" : "Interactions per post"} />
              <Card>
                <CardHeader>
                  <CardDescription className="text-[13px]">
                    Oldest to newest. Solid bars are posts at 3× your typical post or better.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PostPerformanceChart
                    posts={organic}
                    color={color}
                    metric={metric}
                    eras={data.eras ?? []}
                  />
                </CardContent>
              </Card>
            </>
          ) : null}

          {dayRows.length > 1 ? (
            <>
              <SectionHeading title="Best days to post" note="Typical post on each day" />
              <MetricBars
                title={hasViews ? "Typical views by day" : "Typical interactions by day"}
                rows={dayRows}
                color={color}
                note="Few posts fall on each day, so read this as something to test, not a rule."
              />
            </>
          ) : null}

          {best ? (
            <>
              <SectionHeading
                title="Your best post, broken down"
                note={best.caption.split(/[.!?\n]/)[0]?.slice(0, 60) ?? ""}
                {...(best.url ? { noteHref: best.url } : {})}
              />
              <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
                <MetricBars
                  title="From views to interactions"
                  rows={funnel}
                  color={color}
                  note={
                    hasViews
                      ? `${percent(engagementsOf(best) / Math.max(viewsOf(best), 1), 2)} of viewers interacted.`
                      : "LinkedIn shows no view count on personal posts, so this starts at interactions."
                  }
                />
                <MetricBars
                  title={hasViews ? "Typical views by format" : "Typical interactions by format"}
                  rows={formatRows}
                  color={color}
                  note={
                    formatRows.some((row) => row.muted)
                      ? "Dimmed formats have fewer than 3 posts in this period, too few to compare."
                      : undefined
                  }
                />
              </div>
            </>
          ) : null}

          {!isInstagram ? (
            <>
              <SectionHeading title="Reactions, comments and reposts" />
              <PublicEngagement posts={posts} range={range} />
            </>
          ) : null}

          {data.insights ? (
            <>
              <SectionHeading title="Instagram's own figures" note="Reach, saves and watch time" />
              <InsightsPanels insights={data.insights} posts={data.posts} color={color} />
            </>
          ) : !isInstagram ? (
            <>
              <SectionHeading
                title="LinkedIn's own figures"
                note="Impressions and members reached"
              />
              <LinkedInOwnerMetrics posts={posts} color={color} range={range} />
            </>
          ) : (
            <>
              <SectionHeading title="Not available yet" />
              <div className="grid gap-4 lg:grid-cols-2">
                {LOCKED[data.platform].map((panel) => (
                  <LockedPanel key={panel.title} {...panel} rows={[...panel.rows]} />
                ))}
              </div>
            </>
          )}
        </>
      ) : null}

      {tab === "competitors" ? (
        <CompetitorTable
          rows={benchmark}
          viewsLabel={hasViews ? "Typical views" : "Typical views (n/a)"}
          envVar={isInstagram ? "COMPETITORS_INSTAGRAM" : "COMPETITORS_LINKEDIN"}
        />
      ) : null}

      {tab === "ideas" ? (
        <>
          <AiPanel platform={data.platform} />
          <SectionHeading
            title="Patterns in your own posts"
            note="Each one is found in your numbers, not written by AI"
          />
          <TopicCards recommendations={recommendations} />
        </>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
  tip,
}: {
  label: string;
  value: string;
  sub?: string | undefined;
  tone?: "good" | "bad" | undefined;
  tip?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-5">
        <p className="flex items-center gap-1 text-[13px] text-muted-foreground">
          {label}
          {tip ? <InfoTip text={tip} /> : null}
        </p>
        <p className="text-3xl font-bold tabular-nums">{value}</p>
        {sub ? (
          <p
            className={cn(
              "text-[13px]",
              tone === "bad"
                ? "font-semibold text-red-700 dark:text-red-400"
                : tone === "good"
                  ? "font-semibold text-emerald-700 dark:text-emerald-400"
                  : "text-muted-foreground",
            )}
          >
            {sub}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FindingCard({
  title,
  findings,
  tone,
}: {
  title: string;
  findings: Finding[];
  tone: "good" | "bad";
}) {
  const Icon = tone === "good" ? ArrowUp : ArrowDown;
  return (
    <Card>
      <CardContent className="p-0">
        <h3 className="flex items-center gap-2 border-b px-5 py-4 text-base font-semibold">
          <Icon
            className={cn(
              "size-4",
              tone === "good"
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-red-700 dark:text-red-400",
            )}
            aria-hidden
          />
          {title}
        </h3>
        {findings.length ? (
          <ul>
            {findings.map((finding) => (
              <li
                key={finding.label}
                className="flex min-h-12 items-center justify-between gap-3 border-b px-5 py-3 text-sm last:border-b-0"
              >
                <span>
                  {finding.label}{" "}
                  <span className="text-[13px] text-muted-foreground">· {finding.posts} posts</span>
                </span>
                <span
                  className={cn(
                    "font-semibold whitespace-nowrap",
                    tone === "good"
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-red-700 dark:text-red-400",
                  )}
                >
                  {finding.value}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-muted-foreground">
            Nothing stands out yet in this period.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
