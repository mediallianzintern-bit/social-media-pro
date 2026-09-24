import { AlertTriangle, ExternalLink, Eye, Heart, Info, Send, Users } from "lucide-react";
import { useMemo } from "react";

import { AiPanel } from "@/components/dashboard/ai-panel";
import { CompetitorTable, type BenchmarkRow } from "@/components/dashboard/competitor-table";
import { ContentTiles } from "@/components/dashboard/content-tiles";
import { GrowthChart } from "@/components/dashboard/growth-chart";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import { InsightsPanels } from "@/components/dashboard/insights-panels";
import { LearningPanel } from "@/components/dashboard/learning-panel";
import { LockedPanel } from "@/components/dashboard/locked-panel";
import { MetricBars, type BarRow } from "@/components/dashboard/metric-bars";
import { PostPerformanceChart } from "@/components/dashboard/post-performance-chart";
import { PostsTable } from "@/components/dashboard/posts-table";
import { TopicCards } from "@/components/dashboard/topic-cards";
import { SectionHeading } from "@/components/dashboard/section-heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { compactNumber, fullNumber, percent, shortDate } from "@/lib/format";
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
import type { ResolvedRange } from "@/lib/date-range";

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
      rows: ["Impressions", "Members reached", "Unique view rate"],
      unlock:
        "LinkedIn publishes no member-analytics API at any access tier, and impressions never appear on a public post. These are available only as a manual export from Pritesh's own LinkedIn analytics screen.",
    },
    {
      title: "Who you reach vs who follows you",
      description: "Industry, seniority and top companies",
      rows: ["Industry breakdown", "Seniority breakdown", "Top companies in reach"],
      unlock:
        "Owner-only, and unavailable via API for personal profiles. A LinkedIn company Page would expose these — a personal profile never does.",
    },
  ],
} as const;

