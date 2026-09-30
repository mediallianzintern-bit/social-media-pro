// Fetches, stores and hands out the real articles topics are built on.
//
// Free to run: the news feed needs no key and costs nothing, so unlike every
// other external call in this system it can run on each sync. The only guard is
// a politeness floor, so a busy afternoon of syncs does not hammer the feed.
import { searchNews } from "./news";
import { queriesForLane } from "./queries";
import { OWNER_ACCOUNTS } from "../apify/accounts";
import { hasOpenAi } from "../ai/client";
import {
  lastSourceFetch,
  readPosts,
  readSourceItems,
  readTaxonomy,
  readTopicVotes,
  readUsedSourceIds,
  saveSourceItems,
} from "../store";
import { lanePerformance, type PlatformId } from "@/lib/analytics-types";
import {
  buildPreferenceModel,
  laneQuota,
  preferenceFor,
  pullQueries,
  type Verdict,
} from "@/lib/preferences";
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

  let lanes = await lanesFor(platform);
  // An explicit refresh may derive them; a sync may not. See deriveLanesForOwner.
  if (!lanes.length && options.force) {
    // Only on an explicit refresh, never on a sync: refreshSources runs on every
    // sync and earns that place by being free, and two model calls per sync
    // would take away the one property that justifies it.
    const { deriveLanesForOwner } = await import("../ai/lanes");
    lanes = (await deriveLanesForOwner(platform)).lanes;
  }

  const plan: Array<{ lane: string | null; query: string; pulled?: boolean }> = lanes.flatMap(
    (lane) => queriesForLane(lane).map((query) => ({ lane, query })),
  );
  // T67 — searches pulled in by what the team keeps ticking. Added only once a
  // pattern has formed; see pullQueries. Marked so their results get their
  // own share below instead of competing with the lane's standing searches
  // for the same fifteen places.
  const votes = await readTopicVotes(platform).catch(() => []);
  for (const pull of pullQueries(votes)) plan.push({ ...pull, pulled: true });
  if (!plan.length) {
    return {
      ...empty,
      reason: hasOpenAi()
        ? "No content lanes yet, and none could be derived — this account has no stored posts to read them from. Run a sync first."
        : "No content lanes yet. Deriving them needs OPENAI_API_KEY, which is not set.",
    };
  }

  const failures: string[] = [];
  const byLane = new Map<string, SourceDraft[]>();
  for (const { lane, query, pulled } of plan) {
    try {
      const found = await searchNews(query, lane, { days: SEARCH_DAYS });
      const bucket = pulled ? `pulled:${query}` : (lane ?? "");
      byLane.set(bucket, [...(byLane.get(bucket) ?? []), ...found]);
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

/** How the team's votes bear on one story. See lib/preferences.ts. */
export interface InboxPreference {
  voted: Verdict | null;
  /** Why it moved, in words. Null when no vote applied. */
  reason: string | null;
}

export interface TopicInbox {
  items: Array<SourceItem & { used: boolean; preference: InboxPreference }>;
  /**
   * Stories held back because the team crossed them, or crossed enough like
   * them. Returned rather than silently dropped, for the same reason the trend
   * catcher returns what its gate rejected: a filter that removes things
   * without showing them is one nobody can check, and one bad vote pattern
   * could quietly empty a lane.
   */
  hidden: Array<SourceItem & { reason: string }>;
  lastFetchedAt: string | null;
  /** False before migration 0010: the inbox cannot keep what it fetches. */
  storable: boolean;
}

/** Fresh stories for the inbox, trending first, with the ones already turned into ideas marked. */
export async function topicInbox(platform: PlatformId): Promise<TopicInbox> {
  const since = new Date(Date.now() - SOURCE_WINDOW_DAYS * 86_400_000).toISOString();
  const [items, used, last, votes] = await Promise.all([
    readSourceItems(platform, since).catch(() => []),
    readUsedSourceIds(platform).catch(() => []),
    lastSourceFetch(platform).catch(() => null),
    readTopicVotes(platform).catch(() => []),
  ]);
  const usedSet = new Set(used);
  const model = buildPreferenceModel(votes);

  // The existing order — trending first, then newest — becomes a score that
  // falls off gently with position, and the team's preference multiplies it.
  // With no votes every multiplier is exactly 1 and the order is untouched;
  // a liked story climbs a few places and a disliked one sinks, rather than
  // either jumping to an end on one click.
  const shown: TopicInbox["items"] = [];
  const hidden: TopicInbox["hidden"] = [];
  const scored = rankSources(items).map((item, index) => {
    const preference = preferenceFor(model, {
      kind: "source",
      itemId: item.id,
      text: item.title,
      lane: item.lane,
    });
    return { item, preference, rank: (1 / (1 + index / 10)) * preference.multiplier };
  });

  for (const { item, preference } of scored.sort((a, b) => b.rank - a.rank)) {
    if (preference.suppressed) {
      hidden.push({ ...item, reason: preference.reason ?? "like topics you crossed" });
      continue;
    }
    shown.push({
      ...item,
      used: usedSet.has(item.id),
      preference: { voted: preference.voted, reason: preference.reason },
    });
  }

  return {
    items: shown,
    hidden,
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
  const [inbox, votes] = await Promise.all([
    topicInbox(platform),
    readTopicVotes(platform).catch(() => []),
  ]);
  const model = buildPreferenceModel(votes);
  const counts = new Map<string, number>();
  const picked: SourceItem[] = [];
  for (const item of inbox.items) {
    if (item.used) continue;
    const lane = item.lane ?? "";
    // A lane the team keeps ticking gets more of the strategist's attention,
    // one it keeps crossing gets less — the "more of what we like" half of the
    // feature. Hidden stories never reach here at all.
    if ((counts.get(lane) ?? 0) >= laneQuota(model, item.lane, perLane)) continue;
    counts.set(lane, (counts.get(lane) ?? 0) + 1);
    const { used: _used, preference: _preference, ...source } = item;
    picked.push(source);
    if (picked.length >= limit) break;
  }
  return picked;
}
