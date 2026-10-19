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
 * whole day), both "YYYY-MM-DD".
 */
export function laneReport(allPosts: PostRecord[], from: string, to: string): LaneReport {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T23:59:59.999Z`);
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
          vsMedian: Number((primary(post) / baseline).toFixed(2)),
        };
        if (post.url) reel.url = post.url;
        if (post.insight) {
          reel.saves = post.insight.saved;
          reel.reach = post.insight.reach;
          if (post.insight.avgWatchMs) {
            reel.avgWatchSeconds = Number((post.insight.avgWatchMs / 1000).toFixed(1));
          }
        }
        return reel;
      })
      .sort((a, b) => b.vsMedian - a.vsMedian);
    return {
      ...lane,
      totalViews: group.reduce((sum, post) => sum + viewsOf(post), 0),
      totalInteractions: group.reduce((sum, post) => sum + engagementsOf(post), 0),
      medianViews: Math.round(median(group.map(viewsOf))),
      reels,
    };
  });

  return {
    from,
    to,
    reelCount: inWindow.length,
    unlabelled: inWindow.length - labelled.length,
    measuredBy: useViews ? "views" : "interactions",
    medianViews: Math.round(median(labelled.map(viewsOf))),
    lanes,
  };
}
