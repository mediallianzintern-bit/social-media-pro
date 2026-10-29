// Reading the article behind a headline, for the one story a script is
// being written from.
//
// Every inbox row is a headline from a Google News search: the feed carries
// the headline, the outlet, the date and a link, and nothing of the article.
// A script built on a headline alone cannot say what a brand actually did, so
// it turns generic or fills with "[verify: …]" notes (the Powerade test, Oct
// 2026). This reads the article itself, at "Write script" time only, so the
// script can state what happened instead of guessing.
//
// The rules it keeps:
//   - Free: plain page fetches, no Apify, no model call.
//   - Polite: an honest user agent, one request per page, a short timeout. A
//     site that refuses automated reading (403, 401, 429, a paywall page) is
//     respected, never worked around. Inc.com, for one, refuses.
//   - When the story's own outlet refuses, other outlets that covered the SAME
//     story are tried, found by a news search and matched by headline. The
//     script then credits the outlet actually read (IdeaSource.readFrom).
//   - Nothing is stored. The text goes into this one prompt and is dropped;
//     the model is told to use its facts in his words, never its sentences.
//   - Any failure returns null, and the script is written from the headline
//     exactly as before.
import { titleTokens, type SourceItem } from "@/lib/sources";

import { searchNews } from "./news";

/** Identifies the reader honestly. A site that blocks it is respected. */
const USER_AGENT =
  "Mozilla/5.0 (compatible; SocialCommandCenter/1.0; +https://social.mediallianz.com)";

const TIMEOUT_MS = 8_000;

/** Below this many words of body text, the page is a stub, a paywall or a blocked page. */
const MIN_WORDS = 150;

/** Enough for the facts of a news story; the rest only costs prompt tokens. */
const MAX_WORDS = 900;

/** Pages fetched per story, all outlets together. */
const MAX_FETCHES = 5;

export interface ArticleText {
  publisher: string | null;
  url: string;
  text: string;
  words: number;
  /** False when the story's own outlet refused and another outlet's report was read. */
  sameOutlet: boolean;
}

async function get(url: string, init: RequestInit = {}): Promise<Response | null> {
  try {
    return await fetch(url, {
      ...init,
      headers: { "user-agent": USER_AGENT, "accept-language": "en", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

/**
 * The publisher's own link for a Google News article link, or the link as
 * given when it is not one.
 *
 * Google News links do not redirect to the article: the page carries a signed
 * id that Google's own page swaps for the real address through one request,
 * and this makes that same request. Unofficial, so any change on Google's side
 * simply returns null and the story falls back to its headline.
 */
export async function publisherUrl(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== "news.google.com") return url;
  const id = parsed.pathname.split("/").pop();
  if (!id) return null;

  const page = await get(`https://news.google.com/articles/${id}`);
  const html = page?.ok ? await page.text() : "";
  const signature = /data-n-a-sg="([^"]+)"/.exec(html)?.[1];
  const timestamp = /data-n-a-ts="([^"]+)"/.exec(html)?.[1];
  if (!signature || !timestamp) return null;

  const inner = JSON.stringify([
    "garturlreq",
    [
      [
        "X",
        "X",
        ["X", "X"],
        null,
        null,
        1,
        1,
        "US:en",
        null,
        1,
        null,
        null,
        null,
        null,
        null,
        0,
        1,
      ],
      "X",
      "X",
      1,
      [1, 1, 1],
      1,
      1,
      null,
      0,
      0,
      null,
      0,
    ],
    id,
    Number(timestamp),
    signature,
  ]);
  const response = await get("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: `f.req=${encodeURIComponent(JSON.stringify([[["Fbv4je", inner]]]))}`,
  });
  if (!response?.ok) return null;
  try {
    const payload = (await response.text()).split("\n\n")[1] ?? "";
    const decoded = JSON.parse(JSON.parse(payload)[0][2])[1];
    return typeof decoded === "string" && /^https?:\/\//.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  nbsp: " ",
  lt: "<",
  gt: ">",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  mdash: "—",
  ndash: "–",
  hellip: "…",
};

function decode(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match);
}

const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

/**
 * The readable body of an article page: its paragraphs, minus navigation,
 * scripts and boilerplate. Null when there is too little to be the article.
 */
export function extractArticleText(html: string): string | null {
  const body = html
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const paragraphs = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) =>
      decode((match[1] ?? "").replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim(),
    )
    // Bylines, captions, "Sign up for our newsletter" and cookie notices are
    // short; the story's own paragraphs are not.
    .filter((text) => text.length >= 60 && !/subscribe|newsletter|cookie|sign up/i.test(text));

  const kept: string[] = [];
  let total = 0;
  for (const paragraph of paragraphs) {
    if (kept.includes(paragraph)) continue;
    kept.push(paragraph);
    total += countWords(paragraph);
    if (total >= MAX_WORDS) break;
  }
  if (total < MIN_WORDS) return null;
  const text = kept.join("\n\n").split(/\s+/).slice(0, MAX_WORDS).join(" ");
  return text;
}

