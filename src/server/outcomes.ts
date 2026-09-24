// Freezing what a suggestion actually did.
//
// Deterministic end to end — no model is involved in deciding whether a
// suggestion worked, which is the point: the layer that grades the advice must
// not be the layer that gives it.
//
// Runs on every sync. The first sync after a post matures writes its outcome;
// every sync after that hits the unique constraint and does nothing, so this is
// safe to call unconditionally.
import { OWNER_ACCOUNTS } from "./apify/accounts";
import { parsePostLink } from "./post-link";
import {
  findPostByLink,
  readClient,
  readOutcomes,
  readPosts,
  readUsedSuggestions,
  saveOutcome,
  type OutcomeRow,
} from "./store";
import {
  engagementsOf,
  median,
  organicPosts,
  viewsOf,
  type PlatformId,
  type PostRecord,
} from "@/lib/analytics-types";
import { GOAL_METRIC, goalValueOf, type GoalMetric } from "@/lib/prediction";

/**
 * How old a post must be before its numbers are worth freezing.
 *
 * Most engagement lands within 48-72 hours; a week is settled without being so
 * far out that early data is wasted. Every stored row records the maturity it
 * was measured at, so changing this later does not invalidate what came before.
 */
export const OUTCOME_MATURITY_DAYS = 7;

/**
 * Captures any outstanding outcomes for one platform. Returns how many were
 * written.
 *
 * Never throws: an outcome is valuable but it is not worth failing a sync over,
 * and a sync that fails loses the follower snapshot, which cannot be backfilled.
 */
export async function captureOutcomes(platform: PlatformId): Promise<number> {
  try {
    const used = await readUsedSuggestions(platform);
    if (!used.length) return 0;

    const existing = new Set((await readOutcomes(platform)).map((row) => row.suggestionId));
    const pending = used.filter((suggestion) => !existing.has(suggestion.id));
    if (!pending.length) return 0;

    // The baseline this reading is scored against, computed once and stored on
    // every row written in this pass — so the figure stays auditable even after
    // the account's median has moved on.
    const ownerPosts = await readPosts(platform, OWNER_ACCOUNTS[platform].handle);
    const organic = organicPosts(ownerPosts);
    if (!organic.length) return 0;

    // Graph views wherever Graph measured the post — the same figure lane
    // ranking uses. This read post.views (the scraped count) until the audit
    // that moved the rest of the dashboard to Graph missed it here, so a filmed
    // idea was scored on a different number than the one its lane was chosen on.
    const useViews = organic.some((post) => viewsOf(post) > 0);
    const primary = (post: PostRecord) => (useViews ? viewsOf(post) : engagementsOf(post));
    const baseline = median(organic.map(primary)) || 1;

    // The goal metric, and this account's own median on it. Computed once per
    // pass and applied to every outcome, exactly like the reach baseline.
    const client = await readClient().catch(() => null);
    const goal: GoalMetric | null = client ? GOAL_METRIC[client.growthGoal] : null;
    const goalValues = goal
      ? organic.map((post) => goalValueOf(post, goal.field)).filter((v): v is number => v != null)
      : [];
    const goalBaseline = goalValues.length ? median(goalValues) : 0;

    const now = Date.now();
    let written = 0;

    for (const suggestion of pending) {
      // What was stored is the bare identifier the permalink was parsed down to,
      // not the permalink itself, so how to look it up follows from the
      // platform: LinkedIn's activity id IS the stored post_id, while an
      // Instagram shortcode only appears inside the url.
      const match = platform === "linkedin" ? "postId" : "urlContains";
      const post = await findPostByLink(platform, match, suggestion.publishedShortcode);
      // Not scraped yet, or never will be. Left uncaptured so a later sync can
      // pick it up rather than freezing an absence as a result.
      if (!post) continue;

      const publishedAt = new Date(post.publishedAt).getTime();
      const ageDays = (now - publishedAt) / 86_400_000;
      if (ageDays < OUTCOME_MATURITY_DAYS) continue;

      const base: OutcomeRow = {
        suggestionId: suggestion.id,
        platform,
        postId: post.postId,
        publishedShortcode: suggestion.publishedShortcode,
        publishedAt: post.publishedAt,
        measuredAt: new Date().toISOString(),
        maturityDays: OUTCOME_MATURITY_DAYS,
        views: post.views,
        likes: post.likes,
        comments: post.comments,
        shares: post.shares,
        reach: post.insight?.reach ?? null,
        saved: post.insight?.saved ?? null,
        avgWatchMs: post.insight?.avgWatchMs ?? null,
        vsMedian: null,
        baselineMedian: baseline,
        saveRatePct: null,
        shareRatePct: null,
        contentLane: suggestion.contentLane ?? post.contentLane ?? null,
        excludedReason: null,
        goalMetric: goal?.label ?? null,
        goalVsMedian: null,
        gradedOn: null,
        viewsSource: post.insight?.views ? "graph" : "public",
      };

      if (post.pinned) {
        // Recorded, not scored. A pinned post collects views the rest of the
        // feed never sees, so scoring one would flatter the only number in the
        // system that grades its own advice. Writing the row anyway means the
        // scorecard can say "excluded because pinned" instead of leaving the
        // suggestion looking permanently unmeasured.
        base.excludedReason = "pinned";
      } else {
        base.vsMedian = Number((primary(post) / baseline).toFixed(2));
        base.views = viewsOf(post);

        // Graded on the goal when this post was measured for it; otherwise on
        // reach, and gradedOn says so. An unmeasured goal metric must never be
        // read as a pass OR a fail — it is a different question answered.
        const value = goal ? goalValueOf(post, goal.field) : null;
        if (goal && value != null && goalBaseline > 0) {
          base.goalVsMedian = Number((value / goalBaseline).toFixed(2));
          base.gradedOn = goal.label;
        } else {
          base.gradedOn = useViews ? "reach" : "engagement";
        }

        if (post.insight && post.insight.reach > 0) {
          base.saveRatePct = Number(((post.insight.saved / post.insight.reach) * 100).toFixed(2));
          base.shareRatePct = Number(((post.insight.shares / post.insight.reach) * 100).toFixed(2));
        }
      }

      if (await saveOutcome(base)) written += 1;
    }

    return written;
  } catch (error) {
    console.error(`[outcomes:${platform}] capture skipped:`, error);
    return 0;
  }
}
