import { TRACKING_TABS } from "@/lib/service-level";
import { useDashboard } from "@/lib/use-dashboard";
import { Link, useSearch } from "@tanstack/react-router";
import { AlertTriangle, ArrowDown, ArrowUp, ExternalLink, FileText, Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { savedTopicsQueryOptions } from "@/lib/analytics.functions";
import { useMemo, useState, type ReactNode } from "react";

import { AiPanel } from "@/components/dashboard/ai-panel";
import { CompetitorTable, type BenchmarkRow } from "@/components/dashboard/competitor-table";
import { followersForPeriod } from "@/lib/followers";
import { FollowFlowLine } from "@/components/dashboard/follow-flow-line";
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
import { MetricTrendChart, type TrendRow } from "@/components/dashboard/metric-trend-chart";
import { TopicCards } from "@/components/dashboard/topic-cards";
import { PostCover } from "@/components/dashboard/post-cover";
import { KindBadge, PostsBrowser } from "@/components/dashboard/posts-browser";
import { linkedInAnalyticsQueryOptions } from "@/lib/linkedin-api.functions";
import { SavedTopics } from "@/components/dashboard/saved-topics";
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
  type PostRecord,
  publicViewsOf,
  viewsOf,
} from "@/lib/analytics-types";
import { toInputValue, type ResolvedRange } from "@/lib/date-range";

type Tab = "summary" | "posts" | "audience" | "competitors" | "ideas" | "saved";