/** One page, read if the site allows it. Null on refusal, failure or a stub. */
async function readPage(url: string): Promise<string | null> {
  const resolved = await publisherUrl(url);
  if (!resolved) return null;
  const response = await get(resolved, { redirect: "follow" });
  if (!response?.ok) return null;
  if (!/html/i.test(response.headers.get("content-type") ?? "")) return null;
  return extractArticleText(await response.text());
}

const stem = (words: Set<string>) => new Set([...words].map((word) => word.replace(/s$/, "")));

/**
 * Other outlets' reports of the same story.
 *
 * Searched on the headline's rarest words across the stored inbox (a brand
 * name, not "launches"), and kept only when the result names that same word
 * and shares at least two more with the original headline. Tested on the
 * Powerade story: 11 matching reports, and none of the unrelated Powerade news
 * (new flavours, a court case) that the same search also returned.
 */
async function sameStoryElsewhere(
  source: SourceItem,
  inboxTitles: string[],
): Promise<Array<{ url: string; publisher: string | null }>> {
  const original = stem(titleTokens(source.title));
  const frequency = new Map<string, number>();
  for (const title of inboxTitles) {
    for (const word of stem(titleTokens(title))) {
      frequency.set(word, (frequency.get(word) ?? 0) + 1);
    }
  }
  const anchors = [...original]
    .sort((a, b) => (frequency.get(a) ?? 0) - (frequency.get(b) ?? 0))
    .slice(0, 4);
  // Two shared words beside the anchor, never fewer. One was tried for short
  // headlines and matched the WRONG stories: "Meta Gives Advertisers a Smarter
  // AI Assistant" took an article on LinkedIn's Hiring Assistant, and "X
  // Launches an AI Tool That Builds Ads" a Linux Foundation release on "BUILD".
  // A wrong article is far worse than none, so a short headline that matches
  // nothing stays on its headline.
  const needed = 2;

  const seen = new Set([source.url, (source.publisher ?? "").toLowerCase()]);
  const found: Array<{ url: string; publisher: string | null }> = [];
  for (const anchor of anchors) {
    const results = await searchNews(anchor, null, { days: 14 }).catch(() => []);
    for (const result of results) {
      const words = stem(titleTokens(result.title));
      const shared = [...original].filter((word) => word !== anchor && words.has(word));
      const outlet = (result.publisher ?? "").toLowerCase();
      if (
        !words.has(anchor) ||
        shared.length < needed ||
        seen.has(result.url) ||
        seen.has(outlet)
      ) {
        continue;
      }
      seen.add(result.url);
      seen.add(outlet);
      found.push({ url: result.url, publisher: result.publisher });
    }
    if (found.length) break;
  }
  return found;
}

/** How much of an article's opening is checked: the lede, where a story names its subject. */
const LEDE_WORDS = 120;

/**
 * Whether another outlet's article is really about this story, not just a
 * headline that shares a word. Its OPENING must contain at least 40% of the
 * original headline's distinctive words. Checked on the lede, not the whole
 * text: a 900-word article contains most common words somewhere, which let an
 * unrelated article pass when the whole text was checked.
 */
export function coversStory(text: string, headline: string): boolean {
  const wanted = [...stem(titleTokens(headline))];
  if (!wanted.length) return false;
  const lede = text.split(/\s+/).slice(0, LEDE_WORDS).join(" ");
  const have = stem(titleTokens(lede));
  const found = wanted.filter((word) => have.has(word)).length;
  return found / wanted.length >= 0.4;
}

/**
 * The article behind one story: its own outlet first, then other outlets that
 * covered the same story. Null when none can be read, which leaves the script
 * on the headline exactly as before.
 */
/**
 * A creator's reel, read as its transcript: what is said in it is the workflow
 * the script is built on. One Apify transcript run (about 1.5¢), only when a
 * script is written from the reel.
 */
async function readReel(source: SourceItem): Promise<ArticleText | null> {
  const { fetchReelTranscript } = await import("../apify/reels");
  const result = await fetchReelTranscript(source.url).catch(() => null);
  if (!result || !("transcript" in result) || !result.transcript.trim()) return null;
  const text = `What ${source.publisher ?? "the creator"} says in the reel:\n${result.transcript.trim()}`;
  return {
    publisher: source.publisher,
    url: source.url,
    text,
    words: countWords(text),
    sameOutlet: true,
  };
}

export async function readStory(
  source: SourceItem,
  inboxTitles: string[] = [],
): Promise<ArticleText | null> {
  if (source.kind === "video" && /instagram\.com\/(reel|p)\//.test(source.url)) {
    return readReel(source);
  }
  let fetches = 0;

  fetches += 1;
  const own = await readPage(source.url);
  if (own) {
    return {
      publisher: source.publisher,
      url: (await publisherUrl(source.url)) ?? source.url,
      text: own,
      words: countWords(own),
      sameOutlet: true,
    };
  }

  for (const other of await sameStoryElsewhere(source, inboxTitles)) {
    if (fetches >= MAX_FETCHES) break;
    fetches += 1;
    const resolved = await publisherUrl(other.url);
    if (!resolved) continue;
    const text = await readPage(resolved);
    if (text && coversStory(text, source.title)) {
      return {
        publisher: other.publisher,
        url: resolved,
        text,
        words: countWords(text),
        sameOutlet: false,
      };
    }
  }
  return null;
}
