// Layer 7 — the client report view's data.
//
// This is the artifact a client actually reads, so it is deliberately narrower
// than the agency console: growth, what worked, and how the system's own advice
// has held up. No competitor names, no unpublished suggestions, no cost figures.
//
// The honesty rule from Layer 4 carries through here unchanged. Where a niche
// has not graduated, this returns the cold-start calibration report and the view
// says plainly that accuracy improves as more posts are tracked.
import { OWNER_ACCOUNTS } from "./apify/accounts";
import { calibrationReport, currentNiche } from "./predict";
import {
  competitorSnapshots,
  growthSeries,
  latestSnapshot,
  readClient,
  readOutcomes,
  readPosts,
} from "./store";
import { hasDurableStore } from "./store";
import {
  PLATFORM_IDS,
  lanePerformance,
  organicPosts,
  type PostRecord,
} from "@/lib/analytics-types";
import {
  DEFAULT_PRIMARY_METRIC,
  GOAL_LABEL,
  growthTrajectory,
  type GrowthTrajectory,
} from "@/lib/growth";
import { goalScorecard } from "@/lib/goal-scorecard";
import type { ClientReport, ClientReportPlatform } from "@/lib/report-types";

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

async function platformReport(
  platform: (typeof PLATFORM_IDS)[number],
  primaryMetric: string,
  engagementStart: string | null,
): Promise<ClientReportPlatform | null> {
  const owner = OWNER_ACCOUNTS[platform];

  const [snapshot, growth, posts, outcomes] = await Promise.all([
    latestSnapshot(platform, owner.handle).catch(() => null),
    growthSeries(platform, owner.handle).catch(() => []),
    readPosts(platform, owner.handle).catch(() => [] as PostRecord[]),
    readOutcomes(platform).catch(() => []),
  ]);

  // Nothing synced for this platform yet — omitted entirely rather than shown
  // as an empty section, which reads to a client as a broken report.
  if (!snapshot) return null;

  const niche = await currentNiche(platform).catch(() => platform);
  const calibration = await calibrationReport(platform, niche);

  const first = growth[0];
  const last = growth[growth.length - 1];
  const followersGained = first && last ? last.followers - first.followers : 0;
  const periodDays =
    first && last
      ? Math.max(
          1,
          Math.round(
            (new Date(last.capturedAt).getTime() - new Date(first.capturedAt).getTime()) /
              (24 * 60 * 60 * 1000),
          ),
        )
      : 0;

  return {
    platform,
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
    trajectory: growthTrajectory(growth, primaryMetric, engagementStart) as GrowthTrajectory | null,
    // A.5 — weeks containing a published suggestion, against the rest.
    goalScore: goalScorecard(
      growth,
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
 * The whole report.
 *
 * Deliberately read-only and side-effect free: opening it must never trigger a
 * sync. A client may open this link at any hour, and a page that quietly spends
 * Apify credit each time it is viewed is a bill nobody agreed to.
 */
export async function loadReport(): Promise<ClientReport> {
  const client = await readClient().catch(() => null);
  const primaryMetric = client
    ? client.primaryMetric || DEFAULT_PRIMARY_METRIC[client.growthGoal]
    : "follower_growth_rate";

  const platforms = (
    await Promise.all(
      PLATFORM_IDS.map((platform) =>
        platformReport(platform, primaryMetric, client?.engagementStart ?? null).catch(
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
  const tracked = await Promise.all(
    PLATFORM_IDS.map((platform) => competitorSnapshots(platform).catch(() => [])),
  );

  return {
    generatedAt: new Date().toISOString(),
    goal: client
      ? {
          growthGoal: client.growthGoal,
          primaryMetric,
          label: GOAL_LABEL[client.growthGoal],
        }
      : null,
    platforms,
    benchmarkedAgainst: tracked.reduce((sum, list) => sum + list.length, 0),
    ephemeral: !hasDurableStore(),
  };
}
