// In-memory fallback used when SUPABASE_SERVICE_ROLE_KEY is not configured.
//
// This exists so the dashboard is usable with nothing but an Apify token: syncs
// run, real numbers render, and the app is demonstrably working. What it cannot
// do is survive a server restart — so the follower growth curve, which is the
// whole point of syncing every two hours, only becomes real once Supabase is
// wired up. The UI says so rather than letting the gap pass unnoticed.
import type { ContentEra } from "@/lib/eras";
import type { TopicVote } from "@/lib/preferences";
import type { ReactionFields, ReactionSource } from "@/lib/reaction";
import { isTrendSource } from "./apify/accounts";
import type {
  AccountSnapshot,
  ContentLane,
  GrowthPoint,
  InstagramInsights,
  PlatformId,
  PostRecord,
} from "@/lib/analytics-types";
import type {
  ClientRecord,
  OutcomeRow,
  UsedSuggestion,
  NicheModelRow,
  PredictionRow,
  PriorSuggestion,
  PublishedSubject,
  QueueItem,
  UserRow,
  TrendObservationRow,
} from "./store.supabase";
import type { AiAnalysis, ContentIdea } from "@/lib/ai-types";
import type { IdeaStatus, Role } from "@/lib/roles";
import type { TrendObservation, TrendSignal } from "@/lib/trends";
import type { SourceDraft, SourceItem } from "@/lib/sources";
import type { CalendarEntry } from "@/lib/calendar-types";

interface SnapshotEntry {
  snapshot: AccountSnapshot;
  role: "owner" | "competitor";
  platform: PlatformId;
}

const snapshots: SnapshotEntry[] = [];
const posts = new Map<string, PostRecord & { handle: string }>();
const lastSync = new Map<PlatformId, string>();
const ingestedRuns = new Set<string>();
const analyses = new Map<PlatformId, AiAnalysis>();
const watchlists = new Map<PlatformId, string[]>();
const insights = new Map<string, InstagramInsights>();
const taxonomies = new Map<string, ContentLane[]>();

export const isEphemeral = true;

export async function saveInsights(
  platform: PlatformId,
  handle: string,
  payload: InstagramInsights,
): Promise<void> {
  insights.set(`${platform}:${handle}`, payload);
}

export async function readInsights(
  platform: PlatformId,
  handle: string,
): Promise<InstagramInsights | null> {
  return insights.get(`${platform}:${handle}`) ?? null;
}

export async function recordRun(
  platform: PlatformId,
  _trigger: "manual" | "schedule",
  apifyRunId: string | null,
): Promise<string | null> {
  lastSync.set(platform, new Date().toISOString());
  if (apifyRunId) ingestedRuns.add(apifyRunId);
  return apifyRunId;
}

export async function recordFailedRun(): Promise<void> {
  // Failures are logged by the caller; there is nothing durable to write to.
}

export async function finishRun(): Promise<void> {}

export async function saveSnapshots(
  platform: PlatformId,
  _runId: string | null,
  entries: Array<{ snapshot: AccountSnapshot; role: "owner" | "competitor" }>,
): Promise<void> {
  for (const entry of entries) {
    snapshots.push({ ...entry, platform });
  }
}

export async function savePosts(handle: string, records: PostRecord[]): Promise<number> {
  for (const post of records) {
    posts.set(`${post.platform}:${post.postId}`, { ...post, handle });
  }
  return records.length;
}

export async function latestSnapshot(
  platform: PlatformId,
  handle: string,
): Promise<AccountSnapshot | null> {
  const matches = snapshots.filter(
    (entry) => entry.platform === platform && entry.snapshot.handle === handle,
  );
  return matches.at(-1)?.snapshot ?? null;
}

export async function growthSeries(platform: PlatformId, handle: string): Promise<GrowthPoint[]> {
  return snapshots
    .filter(
      (entry) =>
        entry.platform === platform && entry.snapshot.handle === handle && entry.role === "owner",
    )
    .map((entry) => ({
      capturedAt: entry.snapshot.capturedAt,
      followers: entry.snapshot.followers,
    }));
}

function competitorRoleSnapshots(platform: PlatformId): AccountSnapshot[] {
  const newest = new Map<string, AccountSnapshot>();
  for (const entry of snapshots) {
    if (entry.platform !== platform || entry.role !== "competitor") continue;
    newest.set(entry.snapshot.handle, entry.snapshot);
  }
  return [...newest.values()];
}

/** Real competitors only — benchmarks. Trend sources are excluded. */
export async function competitorSnapshots(platform: PlatformId): Promise<AccountSnapshot[]> {
  return competitorRoleSnapshots(platform).filter((s) => !isTrendSource(platform, s.handle));
}

