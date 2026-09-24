// Real external data for the two agents that are forbidden to invent.
//
// The Trend scout and the Audience-question agent must never name a trend or a
// question from memory, so neither is ever asked to. This module fetches real
// items from a live source; the agent's only job is to select from what came
// back. If nothing comes back, the agent does not run — it is not given the
// chance to fill the silence.
//
// Both feeds are OPT-IN, by env var. Unset means the feed is off and its agent
// is skipped entirely. That is deliberate: each call spends Apify credit, and a
// feed that quietly bills on every regeneration is worse than one you had to
// switch on.
import { datasetItems, runActor } from "../apify/client";

/** Actor that returns rising/related search terms. Unset disables the agent. */
export function trendFeedActor(): string | undefined {
  return process.env["TREND_FEED_ACTOR"]?.trim() || undefined;
}

/**
 * Whether the per-analysis trend scout may scrape.
 *
 * Separate from trendFeedActor() on purpose, and OFF unless explicitly enabled.
 * The scheduled listener is careful — a 20-hour floor, an explicit trigger,
 * nothing automatic. The per-analysis scout has none of that: it fires on every
 * regeneration. Sharing one env var meant configuring the listener silently
 * attached a scrape to every AI run, which cost $0.37 before it was noticed.
 *
 * Set TREND_FEED_IN_ANALYSIS=true only if you want every generation to pay for
 * fresh trend data. The listener does not need it.
 */
export function trendFeedInAnalysis(): boolean {
  return /^(1|true|yes)$/i.test(process.env["TREND_FEED_IN_ANALYSIS"]?.trim() ?? "");
}

/** Actor that returns real questions people ask. Unset disables the agent. */
export function questionFeedActor(): string | undefined {
  return process.env["QUESTION_FEED_ACTOR"]?.trim() || undefined;
}

/** Two-letter country for both feeds. Empty means worldwide. */
function feedGeo(): string {
  return process.env["FEED_GEO"]?.trim().toUpperCase() || "";
}

export interface FeedItem {
  /** The verbatim string the source returned. */
  term: string;
  /** Which query produced it, so a pick can be traced back. */
  fromQuery: string;
  /**
   * C.4 — the real items that establish this term, where the actor returns
   * them. The addendum asks each surfaced trend to link to its evidence so the
   * team can judge it rather than trust the label.
   *
   * Empty when the actor returns no links, which is a fact about that actor
   * rather than a failure: the UI shows the trend without evidence instead of
   * pretending there is some.
   */
  evidence: string[];
}

/**
 * Cached in process for six hours.
 *
 * Trends and common questions move over days, not minutes, while a person
 * clicking Regenerate three times in a row would otherwise pay for three
 * identical scrapes. Deliberately not a database table: losing this cache on
 * restart costs one extra fetch, which is not worth a migration.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; items: FeedItem[] }>();

function cached(key: string): FeedItem[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.items;
}

/**
 * Pulls strings out of whatever shape the actor returned.
 *
 * Written tolerantly on purpose: these are third-party actors whose output
 * shape is not contractual and has no published schema. The important part is
 * the logging below — a feed that silently yields nothing looks identical to a
 * niche with no trends, so when items come back but nothing is extracted, the
 * actual keys are logged rather than swallowed.
 */
/** Keys an actor might carry a link under. Checked case-insensitively. */
const URL_KEYS = ["url", "link", "href", "permalink", "postUrl", "sourceUrl"];

/** Any http(s) URLs on this object, one level deep. Evidence, where it exists. */
function urlsOn(node: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (typeof value !== "string") continue;
    const isUrlKey = URL_KEYS.some((k) => k.toLowerCase() === key.toLowerCase());
    if (isUrlKey && /^https?:\/\//i.test(value)) out.push(value);
  }
  return out;
}

function harvest(items: unknown[], keys: string[], fromQuery: string): FeedItem[] {
  const found: FeedItem[] = [];
  const seen = new Set<string>();

  const walk = (node: unknown, depth: number) => {
    if (depth > 6 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const entry of node) walk(entry, depth + 1);
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (keys.includes(key) && typeof value === "string") {
        const term = value.trim();
        // Single words are almost always noise from a title field; a real
        // trend or question is a phrase.
        if (term.length > 3 && term.includes(" ") && !seen.has(term.toLowerCase())) {
          seen.add(term.toLowerCase());
          // Evidence comes from the same object the term was found on, so a
          // link always belongs to the trend it is shown under.
          found.push({ term, fromQuery, evidence: urlsOn(node as Record<string, unknown>) });
        }
      } else if (typeof value === "object") {
        walk(value, depth + 1);
      }
    }
  };

  walk(items, 0);
  return found;
}

async function runFeed(
  actor: string,
  input: Record<string, unknown>,
  keys: string[],
  queries: string[],
  label: string,
): Promise<FeedItem[]> {
  const key = `${actor}:${queries.join("|")}`;
  const hit = cached(key);
  if (hit) return hit;

  const { datasetId } = await runActor(actor, input);
  const raw = await datasetItems<Record<string, unknown>>(datasetId, 200);

  const items = harvest(raw, keys, queries.join(", "));
  if (raw.length && !items.length) {
    // The actor returned data but none of the expected fields were in it —
    // almost certainly a shape change. Loud, because the alternative is an
    // agent that reports "no trends" forever and looks correct doing it.
    console.warn(
      `[feeds:${label}] ${raw.length} items returned but no usable strings found. ` +
        `Top-level keys seen: ${[...new Set(raw.flatMap((item) => Object.keys(item)))].join(", ")}`,
    );
  }

  cache.set(key, { at: Date.now(), items });
  return items;
}

/** Rising and related search terms for the niche. */
export async function fetchTrends(queries: string[]): Promise<FeedItem[]> {
  const actor = trendFeedActor();
  if (!actor || !queries.length) return [];

  const geo = feedGeo();
  return runFeed(
    actor,
    {
      searchTerms: queries,
      timeRange: "today 3-m",
      maxItems: 60,
      skipDebugScreen: true,
      ...(geo ? { geo } : {}),
    },
    // Google Trends exposes related queries and topics under these names.
    ["query", "topic", "title", "term", "value", "relatedQuery", "relatedTopic"],
    queries,
    "trends",
  );
}

/** Real questions people ask around the niche. */
export async function fetchAudienceQuestions(queries: string[]): Promise<FeedItem[]> {
  const actor = questionFeedActor();
  if (!actor || !queries.length) return [];

  const geo = feedGeo();
  return runFeed(
    actor,
    {
      // The two common input names across People-Also-Ask actors; passing both
      // means one actor can be swapped for another without a code change.
      queries,
      keywords: queries,
      maxQuestionsPerQuery: 10,
      includeRelatedSearches: true,
      ...(geo ? { country: geo, countryCode: geo, region: geo } : {}),
    },
    ["question", "title", "text", "relatedSearch", "query"],
    queries,
    "questions",
  );
}

/**
 * The search terms both feeds are seeded with.
 *
 * Derived from the account's own lanes rather than asked of a model. The lanes
 * were themselves derived from real captions and are already the distilled
 * answer to "what does this account talk about" — so seeding from them keeps
 * the feed anchored to measured data, and saves an LLM call per agent whose
 * only job would have been to guess at the same thing.
 */
export function feedQueries(niche: string, lanes: string[], limit = 4): string[] {
  const terms = [niche.trim(), ...lanes.map((lane) => lane.trim())]
    .filter((term) => term.length > 2 && term.toLowerCase() !== "other")
    .slice(0, limit);
  return [...new Set(terms)];
}
