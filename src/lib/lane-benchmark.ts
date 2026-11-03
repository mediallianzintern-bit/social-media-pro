// Each lane, the owner against the tracked competitors, on engagement per
// 1,000 followers (Oct 2026).
//
// The competitor read judged every account against its own typical post
// only, so it never compared accounts with each other. With LinkedIn
// competitors seven to two hundred times his size, a raw median says only
// who is bigger: Rand Fishkin's 287 against his 13 is audience, not content.
// Engagement per 1,000 followers puts them on one scale. The read is given
// this table and told to judge contested, open and underperforming lanes on
// it. Computed from the briefs' own lane medians; client-safe and pure.
import type { LanePerformance } from "@/lib/analytics-types";

export interface LaneBenchmarkRow {
  lane: string;
  ownerPosts: number;
  ownerMedianEngagement: number | null;
  /** The owner's median engagement per 1,000 followers in this lane. */
  ownerPer1k: number | null;
  competitorsPublishing: number;
  competitorPosts: number;
  /** The middle competitor's median engagement per 1,000 followers, among those publishing. */
  competitorsPer1k: number | null;
  /** The competitor doing best in the lane on that scale. */
  leader: { handle: string; per1k: number } | null;
  /**
   * contested: both publish here; the owner is ahead or behind on per-1k.
   * owner-only: the owner publishes, no competitor does: an open lane he holds.
   * competitors-only: competitors publish, the owner does not: a gap.
   */
  standing: "ahead" | "behind" | "owner-only" | "competitors-only";
}

interface Account {
  handle: string;
  followers: number;
  lanes?: LanePerformance[] | undefined;
}

const per1k = (engagement: number, followers: number) =>
  followers > 0 ? Number(((engagement / followers) * 1000).toFixed(2)) : null;

function middle(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return Number(
    (sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2).toFixed(2),
  );
}

export function laneBenchmark(owner: Account, rivals: Account[]): LaneBenchmarkRow[] {
  const names = new Set<string>();
  for (const account of [owner, ...rivals]) {
    for (const lane of account.lanes ?? []) if (lane.lane !== "other") names.add(lane.lane);
  }
  return [...names].map((lane) => {
    const mine = owner.lanes?.find((row) => row.lane === lane);
    const ownerPosts = mine?.postCount ?? 0;
    const ownerRate = mine && ownerPosts ? per1k(mine.medianInteractions, owner.followers) : null;
    const theirs = rivals
      .map((rival) => {
        const row = rival.lanes?.find((entry) => entry.lane === lane);
        return row && row.postCount
          ? {
              handle: rival.handle,
              posts: row.postCount,
              rate: per1k(row.medianInteractions, rival.followers),
            }
          : null;
      })
      .filter((row): row is { handle: string; posts: number; rate: number | null } => row !== null);
    const rates = theirs.map((row) => row.rate).filter((rate): rate is number => rate !== null);
    const competitorsPer1k = middle(rates);
    const best = [...theirs]
      .filter((row) => row.rate !== null)
      .sort((a, b) => b.rate! - a.rate!)[0];
    const standing: LaneBenchmarkRow["standing"] = !ownerPosts
      ? "competitors-only"
      : !theirs.length
        ? "owner-only"
        : (ownerRate ?? 0) >= (competitorsPer1k ?? 0)
          ? "ahead"
          : "behind";
    return {
      lane,
      ownerPosts,
      ownerMedianEngagement: mine && ownerPosts ? mine.medianInteractions : null,
      ownerPer1k: ownerRate,
      competitorsPublishing: theirs.length,
      competitorPosts: theirs.reduce((sum, row) => sum + row.posts, 0),
      competitorsPer1k,
      leader: best ? { handle: best.handle, per1k: best.rate! } : null,
      standing,
    };
  });
}
