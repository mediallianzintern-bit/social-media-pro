// Fetches, stores and hands out the real articles topics are built on.
//
// Free to run: the news feed needs no key and costs nothing, so unlike every
// other external call in this system it can run on each sync. The only guard is
// a politeness floor, so a busy afternoon of syncs does not hammer the feed.
import { searchNews } from "./news";
import { OWN_SHARE, queriesForLane } from "./queries";
import { OWNER_ACCOUNTS } from "../apify/accounts";
import { hasOpenAi } from "../ai/client";
import { readAllReelLearning } from "../reel-learning/store";
import {
  lastSourceFetch,
  readIdeaById,
  readPosts,
  readSavedTopics,
  readSourceItems,
  readSourceItemsById,
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
  type TopicVote,
  type Verdict,
} from "@/lib/preferences";
import {
  buildOutletModel,
  outletEvidence,
  outletFor,
  outletSummary,
  type OutletRecord,
  type OutletSignal,
  type OutletStanding,
} from "@/lib/source-trust";
import {
  clusterStories,
  groupStories,
  outletCount,
  rankSources,
  sameStory,
  SOURCE_WINDOW_DAYS,
  TRENDING_COVERAGE,
  type SourceDraft,
  type SourceItem,
} from "@/lib/sources";

/** Minimum gap between fetches, unless forced from the UI. */
export const REFRESH_FLOOR_HOURS = 6;

/** Stories kept per lane per fetch — enough to choose from, few enough to read. */
const PER_LANE = 15;

/**
 * Stories kept per search, for a lane with many searches: a lane keeps the
 * larger of PER_LANE and this times its searches, so adding searches to a lane
 * adds stories rather than splitting the same fifteen.
 */
const PER_QUERY = 7;

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
      const bucket = pulled
        ? `pulled:${query}`
        : OWN_SHARE.has(query)
          ? `own:${query}`
          : (lane ?? "");
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
  const searchesIn = new Map<string, number>();
  for (const { lane, query, pulled } of plan) {
    if (pulled || OWN_SHARE.has(query)) continue;
    searchesIn.set(lane ?? "", (searchesIn.get(lane ?? "") ?? 0) + 1);
  }
  for (const [bucket, drafts] of byLane) {
    const limit = Math.max(PER_LANE, PER_QUERY * (searchesIn.get(bucket) ?? 0));
    const stories = rankSources(clusterStories(drafts)).slice(0, limit);
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

/** What the team's behaviour says about a story's outlet. See lib/source-trust.ts. */
export interface InboxOutlet {
  standing: OutletStanding;
  /** The counts behind it ("7 ✓ · 1 ✗ · 2 scripts"). Null when never acted on. */
  evidence: string | null;
}

export interface TopicInbox {
  items: Array<
    SourceItem & {
      used: boolean;
      preference: InboxPreference;
      outlet: InboxOutlet;
      /** Other reports of this same story folded into this row. */
      repeats: number;
      /**
       * The report the script was written from, when this story already has
       * one. Not always this row's id: the script may come from another
       * outlet's report of the same story, or from an older fetch.
       */
      scriptSourceId: string | null;
    }
  >;
  /**
   * Stories held back because the team crossed them, or crossed enough like
   * them. Returned rather than silently dropped, for the same reason the trend
   * catcher returns what its gate rejected: a filter that removes things
   * without showing them is one nobody can check, and one bad vote pattern
   * could quietly empty a lane.
   */
  hidden: Array<SourceItem & { reason: string }>;
  /** Reports folded into another row because they were the same story. */
  repeatsMerged: number;
  /** Outlets the team's behaviour has judged, for display. */
  outlets: { trusted: OutletRecord[]; avoided: OutletRecord[]; judged: number };
  lastFetchedAt: string | null;
  /** False before migration 0010: the inbox cannot keep what it fetches. */
  storable: boolean;
}

/** Stored sources by id, in batches small enough for one request each. */
async function sourcesById(ids: string[]): Promise<SourceItem[]> {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) batches.push(ids.slice(i, i + 100));
  const results = await Promise.all(
    batches.map((batch) => readSourceItemsById(batch).catch(() => [] as SourceItem[])),
  );
  return results.flat();
}

