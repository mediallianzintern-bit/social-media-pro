// Universal trends (6 Nov 2026): one fetch of what is new across everything
// Pritesh Sir talks about, for both platforms, before a lane or platform is
// chosen (lib/universal-trends.ts).
//
// Free: Google News searches only, run one at a time as the topic refresh
// does. Most searches are the ones each lane already runs, tested on the live
// feed (sources/queries.ts); the companies-using-AI searches were tested on
// 6 Nov 2026 and returned Neko Health, Stitch Fix's AI-built brands and
// Heineken's AI decisions.
//
// Stored in trend_observations under its own niche, which the opt-in niche
// listener (listen.ts) never reads. No migration: the table already allows a
// row with no platform. "Add to Instagram / LinkedIn" copies a story into that
// platform's topics, in a lane, where it is written like any other story.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { PlatformId } from "@/lib/analytics-types";
import { clusterStories, rankSources, type SourceDraft } from "@/lib/sources";
import type { TrendItem, TrendsView } from "@/lib/universal-trends";

import { OWNER_ACCOUNTS } from "../apify/accounts";
import { searchNews } from "../sources/news";
import { isNewsOffLane, LANE_QUERIES } from "../sources/queries";
import { readTaxonomy, saveSourceItems } from "../store";

/** The niche these rows are stored under, apart from the niche listener's. */
const NICHE = "universal-trends";

/** How far back a fetch searches. */
const SEARCH_DAYS = 7;

/** Stories kept per category per fetch. */
const PER_CATEGORY = 12;

/** How long a stored trend stays on the page. */
const KEEP_DAYS = 14;

/** A second fetch within this many minutes returns the stored list instead. */
const FLOOR_MINUTES = 10;

const NO_JOB_MOVES = " -appoints -appointed -joins -hires -promoted";
const lane = (name: string) => LANE_QUERIES[name] ?? [];

/**
 * Each category's searches. Tested on the live feed on 6 Nov 2026: the
 * Kantar OR Nielsen search is left out here (it brought Nielsen's college
 * basketball rankings to the top), and the brand searches skip job moves.
 */
const SEARCHES: Record<string, string[]> = {
  marketing: [0, 2, 3, 4].map((index) => lane("marketing fundamentals")[index]!).filter(Boolean),
  "ad-platforms": lane("marketing fundamentals").slice(7),
  brands: lane("brand strategy lessons").map((query) => `${query}${NO_JOB_MOVES}`),
  campaigns: [`"brand marketing" campaign${NO_JOB_MOVES}`, "intitle:campaign brand ad"],
  stunts: ['"marketing stunt"', "brand stunt viral marketing", "intitle:stunt brand"],
  ai: lane("ai launches explained"),
  "frontier-ai": ['"frontier AI"', '"AI safety" OpenAI', '"AI agents" security risk'],
  "ai-marketing": lane("ai x marketing bridge"),
  "ai-companies": [
    `company "uses AI" customers${NO_JOB_MOVES}`,
    `brand "using AI" to${NO_JOB_MOVES}`,
    '"Neko Health"',
  ],
};

/**
 * Headlines a category's story must match. "Marketing stunt" also finds
 * stunt drivers, a golfer and a car's world record (6 Nov 2026), so a stunt
 * is kept only when its headline is about a brand or its marketing.
 */
const MUST: Record<string, RegExp> = {
  stunts: /\b(brand|brands|campaign\w*|marketing|advertis\w*|ads?|viral)\b/i,
};

/** A row whose headline is only its outlet's name ("Marketing Brew"), or too short to be a story. */
function isStory(title: string, publisher: string | null): boolean {
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length < 4) return false;
  return !publisher || title.trim().toLowerCase() !== publisher.trim().toLowerCase();
}

type Row = {
  id: string;
  observed_at: string;
  label: string;
  strength: number | null;
  from_query: string | null;
  evidence: unknown;
};

type Evidence = {
  category: string;
  url: string;
  publisher: string | null;
  publisherUrl: string | null;
  publishedAt: string | null;
};

// The generated Supabase types do not know this table's columns well enough
// for these queries; the same cast the decoded_links store uses.
const from = (name: string) =>
  (supabaseAdmin as unknown as { from: (name: string) => any }).from(name); // eslint-disable-line @typescript-eslint/no-explicit-any
const table = () => from("trend_observations");

function itemOf(row: Row): TrendItem | null {
  const evidence = (Array.isArray(row.evidence) ? row.evidence[0] : null) as Evidence | null;
  if (!evidence?.url) return null;
  return {
    id: row.id,
    category: evidence.category,
    title: row.label,
    url: evidence.url,
    publisher: evidence.publisher,
    publisherUrl: evidence.publisherUrl,
    publishedAt: evidence.publishedAt,
    coverage: Number(row.strength ?? 1),
    fetchedAt: row.observed_at,
  };
}

/** A platform's lanes a news story can go in, from its stored taxonomy. Empty before lanes exist. */
async function lanesOf(platform: PlatformId): Promise<string[]> {
  const taxonomy = await readTaxonomy(platform, OWNER_ACCOUNTS[platform].handle).catch(() => null);
  // A lane fed by creator reels or his own experience takes no news story.
  return (taxonomy ?? []).map((entry) => entry.name).filter((name) => !isNewsOffLane(name));
}