export function PlatformView({ data, range }: { data: PlatformData; range: ResolvedRange }) {
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
          Add {data.missingEnv?.join(", ")} to <code>.env</code>, restart the dev server, then press
          Sync.
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
          Press Sync to scrape {meta.label} for the first time. Every screen is built from stored
          syncs.
        </AlertDescription>
      </Alert>
    );
  }

  const { latest, posts } = data;
  const organic = organicPosts(posts);
  const pinnedCount = posts.length - organic.length;
  const hasViews = insights.useViews;
  const metric = hasViews ? ("views" as const) : ("engagements" as const);
  const primaryOf = (post: (typeof posts)[number]) =>
    hasViews ? viewsOf(post) : engagementsOf(post);

  const ranked = [...organic].sort((a, b) => primaryOf(b) - primaryOf(a));
  const best = ranked[0];
  const rate = engagementRate(posts, latest.followers);
  const totalInteractions = organic.reduce((sum, post) => sum + engagementsOf(post), 0);

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
          ? { label: `Engages ${rateRatio.toFixed(1)}× better`, tone: "bad" }
          : rateRatio > 0 && rateRatio <= 0.8
            ? { label: "You engage better", tone: "good" }
            : followerRatio >= 2
              ? { label: `${followerRatio.toFixed(1)}× your audience`, tone: "warn" }
              : { label: "Comparable", tone: "neutral" };
      return { ...rival, gap };
    }),
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex size-10 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: color }}
          >
            <meta.icon className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold">{latest.displayName}</p>
            <a
              href={data.profileUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {data.profileUrl.replace("https://www.", "")}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {range.label} · {organic.length} post{organic.length === 1 ? "" : "s"}
        </p>
      </div>

      {/* ---- Overview ---- */}
      <SectionHeading title="Overview" note={range.label} />
      <section aria-label="Headline metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Followers"
          value={fullNumber(latest.followers)}
          icon={Users}
          hint={latest.following ? `${compactNumber(latest.following)} following` : undefined}
          accent={color}
        />
        <KpiTile
          label="Interactions"
          value={fullNumber(totalInteractions)}
          icon={Heart}
          hint={`${organic.length} posts${pinnedCount ? ` · ${pinnedCount} pinned excluded` : ""}`}
          accent={color}
        />
        <KpiTile
          label="Engagement rate"
          value={percent(rate, 2)}
          icon={Eye}
          hint={hasViews ? "interactions ÷ views" : "interactions ÷ follower-impressions"}
          accent={color}
        />
        <KpiTile
          label={hasViews ? "Top post views" : "Top post interactions"}
          value={best ? compactNumber(primaryOf(best)) : "—"}
          icon={Send}
          hint={best ? shortDate(best.publishedAt) : undefined}
          accent={color}
        />
      </section>

      {/* ---- Growth ---- */}
      <SectionHeading title="Follower growth" note="One point per stored sync" />
      <Card>
        <CardContent className="pt-6">
          <GrowthChart points={data.growth} color={color} />
        </CardContent>
      </Card>

      {/* ---- Top content ---- */}
      <SectionHeading title={hasViews ? "Top content by views" : "Top content by interactions"} />
      <ContentTiles posts={ranked.slice(0, 4)} color={color} metric={metric} />

      {/* ---- Best performer + distribution ---- */}
      {best ? (
        <>
          <SectionHeading
            title="Best performer breakdown"
            note={best.caption.split(/[.!?\n]/)[0]?.slice(0, 60) ?? ""}
          />
          <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <MetricBars
              title="Engagement funnel"
              description="Only the rows a public profile actually publishes."
              rows={funnel}
              color={color}
              note={
                hasViews
                  ? `${percent(engagementsOf(best) / Math.max(viewsOf(best), 1), 2)} of viewers interacted. Reach, saves and shares are owner-only — see the locked panel below.`
                  : "LinkedIn publishes no view count on personal posts, so this funnel starts at interactions."
              }
            />
            <MetricBars
              title={hasViews ? "Median views by format" : "Median interactions by format"}
              rows={formatRows}
              color={color}
              note={
                formatRows.some((row) => row.muted)
                  ? "Dimmed formats have fewer than 3 posts in this window — too few to compare."
                  : undefined
              }
            />
          </div>
        </>
      ) : null}

      {/* ---- Performance over time ---- */}
      {organic.length ? (
        <>
          <SectionHeading title={hasViews ? "Views per post" : "Interactions per post"} />
          <Card>
            <CardHeader>
              <CardDescription>
                Oldest to newest. Solid bars are posts at 3× the median or better.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PostPerformanceChart posts={organic} color={color} metric={metric} />
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* ---- Timing ---- */}
      {dayRows.length > 1 ? (
        <>
          <SectionHeading title="When posts land best" note="By weekday, median performance" />
          <MetricBars
            title={hasViews ? "Median views by weekday" : "Median interactions by weekday"}
            rows={dayRows}
            color={color}
            note="Sample sizes are small at this cadence — read this as a direction to test, not a rule."
          />
        </>
      ) : null}

      {/* ---- Owner-only sections ----
           Unlocked on Instagram once a Meta Graph token is configured; still
           locked on LinkedIn, which publishes no member-analytics API at any
           access tier. */}
      {data.insights ? (
        <>
          <SectionHeading title="Owner-only metrics" note="Measured by Instagram, not scraped" />
          <InsightsPanels insights={data.insights} posts={data.posts} color={color} />
        </>
      ) : (
        <>
          <SectionHeading title="Owner-only metrics" note="Not available from public data" />
          <div className="grid gap-4 lg:grid-cols-2">
            {LOCKED[data.platform].map((panel) => (
              <LockedPanel key={panel.title} {...panel} rows={[...panel.rows]} />
            ))}
          </div>
        </>
      )}

      {/* ---- Content lanes and the learning scorecard ---- */}
      {data.learning ? (
        <>
          <SectionHeading
            title="Content lanes"
            note="What this account publishes, scored against itself"
          />
          <LearningPanel learning={data.learning} />
        </>
      ) : null}

      {/* ---- Competitors ---- */}
      <SectionHeading title="Competitor analysis" />
      <CompetitorTable
        rows={benchmark}
        viewsLabel={hasViews ? "Med. views" : "Med. views (n/a)"}
        envVar={isInstagram ? "COMPETITORS_INSTAGRAM" : "COMPETITORS_LINKEDIN"}
      />

      {/* ---- AI layer ----
          The Google Trends strip that stood here is superseded by the topic
          inbox inside AiPanel: it returned bare search terms with nothing to
          read, and its actor failed on both paid runs. */}

      <AiPanel platform={data.platform} />

      {/* ---- Rule-based plays ----
          Renamed away from "Next reel to make", which now labels the AI ideas
          above. These cards cannot name a subject — they are triggered by a
          measured pattern with no model involved, so the most they can honestly
          say is "reuse this structure" or "move this slot". Calling them the
          next reel implied a topic they never contained. */}
      <SectionHeading
        title="Plays from your own data"
        note="Rule-based — each card is triggered by a measured pattern, no model involved"
      />
      <TopicCards recommendations={recommendations} />

      {/* ---- Ledger ---- */}
      <SectionHeading title="All posts in this window" />
      <Card>
        <CardContent className="pt-6">
          <PostsTable posts={posts} showViews={hasViews} />
        </CardContent>
      </Card>
    </>
  );
}
