// The content-lane report: how every reel in each lane did, between two dates.
//
// The Content lanes panel answers "which lane works" in one row per lane. The
// team also needs the reels behind each row, with their dates, to say WHICH
// reels made a lane strong or weak and to hand that to a client as a PDF. This
// is that: the same lane figures the panel shows, computed for the chosen
// dates, with every reel listed under its lane.
//
// Pure and client-safe. No model call, no network: it reads stored posts only.
import {
  engagementsOf,
  type GrowthPoint,
  lanePerformance,
  median,
  organicPosts,
  viewsOf,
  type LanePerformance,
  type PostRecord,
} from "@/lib/analytics-types";

export interface LaneReportReel {
  postId: string;
  url?: string;
  publishedAt: string;
  /** The caption's first line, which is the reel's hook as published. */
  title: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  /** Owner-only Graph figures; absent means not measured, never zero. */
  saves?: number;
  reach?: number;
  avgWatchSeconds?: number;
  /** This reel's views (or interactions) against the window's median reel. */
  vsMedian: number;
}

export interface LaneReportLane extends LanePerformance {
  totalViews: number;
  totalInteractions: number;
  medianViews: number;
  /** The lane's reels, best first. */
  reels: LaneReportReel[];
}

export interface LaneReport {
  from: string;
  to: string;
  /** Reels published in the window, pinned posts excluded. */
  reelCount: number;
  /** Of those, how many carry no lane yet (a sync labels them). */
  unlabelled: number;
  /** "views" where the platform publishes them, otherwise "interactions". */
  measuredBy: "views" | "interactions";
  medianViews: number;
  lanes: LaneReportLane[];
}

/** First line of a caption, trimmed to a readable title. */
function titleOf(caption: string): string {
  const line = caption.split("\n").find((part) => part.trim()) ?? "";
  const clean = line.trim();
  return clean.length > 110 ? `${clean.slice(0, 107).trimEnd()}…` : clean || "(no caption)";
}

/**
 * The report for posts published from `from` (inclusive) to `to` (inclusive,
 * whole day), both "YYYY-MM-DD" and both days in India (IST), which is where
 * the team reads them: a reel posted at 1 AM IST belongs to that day.
 */
export function laneReport(allPosts: PostRecord[], from: string, to: string): LaneReport {
  const start = Date.parse(`${from}T00:00:00+05:30`);
  const end = Date.parse(`${to}T23:59:59.999+05:30`);
  const inWindow = organicPosts(allPosts).filter((post) => {
    const at = Date.parse(post.publishedAt);
    return Number.isFinite(at) && at >= start && at <= end;
  });

  const labelled = inWindow.filter((post) => post.contentLane);
  const useViews = labelled.some((post) => viewsOf(post) > 0);
  const primary = (post: PostRecord) => (useViews ? viewsOf(post) : engagementsOf(post));
  const baseline = median(labelled.map(primary)) || 1;

  const lanes = lanePerformance(inWindow).map((lane): LaneReportLane => {
    const group = labelled.filter((post) => post.contentLane === lane.lane);
    const reels = group
      .map((post): LaneReportReel => {
        const reel: LaneReportReel = {
          postId: post.postId,
          publishedAt: post.publishedAt,
          title: titleOf(post.caption),
          views: viewsOf(post),
          likes: post.likes,
          comments: post.comments,
          shares: post.shares,
          vsMedian: primary(post) / baseline,
        };
        if (post.url) reel.url = post.url;
        if (post.insight) {
          reel.saves = post.insight.saved;
          reel.reach = post.insight.reach;
          if (post.insight.avgWatchMs) {
            // Exact: Instagram reports milliseconds, so seconds need three decimals.
            reel.avgWatchSeconds = post.insight.avgWatchMs / 1000;
          }
        }
        return reel;
      })
      .sort((a, b) => b.vsMedian - a.vsMedian);
    return {
      ...lane,
      totalViews: group.reduce((sum, post) => sum + viewsOf(post), 0),
      totalInteractions: group.reduce((sum, post) => sum + engagementsOf(post), 0),
      medianViews: median(group.map(viewsOf)),
      reels,
    };
  });

  return {
    from,
    to,
    reelCount: inWindow.length,
    unlabelled: inWindow.length - labelled.length,
    measuredBy: useViews ? "views" : "interactions",
    medianViews: median(labelled.map(viewsOf)),
    lanes,
  };
}

