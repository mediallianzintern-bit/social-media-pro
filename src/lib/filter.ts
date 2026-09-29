// Applies the selected date range to a platform's stored payload.
import { withinRange, type ResolvedRange } from "@/lib/date-range";
import { goalReadFor, laneExpectations } from "@/lib/prediction";
import { lanePerformance } from "@/lib/analytics-types";
import type { GrowthGoal } from "@/lib/growth";
import type { DashboardData, PlatformData, PostRecord } from "@/lib/analytics-types";

/**
 * The lane scorecard, recomputed over the posts actually in the window.
 *
 * The server builds `learning.lanes` and `goalByLane` from the whole stored
 * history, because it has no idea which range the browser is about to pick. Left
 * alone that produced two panels on one screen counting different things: the
 * header said "Last 30 days · 19 posts" while the lane table underneath was
 * summing 60. Every share-of-output percentage in it was therefore answering a
 * question nobody had asked, and the two could not be reconciled by looking.
 *
 * `taxonomyStale` is deliberately NOT recomputed. It asks whether the account's
 * content has outgrown its vocabulary, which is a judgement about the account
 * rather than about a reporting window — and a 7-day range with two `other`
 * posts in it would otherwise flip the rebuild warning on and off as someone
 * clicked through ranges.
 */
function windowedLearning(
  learning: NonNullable<PlatformData["learning"]>,
  posts: PostRecord[],
  growthGoal: GrowthGoal | null,
): NonNullable<PlatformData["learning"]> {
  const lanes = lanePerformance(posts);
  // Recomputed rather than carried over: a goal multiple from the full history
  // sitting beside a windowed reach multiple is the same mismatch one level down.
  const goalByLane =
    growthGoal && lanes.length
      ? laneExpectations(posts, lanes).map((expectation) => {
          const read = goalReadFor(expectation, growthGoal);
          return {
            lane: expectation.lane,
            metric: read?.metric ?? "",
            multiple: read?.multiple ?? null,
            servesGoal: read?.servesGoal ?? false,
            sample: expectation.saveSample ?? null,
          };
        })
      : [];

  return { ...learning, lanes, goalByLane };
}

export function filterPlatform(
  data: PlatformData,
  range: ResolvedRange,
  growthGoal: GrowthGoal | null = null,
): PlatformData {
  const posts = data.posts.filter((post) => withinRange(post.publishedAt, range));
  return {
    ...data,
    posts,
    growth: data.growth.filter((point) => withinRange(point.capturedAt, range)),
    // `latest` is the current follower count and is deliberately NOT filtered —
    // "followers as of now" is the truth regardless of the window being viewed.
    ...(data.learning ? { learning: windowedLearning(data.learning, posts, growthGoal) } : {}),
  };
}

export function filterDashboard(data: DashboardData, range: ResolvedRange): DashboardData {
  // The goal is stored as a plain string on the payload; only the four known
  // values have a metric to read, and anything else is treated as no goal.
  const growthGoal = (data.goal?.growthGoal ?? null) as GrowthGoal | null;
  return {
    ...data,
    platforms: data.platforms.map((p) => filterPlatform(p, range, growthGoal)),
  };
}
