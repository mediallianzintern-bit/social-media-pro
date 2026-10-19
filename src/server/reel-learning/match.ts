// Finding the live reel for each filmed idea. Free: it reads synced posts only.
//
// Runs whenever a filmed idea is opened and after every sync, so the team never
// pastes a link. A found reel is also linked the way the older "paste the link"
// path linked it (status "used" + its shortcode), which is what the 7-day
// outcome capture reads, so the existing learning loop finally gets fed too.
import { OWNER_ACCOUNTS } from "../apify/accounts";
import { markIdeaUsed, readIdeaById, readPosts } from "../store";
import { findReelForIdea, shortcodeFromUrl } from "@/lib/reel-match";
import type { PlatformId, PostRecord } from "@/lib/analytics-types";

import {
  ideaCreatedAt,
  linkedShortcodes,
  readAllReelLearning,
  readReelLearning,
  updateReelLearning,
  type ReelLearningRow,
} from "./store";

async function ownerReels(platform: PlatformId): Promise<PostRecord[]> {
  const posts = await readPosts(platform, OWNER_ACCOUNTS[platform].handle, 1000);
  return platform === "instagram" ? posts.filter((post) => post.format === "reel") : posts;
}

/** Links one filmed idea to its reel when one is now clear. Returns the row as it stands. */
export async function linkFilmedReel(
  row: ReelLearningRow,
  context?: { posts: PostRecord[]; taken: Set<string> },
): Promise<ReelLearningRow> {
  if (row.shortcode) return row;
  const idea = await readIdeaById(row.ideaId);
  if (!idea) return row;
  const posts = context?.posts ?? (await ownerReels(row.platform));
  const taken = context?.taken ?? (await linkedShortcodes(row.platform));
  const createdAt = (await ideaCreatedAt(row.ideaId)) ?? row.filmedAt;

  const found = findReelForIdea(idea, posts, { createdAt, filmedAt: row.filmedAt, taken });
  if (!found) return row;

  const matchedAt = new Date().toISOString();
  const match = { by: "topic" as const, words: found.words, score: found.score };
  await updateReelLearning(row.ideaId, {
    shortcode: found.shortcode,
    reel_url: found.post.url ?? null,
    matched_at: matchedAt,
    match,
  });
  await markIdeaUsed(row.ideaId, found.shortcode);
  taken.add(found.shortcode);
  return {
    ...row,
    shortcode: found.shortcode,
    reelUrl: found.post.url ?? null,
    matchedAt,
    match,
  };
}

/**
 * Links a reel a person named, for the rare match the topic cannot make (a
 * reel whose caption never names the story). The reel must be one of this
 * account's synced posts, so a stray link cannot be filed against an idea.
 */
export async function linkReelByHand(ideaId: string, permalink: string): Promise<ReelLearningRow> {
  const row = await readReelLearning(ideaId);
  if (!row) throw new Error("Press I filmed this first.");
  const shortcode = shortcodeFromUrl(permalink);
  if (!shortcode) throw new Error("That doesn't look like a reel link.");
  const post = (await ownerReels(row.platform)).find(
    (item) => (shortcodeFromUrl(item.url) ?? item.postId) === shortcode,
  );
  if (!post) {
    throw new Error(
      "That reel isn't in the synced posts yet. Press Sync once it is live, then try again.",
    );
  }
  const matchedAt = new Date().toISOString();
  const match = { by: "manual" as const, words: [], score: 0 };
  // A different reel means the earlier analysis was of the wrong one.
  await updateReelLearning(ideaId, {
    shortcode,
    reel_url: post.url ?? null,
    matched_at: matchedAt,
    match,
    transcript: null,
    comparison: null,
    usage: null,
    analysed_at: null,
    review: null,
    worked: null,
    reviewed_at: null,
  });
  await markIdeaUsed(ideaId, shortcode);
  return (await readReelLearning(ideaId))!;
}

/** After a sync: links every filmed idea still waiting for its reel. Never throws. */
export async function linkFilmedReels(platform: PlatformId): Promise<number> {
  try {
    const waiting = (await readAllReelLearning(platform)).filter((row) => !row.shortcode);
    if (!waiting.length) return 0;
    const posts = await ownerReels(platform);
    const taken = await linkedShortcodes(platform);
    let linked = 0;
    // Oldest first, so the earlier filming claims the earlier reel.
    for (const row of waiting.reverse()) {
      const after = await linkFilmedReel(row, { posts, taken });
      if (after.shortcode) linked += 1;
    }
    return linked;
  } catch (error) {
    console.error(`[reel-learning:${platform}] linking filmed reels skipped:`, error);
    return 0;
  }
}

/** The synced post a row is linked to, for its publish time and metrics. */
export async function linkedPost(row: ReelLearningRow): Promise<PostRecord | null> {
  if (!row.shortcode) return null;
  const posts = await ownerReels(row.platform);
  return (
    posts.find((post) => (shortcodeFromUrl(post.url) ?? post.postId) === row.shortcode) ?? null
  );
}
