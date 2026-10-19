// Finding the live reel for each filmed idea. Free: it reads synced posts, and
// at most once per idea the source article.
//
// Runs whenever a filmed idea is opened and after every sync, so the team never
// pastes a link. Three ways in, strongest first, each only when the one before
// found nothing:
//   1. topic    the caption names the story (a brand, product or campaign)
//   2. article  the caption shares names and facts with the source article
//   3. timing   the only new reel posted around when it was filmed; a guess,
//               held unconfirmed (and unscored) until Analyse checks the topic
// Linking by hand is the backup. A confirmed reel is also linked the way the
// older "paste the link" path linked it (status "used" + its shortcode), which
// is what the 7-day outcome capture reads.
import { OWNER_ACCOUNTS } from "../apify/accounts";
import { readStory } from "../sources/article";
import { markIdeaUsed, readIdeaById, readPosts, readSourceItemsById } from "../store";
import {
  distinctive,
  findReelByArticle,
  findReelByTiming,
  findReelForIdea,
  namesIn,
  shortcodeFromUrl,
  type ReelCandidate,
} from "@/lib/reel-match";
import type { ReelMatch } from "@/lib/reel-learning-types";
import type { PlatformId, PostRecord } from "@/lib/analytics-types";

import {
  ideaCreatedAt,
  linkedShortcodes,
  readAllReelLearning,
  readReelLearning,
  unlinkIdea,
  updateReelLearning,
  type ReelLearningRow,
  type SourceWords,
} from "./store";

async function ownerReels(platform: PlatformId): Promise<PostRecord[]> {
  const posts = await readPosts(platform, OWNER_ACCOUNTS[platform].handle, 1000);
  return platform === "instagram" ? posts.filter((post) => post.format === "reel") : posts;
}

/**
 * The source article's names and words, read once and kept on the row. An
 * idea with no source, or an article that cannot be read, stores empty lists
 * so the read is never attempted again.
 */
async function sourceWordsFor(row: ReelLearningRow, sourceId: string | undefined) {
  if (row.sourceWords) return row.sourceWords;
  let words: SourceWords = { names: [], words: [] };
  if (sourceId) {
    const [source] = await readSourceItemsById([sourceId]).catch(() => []);
    const article = source ? await readStory(source).catch(() => null) : null;
    if (article?.text) {
      words = { names: [...namesIn(article.text)], words: [...distinctive(article.text)] };
    }
  }
  await updateReelLearning(row.ideaId, { source_words: words });
  return words;
}

/** Links one filmed idea to its reel when one is now clear. Returns the row as it stands. */
export async function linkFilmedReel(
  row: ReelLearningRow,
  context?: { posts: PostRecord[]; taken: Set<string> },
): Promise<ReelLearningRow> {
  // Settled: a confirmed link, or one a person made. A timing guess keeps
  // being re-checked, so a clearer match that appears later replaces it.
  const guessing = row.match?.by === "timing" && !row.match.confirmed;
  if (row.shortcode && !guessing) return row;

  const idea = await readIdeaById(row.ideaId);
  if (!idea) return row;
  const posts = context?.posts ?? (await ownerReels(row.platform));
  const taken = new Set(context?.taken ?? (await linkedShortcodes(row.platform)));
  for (const code of row.match?.rejected ?? []) taken.add(code);
  // The guess itself must not block a better match for the same idea.
  if (guessing && row.shortcode) taken.delete(row.shortcode);
  const createdAt = (await ideaCreatedAt(row.ideaId)) ?? row.filmedAt;
  const window = { createdAt, filmedAt: row.filmedAt, taken };

  let found: ReelCandidate | null = findReelForIdea(idea, posts, window);
  let by: ReelMatch["by"] = "topic";
  if (!found) {
    const article = await sourceWordsFor(row, idea.source?.sourceId);
    found = findReelByArticle(article, posts, window);
    by = "article";
  }
  if (!found && !guessing) {
    found = findReelByTiming(posts, { filmedAt: row.filmedAt, taken });
    by = "timing";
  }
  if (!found || found.shortcode === row.shortcode) return row;

  const confirmed = by !== "timing";
  const matchedAt = new Date().toISOString();
  const match: ReelMatch = {
    by,
    confirmed,
    words: found.words,
    score: found.score,
    ...(row.match?.rejected ? { rejected: row.match.rejected } : {}),
  };
  await updateReelLearning(row.ideaId, {
    shortcode: found.shortcode,
    reel_url: found.post.url ?? null,
    matched_at: matchedAt,
    match,
  });
  // Only a confirmed reel is scored by the outcome capture.
  if (confirmed) await markIdeaUsed(row.ideaId, found.shortcode);
  context?.taken.add(found.shortcode);
  return (await readReelLearning(row.ideaId)) ?? row;
}

/** Analyse found the reel matches the story: a timing guess becomes a link. */
export async function confirmMatch(row: ReelLearningRow): Promise<void> {
  if (!row.shortcode || !row.match || row.match.confirmed) return;
  await updateReelLearning(row.ideaId, { match: { ...row.match, confirmed: true } });
  await markIdeaUsed(row.ideaId, row.shortcode);
}

/**
 * Analyse found the reel covers a different story. It is unlinked, remembered
 * as rejected so it is never matched to this idea again, and the search goes
 * on. A reel a person linked by hand is never undone by the system.
 */
export async function rejectMatch(row: ReelLearningRow): Promise<void> {
  if (!row.shortcode || row.match?.by === "manual") return;
  const rejected = [...(row.match?.rejected ?? []), row.shortcode];
  await updateReelLearning(row.ideaId, {
    shortcode: null,
    reel_url: null,
    matched_at: null,
    match: { by: "none", confirmed: false, words: [], score: 0, rejected },
    transcript: null,
    comparison: null,
    usage: null,
    analysed_at: null,
    review: null,
    worked: null,
    reviewed_at: null,
  });
  await unlinkIdea(row.ideaId);
}

/**
 * Links a reel a person named: the backup, for a reel none of the automatic
 * ways can find, or a wrong match. The reel must be one of this account's
 * synced posts, so a stray link cannot be filed against an idea.
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
  const match: ReelMatch = {
    by: "manual",
    confirmed: true,
    words: [],
    score: 0,
    ...(row.match?.rejected ? { rejected: row.match.rejected } : {}),
  };
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
    const waiting = (await readAllReelLearning(platform)).filter(
      (row) => !row.shortcode || (row.match?.by === "timing" && !row.match.confirmed),
    );
    if (!waiting.length) return 0;
    const posts = await ownerReels(platform);
    const taken = await linkedShortcodes(platform);
    let linked = 0;
    // Oldest first, so the earlier filming claims the earlier reel.
    for (const row of waiting.reverse()) {
      const after = await linkFilmedReel(row, { posts, taken });
      if (after.shortcode && after.shortcode !== row.shortcode) linked += 1;
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
