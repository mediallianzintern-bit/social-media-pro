// Which of Pritesh Sir's LinkedIn posts to ask LinkedIn about, and how to read
// the answer. Client-safe and pure, so the schedule can be tested.
//
// LinkedIn's Development tier allows 100 calls per member per day (and 500 per
// app). Each post costs one call per figure, so asking about every post on
// every sync would run out within a day. Instead:
//   - a post under 7 days old is refreshed once a day: its figures still move,
//   - a post 7-30 days old every 3 days: they have mostly settled,
//   - an older post is not asked about again and keeps its last figures,
// newest first, within a fixed budget per run.
import type { PostRecord } from "@/lib/analytics-types";

/** The figures asked for per post. Reactions, comments and reposts come from the scraper. */
export const POST_METRICS = ["IMPRESSION", "MEMBERS_REACHED", "POST_SAVE", "POST_SEND"] as const;
export type PostMetric = (typeof POST_METRICS)[number];

/** Calls one sync may spend, well under LinkedIn's 100 per member per day. */
export const CALLS_PER_RUN = 80;
/**
 * Calls the daily account step costs: followers, 30-day impressions and reach,
 * and his six figures day by day (see DAILY_METRICS below).
 */
export const ACCOUNT_CALLS = 9;
/** Posts older than this are no longer asked about. */
export const TRACK_DAYS = 30;
const FRESH_DAYS = 7;
const FRESH_EVERY_HOURS = 20;
const SETTLED_EVERY_HOURS = 72;

export interface TrackedPost {
  postId: string;
  shareUrn: string;
  publishedAt: string | null;
  fetchedAt: string | null;
}

/** The posts due a refresh now, newest first, as many as `budget` calls cover. */
export function duePosts(posts: TrackedPost[], budget: number, now = Date.now()): TrackedPost[] {
  const hours = (iso: string | null) => (iso ? (now - Date.parse(iso)) / 3_600_000 : Infinity);
  const due = posts
    .filter((post) => {
      const age = hours(post.publishedAt) / 24;
      if (!Number.isFinite(age) || age > TRACK_DAYS) return false;
      const since = hours(post.fetchedAt);
      return since >= (age < FRESH_DAYS ? FRESH_EVERY_HOURS : SETTLED_EVERY_HOURS);
    })
    .sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""));
  return due.slice(0, Math.max(0, Math.floor(budget / POST_METRICS.length)));
}

/**
 * The entity parameter LinkedIn wants for a post, from its URN. A share and a
 * ugcPost are written differently, and LinkedIn refuses the wrong one.
 */
export function entityParam(shareUrn: string): string | null {
  const alias = /^urn:li:share:\d+$/.test(shareUrn)
    ? "share"
    : /^urn:li:ugcPost:\d+$/.test(shareUrn)
      ? "ugc"
      : null;
  return alias ? `(${alias}:${encodeURIComponent(shareUrn)})` : null;
}

export interface LinkedInPostFigures {
  postId: string;
  impressions: number | null;
  membersReached: number | null;
  saves: number | null;
  sends: number | null;
  fetchedAt: string | null;
}

/** Engagement on what LinkedIn says was seen, not on followers. Null without impressions. */
export function trueEngagementRate(
  interactions: number,
  impressions: number | null,
): number | null {
  return impressions && impressions > 0 ? interactions / impressions : null;
}

/** LinkedIn's own analytics page for one of his posts, opened from "View analytics". */
export function postAnalyticsUrl(postId: string): string {
  return `https://www.linkedin.com/analytics/post-summary/urn:li:activity:${postId}/`;
}

/** His posts in `posts` that LinkedIn has measured, most impressions first. */
export function measuredByImpressions(
  posts: PostRecord[],
  figures: LinkedInPostFigures[] | undefined,
) {
  const byId = new Map((figures ?? []).map((row) => [row.postId, row]));
  return posts
    .filter((post) => !post.pinned)
    .map((post) => ({ post, figures: byId.get(post.postId) }))
    .filter(
      (row): row is { post: PostRecord; figures: LinkedInPostFigures } =>
        row.figures?.impressions != null,
    )
    .sort((a, b) => (b.figures.impressions ?? 0) - (a.figures.impressions ?? 0));
}

// ---------------------------------------------------------------------------
// His whole account, day by day: the Discovery and Engagement cards of his
// LinkedIn Content analytics screen. Stored per UTC day (0026), summed here.
// ---------------------------------------------------------------------------

/** The account figures LinkedIn reports per day. Members reached is not one: it cannot be summed. */
export const DAILY_METRICS = {
  IMPRESSION: "impressions",
  REACTION: "reactions",
  COMMENT: "comments",
  RESHARE: "reposts",
  POST_SAVE: "saves",
  POST_SEND: "sends",
} as const;
export type DailyField = (typeof DAILY_METRICS)[keyof typeof DAILY_METRICS];
/** Days of history refreshed each day: enough for a 90-day period and the one before it. */
export const DAILY_HISTORY_DAYS = 180;

export type DailyRow = { day: string } & Record<DailyField, number>;
export type PeriodTotals = Record<DailyField, number> & { days: number };

/** A period as LinkedIn's days: `start` inclusive, `end` exclusive, YYYY-MM-DD. */
export interface LinkedInPeriod {
  start: string | null;
  end: string;
}

const dayOf = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/**
 * The page's period as calendar days. Taken from the viewer's own dates, so
 * "Oct 1 – Oct 28" on the page asks LinkedIn for Oct 1 – Oct 28, the same
 * days his LinkedIn screen labels, although LinkedIn counts each day in UTC.
 */
export function periodOf(
  range: { from: Date | null; to: Date | null },
  now = new Date(),
): LinkedInPeriod {
  const end = range.to ?? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start: range.from ? dayOf(range.from) : null, end: dayOf(end) };
}

/** The period of the same length just before, or null for all time. */
export function priorPeriodOf(period: LinkedInPeriod): LinkedInPeriod | null {
  if (!period.start) return null;
  const start = Date.parse(`${period.start}T00:00:00Z`);
  const length = Date.parse(`${period.end}T00:00:00Z`) - start;
  if (!(length > 0)) return null;
  const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
  return { start: iso(start - length), end: period.start };
}

/** Sums the stored days inside a period. */
export function sumPeriod(rows: DailyRow[], period: LinkedInPeriod): PeriodTotals {
  const totals: PeriodTotals = {
    impressions: 0,
    reactions: 0,
    comments: 0,
    reposts: 0,
    saves: 0,
    sends: 0,
    days: 0,
  };
  for (const row of rows) {
    if ((period.start && row.day < period.start) || row.day >= period.end) continue;
    totals.days += 1;
    for (const field of Object.values(DAILY_METRICS)) totals[field] += row[field] ?? 0;
  }
  return totals;
}

/** Reactions, comments, reposts, saves and sends: what LinkedIn calls social engagements. */
export function socialEngagements(totals: PeriodTotals): number {
  return totals.reactions + totals.comments + totals.reposts + totals.saves + totals.sends;
}
