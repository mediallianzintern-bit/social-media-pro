// Finding reels in this creator's lanes, from accounts nobody is tracking.
//
// One search per refresh, deliberately: each is an Apify actor run, and this
// account's plan is the scarce thing. What makes one run a week useful rather
// than the same twenty posts over and over is the QUERY ROTATION below — and
// the fact that the table never clears, so every run adds to a growing pool.
//
// Why the pool matters. On a free Apify plan the search returns only about
// three complete rows (the rest arrive with a four-character caption, which
// cannot be matched to a lane). Three reels is thin — but three a run, kept,
// is a shelf that fills. The team crossing reels it does not want then hides
// those reels, it does not empty the shelf.
import { buildLaneVocabulary, laneFit, LANE_FIT_THRESHOLD } from "@/lib/lane-fit";
import { offVoiceReason } from "@/lib/instagram-trends";
import { buildPreferenceModel, preferenceFor, pullQueries } from "@/lib/preferences";
import {
  ageDaysOf,
  discoveredScore,
  DISCOVERED_WINDOW_DAYS,
  type DiscoveredReel,
  type DiscoveredResult,
  type DiscoveredRow,
} from "@/lib/discovered";
import type { PlatformId } from "@/lib/analytics-types";

import { OWNER_ACCOUNTS } from "./apify/accounts";
import { apifyToken } from "./apify/client";
import { searchInstagramPosts } from "./apify/search";
import {
  readCalendarEntries,
  readDiscoveredReels,
  readTaxonomy,
  readTopicVotes,
  saveDiscoveredReels,
} from "./store";

/**
 * Instagram search terms per lane, hand-written and literal.
 *
 * NOT the news queries in sources/queries.ts: those carry Google operators
 * (`intitle:`, quoted phrases) that Instagram's search box treats as text and
 * returns nothing for. Instagram's search is literal and shallow, so these are
 * two to four plain words, the same shape the niche classifier is told to
 * produce. Several per lane, because rotating between them is what makes the
 * next run return something new.
 */
const IG_LANE_QUERIES: Record<string, string[]> = {
  "marketing stunts": ["marketing stunt", "viral ad campaign", "brand campaign breakdown"],
  "brand strategy lessons": ["brand strategy", "brand positioning", "rebrand explained"],
  "ai tool workflows": ["ai marketing tools", "ai tool workflow", "chatgpt for marketing"],
  "frontier ai developments": ["new ai model", "ai news this week", "openai announcement"],
};

const laneKey = (lane: string) => lane.trim().toLowerCase();

function queriesFor(lane: string): string[] {
  const tested = IG_LANE_QUERIES[laneKey(lane)];
  if (tested?.length) return tested;
  // A lane nobody wrote queries for still gets searched, on its own name
  // minus the words that describe a post format rather than a subject.
  const derived = lane
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => !["lessons", "lesson", "developments", "workflows", "stunts"].includes(word))
    .join(" ")
    .trim();
  return derived ? [derived] : [];
}

/**
 * The next search to run: the one least recently used.
 *
 * Every stored reel remembers the query that found it, so "least recently
 * used" needs no extra table. A query never run before sorts first, which is
 * what spreads the early runs across every lane instead of deepening one.
 *
 * Queries the team's own ticks have earned come first of all — see
 * pullQueries, which turns repeatedly liked subjects into a search phrase.
 * That is the loop the team asked for: ticking does not only reorder what is
 * on screen, it decides what gets looked for next.
 */
