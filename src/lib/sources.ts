// Real sources — the articles a topic is allowed to be built on.
//
// Client-safe: the topic inbox renders these and the server ranks them, and
// both must agree on what "the same story" and "fresh" mean.
//
// The rule this module exists to serve: a topic on screen must trace to a page
// that existed when we fetched it. The model never supplies a link. It picks a
// source by id from a list built here, and the link is attached server-side
// from the stored row — so a fabricated URL is structurally impossible, not
// merely discouraged.

import type { StoryResearch } from "@/lib/research";

export type SourceKind = "article" | "video";

export interface SourceItem {
  id: string;
  platform: "instagram" | "linkedin";
  url: string;
  /** The headline as the outlet published it, publisher suffix stripped. */
  title: string;
  publisher: string | null;
  publisherUrl: string | null;
  publishedAt: string | null;
  /** The search that found it. */
  query: string;
  /** The account lane that search was derived from. Null for the niche-wide query. */
  lane: string | null;
  kind: SourceKind;
  /** Outlets that carried the same story in the same fetch. Above one = trending. */
  coverage: number;
  fetchedAt: string;
  /**
   * The article's text, read at script time for the one story being written
   * (see server/sources/article.ts). Never stored, never on inbox rows.
   */
  article?: { publisher: string | null; url: string; text: string } | undefined;
  /**
   * The story read from several outlets and combined into one fact sheet with
   * sources (server/ai/research.ts). Written from in place of `article` when
   * present. The fact sheet is kept with the idea; the article texts are not.
   */
  research?: StoryResearch | undefined;
}

/** The fields a fetch produces, before storage assigns an id. */
export type SourceDraft = Omit<SourceItem, "id" | "fetchedAt" | "coverage" | "platform">;

/** A story counts as trending when more than one outlet carried it. */
export const TRENDING_COVERAGE = 2;

/** How far back the inbox and the strategist look. News older than this is not a reason to post now. */
export const SOURCE_WINDOW_DAYS = 14;

const STOPWORDS = new Set(
  (
    "the a an and or but of to in on for with at by from as is are was were be been it its " +
    "this that these those how why what when who which your you our their his her they them " +
    "we i new after over into about more than just will can could would should has have had " +
    "not no now out up down all any some most very says said get gets got make makes made " +
    "here there top best first last year years day days week weeks"
  ).split(" "),
);

/** The distinctive words of a headline — what two reports of one story share. */
export function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[’']/g, "")
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 3 && !STOPWORDS.has(word)),
  );
}

/**
 * Headline words too common in marketing and tech news to identify a story,
 * even when capitalised — "Launches", "Brand", "Campaign" appear in a
 * different story every hour.
 */
const GENERIC_NAMES = new Set(
  (
    "exclusive breaking update launches launch launched unveils announces new brand brands " +
    "campaign campaigns ad ads advertising marketing model models report reports first ai tool " +
    "tools app apps startup company companies ceo india global world"
  ).split(" "),
);

/**
 * The words in a headline that NAME something — capitalised words and
 * version-style tokens like "GPT-6" — minus generic headline vocabulary.
 *
 * Two reports of one story almost always share a name (the brand, product or
 * person it is about). Two different stories can share plenty of vocabulary —
 * "X launches brand campaign" and "Y launches brand campaign" — and no name.
 */
