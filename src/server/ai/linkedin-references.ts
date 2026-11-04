// His own best LinkedIn posts of the last 30 days, as references for how a
// post should read (4 Nov 2026).
//
// The meeting with Pritesh Sir asked for posts written in the tone and format
// of his recent LinkedIn posts, the best-performing first. The writer had one
// fixed example (the approved crypto post) and a description of his patterns;
// his actual recent posts read very differently from what it produced: lines
// of about 9 words against its 22. These are his real posts, ranked by the
// impressions LinkedIn's API measured, re-read on every generation, so the
// references move as he posts.
//
// For tone and format ONLY: line length, rhythm, how the opening holds back,
// the plain words. Their facts belong to their own stories.
//
// Free: reads stored posts and stored impressions. Never fatal.
import type { PostRecord } from "@/lib/analytics-types";
import { engagementsOf } from "@/lib/analytics-types";

import { OWNER_ACCOUNTS } from "../apify/accounts";
import { readLinkedInAnalytics } from "../linkedin-analytics";
import { readPosts } from "../store";

/** References quoted: enough for a voice, few enough to stay cheap (~900 tokens). */
export const REFERENCE_POSTS = 3;
/** The window the team asked for; widened once when it holds too few posts. */
export const REFERENCE_DAYS = 30;
const WIDER_DAYS = 60;
/** A post this short is an article teaser, not a model of a full post. */
const MIN_WORDS = 120;
const DAY_MS = 86_400_000;

const wordsIn = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** His best full posts in a window, by impressions (engagement where none was measured). */
export function bestRecentPosts(
  posts: PostRecord[],
  impressions: Map<string, number>,
  now = Date.now(),
): Array<{ post: PostRecord; impressions: number | null }> {
  const pick = (days: number) =>
    posts
      .filter((post) => Date.parse(post.publishedAt) >= now - days * DAY_MS)
      .filter((post) => wordsIn(post.caption) >= MIN_WORDS)
      .map((post) => ({ post, impressions: impressions.get(post.postId) ?? null }))
      .sort(
        (a, b) =>
          (b.impressions ?? -1) - (a.impressions ?? -1) ||
          engagementsOf(b.post) - engagementsOf(a.post),
      )
      .slice(0, REFERENCE_POSTS);
  const recent = pick(REFERENCE_DAYS);
  return recent.length >= 2 ? recent : pick(WIDER_DAYS);
}

/** The block the LinkedIn writer and reviewer read, or "" when there is nothing to quote. */
export async function linkedInPostReferences(now = Date.now()): Promise<string> {
  try {
    const [posts, analytics] = await Promise.all([
      readPosts("linkedin", OWNER_ACCOUNTS.linkedin.handle, 1000),
      readLinkedInAnalytics(),
    ]);
    const impressions = new Map(
      analytics.posts
        .filter((row) => row.impressions != null)
        .map((row) => [row.postId, row.impressions as number]),
    );
    const best = bestRecentPosts(posts, impressions, now);
    if (!best.length) return "";
    return `HIS OWN BEST LINKEDIN POSTS OF THE LAST ${REFERENCE_DAYS} DAYS, by the impressions LinkedIn measured. For TONE AND FORMAT ONLY: how short his lines are (one sentence a line, about nine words), how his opening holds the point back, how plainly he says things, how he closes. Never use a fact, name, figure or story from them, and never copy or lightly reword a sentence: they are about other stories.

${best
  .map(
    ({ post, impressions: count }, index) =>
      `REFERENCE ${index + 1}${count != null ? ` (${count} impressions)` : ""}:
"""
${post.caption.trim()}
"""`,
  )
  .join("\n\n")}`;
  } catch (error) {
    console.warn("[ai:linkedin] post references unavailable:", error);
    return "";
  }
}
