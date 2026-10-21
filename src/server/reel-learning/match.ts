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
  earliestReelFor,
  findReelForIdea,
  nameFrequency,
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
  recentIdeas,
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

/** A timing guess not yet confirmed by Analyse. It never blocks a stronger match. */
const isGuess = (row: ReelLearningRow) => row.match?.by === "timing" && !row.match.confirmed;

/** The topic or source-article match for one idea, ignoring `taken` reels. */
async function strongMatch(
  row: ReelLearningRow,
  posts: PostRecord[],
  taken: Set<string>,
  nameFreq: Map<string, number>,
): Promise<{ found: ReelCandidate; by: ReelMatch["by"] } | null> {
  const idea = await readIdeaById(row.ideaId);
  if (!idea) return null;
  const createdAt = (await ideaCreatedAt(row.ideaId)) ?? row.filmedAt;
  const window = { createdAt, filmedAt: row.filmedAt, taken };
  const byTopic = findReelForIdea(idea, posts, { ...window, nameFreq });
  if (byTopic) return { found: byTopic, by: "topic" };
  const article = await sourceWordsFor(row, idea.source?.sourceId);
  const byArticle = findReelByArticle(article, posts, {
    ...window,
    earliest: earliestReelFor(idea, createdAt),
  });
  return byArticle ? { found: byArticle, by: "article" } : null;
}

async function setLink(row: ReelLearningRow, found: ReelCandidate, by: ReelMatch["by"]) {
  const confirmed = by !== "timing";
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
    matched_at: new Date().toISOString(),
    match,
  });
  // Only a confirmed reel is scored by the outcome capture.
  if (confirmed) await markIdeaUsed(row.ideaId, found.shortcode);
}

/**
 * Links every filmed idea still waiting for its reel, for one platform. Free.
 *
 * Done for all waiting ideas together, in two passes, because a reel can only
 * belong to one idea and a weak claim must never beat a strong one. This went
 * wrong on 21 October: an idea with no reel posted yet (Reflection AI's Beam)
 * guessed by timing and took the Disney reel, and the Disney idea, whose reel
 * names Disney, Hulu and Canada, then found it taken.
 *
 *   1. Strong matches first, for every waiting idea: the story's names in the
 *      caption, then the source article. A reel held only by another idea's
 *      timing guess is not taken: the strong match wins and the guess is
 *      released, with that reel remembered as not its own.
 *   2. Timing last, only for ideas still without a reel, and only from reels
 *      no idea has claimed in any way.
 */
export async function linkFilmedReels(platform: PlatformId): Promise<number> {
  try {
    const rows = await readAllReelLearning(platform);
    const waiting = rows.filter((row) => !row.shortcode || isGuess(row)).reverse(); // oldest first
    if (!waiting.length) return 0;
    const posts = await ownerReels(platform);
    const taken = await linkedShortcodes(platform);
    const nameFreq = nameFrequency(posts);
    // Guesses do not block strong matches: who holds which reel by guessing.
    const guessHeld = new Map<string, ReelLearningRow>();
    for (const row of rows) if (isGuess(row) && row.shortcode) guessHeld.set(row.shortcode, row);
    for (const code of guessHeld.keys()) taken.delete(code);

    let linked = 0;
    const unmatched: ReelLearningRow[] = [];
    for (const row of waiting) {
      const own = new Set([...taken, ...(row.match?.rejected ?? [])]);
      const strong = await strongMatch(row, posts, own, nameFreq);
      if (!strong) {
        unmatched.push(row);
        continue;
      }
      const code = strong.found.shortcode;
      const holder = guessHeld.get(code);
      if (holder && holder.ideaId !== row.ideaId) {
        await rejectMatch(holder);
        guessHeld.delete(code);
      }
      if (!(row.shortcode === code && row.match?.by === strong.by)) {
        await setLink(row, strong.found, strong.by);
        linked += 1;
      }
      taken.add(code);
    }

    // Every recent idea's story, so a guess never lands on a reel about another one.
    const stories = unmatched.length ? await recentIdeas(platform) : [];
    for (const stale of unmatched) {
      const row = (await readReelLearning(stale.ideaId)) ?? stale;
      if (row.shortcode) {
        // A guess that kept its reel: still held, still unconfirmed.
        taken.add(row.shortcode);
        continue;
      }
      const blocked = new Set([...taken, ...guessHeld.keys(), ...(row.match?.rejected ?? [])]);
      const guess = findReelByTiming(posts, {
        filmedAt: row.filmedAt,
        taken: blocked,
        otherStories: stories.filter((idea) => idea.id !== row.ideaId),
      });
      if (!guess) continue;
      await setLink(row, guess, "timing");
      guessHeld.set(guess.shortcode, row);
      linked += 1;
    }
    return linked;
  } catch (error) {
    console.error(`[reel-learning:${platform}] linking filmed reels skipped:`, error);
    return 0;
  }
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

/** The synced post a row is linked to, for its publish time and metrics. */
export async function linkedPost(row: ReelLearningRow): Promise<PostRecord | null> {
  if (!row.shortcode) return null;
  const posts = await ownerReels(row.platform);
  return (
    posts.find((post) => (shortcodeFromUrl(post.url) ?? post.postId) === row.shortcode) ?? null
  );
}