/**
 * Everything the team has done with stories, as signals about their outlets:
 * ticks and crosses, scripts written, stories saved, reels filmed. Free: stored
 * rows only. See lib/source-trust.ts for how they are weighed.
 */
async function outletSignals(
  platform: PlatformId,
  votes: TopicVote[],
  usedIds: string[],
  byId: Map<string, SourceItem>,
): Promise<OutletSignal[]> {
  const [saved, filmed] = await Promise.all([
    readSavedTopics(platform).catch(() => []),
    readAllReelLearning(platform).catch(() => []),
  ]);
  const filmedSources = await Promise.all(
    filmed.map(async (row) => ({
      at: row.filmedAt,
      publisher: (await readIdeaById(row.ideaId).catch(() => null))?.source?.publisher ?? null,
    })),
  );

  const signals: OutletSignal[] = [];
  const push = (publisher: string | null | undefined, kind: OutletSignal["kind"], at: string) => {
    if (publisher) signals.push({ publisher, kind, at });
  };
  for (const vote of votes) {
    if (vote.kind !== "source") continue;
    push(
      byId.get(vote.itemId)?.publisher,
      vote.verdict === "like" ? "tick" : "cross",
      vote.createdAt,
    );
  }
  for (const id of usedIds) {
    const source = byId.get(id);
    if (source) push(source.publisher, "script", source.fetchedAt);
  }
  for (const topic of saved) {
    if (topic.kind === "source") push(topic.sourceLabel, "saved", topic.createdAt);
  }
  for (const reel of filmedSources) push(reel.publisher, "filmed", reel.at);
  return signals;
}

/**
 * Fresh stories for the inbox: each story once, trending first, with the
 * team's votes and outlet trust applied, and the ones already written marked.
 *
 * The same story is fetched again and again: by another outlet, by another
 * lane's search, or by the next fetch. On 22 Oct 2026, 91 of the 812 stories in
 * the inbox repeated one already there. So every report in the window is
 * grouped by story (lib/sources.ts sameStory) and shown once. A vote, a script
 * or a cross on any report counts for the whole story, and so does a script
 * written from an older report that has left the window.
 */
