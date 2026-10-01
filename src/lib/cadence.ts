// T61 — the posting-cadence nudge: "you haven't posted in a while".
//
// Measured against THIS account's own rhythm, never a fixed number. An account
// that posts daily is overdue after three quiet days; one that posts weekly is
// on schedule after five. A universal "post every two days" rule would nag the
// second and excuse the first.
//
// It stays silent while the account is on track. A banner that is always
// there is a banner nobody reads, and the one time it matters it has already
// been tuned out.
//
// Client-safe. Computed from stored posts; no model call.
import { organicPosts, type PostRecord } from "@/lib/analytics-types";

/** Posts needed before the account has a rhythm worth measuring against. */
export const MIN_POSTS_FOR_RHYTHM = 6;

/** How many recent gaps define the "usual" rhythm. Recent, so a change of pace is honoured. */
const RECENT_GAPS = 20;

export type CadenceState = "on_track" | "due" | "overdue";

export interface CadenceNudge {
  state: CadenceState;
  /** Whole days since the most recent post. */
  daysSince: number;
  /** The account's typical gap between posts, in days. */
  usualGapDays: number;
  /** Posts per week over the last 14 days, and over the 28 days before that. */
  recentPerWeek: number;
  priorPerWeek: number;
  /** Posting has dropped well below its recent pace. */
  slowing: boolean;
  /** One sentence, in the account's own numbers. Null when on track and steady. */
  message: string | null;
  /**
   * Days since the posts were last fetched, when that is long enough that a
   * newer post could exist without showing. Null when the data is fresh.
   */
  staleDays: number | null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const DAY = 86_400_000;

function perWeek(times: number[], from: number, to: number): number {
  const count = times.filter((time) => time >= from && time < to).length;
  return Number(((count / ((to - from) / DAY)) * 7).toFixed(1));
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * Where this account stands against its own posting rhythm.
 *
 * Due at one and a half usual gaps, overdue at two — but never before two
 * and three days respectively, so an account that posts several times a day
 * is not flagged after an ordinary quiet afternoon.
 *
 * The usual gap is the MEDIAN of recent gaps, not the mean: one long holiday
 * would otherwise stretch "usual" until a real lapse looked normal.
 */
export function cadenceNudge(
  allPosts: PostRecord[],
  now = Date.now(),
  /**
   * When the posts were last fetched. A silence can only be measured up to
   * the last sync: production syncs on demand, so a post made since then is
   * invisible here, and without this the banner would tell someone to post
   * who already had.
   */
  lastSyncedAt: string | null = null,
): CadenceNudge | null {
  const times = organicPosts(allPosts)
    .map((post) => new Date(post.publishedAt).getTime())
    .filter((time) => Number.isFinite(time) && time <= now)
    .sort((a, b) => b - a);
  if (times.length < MIN_POSTS_FOR_RHYTHM) return null;

  const gaps: number[] = [];
  for (let i = 0; i < Math.min(times.length - 1, RECENT_GAPS); i += 1) {
    gaps.push((times[i]! - times[i + 1]!) / DAY);
  }
  const usualGapDays = Number(Math.max(median(gaps), 0.1).toFixed(1));
  const daysSince = Math.floor((now - times[0]!) / DAY);

  const dueAt = Math.max(2, usualGapDays * 1.5);
  const overdueAt = Math.max(3, usualGapDays * 2);
  const state: CadenceState =
    daysSince >= overdueAt ? "overdue" : daysSince >= dueAt ? "due" : "on_track";

  const recentPerWeek = perWeek(times, now - 14 * DAY, now);
  const priorPerWeek = perWeek(times, now - 42 * DAY, now - 14 * DAY);
  // Slowing only means something against a real prior pace; a drop from 0.5
  // a week to 0.2 is noise in a quiet account, not a trend.
  const slowing = priorPerWeek >= 1 && recentPerWeek < priorPerWeek * 0.6;

  const usual =
    usualGapDays < 1
      ? "you usually post more than once a day"
      : usualGapDays < 1.5
        ? "you usually post about daily"
        : `you usually post every ${usualGapDays} days`;

  let message: string | null = null;
  if (state !== "on_track") {
    message = `${plural(daysSince, "day")} since the last post — ${usual}.`;
    if (slowing) message += ` Down to ${recentPerWeek} a week, from ${priorPerWeek}.`;
  } else if (slowing) {
    message = `Posting has slowed to ${recentPerWeek} a week over the last fortnight, from ${priorPerWeek} before.`;
  }

  const syncAge = lastSyncedAt ? Math.floor((now - new Date(lastSyncedAt).getTime()) / DAY) : null;
  const staleDays = syncAge != null && syncAge >= 1 ? syncAge : null;
  if (message && staleDays != null) {
    message += ` (Last synced ${plural(staleDays, "day")} ago — a newer post would not show yet.)`;
  }

  return {
    state,
    daysSince,
    usualGapDays,
    recentPerWeek,
    priorPerWeek,
    slowing,
    message,
    staleDays,
  };
}
