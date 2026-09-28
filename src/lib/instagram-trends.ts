// What is working on Instagram right now, in this account's own niche.
//
// The signal is posts by the tracked competitors that beat THEIR OWN median.
// Nothing new is scraped for this: those posts already arrive on every sync, so
// unlike a trends feed it costs nothing and — the part that matters — every
// item carries a real permalink. The source is the post itself.
//
// Two rules shape the whole thing:
//
//   1. RELATIVE, NEVER RAW. A 20,000-view post on an account whose median is
//      8,000 is a breakout; the same 20,000 on an account whose median is
//      460,000 is a flop. Comparing raw counts across accounts of different
//      sizes is the exact trap the rest of this system exists to avoid.
//
//   2. THE LANE GATE DECIDES, NOT THE MULTIPLE. Measured on the real data, the
//      biggest breakouts in this niche are relatable meme humour — one at
//      1023x its account's median — and general-interest science. Feeding
//      those in unfiltered would walk this account straight off its own
//      positioning, which is the homogenisation the strategist rules forbid.
//      A trend is only worth surfacing when it fits a lane this account
//      already publishes into.
//
// Client-safe: the topic inbox renders these and the server computes them.

/** One post that outperformed its own account, and why it is worth a look. */
export interface InstagramTrend {
  /** The tracked account that published it. */
  handle: string;
  postId: string;
  /** The permalink — the source, shown to the team so they can judge it. */
  url: string | null;
  /** The opening line of the caption. */
  hook: string;
  caption: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  /** Views as a multiple of that account's own median. 1.0 is typical for them. */
  vsAccountMedian: number;
  ageDays: number;
  /** The owner lane this fits, from the owner's own taxonomy. Null means it does not fit. */
  lane: string | null;
  /** Why it passed or failed the gate, in words the team can act on. */
  reason: string;
  /** Ranking score: breakout size, tempered by recency. Only meaningful among gated trends. */
  score: number;
}

/** Below this multiple a post is normal variation for that account, not a breakout. */
export const BREAKOUT_MULTIPLE = 1.5;

/** Older than this and it is no longer "what is working now". */
export const TREND_WINDOW_DAYS = 45;

/**
 * An account needs at least this many posts before its median means anything.
 * With fewer, one strong post drags the median up and hides every other.
 */
export const MIN_POSTS_FOR_MEDIAN = 5;

export function median(values: number[]): number {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Hashtag and caption patterns that mark content this account does not make.
 *
 * Checked BEFORE the lane match, because a meme caption is often a handful of
 * hashtags — "#marketing #relatable #funny #corporatehumor" — and the word
 * "marketing" in that list is enough to score against a marketing lane. The
 * lane gate alone would wave it through.
 */
const OFF_VOICE = [
  "relatable",
  "corporatehumor",
  "workhumor",
  "marketinghumor",
  "officehumor",
  "meme",
  "memes",
  "funny",
  "comedy",
  "skit",
  "pov:",
  "when your",
  "when you",
  "me when",
  "nobody:",
  "brb",
];

/** Captions that are mostly hashtags carry no story to build a reel on. */
function isHashtagSoup(caption: string): boolean {
  const words = caption.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const tags = words.filter((w) => w.startsWith("#")).length;
  return words.length - tags < 6;
}

export function offVoiceReason(caption: string): string | null {
  const text = caption.toLowerCase();
  const hit = OFF_VOICE.find((marker) => text.includes(marker));
  if (hit) return `reads as meme or humour content (“${hit}”) — not this account's register`;
  if (isHashtagSoup(caption)) return "caption is mostly hashtags — no story to build a reel on";
  return null;
}

/**
 * Ranking score.
 *
 * The multiple is compressed with a log because the tail is enormous — 1023x
 * against 2.4x — and without it one meme would outrank every genuinely useful
 * finding forever. Recency then decays linearly across the window, so a strong
 * post from last week beats an equally strong one from six weeks ago.
 */
export function trendScore(vsAccountMedian: number, ageDays: number): number {
  const size = Math.log10(Math.max(1, vsAccountMedian)) + 1;
  const freshness = Math.max(0.2, 1 - ageDays / TREND_WINDOW_DAYS);
  return Number((size * freshness).toFixed(3));
}
