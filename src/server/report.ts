// Layer 7 — the client report view's data.
//
// This is the artifact a client actually reads, so it is deliberately narrower
// than the agency console: growth, what worked, and how the system's own advice
// has held up. No competitor names, no unpublished suggestions, no cost figures.
//
// The honesty rule from Layer 4 carries through here unchanged. Where a niche
// has not graduated, this returns the cold-start calibration report and the view
// says plainly that accuracy improves as more posts are tracked.
import { trackedCompetitorSnapshots } from "./competitors";
import { activeClient } from "./clients/context";
import {
  clientCompetitorSnapshots,
  readClientBenchmarks,
  readClientCompetitors,
} from "./clients/store";
import { hasInstagramGraph } from "./graph/client";
import { ownerAccount } from "./apify/accounts";
import { calibrationReport, currentNiche } from "./predict";
import {
  growthSeries,
  latestSnapshot,
  readClient,
  readOutcomes,
  readPosts,
  readEras,
  readInsights,
} from "./store";
import { hasDurableStore } from "./store";
import {
  PLATFORM_IDS,
  lanePerformance,
  organicPosts,
  viewsOf,
  type GrowthPoint,
  type PostRecord,
} from "@/lib/analytics-types";
import {
  DEFAULT_PRIMARY_METRIC,
  GOAL_LABEL,
  growthTrajectory,
  type GrowthTrajectory,
} from "@/lib/growth";
import { goalScorecard } from "@/lib/goal-scorecard";
import { followersIn, monthlyReview, type MonthlyReview } from "@/lib/monthly-review";
import { istDay, periodWindow, previousWindow } from "@/lib/report-periods";
import { withLinkedIn } from "@/lib/linkedin-review";
import { readLinkedInAnalytics, readLinkedInDays, readLinkedInPeriod } from "./linkedin-analytics";
import type { ReportRange } from "@/lib/report-types";
import type { ClientReport, ClientReportPlatform, PeriodTotals } from "@/lib/report-types";

/** What the account published and earned across `posts`: organic only. */
export function periodTotals(posts: PostRecord[]): PeriodTotals {
  const organic = posts.filter((post) => !post.pinned);
  const likes = organic.reduce((sum, post) => sum + post.likes, 0);
  const comments = organic.reduce((sum, post) => sum + post.comments, 0);
  const formats: PeriodTotals["formats"] = {};
  for (const post of organic) formats[post.format] = (formats[post.format] ?? 0) + 1;
  return {
    posts: organic.length,
    views: organic.reduce((sum, post) => sum + viewsOf(post), 0),
    likes,
    comments,
    interactionsPerPost: organic.length ? Math.round((likes + comments) / organic.length) : 0,
    formats,
  };
}

/** The follower change across `points`, oldest to newest; null without two of them. */
export function followerChange(points: GrowthPoint[]): number | null {
  const first = points[0];
  const last = points[points.length - 1];
  return first && last && points.length > 1 ? last.followers - first.followers : null;
}

/** Posts worth showing a client: their own, organic, best first. */
function bestPosts(posts: PostRecord[], limit: number): PostRecord[] {
  return organicPosts(posts)
    .slice()
    .sort((a, b) => {
      const aScore = a.insight?.reach || a.insight?.views || a.views || a.likes;
      const bScore = b.insight?.reach || b.insight?.views || b.views || b.likes;
      return bScore - aScore;
    })
    .slice(0, limit);
}

// Where a period starts and ends, and the period it is compared with, live in
// lib/report-periods.ts (26 Nov 2026) so the period dropdown agrees with them.
export { periodWindow, previousWindow };

