// Reels found by searching the open platform, rather than by watching a fixed
// list of accounts.
//
// The gate is the LANE. A tracked competitor earns its place by being chosen;
// a stranger's reel has nothing vouching for it, so the only thing that makes
// it relevant is that it is about what this creator is about. That is why the
// lane is a hard gate here and only a ranking signal in "Rising on <platform>"
// (see trends/instagram.ts, where a hard gate once threw away a real breakout
// from a vetted account).
//
// Client-safe: types and pure scoring only, no server imports.

/** One reel found by search, as stored. */
export interface DiscoveredReel {
  postId: string;
  url: string;
  creatorHandle: string | null;
  caption: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  publishedAt: string | null;
  /** The creator's own lane this reel matched. Never null once stored. */
  lane: string | null;
  laneFit: number;
  /** The words that matched, so a wrong match can be argued with. */
  matchedWords: string[];
  query: string | null;
  foundAt: string;
}

/** A reel as the screen shows it: the stored row plus what the team said about it. */
export interface DiscoveredRow extends DiscoveredReel {
  ageDays: number | null;
  /** The team's own tick or cross, if any. */
  voted: "like" | "dislike" | null;
  /** Why it sits where it does, in words. */
  reason: string | null;
}

export interface DiscoveredResult {
  rows: DiscoveredRow[];
  /** Crossed, or too like something crossed. Shown behind a fold, never deleted. */
  hidden: DiscoveredRow[];
  /** How many remain per lane, so the screen can offer a search before it runs dry. */
  byLane: Array<{ lane: string; shown: number }>;
  lastFoundAt: string | null;
  /** False until migration 0019 is applied. */
  storable: boolean;
}

/** Below this many reels left in a lane, the screen asks for a new search. */
export const RUNNING_LOW = 4;

/**
 * Older than this and a reel is history rather than a model to learn from.
 *
 * Deliberately far wider than the 45 days the trend catcher allows on tracked
 * accounts, because the two answer different questions. There it is "what is
 * this account doing now". Here it is "what structure works in this lane", and
 * a reel from six months ago that took thirteen million views still answers
 * that. Instagram's Top tab is full of exactly those, and a short window threw
 * nearly all of them away — measured on the first real search, where the three
 * readable results were 176, 78 and 140 days old. Age still counts, through
 * the ranking below rather than as a cliff.
 */
export const DISCOVERED_WINDOW_DAYS = 365;

export function ageDaysOf(publishedAt: string | null, now = Date.now()): number | null {
  if (!publishedAt) return null;
  const ms = Date.parse(publishedAt);
  if (!Number.isFinite(ms)) return null;
  return Math.round((now - ms) / 86_400_000);
}

/**
 * Ranking: views, damped, and newer wins among reels of similar size.
 *
 * Views alone would put a three-year-old reel with ten million plays above
 * everything current, and the Top tab is full of those. Log-damped so a reel
 * ten times bigger ranks higher but does not bury the rest, which is the same
 * shape trendScore uses on the tracked accounts.
 */
export function discoveredScore(views: number | null, ageDays: number | null): number {
  const size = Math.log10(Math.max(1, views ?? 0)) + 1;
  const age = ageDays ?? DISCOVERED_WINDOW_DAYS;
  const freshness = Math.max(0.2, 1 - age / DISCOVERED_WINDOW_DAYS);
  return Number((size * freshness).toFixed(3));
}