/** Sections from the original spec that public data cannot fill, per platform. */
const LOCKED = {
  instagram: [
    {
      title: "Audience demographics",
      description: "Age range and gender split",
      rows: ["13–17", "18–24", "25–34", "35–44", "45–54", "55–64", "65+"],
      unlock:
        "Instagram renders these only inside the account owner's own Insights. Switching the account to a Business or Creator account and linking a Facebook Page makes them available through the Meta Graph API, free.",
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
  const { tab: requested = "summary" } = useSearch({ from: "/_app" });
  // A client from Studio: its competitors come from its brand profile.
  const client = useDashboard().client;
  const forClient = client?.isDefault === false;
  // A tracking-only client (migration 0041) sees the tabs built from its own
  // stored posts; Ideas and Saved are the full service.
  const tracking = client?.service === "tracking";
  const tab: Tab = tracking && !TRACKING_TABS.has(requested) ? "summary" : requested;
  // Which Summary card's figure the chart under them shows (18 Nov 2026).
  const [chart, setChart] = useState<ChartKey>("followers");
  // The count on the Saved tab: this account's saved items only.
  const { data: saved } = useQuery({
    ...savedTopicsQueryOptions(data.platform),
    enabled: !tracking,
  });
  // LinkedIn: which posts are articles, with each one's title, reading time
  // and its own page, for the Post / Article label on Top posts (19 Nov 2026).
  const { data: linkedinFigures } = useQuery({
    ...linkedInAnalyticsQueryOptions,
    enabled: data.platform === "linkedin",
  });
  const articleOf = useMemo(
    () => new Map((linkedinFigures?.articles ?? []).map((article) => [article.postId, article])),
    [linkedinFigures],
  );
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
          {forClient
            ? `Press Refresh to collect ${client?.displayName}'s ${meta.label} figures for the first time.`
            : `Press Refresh to collect ${meta.label}'s figures for the first time.`}
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
      const gap: BenchmarkRow["gap"] = rival.aspirational
        ? // The account the client wants to grow into: a target, not a peer.
          { label: "Aspirational account", tone: "neutral" }
        : rateRatio >= 1.25
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
  const trend = trendFor(chart, {
    posts: organic,
    hasViews,
    followers: followersForPeriod(data) ?? latest.followers,
    range,
    typical: summary.typical,
    rate,
    perWeek: summary.postsPerWeek,
  });

  const allTabs: Array<{ id: Tab; label: string }> = [
    { id: "summary", label: "Summary" },
    { id: "posts", label: `Posts · ${posts.length}` },
    { id: "audience", label: "Audience" },
    { id: "competitors", label: `Competitors · ${data.competitors.length}` },
    { id: "ideas", label: "Ideas" },
    { id: "saved", label: saved?.saved.length ? `Saved · ${saved.saved.length}` : "Saved" },
  ];
  const tabs = allTabs.filter((entry) => !tracking || TRACKING_TABS.has(entry.id));

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
              extra={<FollowFlowLine platform={data.platform} range={range} />}
              selected={chart === "followers"}
              onSelect={() => setChart("followers")}
            />
            <Stat
              label={hasViews ? "Typical views per post" : "Typical interactions per post"}
              value={compact(summary.typical)}
              sub={`Middle value of ${summary.posts} post${summary.posts === 1 ? "" : "s"}`}
              tip="Half your posts did better than this and half did worse, so one viral post does not move it."
              selected={chart === "typical"}
              onSelect={() => setChart("typical")}
            />
            <Stat
              label="Engagement rate"
              value={percent(rate, 2)}
              sub={
                hasViews
                  ? "Of viewers who liked, commented or reposted"
                  : "Interactions for every follower who could see a post"
              }
              selected={chart === "rate"}
              onSelect={() => setChart("rate")}
            />
            <Stat
              label="Posts a week"
              value={summary.postsPerWeek.toFixed(1)}
              sub={`${summary.posts} posts in this period`}
              selected={chart === "cadence"}
              onSelect={() => setChart("cadence")}
            />
          </section>

          <Card>
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold">
                  {trend ? trend.title : "Followers over time"}
                </h3>
                {trend ? (
                  <p className="text-[13px] text-muted-foreground tabular-nums">{trend.note}</p>
                ) : firstPoint && lastPoint ? (
                  <p className="text-[13px] text-muted-foreground tabular-nums">
                    {dayMonth(new Date(firstPoint.capturedAt))}: {fullNumber(firstPoint.followers)}{" "}
                    → {dayMonth(new Date(lastPoint.capturedAt))}: {fullNumber(lastPoint.followers)}
                  </p>
                ) : null}
              </div>
              {trend ? (
                <MetricTrendChart
                  rows={trend.rows}
                  color={color}
                  name={trend.name}
                  format={trend.format}
                  reference={trend.reference}
                />
              ) : (
                <GrowthChart points={data.growth} color={color} eras={data.eras ?? []} />
              )}
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
                {ranked.slice(0, 4).map((post) => {
                  const article = articleOf.get(post.postId);
                  const isArticle = !isInstagram && (post.format === "article" || Boolean(article));
                  return (
                    <a
                      key={post.postId}
                      // An article opens on its own page, not the post that shared it.
                      href={article?.url ?? post.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex gap-3 rounded-xl border bg-card p-3 hover:bg-muted/40"
                    >
                      {isInstagram ? <PostCover post={post} className="h-16 w-12" /> : null}
                      <div className="min-w-0">
                        {isInstagram ? null : (
                          <KindBadge article={isArticle} minutes={article?.readMinutes ?? null} />
                        )}
                        <p className="text-base font-bold tabular-nums">
                          {compact(primaryOf(post))} {unit}
                        </p>
                        <p className="line-clamp-2 text-[13px] text-muted-foreground">
                          {article?.title ?? postTitle(post.caption, 60)} ·{" "}
                          {dayMonth(new Date(post.publishedAt))}
                        </p>
                      </div>
                    </a>
                  );
                })}
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
                    {tracking ? null : <DeriveLanes platform={data.platform} mode="refresh" />}
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
              {tracking ? null : <DeriveLanes platform={data.platform} />}
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
                  title={hasViews ? "From views to interactions" : "Its interactions"}
                  rows={funnel}
                  color={color}
                  note={
                    hasViews
                      ? `${percent(engagementsOf(best) / Math.max(viewsOf(best), 1), 2)} of viewers interacted.`
                      : isInstagram
                        ? "Instagram published no view count for these posts, so this starts at interactions."
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

      {tab === "competitors" && forClient && !data.competitors.length ? (
        <Alert>
          <Info className="size-4" aria-hidden />
          <AlertTitle>
            {data.trackedCompetitors.length
              ? "Competitors not collected yet"
              : "No competitors yet"}
          </AlertTitle>
          <AlertDescription>
            {data.trackedCompetitors.length
              ? `Press Refresh to collect ${data.trackedCompetitors.map((h) => `@${h}`).join(", ")}.`
              : `${client?.displayName}'s competitors come from its brand profile in Studio. Add them there, then use Import clients from Studio and Refresh.`}
          </AlertDescription>
        </Alert>
      ) : null}

      {tab === "competitors" && (!forClient || data.competitors.length) ? (
        <CompetitorTable
          rows={benchmark}
          viewsLabel={hasViews ? "Typical views" : "Typical views (n/a)"}
          envVar={isInstagram ? "COMPETITORS_INSTAGRAM" : "COMPETITORS_LINKEDIN"}
        />
      ) : null}

      {/* Its own tab (18 Nov 2026), so saved stories, posts and scripts are not
          mixed in with the ideas: this account's only. */}
      {tab === "saved" ? <SavedTopics only={data.platform} /> : null}

      {tab === "ideas" ? (
        <>
          <AiPanel platform={data.platform} />
          <SectionHeading
            title="Patterns in your own posts"
            note="Each one is found in your numbers, not written by AI"
          />
          <TopicCards recommendations={recommendations} />
          {/* LinkedIn: every post he published, reviewed 14 days after it went
              up, and the lessons the writer reads (post-learning). */}
          {!isInstagram ? (
            <>
              <SectionHeading
                title="What his posts taught"
                note={`Each post reviewed ${POST_REVIEW_DAYS} days after it went up`}
              />
              <PostLessons />
            </>
          ) : null}
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
  extra,
  selected,
  onSelect,
}: {
  label: string;
  value: string;
  sub?: string | undefined;
  tone?: "good" | "bad" | undefined;
  tip?: string;
  /** A second line under `sub`, such as followed and unfollowed. */
  extra?: ReactNode;
  /** Clickable: the chart under the cards shows this figure. */
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <Card
      className={cn(
        "relative transition-colors",
        onSelect && "hover:bg-muted/40",
        selected && "border-primary ring-1 ring-primary",
      )}
    >
      {onSelect ? (
        // Covers the card, under the info tip, so the tip stays its own button.
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={Boolean(selected)}
          aria-label={`Show ${label.toLowerCase()} on the chart`}
          className="absolute inset-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
      ) : null}
      <CardContent className="pointer-events-none space-y-1 p-5">
        <p className="flex items-center gap-1 text-[13px] text-muted-foreground">
          {label}
          {tip ? (
            <span className="pointer-events-auto relative z-10">
              <InfoTip text={tip} />
            </span>
          ) : null}
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
        {extra ? <div className="text-[13px] text-muted-foreground">{extra}</div> : null}
      </CardContent>
    </Card>
  );
}

type ChartKey = "followers" | "typical" | "rate" | "cadence";

const WEEK_MS = 7 * 86_400_000;

/**
 * The bars for a Summary card's figure, or null for followers (GrowthChart).
 * Each uses the card's own basis, so the dashed line is the card's number:
 * views or interactions per post; the rate per post on views where a post has
 * usable views, else per follower (lib/analytics-types engagementRate); and
 * posts in each week from Monday.
 */
function trendFor(
  key: ChartKey,
  input: {
    posts: PostRecord[];
    hasViews: boolean;
    followers: number;
    range: ResolvedRange;
    typical: number;
    rate: number;
    perWeek: number;
  },
): {
  title: string;
  note: string;
  name: string;
  rows: TrendRow[];
  format: (value: number) => string;
  reference?: { value: number; label: string };
} | null {
  const { posts, hasViews, followers, range } = input;
  const byDate = [...posts].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  const label = (post: PostRecord) =>
    `${dayMonth(new Date(post.publishedAt))} · ${postTitle(post.caption, 50)}`;

  if (key === "typical") {
    const unit = hasViews ? "views" : "interactions";
    return {
      title: hasViews ? "Views on each post" : "Interactions on each post",
      note: `Dashed line: your typical post, ${compact(input.typical)} ${unit}`,
      name: hasViews ? "Views" : "Interactions",
      rows: byDate.map((post) => ({
        date: post.publishedAt,
        value: hasViews ? viewsOf(post) : engagementsOf(post),
        label: label(post),
        url: post.url ?? null,
      })),
      format: compact,
      reference: { value: input.typical, label: `Typical ${compact(input.typical)}` },
    };
  }

  if (key === "rate") {
    // The same basis the card's rate uses (engagementRate): public views when
    // any post has a usable public count, else interactions per follower.
    // Instagram's own view figures (post.insight) are not that basis, so a
    // period whose posts have only those is measured per follower.
    const usable = (post: PostRecord) =>
      publicViewsOf(post) > 0 && engagementsOf(post) <= publicViewsOf(post);
    const onViews = byDate.some(usable);
    const rows = byDate
      .map((post) => {
        const engagements = engagementsOf(post);
        const value = onViews
          ? usable(post)
            ? engagements / publicViewsOf(post)
            : null
          : followers > 0
            ? engagements / followers
            : null;
        return value == null
          ? null
          : { date: post.publishedAt, value, label: label(post), url: post.url ?? null };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
    return {
      title: "Engagement rate on each post",
      note: `${onViews ? "Interactions ÷ views" : "Interactions ÷ followers"} · dashed line: the period's rate, ${percent(input.rate, 2)}`,
      name: "Engagement rate",
      rows,
      format: (value) => percent(value, value < 0.01 ? 2 : 1),
      reference: { value: input.rate, label: percent(input.rate, 2) },
    };
  }

  if (key === "cadence") {
    if (!byDate.length) {
      return { title: "Posts each week", note: "", name: "Posts", rows: [], format: String };
    }
    const monday = (time: number) => {
      const day = new Date(time);
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
      return day.getTime();
    };
    const first = Date.parse(byDate[0]!.publishedAt);
    const start = monday(range.from ? Math.max(range.from.getTime(), 0) : first);
    const end = range.to ? range.to.getTime() - 1 : Date.now();
    const counts = new Map<number, number>();
    for (const post of byDate) {
      const week = monday(Date.parse(post.publishedAt));
      counts.set(week, (counts.get(week) ?? 0) + 1);
    }
    const rows: TrendRow[] = [];
    for (let week = start; week <= end; week += WEEK_MS) {
      // Recomputed from the date each time, so a clock change never shifts the weeks.
      const at = monday(week + 12 * 3_600_000);
      rows.push({
        date: new Date(at).toISOString(),
        value: counts.get(at) ?? 0,
        label: `Week of ${dayMonth(new Date(at))}`,
      });
      week = at;
    }
    return {
      title: "Posts each week",
      note: `Dashed line: ${input.perWeek.toFixed(1)} a week on average`,
      name: "Posts",
      rows,
      format: (value) => String(Math.round(value)),
      reference: { value: input.perWeek, label: `${input.perWeek.toFixed(1)} a week` },
    };
  }

  return null;
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