async function platformReport(
  platform: (typeof PLATFORM_IDS)[number],
  primaryMetric: string,
  engagementStart: string | null,
  range: ReportRange,
): Promise<ClientReportPlatform | null> {
  const owner = ownerAccount(platform);
  // A client from Studio (Phase 5) has its own account figures, but no
  // suggestions, predictions or outcomes yet: those are Pritesh's alone, so
  // they are never read for a client and the sections built on them are left
  // out of its report.
  const forClient = activeClient() !== null;

  const [snapshot, allGrowth, allPosts, outcomes, eras] = await Promise.all([
    latestSnapshot(platform, owner.handle).catch(() => null),
    growthSeries(platform, owner.handle).catch(() => []),
    // Enough for a 90-day period and the 90 days before it (Pritesh posts
    // about twice a day across both platforms); the default 60 cut it short.
    readPosts(platform, owner.handle, 400).catch(() => [] as PostRecord[]),
    forClient ? Promise.resolve([]) : readOutcomes(platform).catch(() => []),
    readEras(platform, owner.handle).catch(() => []),
  ]);

  // The period scopes what the client reads as "this period": the follower
  // change, the best posts and the lanes. The track-record sections below —
  // calibration and the goal scorecard — stay cumulative on purpose: they
  // answer "has the advice worked", which a 30-day slice would answer from
  // a handful of posts.
  const window = periodWindow(range);
  const { since, until, label: periodLabel } = window;
  // Stored times are ISO strings, so they compare in time order.
  const inPeriod = (iso: string) => (!since || iso >= since) && (!until || iso < until);
  const growth = allGrowth.filter((point) => inPeriod(point.capturedAt));
  const posts = allPosts.filter((post) => inPeriod(post.publishedAt));
  const before = previousWindow(range);
  const inBefore = (iso: string) =>
    Boolean(before?.since && iso >= before.since && (!before.until || iso < before.until));

  // Nothing synced for this platform yet — omitted entirely rather than shown
  // as an empty section, which reads to a client as a broken report.
  if (!snapshot) return null;

  const calibration = forClient
    ? {
        made: 0,
        scored: 0,
        directionalHits: 0,
        insideRange: 0,
        calibrated: false,
        note: "",
        samples: [],
      }
    : await calibrationReport(platform, await currentNiche(platform).catch(() => platform));

  // From the last sync before the period (when it is within four days), so a
  // month's change runs from the end of the month before: the same figure as
  // the monthly report's (lib/monthly-review.ts), on both reports.
  const followers = followersIn(allGrowth, since, until);
  const followersGained = followers.followerChange ?? 0;
  const periodDays = followers.followerDays ?? 0;

  const monthly =
    window.monthly && before
      ? await monthlyFor({
          platform,
          forClient,
          window,
          before,
          posts,
          previousPosts: allPosts.filter((post) => inBefore(post.publishedAt)),
          growth: allGrowth,
          handle: snapshot.handle,
          displayName: snapshot.displayName,
        }).catch((error: unknown) => {
          console.error(`[report:${platform}] monthly review failed:`, error);
          return null;
        })
      : null;

  return {
    platform,
    monthly,
    handle: snapshot.handle,
    displayName: snapshot.displayName,
    followers: snapshot.followers,
    growth,
    followersGained,
    periodDays,
    postsTracked: organicPosts(posts).length,
    topPosts: bestPosts(posts, 5),
    lanes: lanePerformance(posts),
    calibration,
    trajectory: growthTrajectory(
      allGrowth,
      primaryMetric,
      engagementStart,
    ) as GrowthTrajectory | null,
    // A.5 — weeks containing a published suggestion, against the rest.
    eras: eras.map((era) => ({ startsAt: era.startsAt, label: era.label })),
    periodLabel,
    totals: periodTotals(posts),
    previous: before
      ? {
          ...periodTotals(allPosts.filter((post) => inBefore(post.publishedAt))),
          followersGained: followerChange(allGrowth.filter((point) => inBefore(point.capturedAt))),
        }
      : null,
    goalScore: forClient
      ? null
      : goalScorecard(
          allGrowth,
          outcomes
            .filter((row) => row.excludedReason == null)
            .map((row) => row.publishedAt ?? row.measuredAt)
            .filter((iso): iso is string => Boolean(iso)),
          primaryMetric,
          engagementStart,
        ),
  };
}

