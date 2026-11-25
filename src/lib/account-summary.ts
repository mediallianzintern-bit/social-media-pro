// What Home and each account's Summary say about an account, worked out in one
// place (13 Nov 2026, UI review): "how am I doing, and what do I do next".
//
// The review found the same figure quoted three ways on one page (typical
// views 567 in the cards and 1,170 in the AI text; Marketing stunts 1.87× in
// one table and 1.27× in another). So every number on Home and Summary comes
// from here, from the stored posts and follower history for the period chosen
// in the header, through the same helpers the rest of the dashboard uses
// (lanePerformance, computeInsights, followersForPeriod).
//
// Client-safe and pure.
import {
  cadence,
  engagementRate,
  engagementsOf,
  lanePerformance,
  median,
  organicPosts,
  viewsOf,
  type PlatformData,
  type PostRecord,
} from "@/lib/analytics-types";
import { dayMonth, type ResolvedRange } from "@/lib/date-range";
import { followersForPeriod } from "@/lib/followers";
import { computeInsights, MIN_SAMPLE } from "@/lib/insights";

export interface AccountSummary {
  platform: PlatformData["platform"];
  followers: number | null;
  /** Followers gained (positive) or lost (negative) across the period. */
  change: number | null;
  /** That change spread over the weeks it covers. */
  perWeek: number | null;
  rate: number;
  postsPerWeek: number;
  posts: number;
  /** Views where the platform publishes them, interactions otherwise. */
  usesViews: boolean;
  /** The middle post's views (or interactions): half did better, half worse. */
  typical: number;
  /** Losing followers. */
  needsAttention: boolean;
  /** "since 5 May" / "in the last 30 days", for a sentence. */
  since: string;
}

const WEEK_MS = 7 * 86_400_000;

/** "since 5 May", "in the last 30 days", "today": how a period reads in a sentence. */
export function sinceWords(range: ResolvedRange): string {
  if (range.from && (range.key === "era" || range.key === "custom")) {
    return `since ${dayMonth(range.from)}`;
  }
  if (range.key === "all") return "in all the time recorded";
  if (range.key === "today") return "today";
  if (range.key === "yesterday") return "yesterday";
  const days = { "7d": 7, "30d": 30, "90d": 90 }[range.key as "7d" | "30d" | "90d"];
  return days ? `in the last ${days} days` : "in this period";
}

export function accountSummary(data: PlatformData, range: ResolvedRange): AccountSummary {
  const followers = followersForPeriod(data) ?? null;
  const period = data.followersInPeriod;
  const change = period?.change ?? null;
  const span =
    period?.start && period.end
      ? new Date(period.end.capturedAt).getTime() - new Date(period.start.capturedAt).getTime()
      : 0;
  const posts = organicPosts(data.posts);
  const usesViews = posts.some((post) => viewsOf(post) > 0);
  return {
    platform: data.platform,
    followers,
    change,
    perWeek: change != null && span >= WEEK_MS ? change / (span / WEEK_MS) : null,
    rate: engagementRate(data.posts, followers ?? 0),
    postsPerWeek: cadence(data.posts),
    posts: posts.length,
    usesViews,
    typical: Math.round(median(posts.map((post) => primaryOf(post, usesViews)))),
    needsAttention: change != null && change < 0,
    // When the history itself starts inside the period, the change runs from
    // that first snapshot, so say that date: a client first synced on 20 Nov
    // read "Up 2,523 since 26 Oct", and Pritesh's "since 5 May" ran from 8 Sep.
    since:
      period?.partial && period.start
        ? `since ${dayMonth(new Date(period.start.capturedAt))}`
        : sinceWords(range),
  };
}

export const primaryOf = (post: PostRecord, usesViews: boolean) =>
  usesViews ? viewsOf(post) : engagementsOf(post);

/** "LinkedIn is growing. Instagram is losing followers." */
export function verdict(summaries: Array<AccountSummary & { label: string }>): string {
  const parts = summaries
    .filter((summary) => summary.change != null)
    .map((summary) =>
      summary.change! > 0
        ? `${summary.label} is growing.`
        : summary.change! < 0
          ? `${summary.label} is losing followers.`
          : `${summary.label} is holding steady.`,
    );
  return parts.length ? parts.join(" ") : "Not enough follower history for this period yet.";
}

/** "Down 220 since 5 May, about 26 a week" */
export function changeSentence(summary: AccountSummary): string | null {
  if (summary.change == null) return null;
  const amount = Math.abs(summary.change).toLocaleString("en-US");
  const direction = summary.change < 0 ? "Down" : summary.change > 0 ? "Up" : "No change";
  const weekly =
    summary.perWeek != null && summary.change !== 0
      ? `, about ${Math.abs(Math.round(summary.perWeek)).toLocaleString("en-US")} a week`
      : "";
  return summary.change === 0
    ? `No change ${summary.since}`
    : `${direction} ${amount} ${summary.since}${weekly}`;
}

