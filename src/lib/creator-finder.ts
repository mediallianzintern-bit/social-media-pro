// Whether an Instagram account belongs in a creator-fed lane (AI tool
// workflows, phase 3), judged on its own recent posts against the lane's
// learned pattern. Used twice: to admit a creator the search found, and to
// retire a found creator who has drifted. Pure and client-safe.
import { fitOf, type CreatorPattern } from "@/lib/creator-pattern";
import type { CreatorPost } from "@/lib/creator-reels";

/** Posts needed before an account can be judged at all. */
export const MIN_POSTS_TO_JUDGE = 10;
/** Share of its recent posts that must be reels: this lane is fed by reels. */
export const MIN_REEL_SHARE = 0.5;
/** Share of its recent posts that must fit the pattern to be added. */
export const ADD_FIT_SHARE = 0.4;
/** A found creator is retired below this share: it has drifted off the subject. */
export const RETIRE_FIT_SHARE = 0.2;
/** Must have posted within this many days to be added. */
export const ADD_MAX_QUIET_DAYS = 30;
/** A found creator silent this long is retired. */
export const RETIRE_QUIET_DAYS = 45;
/** Creators added per search run, at most: the lane grows gradually. */
export const MAX_ADDED_PER_RUN = 5;
/** Accounts checked per run, at most. */
export const MAX_CHECKED_PER_RUN = 30;
/** Searches per run, and results asked for per search. */
export const SEARCHES_PER_RUN = 4;
export const RESULTS_PER_SEARCH = 25;
/** What one search result costs (memo23/instagram-search-scraper, Oct 2026). */
export const COST_PER_RESULT_USD = 0.002;
/** Days between automatic searches. */
export const SEARCH_EVERY_DAYS = 7;

export interface CreatorJudgement {
  /** Share of recent posts that fit the lane's pattern, 0-1. */
  fitShare: number;
  reelShare: number;
  posts: number;
  /** Days since the newest post. */
  quietDays: number | null;
  /** Clearly makes this lane's content: add it. */
  add: boolean;
  /** Has drifted off the subject or gone quiet: retire it (found creators only). */
  retire: boolean;
  /** Why, in words. */
  reason: string;
}

export function judgeCreator(
  posts: CreatorPost[],
  pattern: CreatorPattern,
  now = Date.now(),
): CreatorJudgement {
  const count = posts.length;
  const fitting = posts.filter((post) => fitOf(pattern, post.caption).passes).length;
  const fitShare = count ? fitting / count : 0;
  const reelShare = count ? posts.filter((post) => post.isReel).length / count : 0;
  const newest = Math.max(0, ...posts.map((post) => Date.parse(post.postedAt) || 0));
  const quietDays = newest ? Math.floor((now - newest) / 86_400_000) : null;
  const pct = (share: number) => `${Math.round(share * 100)}%`;

  if (count < MIN_POSTS_TO_JUDGE) {
    return {
      fitShare,
      reelShare,
      posts: count,
      quietDays,
      add: false,
      retire: false,
      reason: `only ${count} posts to judge`,
    };
  }
  const quiet = quietDays === null ? Infinity : quietDays;
  const add =
    fitShare >= ADD_FIT_SHARE && reelShare >= MIN_REEL_SHARE && quiet <= ADD_MAX_QUIET_DAYS;
  const retire = fitShare < RETIRE_FIT_SHARE || quiet > RETIRE_QUIET_DAYS;
  const reason = retire
    ? quiet > RETIRE_QUIET_DAYS
      ? `no posts for ${quietDays ?? "many"} days`
      : `only ${pct(fitShare)} of recent posts fit the lane`
    : `${pct(fitShare)} of recent posts fit the lane, ${pct(reelShare)} are reels`;
  return { fitShare, reelShare, posts: count, quietDays, add, retire, reason };
}

/** What a run of `searches` searches costs at most. */
export function searchCostUsd(searches: number): number {
  return Number((searches * RESULTS_PER_SEARCH * COST_PER_RESULT_USD).toFixed(4));
}