/** The figures a lane can be compared on in the report. */
export const LANE_METRICS = ["views", "reach", "interactions", "saves", "watch"] as const;
export type LaneMetric = (typeof LANE_METRICS)[number];

export const LANE_METRIC_LABEL: Record<LaneMetric, string> = {
  views: "Views",
  reach: "Reach",
  interactions: "Interactions",
  saves: "Saves",
  watch: "Watch time",
};

/**
 * One reel's figure for a metric, or undefined where it was not measured.
 * Interactions are likes + comments + shares, as everywhere in the report.
 * Saves and watch time exist only where Instagram measured them, and a reel
 * without them is left out of that comparison rather than counted as zero.
 */
export function metricOf(reel: LaneReportReel, metric: LaneMetric): number | undefined {
  switch (metric) {
    case "views":
      return reel.views;
    case "reach":
      return reel.reach;
    case "interactions":
      return reel.likes + reel.comments + reel.shares;
    case "saves":
      return reel.saves;
    case "watch":
      return reel.avgWatchSeconds;
  }
}

/** The middle value of a metric across some reels, or null when none measured it. */
export function metricMedian(reels: LaneReportReel[], metric: LaneMetric): number | null {
  const values = reels
    .map((reel) => metricOf(reel, metric))
    .filter((value): value is number => value !== undefined);
  return values.length ? median(values) : null;
}

/**
 * "vs median", kept to one division: the lane's typical reel ÷ the typical
 * reel across every lane in the dates, on the chosen metric. Null when either
 * side is missing or the typical reel scored zero, where no ratio means
 * anything.
 */
export function vsMedian(value: number | null, typical: number | null): number | null {
  if (value === null || typical === null || typical <= 0) return null;
  return value / typical;
}

/** One follower count, as a sync recorded it. */
export interface FollowerPoint {
  at: string;
  followers: number;
}

export interface FollowerChange {
  /** The count going into the dates: the last sync before they start, else the first inside. */
  start: FollowerPoint;
  /** The last count recorded by the end of the dates. */
  end: FollowerPoint;
  /** end − start. Negative when followers were lost. */
  change: number;
  /** Every sync's count inside the dates, oldest first. */
  points: FollowerPoint[];
}

/**
 * Followers over the report's dates, from the counts each sync recorded.
 *
 * This is the whole account, not a lane: Instagram does not report how many
 * follows a reel brought (it gives that figure for feed posts only), so a
 * follower can never be credited to one reel or lane. Null when no sync
 * recorded a count by the end of the dates.
 */
export function followerChange(
  growth: GrowthPoint[],
  from: string,
  to: string,
): FollowerChange | null {
  const start = Date.parse(`${from}T00:00:00+05:30`);
  const end = Date.parse(`${to}T23:59:59.999+05:30`);
  const points = growth
    .map((point) => ({ at: point.capturedAt, followers: point.followers }))
    .filter((point) => Number.isFinite(Date.parse(point.at)) && point.followers > 0)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const before = points.filter((point) => Date.parse(point.at) < start);
  const inside = points.filter((point) => {
    const at = Date.parse(point.at);
    return at >= start && at <= end;
  });
  const first = before.at(-1) ?? inside[0];
  const last = inside.at(-1) ?? before.at(-1);
  if (!first || !last) return null;
  return { start: first, end: last, change: last.followers - first.followers, points: inside };
}
