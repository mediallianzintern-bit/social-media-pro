// Finding the reel a filmed idea became, and measuring how much of it was used.
//
// The TOPIC is the anchor (Pritesh, 19 Oct): the team may rewrite the hook,
// the script, the caption and the hashtags, but the story a reel covers is the
// one the dashboard gave them. So a reel is matched to an idea by the
// distinctive words its caption shares with that story, never by how close
// the script is, which is the very thing allowed to change.
//
// Everything here is computed, not judged: no model call. The model explains
// what changed; these numbers say how much did.
//
// Client-safe and pure.
import type { ContentIdea } from "@/lib/ai-types";
import type { PostRecord } from "@/lib/analytics-types";
import { subjectWords } from "@/lib/hook-check";

/** The story an idea is about: the headline it came from, and its own framing. */
export function anchorText(idea: ContentIdea): string {
  return [idea.source?.headline, idea.source?.subject, idea.title, idea.reaction?.claim, idea.angle]
    .filter(Boolean)
    .join(" ");
}

/**
 * Words too common in this account's captions to identify one story: every
 * reel says "brand", "marketing", "campaign". A match resting on these alone
 * would link any two reels.
 */
const COMMON_IN_CAPTIONS = new Set(
  (
    "brand brands marketing campaign campaigns people customer customers business businesses " +
    "idea ideas content reel reels post posts video videos social media one two first new " +
    "turned turn turns made make biggest best real way ways most every still thing things " +
    "product products company companies even also because just would could should into over"
  ).split(" "),
);

function distinctive(text: string): Set<string> {
  return new Set(
    [...subjectWords(text)].filter((word) => word.length >= 3 && !COMMON_IN_CAPTIONS.has(word)),
  );
}

/**
 * Capitalised words that start sentences or headlines without naming anything.
 * Everything else written with a capital is treated as a name: a brand, a
 * product, a person, a campaign.
 */
const NOT_A_NAME = new Set(
  (
    "a an the this that these those what why how when where who which it its is are was were " +
    "i we you he she they our your my his her their if in on at for and but or so to of with " +
    "from by as not no yes imagine instead here there now then today new ai launch launches " +
    "launched model models tool tools brand brands campaign marketing less more most faster " +
    "smarter better best biggest first one two three five ten every all just even also because " +
    "watching people customer customers business businesses ad ads"
  ).split(" "),
);

/**
 * The names in a text, lower-cased for comparison: the words written with a
 * capital ("Claude", "Haiku", "Lay's" as "lay", "X"), minus sentence starters.
 * Possessives are folded so "Google's" and "Google" are one name. Hyphenated
 * words are split, so a sentence opening "AI-powered" is not taken for a name.
 */
export function namesIn(text: string): Set<string> {
  const names = new Set<string>();
  for (const raw of text.replace(/[\u2018\u2019]/g, "'").split(/[^\p{L}\p{N}'.]+/u)) {
    const token = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").replace(/'s$/i, "");
    if (!/^\p{Lu}/u.test(token)) continue;
    const lower = token.toLowerCase();
    if (NOT_A_NAME.has(lower)) continue;
    names.add(lower);
  }
  return names;
}

export interface ReelCandidate {
  post: PostRecord;
  shortcode: string;
  words: string[];
  score: number;
}

/** A reel's shortcode from its link. */
export function shortcodeFromUrl(url: string | undefined): string | null {
  const match = /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/.exec(url ?? "");
  return match?.[1] ?? null;
}

/**
 * A match needs at least one shared NAME, and at least this much evidence in
 * all: a shared name counts double, any other distinctive shared word once.
 * Shared ordinary words alone ("model", "approach", "businesses") linked five
 * unrelated scripts to one reel when tried on real data; a shared name did not.
 */
export const MIN_MATCH_SCORE = 3;

/**
 * The live reel a filmed idea became, or null when none is clear yet.
 *
 * Candidates are the account's own reels published from the day before the
 * idea was written (a team can film from a draft) until 30 days after it was
 * marked filmed, that are not already linked to another idea. The one sharing
 * the most distinctive words with the story wins; a tie goes to the reel
 * published closest to the filming.
 */
export function findReelForIdea(
  idea: ContentIdea,
  posts: PostRecord[],
  options: { createdAt: string; filmedAt: string; taken: Set<string> },
): ReelCandidate | null {
  const text = anchorText(idea);
  const anchor = distinctive(text);
  const anchorNames = namesIn(text);
  if (!anchorNames.size) return null;
  const earliest = Date.parse(options.createdAt) - 86_400_000;
  const latest = Date.parse(options.filmedAt) + 30 * 86_400_000;
  const filmed = Date.parse(options.filmedAt);

  const candidates: ReelCandidate[] = [];
  for (const post of posts) {
    if (post.pinned) continue;
    const shortcode = shortcodeFromUrl(post.url) ?? post.postId;
    if (options.taken.has(shortcode)) continue;
    const at = Date.parse(post.publishedAt);
    if (!Number.isFinite(at) || at < earliest || at > latest) continue;
    const names = [...namesIn(post.caption)].filter((name) => anchorNames.has(name));
    if (!names.length) continue;
    const others = [...distinctive(post.caption)].filter(
      (word) => anchor.has(word) && !names.includes(word),
    );
    const score = names.length * 2 + others.length;
    if (score < MIN_MATCH_SCORE) continue;
    candidates.push({ post, shortcode, words: [...names, ...others], score });
  }
  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      Math.abs(Date.parse(a.post.publishedAt) - filmed) -
        Math.abs(Date.parse(b.post.publishedAt) - filmed),
  );
  return candidates[0] ?? null;
}

/** Lower-case words, with team notes in [brackets] and hashtags left out. */
export function words(text: string): string[] {
  return text
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/#[\p{L}\p{N}_]+/gu, " ")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean);
}

/**
 * How much of `original` survives in `actual`, in order: the longest run of
 * words the two share in sequence, as a share of the original. 1 means every
 * word was said, in order; 0 means none.
 */
export function orderedOverlap(original: string, actual: string): number {
  const a = words(original);
  const b = words(actual);
  if (!a.length || !b.length) return 0;
  let previous = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j += 1) {
      current[j] =
        a[i - 1] === b[j - 1] ? previous[j - 1]! + 1 : Math.max(previous[j]!, current[j - 1]!);
    }
    previous = current;
  }
  return previous[b.length]! / a.length;
}

/** The hashtags in a text, lower-case, in order, without repeats. */
export function hashtagsIn(text: string): string[] {
  return [...new Set((text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((tag) => tag.toLowerCase()))];
}

/** Which of the offered hooks the reel's first line is, and how closely. */
export function closestHook(
  idea: ContentIdea,
  spoken: string,
): { variant: string | null; overlap: number } {
  const offered = [idea.hook, ...(idea.altHooks ?? [])].filter(Boolean);
  let best: { variant: string | null; overlap: number } = { variant: null, overlap: 0 };
  offered.forEach((hook, index) => {
    const overlap = orderedOverlap(hook, spoken);
    if (overlap > best.overlap) best = { variant: String.fromCharCode(65 + index), overlap };
  });
  return best;
}

/** The dashboard's spoken script for an idea, in order. */
export function scriptOf(idea: ContentIdea): string {
  const spoken = (idea.shots ?? []).map((shot) => shot.voiceover).filter(Boolean);
  return spoken.length ? spoken.join(" ") : (idea.post?.body ?? idea.hook);
}