/**
 * The monthly report for one platform (26 Nov 2026): the two periods' posts
 * and syncs, the tracked competitors as the dashboard reads them, and
 * Instagram's own panel. Read-only, like the rest of the report.
 */
async function monthlyFor(input: {
  platform: (typeof PLATFORM_IDS)[number];
  forClient: boolean;
  window: ReturnType<typeof periodWindow>;
  before: NonNullable<ReturnType<typeof previousWindow>>;
  posts: PostRecord[];
  previousPosts: PostRecord[];
  growth: GrowthPoint[];
  handle: string;
  displayName: string;
}): Promise<MonthlyReview> {
  const { platform, window, before } = input;
  const chosen = activeClient();
  // The same competitors, and the same 60 stored posts each, as the
  // dashboard's competitor table, so the two never disagree.
  const [snapshots, aspirational, insights] = await Promise.all([
    chosen
      ? readClientCompetitors(chosen.id, platform)
          .then((handles) => clientCompetitorSnapshots(platform, handles))
          .catch(() => [])
      : trackedCompetitorSnapshots(platform).catch(() => []),
    chosen
      ? readClientBenchmarks(chosen.id, platform).catch(() => [] as string[])
      : Promise.resolve([] as string[]),
    platform === "instagram" && hasInstagramGraph() && !input.forClient
      ? readInsights(platform, ownerAccount(platform).handle).catch(() => null)
      : Promise.resolve(null),
  ]);
  const rivals = await Promise.all(
    snapshots.map(async (snapshot) => ({
      handle: snapshot.handle,
      displayName: snapshot.displayName,
      followers: snapshot.followers,
      posts: await readPosts(platform, snapshot.handle).catch(() => [] as PostRecord[]),
      ...(aspirational.includes(snapshot.handle) ? { aspirational: true } : {}),
    })),
  );
  const ends = window.until ? Date.parse(window.until) : Date.now();
  const previousDays = Math.max(
    1,
    Math.round(
      ((before.until ? Date.parse(before.until) : Date.now()) - Date.parse(before.since!)) /
        86_400_000,
    ),
  );
  const review = monthlyReview({
    platform,
    current: { posts: input.posts, since: window.since, until: window.until, days: window.days },
    previous: {
      posts: input.previousPosts,
      since: before.since,
      until: before.until,
      days: previousDays,
    },
    growth: input.growth,
    handle: input.handle,
    displayName: input.displayName,
    labels: {
      currentShort: window.short,
      previousShort: before.short,
      currentName: window.name,
      previousName: before.name,
    },
    rivals,
    insights,
    // Instagram's panel is the last 28 days up to its capture: it describes a
    // period only when that period ended within the last few days.
    periodIsRecent: Date.now() - ends <= 3 * 86_400_000,
  });
  return platform === "linkedin"
    ? withLinkedInFigures(review, input, window, before).catch((error: unknown) => {
        console.error("[report:linkedin] LinkedIn figures unavailable:", error);
        return review;
      })
    : review;
}

