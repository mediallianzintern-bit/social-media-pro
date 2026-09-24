// Competitor discovery searches.
//
// This is the grounding step: the model proposes search terms, and the platform
// returns accounts that demonstrably exist. The model is never asked to name a
// handle — it would invent plausible ones, and a table full of 404s is worse
// than an empty one.
import { datasetItems, runActor } from "./client";

export const IG_SEARCH_ACTOR = "memo23/instagram-search-scraper";
export const LI_SEARCH_ACTOR = "memo23/linkedin-people-search";

export interface Candidate {
  handle: string;
  fullName: string;
  matchedQuery: string;
  /**
   * Largest view count seen on a post this account produced for the query.
   *
   * Not a follower count — it is a reach signal used only to decide which
   * candidates are worth paying to enrich first. Keyword search alone surfaces
   * small keyword-named accounts; the accounts behind high-performing posts are
   * the ones actually worth benchmarking against.
   */
  observedReach: number;
}

interface IgSearchRow {
  query?: string;
  resultType?: string;
  username?: string;
  fullName?: string;
  isPrivate?: boolean;
  creatorUsername?: string;
  creatorFullName?: string;
  playCount?: number | null;
  likeCount?: number | null;
}

/**
 * Instagram candidates for one search term.
 *
 * `searchType: "top"` returns Instagram's own Top tab — matching accounts AND
 * the highest-ranked posts, whose creators are exactly the larger accounts that
 * a name-keyword search never reaches.
 *
 * One actor run per query, deliberately: the actor only processes the first
 * query in a batch, so passing several silently discards all but one.
 */
async function searchInstagramOnce(query: string, perQuery: number): Promise<IgSearchRow[]> {
  const { datasetId } = await runActor(IG_SEARCH_ACTOR, {
    queries: [query],
    searchType: "top",
    maxResultsPerQuery: perQuery,
    enrichProfiles: false,
  });
  return datasetItems<IgSearchRow>(datasetId, perQuery + 10);
}

export async function searchInstagram(
  queries: string[],
  exclude: string[] = [],
  perQuery = 25,
): Promise<Candidate[]> {
  const skip = new Set(exclude.map((handle) => handle.toLowerCase()));
  const found = new Map<string, Candidate>();

  // Sequential: Apify's free plan caps concurrent runs, and a parallel fan-out
  // trips that limit rather than going faster.
  for (const query of queries) {
    let rows: IgSearchRow[] = [];
    try {
      rows = await searchInstagramOnce(query, perQuery);
    } catch (error) {
      console.error(`[search:instagram] "${query}" failed:`, error);
      continue;
    }

    for (const row of rows) {
      const handle = (row.username ?? row.creatorUsername)?.trim();
      if (!handle || row.isPrivate) continue;
      const key = handle.toLowerCase();
      if (skip.has(key)) continue;

      const reach = row.playCount ?? row.likeCount ?? 0;
      const existing = found.get(key);
      if (existing) {
        // Keep the strongest signal seen for this account across all queries.
        existing.observedReach = Math.max(existing.observedReach, reach);
        continue;
      }
      found.set(key, {
        handle,
        fullName: row.fullName ?? row.creatorFullName ?? "",
        matchedQuery: row.query ?? query,
        observedReach: reach,
      });
    }
  }

  // Biggest observed performers first — enrichment budget is limited.
  return [...found.values()].sort((a, b) => b.observedReach - a.observedReach);
}

interface LiSearchRow {
  name?: string;
  profileUrl?: string;
  location?: string;
  currentCompany?: string;
}

/** The public identifier in a LinkedIn profile URL, e.g. in/<this>. */
function publicIdentifier(url: string): string | null {
  const match = /linkedin\.com\/in\/([^/?#]+)/i.exec(url);
  return match?.[1] ?? null;
}

export async function searchLinkedIn(
  queries: string[],
  exclude: string[] = [],
  perQuery = 12,
): Promise<Candidate[]> {
  const skip = new Set(exclude.map((handle) => handle.toLowerCase()));
  const found = new Map<string, Candidate>();

  for (const query of queries) {
    let rows: LiSearchRow[] = [];
    try {
      const { datasetId } = await runActor(LI_SEARCH_ACTOR, {
        keywords: query,
        maxResults: perQuery,
      });
      rows = await datasetItems<LiSearchRow>(datasetId, perQuery + 5);
    } catch (error) {
      console.error(`[search:linkedin] "${query}" failed:`, error);
      continue;
    }

    for (const row of rows) {
      const handle = row.profileUrl ? publicIdentifier(row.profileUrl) : null;
      if (!handle) continue;
      const key = handle.toLowerCase();
      if (skip.has(key) || found.has(key)) continue;

      // The search actor's `name` field concatenates the profile summary, so it
      // is trimmed to something usable as a display name.
      const name =
        (row.name ?? "")
          .split(/\s{2,}|·/)[0]
          ?.trim()
          .slice(0, 60) ?? "";
      found.set(key, { handle, fullName: name, matchedQuery: query, observedReach: 0 });
    }
  }

  return [...found.values()];
}
