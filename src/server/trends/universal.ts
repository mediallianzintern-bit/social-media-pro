// Universal trends (6 Nov 2026): one fetch of what is new across everything
// Pritesh Sir talks about, for both platforms, before a lane or platform is
// chosen (lib/universal-trends.ts).
//
// Free: Google News searches only, a few at a time. Its OWN searches, not
// the lanes' (6 Nov 2026, the team's request): built around the companies and
// platforms whose news moves first (Meta, Google, Amazon, OpenAI, Anthropic,
// TikTok, YouTube, LinkedIn), so a story like Meta's Andromeda update is
// caught whatever the lanes search for. Ranked by urgency: fresh and widely
// carried first (lib/universal-trends.ts urgencyOf). Every search was tested
// on the live feed on 6 Nov 2026.
//
// Stored in trend_observations under its own niche, which the opt-in niche
// listener (listen.ts) never reads. No migration: the table already allows a
// row with no platform. "Add to Instagram / LinkedIn" copies a story into that
// platform's topics, in a lane, where it is written like any other story.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { PlatformId } from "@/lib/analytics-types";
import { clusterStories, type SourceDraft } from "@/lib/sources";
import { byUrgency, type AddedOn, type TrendItem, type TrendsView } from "@/lib/universal-trends";

import { OWNER_ACCOUNTS } from "../apify/accounts";
import { searchNews } from "../sources/news";
import { isNewsOffLane } from "../sources/queries";
import { readTaxonomy, saveSourceItems } from "../store";

/** The niche these rows are stored under, apart from the niche listener's. */
const NICHE = "universal-trends";

/** How far back a fetch searches: two weeks, so a big update is still here a week on. */
const SEARCH_DAYS = 14;

/**
 * Stories kept per category per fetch, the most urgent first. Enough to
 * reach back two weeks: Meta's Andromeda update (28 Oct) was the 110th most
 * urgent ad-platform story on 6 Nov, two single-outlet headlines, and was
 * cut at 25. The page filters by age and searches by word instead.
 */
const PER_CATEGORY = 100;

/** How long a stored trend stays on the page. */
const KEEP_DAYS = 14;

/**
 * Fetches older than this are deleted after a new one is stored: the page
 * shows each category's latest fetch, and one hourly fetch would otherwise
 * add hundreds of rows an hour.
 */
const KEEP_FETCH_HOURS = 3;

/** A second fetch within this many minutes returns the stored list instead. */
const FLOOR_MINUTES = 10;

/** Searches run at once: quick, and still gentle on a free public feed. */
const PARALLEL = 3;

/** Job moves and stock-market stories, which every company search also finds. */
const NOISE = " -appoints -appointed -joins -hires -promoted -stock -shares -investors";
/** Election campaigns, which "campaign" also finds. */
const NO_POLITICS = " -election -candidate -voters -Trump -senate -congress -political -polls";
/** A launch or an announcement, not a how-to or a review. */
const NEWS = " launches OR announces OR releases OR unveils OR introduces";

/**
 * Each category's searches, independent of any lane. Tested on the live feed
 * on 6 Nov 2026: the Meta searches found Andromeda; "campaign" alone found
 * election ads, hence NO_POLITICS; a bare "Gemini" or "Claude" found how-to
 * reviews, hence NEWS.
 */
const SEARCHES: Record<string, string[]> = {
  marketing: [
    "marketers study OR survey OR report marketing",
    '"brand recall" OR "ad recall" OR "brand building"',
    '"marketing funnel" OR "marketing attribution" OR "marketing measurement" OR "marketing mix"',
    '"retail media" brands advertising',
  ],
  "ad-platforms": [
    "intitle:Meta advertisers",
    "intitle:Meta ads AI",
    'intitle:"Google Ads" OR intitle:"Performance Max"',
    'intitle:"Amazon Ads" OR intitle:"Amazon DSP"',
    "intitle:TikTok advertisers OR brands",
    "intitle:YouTube advertisers OR ads",
    "intitle:LinkedIn ads OR advertisers",
    '"Microsoft Advertising" OR intitle:Pinterest advertisers',
  ],
  brands: [
    `intitle:rebrand brand${NO_POLITICS}`,
    '"brand strategy" OR repositioning brand',
    '"new logo" OR "brand identity" brand',
  ],
  campaigns: [
    `intitle:campaign brand${NO_POLITICS}`,
    `"new campaign" brand ad${NO_POLITICS}`,
    '"holiday campaign" OR "Christmas ad" OR "festive campaign" brand',
  ],
  stunts: ['"marketing stunt"', "brand stunt viral marketing", "intitle:stunt brand"],
  ai: [
    `intitle:OpenAI${NEWS}`,
    `intitle:Anthropic OR intitle:Claude${NEWS}`,
    `intitle:Gemini OR intitle:DeepMind${NEWS}`,
    `intitle:"Meta AI" OR intitle:Llama${NEWS}`,
    `intitle:xAI OR intitle:Grok OR intitle:DeepSeek OR intitle:Mistral${NEWS}`,
    "intitle:AI model launch",
  ],
  "frontier-ai": [
    '"frontier AI"',
    '"AI safety" OR AGI OR superintelligence lab',
    '"AI agents" security risk',
  ],
  "ai-marketing": [
    '"AI advertising" OR "AI ads" brands',
    '"ChatGPT ads" OR "ads in ChatGPT"',
    '"AI search" OR "AI Overviews" brands visibility',
    '"agentic commerce" OR "AI shopping" retailers',
  ],
  "ai-companies": [
    'company "uses AI" customers',
    'brand "using AI" to',
    '"AI-powered" startup raises customers',
    '"Neko Health"',
  ],
};