/** Accounts watched only for what they surface. See AccountRole. */
export async function trendSourceSnapshots(platform: PlatformId): Promise<AccountSnapshot[]> {
  return competitorRoleSnapshots(platform).filter((s) => isTrendSource(platform, s.handle));
}

export async function readPosts(
  platform: PlatformId,
  handle: string,
  limit = 60,
): Promise<PostRecord[]> {
  return [...posts.values()]
    .filter((post) => post.platform === platform && post.handle === handle)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, limit);
}

export async function lastSyncAt(platform: PlatformId): Promise<string | null> {
  return lastSync.get(platform) ?? null;
}

export async function runAlreadyIngested(apifyRunId: string): Promise<boolean> {
  return ingestedRuns.has(apifyRunId);
}

export async function saveAnalysis(platform: PlatformId, analysis: AiAnalysis): Promise<void> {
  analyses.set(platform, analysis);
}

/** In-memory stand-in: assigns a uuid per idea rather than a database id. */
export async function saveSuggestedIdeas(
  _platform: PlatformId,
  ideas: ContentIdea[],
): Promise<ContentIdea[]> {
  return ideas.map((idea) => ({
    ...idea,
    id: crypto.randomUUID(),
    status: "suggested" as const,
  }));
}

/**
 * No-ops rather than errors: without Supabase there is nowhere to persist the
 * link, but a missing store must not be why the button in the UI fails.
 */
export async function markIdeaUsed(_id: string, _shortcode: string): Promise<void> {}
export async function markIdeaDismissed(_id: string): Promise<void> {}

export async function readTaxonomy(
  platform: PlatformId,
  handle: string,
): Promise<ContentLane[] | null> {
  return taxonomies.get(`${platform}:${handle}`) ?? null;
}

export async function saveTaxonomy(
  platform: PlatformId,
  handle: string,
  lanes: ContentLane[],
): Promise<void> {
  taxonomies.set(`${platform}:${handle}`, lanes);
}

export async function savePostLanes(
  platform: PlatformId,
  assignments: Array<{ postId: string; lane: string }>,
): Promise<number> {
  let written = 0;
  for (const { postId, lane } of assignments) {
    for (const post of posts.values()) {
      if (post.platform === platform && post.postId === postId) {
        post.contentLane = lane;
        written += 1;
      }
    }
  }
  return written;
}

/** Nothing is persisted here, so there is no suggestion history to read back. */
export async function readUsedSuggestions(_platform: PlatformId): Promise<UsedSuggestion[]> {
  return [];
}

export async function findPostByLink(
  platform: PlatformId,
  match: "postId" | "urlContains",
  value: string,
): Promise<PostRecord | null> {
  for (const post of posts.values()) {
    if (post.platform !== platform) continue;
    const hit = match === "postId" ? post.postId === value : (post.url ?? "").includes(value);
    if (hit) return post;
  }
  return null;
}

/** Outcomes are the feedback loop's long memory; there is none without Supabase. */
export async function saveOutcome(_outcome: OutcomeRow): Promise<boolean> {
  return false;
}

export async function readOutcomes(_platform: PlatformId): Promise<OutcomeRow[]> {
  return [];
}

export async function readAnalysis(platform: PlatformId): Promise<AiAnalysis | null> {
  return analyses.get(platform) ?? null;
}

export async function saveWatchlist(platform: PlatformId, handles: string[]): Promise<void> {
  watchlists.set(platform, handles);
}

export async function readWatchlist(platform: PlatformId): Promise<string[]> {
  return watchlists.get(platform) ?? [];
}

/** Predictions are scored months later; there is no such thing without Supabase. */
export async function savePrediction(_row: PredictionRow): Promise<boolean> {
  return false;
}

export async function readPredictions(_platform: PlatformId): Promise<PredictionRow[]> {
  return [];
}

export async function saveNicheModel(_row: NicheModelRow): Promise<void> {
  // Nothing to keep: a fitted model is only meaningful across restarts.
}

export async function readNicheModel(
  _platform: PlatformId,
  _niche: string,
): Promise<NicheModelRow | null> {
  return null;
}

export async function readRecentSuggestions(
  _platform: PlatformId,
  _limit = 40,
): Promise<PriorSuggestion[]> {
  return [];
}

export async function readPublishedSubjects(
  _platform: PlatformId,
  _handle: string,
  _limit = 500,
): Promise<PublishedSubject[]> {
  return [];
}

export async function readClient(): Promise<ClientRecord | null> {
  return null;
}