export async function nextQuery(
  platform: PlatformId,
): Promise<{ lane: string | null; query: string } | null> {
  const owner = OWNER_ACCOUNTS[platform].handle;
  const [taxonomy, stored, votes] = await Promise.all([
    readTaxonomy(platform, owner).catch(() => null),
    readDiscoveredReels(platform).catch(() => []),
    readTopicVotes(platform).catch(() => []),
  ]);

  const lastUsed = new Map<string, number>();
  for (const reel of stored) {
    if (!reel.query) continue;
    const at = Date.parse(reel.foundAt);
    const seen = lastUsed.get(reel.query) ?? 0;
    if (Number.isFinite(at) && at > seen) lastUsed.set(reel.query, at);
  }

  // What the team keeps ticking, first — but never a phrase already searched
  // recently, or the loop would run the same pull query every time.
  for (const pull of pullQueries(votes)) {
    if (!lastUsed.has(pull.query)) return { lane: pull.lane, query: pull.query };
  }

  const lanes = (taxonomy ?? []).map((lane) => lane.name);
  const candidates: Array<{ lane: string; query: string; used: number }> = [];
  for (const lane of lanes) {
    for (const query of queriesFor(lane)) {
      candidates.push({ lane, query, used: lastUsed.get(query) ?? 0 });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.used - b.used);
  const pick = candidates[0]!;
  return { lane: pick.lane, query: pick.query };
}

/**
 * Runs ONE search and stores the reels that match a lane.
 *
 * Costs one Apify actor run. Everything else here is free: the lane match is
 * the same TypeScript the account's own posts go through, and the publish date
 * is read out of the post id rather than fetched.
 */
export async function refreshDiscoveredReels(platform: PlatformId): Promise<{
  ran: boolean;
  query?: string;
  lane?: string | null;
  found?: number;
  stored?: number;
  offLane?: number;
  hiddenByPlan?: number;
  reason?: string;
}> {
  if (platform !== "instagram") {
    return { ran: false, reason: "Searching for reels is Instagram only for now." };
  }
  if (!apifyToken()) return { ran: false, reason: "APIFY_TOKEN is not set." };

  const next = await nextQuery(platform);
  if (!next) {
    return { ran: false, reason: "Derive this account's content lanes first, then search." };
  }

  const owner = OWNER_ACCOUNTS[platform].handle;
  const [calendar, taxonomy] = await Promise.all([
    readCalendarEntries(platform).catch(() => []),
    readTaxonomy(platform, owner).catch(() => null),
  ]);
  // The same vocabulary the trend catcher uses, built from what this account
  // has actually planned and published.
  const vocabulary = calendar.length >= 20 ? buildLaneVocabulary(calendar) : null;
  if (!vocabulary) {
    return {
      ran: false,
      reason:
        "The lane vocabulary needs at least 20 calendar entries before a search can be filtered by lane.",
    };
  }
  const known = new Set((taxonomy ?? []).map((lane) => laneKey(lane.name)));

  let result;
  try {
    result = await searchInstagramPosts(next.query);
  } catch (error) {
    return {
      ran: false,
      query: next.query,
      reason: error instanceof Error ? error.message : "The search failed.",
    };
  }

  const keep: DiscoveredReel[] = [];
  let offLane = 0;
  for (const post of result.posts) {
    if (offVoiceReason(post.caption)) {
      offLane += 1;
      continue;
    }
    const fit = laneFit(post.caption, vocabulary, LANE_FIT_THRESHOLD);
    // The hard gate. A reel from an account nobody vetted earns its place
    // only by being about what this creator is about.
    if (!fit.lane || (known.size && !known.has(laneKey(fit.lane)))) {
      offLane += 1;
      continue;
    }
    const age = ageDaysOf(post.publishedAt);
    if (age != null && age > DISCOVERED_WINDOW_DAYS) {
      offLane += 1;
      continue;
    }
    keep.push({
      postId: post.postId,
      url: post.url,
      creatorHandle: post.creatorHandle,
      caption: post.caption,
      views: post.views,
      likes: post.likes,
      comments: post.comments,
      publishedAt: post.publishedAt,
      lane: fit.lane,
      laneFit: Number(fit.score.toFixed(3)),
      matchedWords: fit.matched.slice(0, 6),
      query: next.query,
      foundAt: new Date().toISOString(),
    });
  }

  const stored = await saveDiscoveredReels(platform, keep).catch((error: unknown) => {
    console.error(`[discovered:${platform}] could not store:`, error);
    return 0;
  });

  return {
    ran: true,
    query: next.query,
    lane: next.lane,
    found: result.posts.length,
    stored,
    offLane,
    hiddenByPlan: result.hiddenByPlan,
  };
}

/**
 * The stored reels, ranked, with the team's votes applied. Free: reads only.
 *
 * A crossed reel is hidden rather than deleted, exactly as a crossed news
 * story is, so a cross can be taken back. Nothing here re-searches: running
 * out of reels is answered by the explicit search button, never by a page
 * load that quietly spends.
 */
export async function discoveredReels(platform: PlatformId): Promise<DiscoveredResult> {
  const [stored, votes] = await Promise.all([
    readDiscoveredReels(platform).catch(() => []),
    readTopicVotes(platform).catch(() => []),
  ]);
  const preferences = buildPreferenceModel(votes);
  const now = Date.now();

  const rows: DiscoveredRow[] = [];
  const hidden: DiscoveredRow[] = [];

  const scored = stored.map((reel) => {
    const ageDays = ageDaysOf(reel.publishedAt, now);
    const preference = preferenceFor(preferences, {
      kind: "trend",
      itemId: reel.postId,
      text: reel.caption,
      lane: reel.lane,
    });
    return {
      row: {
        ...reel,
        ageDays,
        voted: preference.voted,
        reason: preference.reason,
      } satisfies DiscoveredRow,
      suppressed: preference.suppressed,
      rank: discoveredScore(reel.views, ageDays) * preference.multiplier,
    };
  });

  for (const entry of scored.sort((a, b) => b.rank - a.rank)) {
    (entry.suppressed ? hidden : rows).push(entry.row);
  }

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.lane) counts.set(row.lane, (counts.get(row.lane) ?? 0) + 1);
  }

  return {
    rows,
    hidden,
    byLane: [...counts].map(([lane, shown]) => ({ lane, shown })).sort((a, b) => a.shown - b.shown),
    lastFoundAt: stored[0]?.foundAt ?? null,
    storable: true,
  };
}