/**
 * Headlines a category's story must match. "Marketing stunt" also finds
 * stunt drivers, a golfer and a car's world record (6 Nov 2026), so a stunt
 * is kept only when its headline is about a brand or its marketing.
 */
const MUST: Record<string, RegExp> = {
  // "Attribution" also found a court ruling and climate science (6 Nov 2026).
  marketing:
    /\b(marketing|marketer\w*|brand\w*|advertis\w*|ads?|media|consumer\w*|shopper\w*|campaign\w*|cmo\w*|retail\w*|customer\w*|funnel|sponsor\w*)\b/i,
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
      .limit(5000) as Promise<{ data: Row[] | null; error: { message: string } | null }>,
    lanesOf("instagram"),
    lanesOf("linkedin"),
  ]);
  if (result.error) throw new Error(`Could not read trends: ${result.error.message}`);
  // Each category's latest fetch only, so the list is what is new now; a
  // category whose searches failed keeps its previous fetch.
  const all = (result.data ?? []).map(itemOf).filter((item): item is TrendItem => Boolean(item));
  const latestOf = new Map<string, string>();
  for (const item of all) {
    if ((latestOf.get(item.category) ?? "") < item.fetchedAt) {
      latestOf.set(item.category, item.fetchedAt);
    }
  }
  const seen = new Set<string>();
  const items: TrendItem[] = [];
  for (const item of all) {
    if (item.fetchedAt !== latestOf.get(item.category) || seen.has(item.url)) continue;
    seen.add(item.url);
    items.push(item);
  }
  const latest = items[0]?.fetchedAt ?? null;
  const { pinned, rest } = await pinAdded(items);
  return {
    items: byUrgency(rest),
    pinned,
    lastFetched: latest,
    lanes: { instagram, linkedin },
  };
}

/** Stories added from Trends shown above the list at most. */
const PINNED_MAX = 20;

type AddedRow = {
  id: string;
  platform: PlatformId;
  url: string;
  title: string;
  publisher: string | null;
  publisher_url: string | null;
  published_at: string | null;
  query: string | null;
  lane: string | null;
  coverage: number | null;
  fetched_at: string;
};

/** One story, however its headline was cased or punctuated. */
const storyKey = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The category a story was added from, kept in its topic's query ("trends: ai | …"). */
const categoryOf = (query: string | null) =>
  /^trends:\s*([^|]+?)\s*(\||$)/.exec(query ?? "")?.[1] ?? "ai";

/**
 * Splits the latest fetch into the stories already added from Trends (pinned,
 * with where they went and what was written) and the rest. An added story the
 * latest fetch no longer carries is pinned from its stored topic. Never fatal:
 * without it the page is the plain list.
 */
