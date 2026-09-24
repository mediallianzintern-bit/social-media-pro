// Read path: assembles the dashboard from stored snapshots. This never calls
// Apify — the page must render instantly from history, and syncing is a
// separate, explicit action.
import { mergeCompetitors, OWNER_ACCOUNTS } from "./apify/accounts";
import { apifyToken } from "./apify/client";
import { hasInstagramGraph, missingGraphEnv } from "./graph/client";
import { suggestionFeedback } from "./ai/feedback";
import { taxonomyLooksStale } from "./ai/lanes";
import { DEFAULT_PRIMARY_METRIC, GOAL_LABEL, growthTrajectory } from "@/lib/growth";
import { goalReadFor, laneExpectations } from "@/lib/prediction";
import {
  competitorSnapshots,
  growthSeries,
  hasDurableStore,
  lastSyncAt,
  latestSnapshot,
  readInsights,
  readPosts,
  readWatchlist,
  readClient,
} from "./store";
import {
  cadence,
  engagementRate,
  engagementsOf,
  lanePerformance,
  median,
  medianViews,
  PLATFORM_IDS,
  SYNC_INTERVAL_MS,
  type CompetitorRecord,
  type DashboardData,
  type PlatformData,
  type PlatformId,
} from "@/lib/analytics-types";

/**
 * Only Apify is required to sync. Supabase is what makes history durable, and
 * its absence degrades the growth curve rather than blocking the dashboard.
 */
function missingEnv(): string[] {
  return apifyToken() ? [] : ["APIFY_TOKEN"];
}

/**
 * Retries a read that failed for a reason that is not about our data.
 *
 * Supabase occasionally rejects a perfectly valid request with "JWT issued at
 * future" — a clock disagreement between its own edge nodes, lasting seconds.
 * It is invisible in the data and permanent on screen: one failed read here
 * rejects the whole Promise.all below, the catch marks the platform errored,
 * and a working dashboard reads as broken until someone reloads at the right
 * moment.
 *
 * Only transient classes are retried. A genuine error — a missing column, a bad
 * query — must still surface immediately rather than being tried three times and
 * reported late.
 */
const TRANSIENT = /JWT issued at future|fetch failed|ECONNRESET|ETIMEDOUT|503|504|upstream/i;

async function resilient<T>(label: string, run: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      last = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!TRANSIENT.test(message) || attempt === attempts) throw error;
      console.warn(
        `[dashboard] ${label} failed (${message}) — retry ${attempt} of ${attempts - 1}`,
      );
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  throw last;
}

