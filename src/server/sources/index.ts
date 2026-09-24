// Fetches, stores and hands out the real articles topics are built on.
//
// Free to run: the news feed needs no key and costs nothing, so unlike every
// other external call in this system it can run on each sync. The only guard is
// a politeness floor, so a busy afternoon of syncs does not hammer the feed.
import { searchNews } from "./news";
import { queriesForLane } from "./queries";
import { OWNER_ACCOUNTS } from "../apify/accounts";
import {
  lastSourceFetch,
  readPosts,
  readSourceItems,
  readTaxonomy,
  readUsedSourceIds,
  saveSourceItems,
} from "../store";
import { lanePerformance, type PlatformId } from "@/lib/analytics-types";
import {
  clusterStories,
  rankSources,
  SOURCE_WINDOW_DAYS,
  TRENDING_COVERAGE,
  type SourceDraft,
  type SourceItem,
} from "@/lib/sources";

/** Minimum gap between fetches, unless forced from the UI. */
export const REFRESH_FLOOR_HOURS = 6;

/** Stories kept per lane per fetch — enough to choose from, few enough to read. */
const PER_LANE = 15;

/** How far back a fetch searches. The inbox then shows anything inside SOURCE_WINDOW_DAYS. */
const SEARCH_DAYS = 7;

export interface RefreshResult {
  ran: boolean;
  reason?: string;
  queries: number;
  /** Stories stored this run, after clustering. */
  stored: number;
  /** Of those, how many were carried by two or more outlets. */
  trending: number;
  /** Queries that failed, with why — reported rather than hidden. */
  failures: string[];
}

/** The account's lanes, from the stored taxonomy or, failing that, its classified posts. */
async function lanesFor(platform: PlatformId): Promise<string[]> {
  const handle = OWNER_ACCOUNTS[platform].handle;
  const taxonomy = await readTaxonomy(platform, handle).catch(() => null);
  if (taxonomy?.length) return taxonomy.map((lane) => lane.name);
  const posts = await readPosts(platform, handle).catch(() => []);
  return lanePerformance(posts).map((lane) => lane.lane);
}

/**
 * One fetch pass: every lane's searches, clustered into stories, stored.
 *
 * Queries run one at a time. They are few, each is fast, and firing them all at
 * once is the kind of burst a free public feed is entitled to throttle.
 */
export async function refreshSources(
  platform: PlatformId,
  options: { force?: boolean } = {},
): Promise<RefreshResult> {
  const empty: RefreshResult = { ran: false, queries: 0, stored: 0, trending: 0, failures: [] };

  if (!options.force) {
    const last = await lastSourceFetch(platform).catch(() => null);
    const hours = last ? (Date.now() - new Date(last).getTime()) / 3_600_000 : Infinity;
    if (hours < REFRESH_FLOOR_HOURS) {
      return {
        ...empty,
        reason: `Fetched ${hours.toFixed(1)}h ago; refreshes at most every ${REFRESH_FLOOR_HOURS}h.`,
      };
    }
  }

  const lanes = await lanesFor(platform);
  const plan = lanes.flatMap((lane) => queriesForLane(lane).map((query) => ({ lane, query })));
  if (!plan.length) {
    return { ...empty, reason: "No content lanes yet, so there is nothing to search for." };
  }

  const failures: string[] = [];
  const byLane = new Map<string, SourceDraft[]>();
  for (const { lane, query } of plan) {
    try {
      const found = await searchNews(query, lane, { days: SEARCH_DAYS });
      byLane.set(lane, [...(byLane.get(lane) ?? []), ...found]);
    } catch (error) {
      failures.push(`${query}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Cluster within a lane, then keep each lane's strongest stories. The same
  // story found by two lanes' searches is kept under the first lane; the
  // unique (platform, url) key would collapse it anyway.
  const seen = new Set<string>();
  const keep: Array<SourceDraft & { coverage: number }> = [];
  for (const [, drafts] of byLane) {
    const stories = rankSources(clusterStories(drafts)).slice(0, PER_LANE);
    for (const story of stories) {
      if (seen.has(story.url)) continue;
      seen.add(story.url);
      keep.push(story);
    }
  }

  const stored = await saveSourceItems(platform, keep).catch((error: unknown) => {
    failures.push(`storage: ${error instanceof Error ? error.message : String(error)}`);
    return 0;
  });

  return {
    ran: true,
    queries: plan.length,
    stored,
    trending: keep.filter((item) => item.coverage >= TRENDING_COVERAGE).length,
    failures,
    ...(stored === 0 && keep.length
      ? { reason: "Fetched stories but could not store them — has migration 0010 been applied?" }
      : {}),
  };
}

export interface TopicInbox {
  items: Array<SourceItem & { used: boolean }>;
  lastFetchedAt: string | null;
  /** False before migration 0010: the inbox cannot keep what it fetches. */
  storable: boolean;
}

/** Fresh stories for the inbox, trending first, with the ones already turned into ideas marked. */
export async function topicInbox(platform: PlatformId): Promise<TopicInbox> {
  const since = new Date(Date.now() - SOURCE_WINDOW_DAYS * 86_400_000).toISOString();
  const [items, used, last] = await Promise.all([
    readSourceItems(platform, since).catch(() => []),
    readUsedSourceIds(platform).catch(() => []),
    lastSourceFetch(platform).catch(() => null),
  ]);
  const usedSet = new Set(used);
  return {
    items: rankSources(items).map((item) => ({ ...item, used: usedSet.has(item.id) })),
    lastFetchedAt: last,
    storable: last !== null || items.length > 0,
  };
}

/**
 * What the strategist may build on: fresh, unused stories, spread across lanes.
 *
 * Capped per lane so one busy news lane cannot crowd the others out of the
 * list, and overall so the prompt stays readable. Stories already turned into
 * an idea are excluded — handing the same article out twice is the source-level
 * version of repeating a topic.
 */
export async function sourceCandidates(
  platform: PlatformId,
  options: { perLane?: number; limit?: number } = {},
): Promise<SourceItem[]> {
  const perLane = options.perLane ?? 6;
  const limit = options.limit ?? 30;
  const inbox = await topicInbox(platform);
  const counts = new Map<string, number>();
  const picked: SourceItem[] = [];
  for (const item of inbox.items) {
    if (item.used) continue;
    const lane = item.lane ?? "";
    if ((counts.get(lane) ?? 0) >= perLane) continue;
    counts.set(lane, (counts.get(lane) ?? 0) + 1);
    const { used: _used, ...source } = item;
    picked.push(source);
    if (picked.length >= limit) break;
  }
  return picked;
}