export async function topicInbox(platform: PlatformId): Promise<TopicInbox> {
  const since = new Date(Date.now() - SOURCE_WINDOW_DAYS * 86_400_000).toISOString();
  const [stored, used, last, votes] = await Promise.all([
    readSourceItems(platform, since).catch(() => []),
    readUsedSourceIds(platform).catch(() => []),
    lastSourceFetch(platform).catch(() => null),
    readTopicVotes(platform).catch(() => []),
  ]);
  // Creator reels stored while the AI tool workflows phases were live (26-28
  // Oct 2026) are not news: kept in the table, never shown as stories.
  const items = stored.filter(
    (item) => !(item.kind === "video" && item.publisher?.startsWith("@")),
  );
  const usedSet = new Set(used);
  const model = buildPreferenceModel(votes);

  // Every story the team voted on or wrote from, including ones that have left
  // the window: their outlets are learned from, and a written one must not
  // come back as new under another outlet's headline.
  const byId = new Map(items.map((item) => [item.id, item]));
  const outside = [
    ...new Set([
      ...votes.filter((vote) => vote.kind === "source").map((vote) => vote.itemId),
      ...used,
    ]),
  ].filter((id) => !byId.has(id));
  for (const source of await sourcesById(outside)) byId.set(source.id, source);
  const outlets = buildOutletModel(await outletSignals(platform, votes, used, byId));
  const writtenEarlier = used
    .filter((id) => !items.some((item) => item.id === id))
    .map((id) => byId.get(id))
    .filter((source): source is SourceItem => Boolean(source));

  const latestVote = new Map<string, TopicVote>();
  for (const vote of votes) {
    if (vote.kind !== "source") continue;
    const seen = latestVote.get(vote.itemId);
    if (!seen || vote.createdAt > seen.createdAt) latestVote.set(vote.itemId, vote);
  }
  const time = (item: SourceItem) => (item.publishedAt ? new Date(item.publishedAt).getTime() : 0);

  // One row per story. Its lead report is the one the team acted on, if any,
  // so the vote and the script stay attached to what is shown; otherwise the
  // newest.
  let repeatsMerged = 0;
  const stories = groupStories(items).map((members) => {
    repeatsMerged += members.length - 1;
    const voted = members
      .filter((item) => latestVote.has(item.id))
      .sort((a, b) =>
        latestVote.get(b.id)!.createdAt.localeCompare(latestVote.get(a.id)!.createdAt),
      );
    const written = members.find((item) => usedSet.has(item.id));
    const lead = voted[0] ?? written ?? [...members].sort((a, b) => time(b) - time(a))[0]!;
    const writtenBefore = written
      ? null
      : writtenEarlier.find((source) =>
          sameStory(source.title, lead.title, 0.5, { a: source.publishedAt, b: lead.publishedAt }),
        );
    return {
      lead: { ...lead, coverage: Math.max(lead.coverage, outletCount(members)) },
      repeats: members.length - 1,
      scriptSourceId: written?.id ?? writtenBefore?.id ?? null,
    };
  });

  // The existing order — trending first, then newest — becomes a score that
  // falls off gently with position, and the team's preference multiplies it.
  // With no votes every multiplier is exactly 1 and the order is untouched; a
  // liked story climbs a few places and a disliked one sinks, rather than
  // either jumping to an end on one click.
  //
  // Outlet standing is worked out and returned with each story, but it does
  // not move anything yet (23 Oct 2026): ordering by it made the topics worse
  // while it rested on too few votes per outlet. It keeps learning from every
  // tick, cross, script, save and filmed reel until there is enough to use.
  const shown: TopicInbox["items"] = [];
  const hidden: TopicInbox["hidden"] = [];
  const leads = new Map(stories.map((story) => [story.lead.id, story]));
  const scored = rankSources(stories.map((story) => story.lead)).map((item, index) => {
    const preference = preferenceFor(model, {
      kind: "source",
      itemId: item.id,
      text: item.title,
      lane: item.lane,
    });
    const record = outletFor(outlets, item.publisher);
    const standing = record?.standing ?? "untested";
    return {
      item,
      preference,
      outlet: { standing, evidence: record ? outletEvidence(record) : null },
      rank: (1 / (1 + index / 10)) * preference.multiplier,
    };
  });

  for (const { item, preference, outlet } of scored.sort((a, b) => b.rank - a.rank)) {
    if (preference.suppressed) {
      hidden.push({ ...item, reason: preference.reason ?? "like topics you crossed" });
      continue;
    }
    const story = leads.get(item.id)!;
    shown.push({
      ...item,
      used: story.scriptSourceId !== null,
      preference: { voted: preference.voted, reason: preference.reason },
      outlet,
      repeats: story.repeats,
      scriptSourceId: story.scriptSourceId,
    });
  }

  return {
    items: shown,
    hidden,
    repeatsMerged,
    outlets: outletSummary(outlets),
    lastFetchedAt: last,
    storable: last !== null || items.length > 0,
  };
}

/**
 * What the strategist may build on: fresh, unused stories, spread across lanes.
 *
 * Built from the inbox, so every story appears once and nothing already
 * written (from any outlet's report of it) is handed out again. Outlet
 * standing plays no part yet (see topicInbox).
 *
 * Capped per lane so one busy news lane cannot crowd the others out of the
 * list, and overall so the prompt stays readable.
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
    // one it keeps crossing gets less. Hidden stories never reach here at all.
    if ((counts.get(lane) ?? 0) >= laneQuota(model, item.lane, perLane)) continue;
    counts.set(lane, (counts.get(lane) ?? 0) + 1);
    const {
      used: _used,
      preference: _preference,
      outlet: _outlet,
      repeats: _repeats,
      scriptSourceId: _script,
      ...source
    } = item;
    picked.push(source);
    if (picked.length >= limit) break;
  }
  return picked;
}
