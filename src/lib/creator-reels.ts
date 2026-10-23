// Which of a watched creator's reels stand out, and how they become topics.
//
// AI tool workflows, phase 1 (approved 23 Oct 2026): the lane shows reels from
// creators who make this kind of content, in place of news. A reel is shown
// when it beat THAT creator's own normal, so a strong reel from a small creator
// is not drowned out by a large account's ordinary post. The same rule the
// "Rising on Instagram" finder uses (lib/instagram-trends.ts).
//
// Instagram's API gives likes and comments for another account's posts, not
// views. Likes are what is compared: these creators end most reels with
// "Comment X and I'll send it", so comments measure the giveaway, not the reel
// (one @mr.pynk reel had 1,838 likes and 6,715 comments). Comments stand in
// only for a creator who hides likes.
//
// Pure and client-safe: the sync uses it, and tests run it on real samples.
import { BREAKOUT_MULTIPLE, MIN_POSTS_FOR_MEDIAN } from "@/lib/instagram-trends";
import type { SourceDraft } from "@/lib/sources";

/** One post as Instagram's business discovery returns it for another account. */
export interface CreatorPost {
  id: string;
  permalink: string;
  caption: string;
  /** Missing when the creator hides like counts. */
  likes: number | null;
  comments: number;
  postedAt: string;
  isReel: boolean;
}

/** How far back a reel can be and still be shown: the same window as the news. */
export const CREATOR_REEL_WINDOW_DAYS = 14;

/** At most this many reels per creator per sync, so a prolific account cannot fill the lane. */
export const MAX_PER_CREATOR = 3;

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Likes; comments only when the creator hides likes. */
export function engagementOf(post: CreatorPost, likesHidden: boolean): number {
  return likesHidden ? post.comments : (post.likes ?? 0);
}

/** A call to action, not a description: "Comment AI for the link", "Follow for more". */
const CTA_LINE = /^(comment|follow|save|share|dm|tap|link in bio|subscribe|like|tag)\b/i;

/**
 * A caption's first DESCRIBING line, without hashtags or mentions, as a
 * headline. Many of these reels open on the giveaway ("Comment “PYNK” and I
 * send the skills"), so call-to-action lines are passed over for the first
 * line that says what the reel is.
 */
export function headlineOf(caption: string): string {
  const lines = caption
    .split("\n")
    .map((line) =>
      line
        .replace(/[#@][\w.]+/g, "")
        // Line separators and replacement characters some captions carry.
        .replace(/[\u2028\u2029\uFFFD]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
  const line =
    lines.find((text) => !CTA_LINE.test(text) && text.split(" ").length >= 3) ?? lines[0] ?? "";
  return line.length > 140 ? `${line.slice(0, 137).trimEnd()}…` : line;
}

export interface Standout {
  post: CreatorPost;
  /** Likes against this creator's own median (comments, if likes are hidden). */
  multiple: number;
}

/**
 * A creator's reels that beat their own normal, best first.
 *
 * Strict, as the proposal recommends: at least BREAKOUT_MULTIPLE times the
 * creator's median, only reels, only from the last CREATOR_REEL_WINDOW_DAYS,
 * only captions that fit the lane, and none at all until the creator has
 * MIN_POSTS_FOR_MEDIAN posts to set a normal from.
 */
export function standoutReels(
  posts: CreatorPost[],
  now = Date.now(),
  /**
   * Is this caption the lane's kind of content? The lane's learned pattern
   * (lib/creator-pattern.ts). Until one exists, every standout reel counts.
   */
  onTopic: (caption: string) => boolean = () => true,
): Standout[] {
  if (posts.length < MIN_POSTS_FOR_MEDIAN) return [];
  // A creator who hides likes everywhere is judged on comments alone.
  const likesHidden = posts.every((post) => post.likes === null);
  const baseline = median(posts.map((post) => engagementOf(post, likesHidden)));
  if (!baseline) return [];
  const since = now - CREATOR_REEL_WINDOW_DAYS * 86_400_000;
  return posts
    .filter((post) => post.isReel && Date.parse(post.postedAt) >= since && onTopic(post.caption))
    .map((post) => ({ post, multiple: engagementOf(post, likesHidden) / baseline }))
    .filter((entry) => entry.multiple >= BREAKOUT_MULTIPLE && headlineOf(entry.post.caption))
    .sort((a, b) => b.multiple - a.multiple)
    .slice(0, MAX_PER_CREATOR);
}

/** "2.3× their normal", one decimal: shown on the topic and handed to the writer. */
export function multipleLabel(multiple: number): string {
  return `${multiple.toFixed(1)}× their normal`;
}

/** A standout reel as a topic, stored beside the news so every topic feature works on it. */
export function reelAsTopic(
  handle: string,
  lane: string,
  standout: Standout,
  /** 0-100 fit to the lane's learned pattern, when there is one. */
  fit: number | null = null,
): SourceDraft & { coverage: number } {
  return {
    url: standout.post.permalink,
    title: headlineOf(standout.post.caption),
    publisher: `@${handle}`,
    publisherUrl: `https://www.instagram.com/${handle}/`,
    publishedAt: standout.post.postedAt,
    // "How it was found" — the creator and how far the reel beat their normal.
    query: `@${handle} reel · ${multipleLabel(standout.multiple)}${fit === null ? "" : ` · ${fit}% fit`}`,
    lane,
    kind: "video",
    coverage: 1,
  };
}
