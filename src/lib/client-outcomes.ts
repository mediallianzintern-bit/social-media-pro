// How a Studio client's published post did after 14 days (25 Nov 2026), for
// Studio's planner. Studio clients only: Pritesh's posts never reach this,
// because only a client linked from Studio has exported posts to measure.
//
// A post is due once Pro has matched it to the Studio post it came from and
// its figures were measured on or after its 14th day. Instagram's profile
// scrape re-measures only a profile's newest posts, so a client posting daily
// has posts that stop being re-measured before day 14; those are sent with
// what was last measured, once it is plain no newer figure is coming, and the
// age they were measured at says so.
//
// Compared on likes + comments, which every post has (a still image publishes
// no view count), against the client's own typical post: the median of the
// posts published in the 90 days before it. Posts newer than it are left out,
// because their figures are still climbing.
//
// Pure, so it is tested without a network, a database or a model. The shape
// matches Studio's bridge contract (Studio: src/lib/pro-bridge.ts, outcomeInput).
import { median, organicPosts, type PostRecord } from "@/lib/analytics-types";
import { interactionsOf, type ExportedPost, type PublicationMatch } from "@/lib/client-lanes";

/** A post's result is taken on or after this day. */
export const OUTCOME_DAYS = 14;
/** A post not re-measured for this long has dropped out of the scrape: send what there is. */
export const NO_LONGER_MEASURED_DAYS = 3;
/** The client's typical post is taken from this many days before the post. */
export const TYPICAL_WINDOW_DAYS = 90;
/** Fewer posts than this to compare with, and there is no typical post yet. */
export const MIN_COMPARED = 3;
/** At or above this many times typical, a post did better than usual; at or below BELOW, worse. */
export const ABOVE = 1.25;
export const BELOW = 0.8;

const DAY_MS = 86_400_000;

export type Verdict = "above" | "typical" | "below";

/** What Studio's `outcomes` action takes, less the client and the lesson. */
export interface OutcomeFigures {
  postId: string;
  platform: "instagram";
  platformPostId: string;
  measuredAt: string;
  ageDays: number;
  likes: number;
  comments: number;
  views: number | null;
  interactions: number;
  typicalInteractions: number;
  comparedWith: number;
  vsTypical: number;
  verdict: Verdict;
  lane: string | null;
  source: string;
}

export interface DueOutcome {
  figures: OutcomeFigures;
  /** The live post, for the lesson. */
  post: PostRecord;
  /** The caption Studio exported, for the lesson. */
  exported: ExportedPost;
}

export function verdictOf(vsTypical: number): Verdict {
  if (vsTypical >= ABOVE) return "above";
  if (vsTypical <= BELOW) return "below";
  return "typical";
}

/** The client's typical post before `post`: the median likes + comments, and how many posts. */
export function typicalBefore(
  post: PostRecord,
  posts: PostRecord[],
): { typical: number; comparedWith: number } {
  const at = Date.parse(post.publishedAt);
  const from = at - TYPICAL_WINDOW_DAYS * DAY_MS;
  const earlier = organicPosts(posts).filter((other) => {
    if (other.postId === post.postId) return false;
    const when = Date.parse(other.publishedAt);
    return Number.isFinite(when) && when >= from && when < at;
  });
  return { typical: median(earlier.map(interactionsOf)), comparedWith: earlier.length };
}

/**
 * The client's posts whose 14-day result is due and not yet in Studio.
 *
 * `matches` are the publications recorded on this same sync, which the
 * exports read earlier do not show yet. An exported post whose `outcome` is
 * undefined comes from a Studio that predates outcomes; the caller checks
 * Studio's bridge version before calling this.
 */
export function dueOutcomes(input: {
  exported: ExportedPost[];
  matches?: PublicationMatch[];
  posts: PostRecord[];
  now: Date;
  source?: string;
}): DueOutcome[] {
  const now = input.now.getTime();
  const matched = new Map(
    (input.matches ?? []).map((match) => [match.postId, match.platformPostId]),
  );
  const live = new Map(input.posts.map((post) => [post.postId, post]));
  const due: DueOutcome[] = [];
  for (const item of input.exported) {
    if (item.outcome) continue;
    const platformPostId = item.publication?.platformPostId ?? matched.get(item.postId);
    const post = platformPostId ? live.get(platformPostId) : undefined;
    if (!post?.measuredAt) continue;

    const published = Date.parse(post.publishedAt);
    const measured = Date.parse(post.measuredAt);
    if (!Number.isFinite(published) || !Number.isFinite(measured)) continue;
    if (now - published < OUTCOME_DAYS * DAY_MS) continue;
    const ageDays = Math.max(0, Math.floor((measured - published) / DAY_MS));
    const settled = now - measured >= NO_LONGER_MEASURED_DAYS * DAY_MS;
    if (ageDays < OUTCOME_DAYS && !settled) continue;

    const { typical, comparedWith } = typicalBefore(post, input.posts);
    if (comparedWith < MIN_COMPARED || typical <= 0) continue;

    const interactions = interactionsOf(post);
    const vsTypical = Number((interactions / typical).toFixed(2));
    const lane = (item.lane ?? post.contentLane ?? "").trim();
    due.push({
      post,
      exported: item,
      figures: {
        postId: item.postId,
        platform: "instagram",
        platformPostId: post.postId,
        measuredAt: new Date(measured).toISOString(),
        ageDays,
        likes: post.likes,
        comments: post.comments,
        views: post.views > 0 ? post.views : null,
        interactions,
        typicalInteractions: Number(typical.toFixed(1)),
        comparedWith,
        vsTypical: Math.min(vsTypical, 1000),
        verdict: verdictOf(vsTypical),
        lane: lane && lane.toLowerCase() !== "other" ? lane.slice(0, 80) : null,
        source: input.source ?? "Social Pulse Pro",
      },
    });
  }
  return due;
}

/** What this month's lessons have cost the client so far, from Studio's own record of them. */
export function lessonSpendThisMonth(exported: ExportedPost[], now: Date): number {
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  return exported.reduce((total, item) => {
    const outcome = item.outcome;
    if (!outcome || Date.parse(outcome.measuredAt) < monthStart) return total;
    return total + (outcome.lessonCostUsd ?? 0);
  }, 0);
}