export function nameTokens(title: string): Set<string> {
  return new Set(
    title
      .replace(/[’']s\b/g, "")
      .split(/[^A-Za-z0-9.-]+/)
      .filter((word) => /^[A-Z]/.test(word) || /[A-Za-z]-?\d/.test(word))
      .map((word) => word.toLowerCase().replace(/[.-]+$/, ""))
      .filter((word) => word.length >= 2 && !STOPWORDS.has(word) && !GENERIC_NAMES.has(word)),
  );
}

function sharesName(a: Set<string>, b: Set<string>): boolean {
  for (const word of a) if (b.has(word)) return true;
  return false;
}

function sharedCount(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** A headline reduced to its letters and digits: two copies of one headline compare equal. */
export function headlineKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Whether two headlines report the same story.
 *
 * Deliberately conservative: two headlines join only when they share at least
 * half their distinctive words AND at least one name. The name test was added
 * after real results merged "PepsiCo launches brand campaign" with "Ecover
 * launches £4m brand campaign" on vocabulary alone. A false merge inflates
 * "trending" — the one number here people will act on — so both tests must
 * pass. An identical headline always matches: on 22 Oct 2026, 24 of the 812
 * stories in the inbox were the same headline fetched twice, some with no
 * capitalised name for the name test to find.
 */
export function sameStory(
  a: string,
  b: string,
  threshold = 0.5,
  dates: { a?: string | null; b?: string | null } = {},
): boolean {
  if (headlineKey(a) === headlineKey(b)) return true;
  const tokensA = titleTokens(a);
  const tokensB = titleTokens(b);
  if (!sharesName(nameTokens(a), nameTokens(b))) return false;
  return (
    jaccard(tokensA, tokensB) >= threshold ||
    reworded(tokensA, tokensB, timeOf(dates.a), timeOf(dates.b))
  );
}

/** Reports this close in time can be the same story told in different words. */
const REWORDED_DAYS = 3;
/** Distinctive words they must share, and the share of all their words. */
const REWORDED_SHARED_WORDS = 4;
const REWORDED_OVERLAP = 0.3;

function timeOf(date: string | null | undefined): number | null {
  const time = date ? new Date(date).getTime() : NaN;
  return Number.isFinite(time) ? time : null;
}

/**
 * The same story, reworded: published within a few days of each other and
 * sharing at least four distinctive words and 30% of their wording. Found on
 * live data on 22 Oct 2026: "Meta's ad revenue hits over US$63 billion in Q3"
 * and "Meta's ad prices rise 14% as advertising revenue hits $63 billion" share
 * meta, revenue, hits, 63 and billion, but only a third of their words, so the
 * stricter test kept them apart. Callers check the shared name first.
 */
function reworded(a: Set<string>, b: Set<string>, timeA: number | null, timeB: number | null) {
  if (timeA === null || timeB === null) return false;
  if (Math.abs(timeA - timeB) > REWORDED_DAYS * 86_400_000) return false;
  return sharedCount(a, b) >= REWORDED_SHARED_WORDS && jaccard(a, b) >= REWORDED_OVERLAP;
}

/**
 * Reports of the same story, grouped: two reports join when they pass the
 * sameStory test (with publish dates), directly or through another report in
 * the group. Tokens are computed once per item, not once per comparison.
 */
export function groupStories<T extends { title: string; publishedAt?: string | null }>(
  items: T[],
  threshold = 0.5,
): T[][] {
  const keys = items.map((item) => headlineKey(item.title));
  const tokens = items.map((item) => titleTokens(item.title));
  const names = items.map((item) => nameTokens(item.title));
  const times = items.map((item) => timeOf(item.publishedAt));
  const taken = new Array<boolean>(items.length).fill(false);
  const groups: T[][] = [];

  const same = (i: number, j: number) =>
    keys[i] === keys[j] ||
    (sharesName(names[i]!, names[j]!) &&
      (jaccard(tokens[i]!, tokens[j]!) >= threshold ||
        reworded(tokens[i]!, tokens[j]!, times[i]!, times[j]!)));

  for (let i = 0; i < items.length; i += 1) {
    if (taken[i]) continue;
    taken[i] = true;
    // A report joins when it matches ANY report already in the group, not only
    // the first: a big story is told many ways, and comparing with the first
    // headline alone left Meta's Muse Wonder launch as five separate stories.
    const members = [i];
    for (let k = 0; k < members.length; k += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        if (!taken[j] && same(members[k]!, j)) {
          taken[j] = true;
          members.push(j);
        }
      }
    }
    groups.push(members.map((index) => items[index]!));
  }
  return groups;
}

/** Distinct outlets behind a group of reports: one outlet running a story twice is one. */
export function outletCount(items: Array<{ publisher: string | null }>): number {
  return Math.max(1, new Set(items.map((item) => (item.publisher ?? "").toLowerCase())).size);
}

/**
 * Groups reports of the same story and counts the outlets behind each.
 *
 * Returns one lead item per story (the most recent report), carrying the
 * number of distinct outlets as `coverage`.
 */
export function clusterStories<
  T extends { title: string; publisher: string | null; publishedAt: string | null },
>(items: T[], threshold = 0.5): Array<T & { coverage: number }> {
  const time = (item: T) => (item.publishedAt ? new Date(item.publishedAt).getTime() : 0);
  return groupStories(items, threshold).map((members) => {
    const lead = members.reduce((best, item) => (time(item) > time(best) ? item : best));
    return { ...lead, coverage: outletCount(members) };
  });
}

/** Age in whole days, or null when the outlet gave no date. */
export function ageDays(publishedAt: string | null, now = Date.now()): number | null {
  if (!publishedAt) return null;
  const t = new Date(publishedAt).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

/**
 * Inbox order: trending stories first, then the freshest.
 *
 * Coverage leads because it is the one signal here that is about the world
 * rather than about our query — a story three outlets ran is news; a story one
 * outlet ran might just be what our search happened to match.
 */
export function rankSources<T extends { coverage: number; publishedAt: string | null }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const trendA = a.coverage >= TRENDING_COVERAGE ? 1 : 0;
    const trendB = b.coverage >= TRENDING_COVERAGE ? 1 : 0;
    if (trendA !== trendB) return trendB - trendA;
    const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return tb - ta;
  });
}