/**
 * A post's one-line title: its caption's first sentence, without hashtags or
 * a "Comment X" call to action, cut at a word near 70 characters.
 */
export function postTitle(caption: string, max = 70): string {
  const text = caption
    .replace(/#[\p{L}\p{N}_]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const first = /^(.+?[.?!])(\s|$)/.exec(text)?.[1] ?? text;
  if (first.length <= max) return first || "Untitled post";
  const cut = first.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).trim()}…`;
}

export interface Finding {
  /** A topic, asking for a comment, or a day to post. */
  kind: "topic" | "cta" | "day";
  label: string;
  posts: number;
  /** "1.87× usual reach", "5.3× comments", "944 typical views" */
  value: string;
  ratio: number;
}

const ratioText = (ratio: number) =>
  ratio >= 10 ? `${Math.round(ratio)}×` : `${ratio.toFixed(ratio >= 3 ? 1 : 2)}×`;

/**
 * What to do more of and less of, from this period's posts: the topics that
 * beat or trail the account's typical post, posting with a comment ask, and
 * the best and worst posting days. Each needs MIN_SAMPLE posts behind it.
 */
export function doMoreAndLess(data: PlatformData): { more: Finding[]; less: Finding[] } {
  const posts = organicPosts(data.posts);
  const more: Finding[] = [];
  const less: Finding[] = [];
  const unit = posts.some((post) => viewsOf(post) > 0) ? "usual reach" : "usual interactions";

  for (const lane of lanePerformance(data.posts)) {
    if (lane.lane === "other" || lane.postCount < MIN_SAMPLE) continue;
    const finding: Finding = {
      kind: "topic",
      label: lane.lane,
      posts: lane.postCount,
      value: `${ratioText(lane.medianVsMedian)} ${unit}`,
      ratio: lane.medianVsMedian,
    };
    if (lane.medianVsMedian >= 1.15) more.push(finding);
    else if (lane.medianVsMedian <= 0.85) less.push(finding);
  }

  const insights = computeInsights(data.posts);
  if (insights.cta && insights.cta.multiple >= 1.5) {
    more.push({
      kind: "cta",
      label: "Asking for a comment",
      posts: insights.cta.withCta.count,
      value: `${ratioText(insights.cta.multiple)} comments`,
      ratio: insights.cta.multiple,
    });
  }
  const days = insights.weekdays.filter((day) => day.count >= MIN_SAMPLE);
  if (days.length >= 2 && insights.overallMedian > 0) {
    const best = days[0]!;
    const worst = days.at(-1)!;
    const typicalWord = insights.useViews ? "typical views" : "typical interactions";
    if (best.medianPrimary / insights.overallMedian >= 1.15) {
      more.push({
        kind: "day",
        label: `Posting on ${FULL_DAY[best.day] ?? best.day}`,
        posts: best.count,
        value: `${Math.round(best.medianPrimary).toLocaleString("en-US")} ${typicalWord}`,
        ratio: best.medianPrimary / insights.overallMedian,
      });
    }
    if (worst.medianPrimary / insights.overallMedian <= 0.85) {
      less.push({
        kind: "day",
        label: `Posting on ${FULL_DAY[worst.day] ?? worst.day}`,
        posts: worst.count,
        value: `${Math.round(worst.medianPrimary).toLocaleString("en-US")} ${typicalWord}`,
        ratio: worst.medianPrimary / insights.overallMedian,
      });
    }
  }
  return {
    more: more.sort((a, b) => b.ratio - a.ratio).slice(0, 3),
    less: less.sort((a, b) => a.ratio - b.ratio).slice(0, 3),
  };
}

const FULL_DAY: Record<string, string> = {
  Sun: "Sunday",
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
};

/** The best posting hour, in IST, and how it compares with the typical post. */
export function bestSlot(data: PlatformData): { ist: string; ratio: number; posts: number } | null {
  const insights = computeInsights(data.posts);
  const slot = insights.hours.find((hour) => hour.count >= MIN_SAMPLE);
  if (!slot || insights.overallMedian <= 0) return null;
  const ratio = slot.medianPrimary / insights.overallMedian;
  if (ratio < 1.3) return null;
  const minutes = (slot.hourUtc * 60 + 330) % (24 * 60);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const ist = `${((hour + 11) % 12) + 1}:${String(minute).padStart(2, "0")} ${hour < 12 ? "am" : "pm"} IST`;
  return { ist, ratio, posts: slot.count };
}

/** The period's best post, by views (or interactions). */
export function bestPost(data: PlatformData): PostRecord | null {
  const posts = organicPosts(data.posts);
  const usesViews = posts.some((post) => viewsOf(post) > 0);
  return [...posts].sort((a, b) => primaryOf(b, usesViews) - primaryOf(a, usesViews))[0] ?? null;
}

/** "17.6K" */
export function compact(value: number): string {
  if (value >= 100_000) return `${Math.round(value / 1000)}K`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.round(value));
}