/** LinkedIn's day for an instant, as YYYY-MM-DD in IST, the report's days. */
const linkedInDay = (ms: number) => {
  const { year, month, day } = istDay(ms);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

/**
 * LinkedIn's own figures for both periods (26 Nov 2026): stored days, each
 * post's impressions, and members reached, which LinkedIn is asked for once
 * per period a day (free; cached, as the LinkedIn page does). Without a
 * LinkedIn connection or stored days, the review is returned as it was.
 */
async function withLinkedInFigures(
  review: MonthlyReview,
  input: { posts: PostRecord[]; previousPosts: PostRecord[] },
  window: ReturnType<typeof periodWindow>,
  before: NonNullable<ReturnType<typeof previousWindow>>,
): Promise<MonthlyReview> {
  const days = await readLinkedInDays();
  if (!days.length) return review;
  const span = (since: string, until: string | null) => ({
    start: linkedInDay(Date.parse(since)),
    // Exclusive: the day after the last day touched, so "1–26 Oct" (ending
    // mid-26 Oct, the same days as November so far) includes 26 Oct; for
    // "up to now", tomorrow.
    end: linkedInDay((until ? Date.parse(until) - 1 : Date.now()) + 86_400_000),
  });
  const current = span(window.since!, window.until);
  const previous = span(before.since!, before.until);
  const [nowReach, thenReach, analytics] = await Promise.all([
    readLinkedInPeriod(current).catch(() => null),
    readLinkedInPeriod(previous).catch(() => null),
    readLinkedInAnalytics().catch(() => null),
  ]);
  const impressions: Record<string, number> = {};
  for (const row of analytics?.posts ?? [])
    if (row.impressions !== null) impressions[row.postId] = row.impressions;
  return withLinkedIn(review, {
    days,
    current: { ...current, membersReached: nowReach?.membersReached ?? null },
    previous: { ...previous, membersReached: thenReach?.membersReached ?? null },
    impressions,
    currentPosts: input.posts,
    previousPosts: input.previousPosts,
  });
}

/**
 * The whole report.
 *
 * Deliberately read-only and side-effect free: opening it must never trigger a
 * sync. A client may open this link at any hour, and a page that quietly spends
 * Apify credit each time it is viewed is a bill nobody agreed to.
 */
export async function loadReport(range: ReportRange = { period: "30d" }): Promise<ClientReport> {
  const client = await readClient().catch(() => null);
  const primaryMetric = client
    ? client.primaryMetric || DEFAULT_PRIMARY_METRIC[client.growthGoal]
    : "follower_growth_rate";

  const platforms = (
    await Promise.all(
      PLATFORM_IDS.map((platform) =>
        platformReport(platform, primaryMetric, client?.engagementStart ?? null, range).catch(
          (error: unknown) => {
            console.error(`[report:${platform}] failed:`, error);
            return null;
          },
        ),
      ),
    )
  ).filter((entry): entry is ClientReportPlatform => entry !== null);

  // Tracked-competitor COUNT only. A client report says how broad the benchmark
  // set is without naming anyone in it — those handles are the agency's
  // research, and a shareable link is the wrong place for them.
  const chosen = activeClient();
  const tracked = await Promise.all(
    PLATFORM_IDS.map((platform) =>
      chosen
        ? readClientCompetitors(chosen.id, platform).catch(() => [])
        : trackedCompetitorSnapshots(platform).catch(() => []),
    ),
  );

  return {
    generatedAt: new Date().toISOString(),
    period: range.period,
    periodLabel: periodWindow(range).label,
    previousLabel: previousWindow(range)?.label ?? null,
    previousName: previousWindow(range)?.name ?? null,
    monthly: periodWindow(range).monthly,
    goal: client
      ? {
          growthGoal: client.growthGoal,
          primaryMetric,
          label: GOAL_LABEL[client.growthGoal],
        }
      : null,
    platforms,
    benchmarkedAgainst: tracked.reduce((sum, list) => sum + list.length, 0),
    suggestions: !chosen,
    // Set per viewer by forViewer; loadReport itself does not know who asks.
    admin: false,
    ephemeral: !hasDurableStore(),
  };
}

/**
 * The report as one viewer may see it (27 Nov 2026). The Technical
 * performance report is for admins: anyone else gets the Performance
 * report's figures and none of the team's working out (the goal's trend,
 * whether our advice moved it, how our predictions have held up, the
 * strategy-change markers), so it cannot be read from the page's data either.
 */
export function forViewer(report: ClientReport, admin: boolean): ClientReport {
  if (admin) return { ...report, admin: true };
  return {
    ...report,
    admin: false,
    goal: null,
    benchmarkedAgainst: 0,
    platforms: report.platforms.map((entry) => ({
      ...entry,
      trajectory: null,
      goalScore: null,
      eras: [],
      calibration: {
        made: 0,
        scored: 0,
        directionalHits: 0,
        insideRange: 0,
        calibrated: false,
        note: "",
        samples: [],
      },
    })),
  };
}