async function pinAdded(items: TrendItem[]): Promise<{ pinned: TrendItem[]; rest: TrendItem[] }> {
  try {
    const since = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
    const { data, error } = (await from("source_items")
      .select(
        "id,platform,url,title,publisher,publisher_url,published_at,query,lane,coverage,fetched_at",
      )
      .like("query", "trends:%")
      .gte("fetched_at", since)
      .order("fetched_at", { ascending: false })
      .limit(200)) as { data: AddedRow[] | null; error: { message: string } | null };
    if (error || !data?.length) return { pinned: [], rest: items };

    // The newest post or script written from each added story.
    const ideas = (await from("suggested_ideas")
      .select("id,payload->source->>sourceId")
      .in(
        "payload->source->>sourceId",
        data.map((row) => row.id),
      )
      .order("created_at", { ascending: false })) as {
      data: Array<{ id: string; sourceId: string }> | null;
    };
    const ideaOf = new Map<string, string>();
    for (const idea of ideas.data ?? []) {
      if (!ideaOf.has(idea.sourceId)) ideaOf.set(idea.sourceId, idea.id);
    }

    // One entry per story, across both platforms, newest added first.
    const stories = new Map<string, AddedRow[]>();
    for (const row of data) {
      const key = storyKey(row.title);
      stories.set(key, [...(stories.get(key) ?? []), row]);
    }

    const claimed = new Set<string>();
    const pinned: TrendItem[] = [];
    for (const rows of [...stories.values()].slice(0, PINNED_MAX)) {
      const first = rows[0]!;
      const urls = new Set(rows.map((row) => row.url));
      const key = storyKey(first.title);
      const current = items.find(
        (item) => !claimed.has(item.id) && (urls.has(item.url) || storyKey(item.title) === key),
      );
      const added: Partial<Record<PlatformId, AddedOn>> = {};
      for (const row of rows) {
        added[row.platform] ??= {
          lane: row.lane,
          sourceId: row.id,
          ideaId: ideaOf.get(row.id) ?? null,
        };
      }
      if (current) {
        claimed.add(current.id);
        pinned.push({ ...current, added });
      } else {
        pinned.push({
          id: first.id,
          category: categoryOf(first.query),
          title: first.title,
          url: first.url,
          publisher: first.publisher,
          publisherUrl: first.publisher_url,
          publishedAt: first.published_at,
          coverage: Number(first.coverage ?? 1),
          fetchedAt: first.fetched_at,
          added,
          kept: true,
        });
      }
    }
    return { pinned, rest: items.filter((item) => !claimed.has(item.id)) };
  } catch (error) {
    console.error("[trends] stories added from Trends not pinned:", error);
    return { pinned: [], rest: items };
  }
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
  // Every search, a few at a time, then grouped back into their categories.
  const plan = Object.entries(SEARCHES).flatMap(([category, queries]) =>
    queries.map((query) => ({ category, query })),
  );
  const results = new Map<string, SourceDraft[]>();
  for (let start = 0; start < plan.length; start += PARALLEL) {
    await Promise.all(
      plan.slice(start, start + PARALLEL).map(async ({ category, query }) => {
        try {
          const found = await searchNews(`${query}${NOISE}`, null, { days: SEARCH_DAYS });
          results.set(category, [...(results.get(category) ?? []), ...found]);
        } catch (error) {
          failures.push(`${query}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }),
    );
  }
  for (const category of Object.keys(SEARCHES)) {
    const found = results.get(category) ?? [];
    const must = MUST[category];
    const stories = byUrgency(
      clusterStories(
        found.filter(
          (story) => isStory(story.title, story.publisher) && (!must || must.test(story.title)),
        ),
        0.5,
        // The headline most of the group is about, not the newest report.
        { lead: "central" },
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
  // Keep the table small: the page reads each category's latest fetch.
  const cutoff = new Date(Date.now() - KEEP_FETCH_HOURS * 3_600_000).toISOString();
  await table().delete().eq("niche", NICHE).lt("observed_at", cutoff);
  return { ran: true, stored: rows.length, failures };
}

/**
 * Copies one trend into a platform's topics, in a lane, and returns its id
 * there, so it can be written like any other story. Adding the same story
 * again moves it to the lane chosen last.
 */
export async function addTrendToPlatform(
  ref: { trendId: string } | { sourceId: string },
  platform: PlatformId,
  laneName: string,
): Promise<{ sourceId: string }> {
  const found = "trendId" in ref ? await trendById(ref.trendId) : await keptById(ref.sourceId);
  if (!found) throw new Error("That trend is no longer stored. Fetch trends again.");
  const { item, query } = found;
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
      query,
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

/** A trend in the stored fetches, and the query its topic is filed under. */
async function trendById(trendId: string): Promise<{ item: TrendItem; query: string } | null> {
  const { data, error } = (await table()
    .select("id,observed_at,label,strength,from_query,evidence")
    .eq("niche", NICHE)
    .eq("id", trendId)
    .maybeSingle()) as { data: Row | null; error: { message: string } | null };
  if (error) throw new Error(`Could not read that trend: ${error.message}`);
  const item = data ? itemOf(data) : null;
  return item ? { item, query: `trends: ${data!.from_query ?? item.category}` } : null;
}

/** A story added from Trends earlier, read back from the topic it was copied to. */
async function keptById(sourceId: string): Promise<{ item: TrendItem; query: string } | null> {
  const { data, error } = (await from("source_items")
    .select(
      "id,platform,url,title,publisher,publisher_url,published_at,query,lane,coverage,fetched_at",
    )
    .eq("id", sourceId)
    .like("query", "trends:%")
    .maybeSingle()) as { data: AddedRow | null; error: { message: string } | null };
  if (error) throw new Error(`Could not read that story: ${error.message}`);
  if (!data) return null;
  return {
    item: {
      id: data.id,
      category: categoryOf(data.query),
      title: data.title,
      url: data.url,
      publisher: data.publisher,
      publisherUrl: data.publisher_url,
      publishedAt: data.published_at,
      coverage: Number(data.coverage ?? 1),
      fetchedAt: data.fetched_at,
    },
    query: data.query ?? "trends: ai",
  };
}
