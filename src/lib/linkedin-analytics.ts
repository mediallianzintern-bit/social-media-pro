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
/** Calls the daily account row costs: followers, 30-day impressions and reach. */
export const ACCOUNT_CALLS = 3;
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