export async function readUsers(): Promise<UserRow[]> {
  return [];
}
export async function saveUser(_n: string, _r: Role, _e?: string): Promise<string | null> {
  return null;
}
export async function readAssignments(
  _userId: string,
): Promise<Array<{ clientId: string; role: Role }>> {
  return [];
}
export async function assignUser(_c: string, _u: string, _r: Role): Promise<void> {}
export async function readQueue(_s: IdeaStatus[], _limit = 60): Promise<QueueItem[]> {
  return [];
}
export async function transitionIdea(
  _id: string,
  _from: IdeaStatus,
  _to: IdeaStatus,
  _actor: string | null,
  _extras: { shortcode?: string } = {},
): Promise<boolean> {
  return false;
}

export async function saveTrendObservations(_rows: TrendObservationRow[]): Promise<number> {
  return 0;
}
export async function readTrendObservations(_n: string, _l = 1000): Promise<TrendObservation[]> {
  return [];
}
export async function saveTrendSignals(_n: string, _s: TrendSignal[]): Promise<void> {}
export async function readTrendSignals(_n: string): Promise<TrendSignal[]> {
  return [];
}

export async function setIdeaSourceSignal(
  _ids: string[],
  _signal: "owner" | "niche" | "niche_trend",
): Promise<number> {
  return 0;
}

// Sources are kept in process so the topic inbox works without Supabase; like
// everything else here they are lost on restart.
const sources = new Map<string, SourceItem>();

export async function saveSourceItems(
  platform: PlatformId,
  items: Array<SourceDraft & { coverage: number }>,
): Promise<number> {
  const now = new Date().toISOString();
  for (const item of items) {
    const key = `${platform}:${item.url}`;
    const existing = sources.get(key);
    sources.set(key, {
      ...item,
      id: existing?.id ?? crypto.randomUUID(),
      platform,
      fetchedAt: now,
    });
  }
  return items.length;
}

export async function readSourceItems(
  platform: PlatformId,
  sinceIso: string,
  limit = 300,
): Promise<SourceItem[]> {
  const since = new Date(sinceIso).getTime();
  return [...sources.values()]
    .filter((item) => item.platform === platform)
    .filter((item) => (item.publishedAt ? new Date(item.publishedAt).getTime() >= since : false))
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, limit);
}

export async function readSourceItemsById(ids: string[]): Promise<SourceItem[]> {
  const wanted = new Set(ids);
  return [...sources.values()].filter((item) => wanted.has(item.id));
}

export async function readUsedSourceIds(_platform: PlatformId): Promise<string[]> {
  return [];
}

export async function lastSourceFetch(platform: PlatformId): Promise<string | null> {
  const times = [...sources.values()]
    .filter((item) => item.platform === platform)
    .map((item) => item.fetchedAt)
    .sort();
  return times.at(-1) ?? null;
}

const calendar = new Map<string, CalendarEntry>();

export async function saveCalendarEntries(entries: CalendarEntry[]): Promise<number> {
  for (const entry of entries) calendar.set(entry.contentHash, entry);
  return entries.length;
}

export async function readCalendarEntries(platform: PlatformId): Promise<CalendarEntry[]> {
  return [...calendar.values()].filter((entry) => entry.platform === platform);
}

export async function linkCalendarEntry(contentHash: string, postId: string): Promise<void> {
  const entry = calendar.get(contentHash);
  if (entry) calendar.set(contentHash, { ...entry, publishedPostId: postId });
}

// ---------------------------------------------------------------------------
// Content eras (Addendum D)
// ---------------------------------------------------------------------------
//
// The in-memory store exists so the app runs without Supabase configured, for
// local work and previews. Eras are a deliberate, durable statement about
// strategy, so there is nothing sensible to invent here: reads return none and
// writes are accepted and dropped, which is the same contract the rest of this
// file offers for anything a preview cannot persist.

export async function readEras(_platform: PlatformId, _handle: string): Promise<ContentEra[]> {
  return [];
}

export async function saveEra(_era: {
  platform: PlatformId;
  handle: string;
  startsAt: string;
  label: string;
  note?: string | null;
  origin?: ContentEra["origin"];
  detection?: ContentEra["detection"];
}): Promise<void> {}

export async function deleteEra(_id: string): Promise<void> {}

// ---------------------------------------------------------------------------
// Topic feedback (T67)
// ---------------------------------------------------------------------------
//
// Kept in memory so a preview without Supabase still shows the ranking react
// to a vote within the session. Lost on restart, like everything else here.

const votes: Array<TopicVote & { platform: PlatformId }> = [];

export async function readTopicVotes(platform: PlatformId): Promise<TopicVote[]> {
  return votes
    .filter((vote) => vote.platform === platform)
    .map(({ platform: _platform, ...vote }) => vote);
}