async function loadPlatform(platform: PlatformId): Promise<PlatformData> {
  const owner = OWNER_ACCOUNTS[platform];
  const base: Omit<PlatformData, "status"> = {
    platform,
    profileUrl: owner.profileUrl,
    latest: null,
    growth: [],
    posts: [],
    competitors: [],
    trackedCompetitors: [],
    lastSyncedAt: null,
  };

  const missing = missingEnv();
  if (missing.length) {
    return { ...base, status: "unconfigured", missingEnv: missing };
  }

  try {
    const [latest, growth, posts, competitors, syncedAt, discovered, insights] = await Promise.all([
      resilient("latestSnapshot", () => latestSnapshot(platform, owner.handle)),
      resilient("growthSeries", () => growthSeries(platform, owner.handle)),
      resilient("readPosts", () => readPosts(platform, owner.handle)),
      resilient("competitorSnapshots", () => competitorSnapshots(platform)),
      resilient("lastSyncAt", () => lastSyncAt(platform)),
      readWatchlist(platform).catch(() => [] as string[]),
      // Instagram-only, and never fatal: the owner-only panels degrade back to
      // their locked state rather than taking the whole platform down.
      platform === "instagram" && hasInstagramGraph()
        ? readInsights(platform, owner.handle).catch(() => null)
        : Promise.resolve(null),
    ]);

    if (!latest) {
      return { ...base, status: "empty", lastSyncedAt: syncedAt };
    }

    // Competitor metrics are computed from their own stored posts, using the
    // same functions as the owner account so the columns are like-for-like.
    const competitorRecords: CompetitorRecord[] = await Promise.all(
      competitors.map(async (snapshot) => {
        const rivalPosts = await readPosts(platform, snapshot.handle).catch(() => []);
        return {
          handle: snapshot.handle,
          displayName: snapshot.displayName,
          followers: snapshot.followers,
          medianViews: medianViews(rivalPosts),
          medianEngagements: median(rivalPosts.map((post) => engagementsOf(post))),
          postsPerWeek: cadence(rivalPosts),
          engagementRate: engagementRate(rivalPosts, snapshot.followers),
        };
      }),
    );

    // §7 scorecard. Read-only and cheap: lanes are already on the stored posts
    // and the suggestion join is one indexed query, so nothing here calls a
    // model or an actor. Never fatal — the dashboard predates all of it.
    const lanes = lanePerformance(posts);
    const suggestions = await suggestionFeedback(platform).catch((error: unknown) => {
      console.error(`[dashboard:${platform}] suggestion feedback unavailable:`, error);
      return null;
    });
    const learning =
      lanes.length || suggestions
        ? { suggestions, lanes, taxonomyStale: taxonomyLooksStale(posts) }
        : null;

    return {
      platform,
      status: "ok",
      profileUrl: owner.profileUrl,
      latest,
      growth,
      posts,
      competitors: competitorRecords,
      trackedCompetitors: mergeCompetitors(platform, discovered).map((account) => account.handle),
      lastSyncedAt: syncedAt,
      ...(learning ? { learning } : {}),
      ...(insights ? { insights } : {}),
      ...(platform === "instagram" && !hasInstagramGraph()
        ? { insightsMissingEnv: missingGraphEnv() }
        : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[dashboard:${platform}]`, message);
    return { ...base, status: "error", error: message };
  }
}

export async function loadDashboard(): Promise<DashboardData> {
  const client = await readClient().catch(() => null);
  const primaryMetric = client
    ? client.primaryMetric || DEFAULT_PRIMARY_METRIC[client.growthGoal]
    : "follower_growth_rate";

  const platforms = await Promise.all(
    PLATFORM_IDS.map(async (platform) => {
      const data = await loadPlatform(platform);

      // The lane table and the reel suggestions were ranking on different
      // figures and neither screen said so: the table's multiple is REACH,
      // while the strategist orders lanes by the goal metric. A lane could
      // therefore read 0.4x in red and still be the one every suggestion
      // aimed at, which is indistinguishable from a bug unless you know both
      // rules. Computing the goal read here puts the second figure on the
      // table beside the first, so the two panels can be reconciled by
      // looking rather than by asking.
      const goalByLane =
        client && data.learning?.lanes.length
          ? laneExpectations(data.posts, data.learning.lanes).map((expectation) => {
              const read = goalReadFor(expectation, client.growthGoal);
              return {
                lane: expectation.lane,
                metric: read?.metric ?? "",
                multiple: read?.multiple ?? null,
                servesGoal: read?.servesGoal ?? false,
                // Carried so the table can hedge a figure whose sample is thin
                // even when the lane around it is not.
                sample: expectation.saveSample ?? null,
              };
            })
          : [];

      return {
        ...data,
        ...(data.learning && goalByLane.length
          ? { learning: { ...data.learning, goalByLane } }
          : {}),
        trajectory: growthTrajectory(data.growth, primaryMetric, client?.engagementStart ?? null),
      };
    }),
  );

  const timestamps = platforms
    .map((p) => p.lastSyncedAt)
    .filter((value): value is string => Boolean(value))
    .sort();
  const lastSyncedAt = timestamps.at(-1) ?? null;

  const missing = missingEnv();

  return {
    platforms,
    goal: client
      ? { growthGoal: client.growthGoal, primaryMetric, label: GOAL_LABEL[client.growthGoal] }
      : null,
    lastSyncedAt,
    stale:
      lastSyncedAt === null || Date.now() - new Date(lastSyncedAt).getTime() > SYNC_INTERVAL_MS,
    // Every sync spends Apify credit, and opening a stale dashboard used to
    // start one by itself. AUTO_SYNC=off keeps syncing to the button alone.
    autoSync: !/^(off|false|0|no)$/i.test(process.env["AUTO_SYNC"]?.trim() ?? ""),
    ephemeral: !hasDurableStore(),
    ...(missing.length
      ? { setupError: `Missing environment variable(s): ${missing.join(", ")}` }
      : {}),
  };
}

/** Summary stats for one platform, computed the same way everywhere. */
export function summarize(data: PlatformData) {
  const followers = data.latest?.followers ?? 0;
  const views = data.posts.map((post) => post.views).filter((value) => value > 0);
  return {
    followers,
    posts: data.posts.length,
    medianViews: median(views),
    totalEngagements: data.posts.reduce((sum, post) => sum + engagementsOf(post), 0),
    engagementRate: engagementRate(data.posts, followers),
    postsPerWeek: cadence(data.posts),
    /** True when the platform publishes view counts at all. */
    hasViews: views.length > 0,
  };
}