/** The stored trends, newest fetch first, one row per story. */
export async function readUniversalTrends(): Promise<TrendsView> {
  const since = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
  const [result, instagram, linkedin] = await Promise.all([
    table()
      .select("id,observed_at,label,strength,from_query,evidence")
      .eq("niche", NICHE)
      .gte("observed_at", since)
      .order("observed_at", { ascending: false })
      .limit(2000) as Promise<{ data: Row[] | null; error: { message: string } | null }>,
    lanesOf("instagram"),
    lanesOf("linkedin"),
  ]);
  if (result.error) throw new Error(`Could not read trends: ${result.error.message}`);
  const seen = new Set<string>();
  const items: TrendItem[] = [];
  for (const row of result.data ?? []) {
    const item = itemOf(row);
    if (!item || seen.has(item.url)) continue;
    seen.add(item.url);
    items.push(item);
  }
  // Trending first within the latest fetch, then by date.
  const latest = items[0]?.fetchedAt ?? null;
  return {
    items: rankSources(items),
    lastFetched: latest,
    lanes: { instagram, linkedin },
  };
}

/**
 * Fetches every category's searches now and stores the top stories. Free.
 * Within FLOOR_MINUTES of the last fetch it does nothing, so a double click
 * does not search everything twice.
 */
export async function fetchUniversalTrends(): Promise<{
  ran: boolean;
  stored: number;
  failures: string[];
  reason?: string;
}> {
  const last = (await table()
    .select("observed_at")
    .eq("niche", NICHE)
    .order("observed_at", { ascending: false })
    .limit(1)) as { data: Array<{ observed_at: string }> | null };
  const lastAt = last.data?.[0]?.observed_at;
  if (lastAt && Date.now() - new Date(lastAt).getTime() < FLOOR_MINUTES * 60_000) {
    return { ran: false, stored: 0, failures: [], reason: "Fetched in the last few minutes." };
  }

  const failures: string[] = [];
  const seen = new Set<string>();
  const now = new Date().toISOString();
  const rows: Array<Record<string, unknown>> = [];
  for (const [category, queries] of Object.entries(SEARCHES)) {
    const found: SourceDraft[] = [];
    for (const query of queries) {
      try {
        found.push(...(await searchNews(query, null, { days: SEARCH_DAYS })));
      } catch (error) {
        failures.push(`${query}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    // Clustered within the category, so one story carried by four outlets is
    // one row marked trending; the same story in two categories stays in the
    // first.
    const must = MUST[category];
    const stories = rankSources(
      clusterStories(
        found.filter(
          (story) => isStory(story.title, story.publisher) && (!must || must.test(story.title)),
        ),
      ),
    ).slice(0, PER_CATEGORY);
    for (const story of stories) {
      if (seen.has(story.url)) continue;
      seen.add(story.url);
      const evidence: Evidence = {
        category,
        url: story.url,
        publisher: story.publisher,
        publisherUrl: story.publisherUrl,
        publishedAt: story.publishedAt,
      };
      rows.push({
        niche: NICHE,
        platform: null,
        kind: "topic",
        observed_at: now,
        label: story.title,
        strength: story.coverage,
        from_query: `${category} | ${story.query}`,
        evidence: [evidence],
      });
    }
  }

  if (rows.length) {
    const { error } = (await table().insert(rows)) as { error: { message: string } | null };
    if (error) throw new Error(`Could not store trends: ${error.message}`);
  }
  // Keep the table small: rows past the page's window are of no further use.
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
  await table().delete().eq("niche", NICHE).lt("observed_at", cutoff);
  return { ran: true, stored: rows.length, failures };
}

/**
 * Copies one trend into a platform's topics, in a lane, and returns its id
 * there, so it can be written like any other story. Adding the same story
 * again moves it to the lane chosen last.
 */
export async function addTrendToPlatform(
  trendId: string,
  platform: PlatformId,
  laneName: string,
): Promise<{ sourceId: string }> {
  const { data, error } = (await table()
    .select("id,observed_at,label,strength,from_query,evidence")
    .eq("niche", NICHE)
    .eq("id", trendId)
    .maybeSingle()) as { data: Row | null; error: { message: string } | null };
  if (error) throw new Error(`Could not read that trend: ${error.message}`);
  const item = data ? itemOf(data) : null;
  if (!item) throw new Error("That trend is no longer stored. Fetch trends again.");
  const lanes = await lanesOf(platform);
  if (!lanes.includes(laneName))
    throw new Error(`"${laneName}" is not one of this platform's lanes.`);

  await saveSourceItems(platform, [
    {
      url: item.url,
      title: item.title,
      publisher: item.publisher,
      publisherUrl: item.publisherUrl,
      publishedAt: item.publishedAt,
      query: `trends: ${data!.from_query ?? item.category}`,
      lane: laneName,
      kind: "article",
      coverage: item.coverage,
    },
  ]);
  const saved = (await from("source_items")
    .select("id")
    .eq("platform", platform)
    .eq("url", item.url)
    .maybeSingle()) as { data: { id: string } | null };
  if (!saved.data?.id) throw new Error("The story could not be added. Try again.");
  return { sourceId: saved.data.id };
}