export async function saveTopicVote(vote: {
  platform: PlatformId;
  kind: TopicVote["kind"];
  itemId: string;
  verdict: TopicVote["verdict"] | null;
  text: string;
  lane: string | null;
  actor: string | null;
}): Promise<void> {
  const index = votes.findIndex(
    (entry) =>
      entry.platform === vote.platform && entry.kind === vote.kind && entry.itemId === vote.itemId,
  );
  if (index >= 0) votes.splice(index, 1);
  if (vote.verdict === null) return;
  votes.unshift({
    platform: vote.platform,
    kind: vote.kind,
    itemId: vote.itemId,
    verdict: vote.verdict,
    text: vote.text,
    lane: vote.lane,
    actor: vote.actor,
    createdAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// T45b — lifecycle stages and people
// ---------------------------------------------------------------------------
//
// Previews without Supabase have no ideas table to move rows through, so these
// accept the call and report that nothing changed.

export async function markIdeaMeasured(_id: string): Promise<boolean> {
  return false;
}

export async function resolveStaffUser(_email: string, _actedAs: Role): Promise<string | null> {
  return null;
}

export async function assignIdea(_id: string, _userId: string | null): Promise<boolean> {
  return false;
}

// ---------------------------------------------------------------------------
// Addendum E — reaction sources
// ---------------------------------------------------------------------------
//
// Previews without Supabase keep sources for the session so the flow can be
// clicked through; settings and the approval gates need the real tables.

const reactionSources: ReactionSource[] = [];

export async function readReactionSources(platform: PlatformId): Promise<ReactionSource[]> {
  return reactionSources.filter((source) => source.platform === platform);
}

export async function readReactionSource(id: string): Promise<ReactionSource | null> {
  return reactionSources.find((source) => source.id === id) ?? null;
}

export async function saveReactionSource(input: {
  platform: PlatformId;
  sourceUrl: string;
  sourcePlatform: ReactionSource["sourcePlatform"];
  sourceCreatorHandle: string | null;
  sourceType: ReactionSource["sourceType"];
  sourcePublicViews: number | null;
  transcript: string | null;
  extractedClaim: string | null;
  creditText: string | null;
  rightsStatus: ReactionSource["rightsStatus"];
  foundBy: ReactionSource["foundBy"];
  createdBy: string | null;
}): Promise<ReactionSource> {
  const existing = reactionSources.findIndex(
    (source) => source.platform === input.platform && source.sourceUrl === input.sourceUrl,
  );
  const row: ReactionSource = {
    id: existing >= 0 ? reactionSources[existing]!.id : crypto.randomUUID(),
    platform: input.platform,
    sourceUrl: input.sourceUrl,
    sourcePlatform: input.sourcePlatform,
    sourceCreatorHandle: input.sourceCreatorHandle,
    sourceType: input.sourceType,
    sourcePublicViews: input.sourcePublicViews,
    transcript: input.transcript,
    extractedClaim: input.extractedClaim,
    creditText: input.creditText,
    rightsStatus: input.rightsStatus,
    foundBy: input.foundBy,
    createdAt: new Date().toISOString(),
  };
  if (existing >= 0) reactionSources[existing] = row;
  else reactionSources.unshift(row);
  return row;
}

export async function setReactionClaim(id: string, claim: string): Promise<void> {
  const source = reactionSources.find((entry) => entry.id === id);
  if (source && !source.extractedClaim) source.extractedClaim = claim;
}

export async function deleteReactionSource(id: string): Promise<void> {
  const index = reactionSources.findIndex((entry) => entry.id === id);
  if (index >= 0) reactionSources.splice(index, 1);
}

export async function readReactionSettings(): Promise<{
  standardCta: string | null;
  leadMagnet: string | null;
  brandSetNotes: string | null;
  ownedLaneForRedirect: string | null;
} | null> {
  return null;
}

export async function saveReactionSettings(_settings: {
  standardCta: string | null;
  leadMagnet: string | null;
  brandSetNotes: string | null;
  ownedLaneForRedirect: string | null;
}): Promise<boolean> {
  return false;
}

export async function readIdeaFormat(_id: string): Promise<{
  formatTemplate: "standard" | "reaction_hook";
  reaction: ReactionFields | null;
  reactionSourceId: string | null;
} | null> {
  return { formatTemplate: "standard", reaction: null, reactionSourceId: null };
}

export async function confirmReactionFacts(_id: string, _userId: string | null): Promise<boolean> {
  return false;
}

export async function readReactionIdeas(
  _platform: PlatformId,
): Promise<Array<{ id: string; status: string; reaction: ReactionFields }>> {
  return [];
}
