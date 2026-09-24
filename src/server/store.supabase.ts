// Supabase persistence. Every read and write goes through the service-role
// client, which bypasses RLS — the tables have RLS on with no policies, so a
// leaked publishable key still reads nothing.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  AccountSnapshot,
  ContentLane,
  GrowthPoint,
  InstagramInsights,
  MediaInsight,
  PlatformId,
  PostRecord,
} from "@/lib/analytics-types";
import type { AiAnalysis, ContentIdea } from "@/lib/ai-types";
import { scriptFeatures, type ScriptFeatures } from "@/lib/script-features";
import type { SourceDraft, SourceItem } from "@/lib/sources";
import type { IdeaStatus, Role } from "@/lib/roles";
import type { TrendKind, TrendObservation, TrendSignal } from "@/lib/trends";

/** Rows returned by the queries below; the generated Database type has no tables yet. */
interface SnapshotRow {
  handle: string;
  display_name: string | null;
  headline: string | null;
  followers: number | null;
  following: number | null;
  posts_count: number | null;
  captured_at: string;
  role: string;
}

interface PostRow {
  post_id: string;
  url: string | null;
  caption: string | null;
  format: string | null;
  published_at: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  pinned: boolean | null;
  // Owner-only Graph columns. Null means "not measured", not zero.
  reach: number | null;
  saved: number | null;
  graph_views: number | null;
  avg_watch_ms: number | null;
  total_watch_ms: number | null;
  follows: number | null;
  profile_visits: number | null;
  insights_at: string | null;
  content_lane: string | null;
}

const POST_COLUMNS =
  "post_id,url,caption,format,published_at,views,likes,comments,shares,pinned," +
  "reach,saved,graph_views,avg_watch_ms,total_watch_ms,follows,profile_visits,insights_at," +
  "content_lane";

/** Rebuilds the optional MediaInsight from its flattened columns. */
function insightOf(row: PostRow): MediaInsight | undefined {
  if (!row.insights_at) return undefined;
  const insight: MediaInsight = {
    reach: row.reach ?? 0,
    saved: row.saved ?? 0,
    shares: row.shares,
    // Falls back to the scraped count only for rows written before graph_views
    // existed; every new capture fills it.
    views: row.graph_views ?? row.views,
  };
  if (row.avg_watch_ms !== null) insight.avgWatchMs = row.avg_watch_ms;
  if (row.total_watch_ms !== null) insight.totalWatchMs = row.total_watch_ms;
  if (row.follows !== null) insight.follows = row.follows;
  if (row.profile_visits !== null) insight.profileVisits = row.profile_visits;
  return insight;
}

// The generated Database type is empty (no tables were introspected), so these
// calls are untyped by necessity. Casting once here keeps the rest type-safe.
/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => supabaseAdmin as any;

export async function recordRun(
  platform: PlatformId,
  trigger: "manual" | "schedule",
  apifyRunId: string | null,
): Promise<string | null> {
  const { data, error } = await db()
    .from("sync_runs")
    .insert({ platform, trigger, apify_run_id: apifyRunId, status: "ok" })
    .select("id")
    .single();
  if (error) throw new Error(`sync_runs insert failed: ${error.message}`);
  return data?.id ?? null;
}

export async function recordFailedRun(
  platform: PlatformId,
  trigger: "manual" | "schedule",
  message: string,
): Promise<void> {
  const { error } = await db().from("sync_runs").insert({
    platform,
    trigger,
    status: "error",
    error: message,
    finished_at: new Date().toISOString(),
  });
  if (error) console.error(`[store] could not record failed run: ${error.message}`);
}

export async function finishRun(runId: string | null): Promise<void> {
  if (!runId) return;
  await db().from("sync_runs").update({ finished_at: new Date().toISOString() }).eq("id", runId);
}

/** Appends one snapshot per account — this is what builds the growth curve. */
export async function saveSnapshots(
  platform: PlatformId,
  runId: string | null,
  snapshots: Array<{ snapshot: AccountSnapshot; role: "owner" | "competitor" }>,
): Promise<void> {
  if (!snapshots.length) return;
  const rows = snapshots.map(({ snapshot, role }) => ({
    run_id: runId,
    platform,
    handle: snapshot.handle,
    role,
    display_name: snapshot.displayName,
    headline: snapshot.headline ?? null,
    followers: snapshot.followers,
    following: snapshot.following ?? null,
    posts_count: snapshot.postsCount ?? null,
    captured_at: snapshot.capturedAt,
  }));
  const { error } = await db().from("account_snapshots").insert(rows);
  if (error) throw new Error(`account_snapshots insert failed: ${error.message}`);
}

/** Upserts post metrics — engagement keeps rising after publication. */
export async function savePosts(handle: string, posts: PostRecord[]): Promise<number> {
  if (!posts.length) return 0;
  const now = new Date().toISOString();

  const base = (post: PostRecord) => ({
    platform: post.platform,
    post_id: post.postId,
    handle,
    url: post.url ?? null,
    caption: post.caption,
    format: post.format,
    published_at: post.publishedAt,
    views: post.views,
    likes: post.likes,
    comments: post.comments,
    shares: post.shares,
    pinned: post.pinned,
    updated_at: now,
  });

  // Split by whether Graph measured the post, and upsert each group separately.
  //
  // PostgREST builds one statement per call from the union of the keys it is
  // given, filling absent keys with null. Mixing measured and unmeasured posts
  // in a single call would therefore write null over reach/saved/watch time for
  // every post the Graph window did not cover — silently destroying earlier
  // measurements on each sync. Two homogeneous calls avoid that entirely.
  const groups = [
    posts.filter((post) => !post.insight).map(base),
    posts
      .filter((post) => post.insight)
      .map((post) => ({
        ...base(post),
        reach: post.insight?.reach ?? null,
        saved: post.insight?.saved ?? null,
        graph_views: post.insight?.views ?? null,
        avg_watch_ms: post.insight?.avgWatchMs ?? null,
        total_watch_ms: post.insight?.totalWatchMs ?? null,
        follows: post.insight?.follows ?? null,
        profile_visits: post.insight?.profileVisits ?? null,
        insights_at: now,
      })),
  ].filter((group) => group.length > 0);

  for (const rows of groups) {
    const { error } = await db()
      .from("post_metrics")
      .upsert(rows, { onConflict: "platform,post_id" });
    if (error) throw new Error(`post_metrics upsert failed: ${error.message}`);
  }
  return posts.length;
}

/** Appends one account-level insights capture. Append-only, like snapshots. */
export async function saveInsights(
  platform: PlatformId,
  handle: string,
  payload: InstagramInsights,
): Promise<void> {
  const { error } = await db()
    .from("account_insights")
    .insert({ platform, handle, payload, captured_at: payload.capturedAt });
  if (error) throw new Error(`account_insights insert failed: ${error.message}`);
}

export async function readInsights(
  platform: PlatformId,
  handle: string,
): Promise<InstagramInsights | null> {
  const { data, error } = await db()
    .from("account_insights")
    .select("payload")
    .eq("platform", platform)
    .eq("handle", handle)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`account_insights read failed: ${error.message}`);
  return (data as { payload: InstagramInsights } | null)?.payload ?? null;
}

export async function latestSnapshot(
  platform: PlatformId,
  handle: string,
): Promise<AccountSnapshot | null> {
  const { data, error } = await db()
    .from("account_snapshots")
    .select("handle,display_name,headline,followers,following,posts_count,captured_at,role")
    .eq("platform", platform)
    .eq("handle", handle)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`account_snapshots read failed: ${error.message}`);
  return data ? toSnapshot(data as SnapshotRow) : null;
}

/**
 * Follower history, oldest first. Syncs run every 2 hours but the curve reads
 * better daily, so this keeps the last snapshot of each calendar day plus the
 * most recent point.
 */
export async function growthSeries(
  platform: PlatformId,
  handle: string,
  days = 90,
): Promise<GrowthPoint[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await db()
    .from("account_snapshots")
    .select("followers,captured_at")
    .eq("platform", platform)
    .eq("handle", handle)
    .eq("role", "owner")
    .gte("captured_at", since)
    .order("captured_at", { ascending: true });
  if (error) throw new Error(`growth read failed: ${error.message}`);

  const byDay = new Map<string, GrowthPoint>();
  for (const row of (data ?? []) as Array<{ followers: number | null; captured_at: string }>) {
    byDay.set(row.captured_at.slice(0, 10), {
      capturedAt: row.captured_at,
      followers: row.followers ?? 0,
    });
  }
  return [...byDay.values()];
}

export async function competitorSnapshots(platform: PlatformId): Promise<AccountSnapshot[]> {
  const { data, error } = await db()
    .from("account_snapshots")
    .select("handle,display_name,headline,followers,following,posts_count,captured_at,role")
    .eq("platform", platform)
    .eq("role", "competitor")
    .order("captured_at", { ascending: false });
  if (error) throw new Error(`competitor read failed: ${error.message}`);

  // One row per handle — the newest.
  const newest = new Map<string, SnapshotRow>();
  for (const row of (data ?? []) as SnapshotRow[]) {
    if (!newest.has(row.handle)) newest.set(row.handle, row);
  }
  return [...newest.values()].map(toSnapshot);
}

/** Columns that exist in the very first migration and can always be selected. */
const POST_COLUMNS_BASE =
  "post_id,url,caption,format,published_at,views,likes,comments,shares,pinned";

/** Postgres "undefined_column" — raised when a migration has not been applied. */
const UNDEFINED_COLUMN = "42703";

/**
 * True when an error means "this migration has not been applied yet" rather
 * than a real failure: a missing column or table, as Postgres or PostgREST's
 * schema cache reports it. Callers use it to fall back to the older shape, so
 * shipping code ahead of its migration degrades instead of breaking.
 */
function schemaNotReady(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code ?? "";
  return ["42703", "42P01", "PGRST204", "PGRST205"].includes(code);
}

export async function readPosts(platform: PlatformId, handle: string): Promise<PostRecord[]> {
  const query = (columns: string) =>
    db()
      .from("post_metrics")
      .select(columns)
      .eq("platform", platform)
      .eq("handle", handle)
      .order("published_at", { ascending: false })
      .limit(60);

  let { data, error } = await query(POST_COLUMNS);

  // A pending migration should cost the owner-only columns, not the dashboard.
  // Selecting a column that does not exist fails the whole query, so the page
  // went blank twice over a one-line ALTER TABLE — the public metrics were
  // sitting there intact the entire time. Retry without the newer columns and
  // say so in the log rather than taking everything down with them.
  if (error?.code === UNDEFINED_COLUMN) {
    console.warn(
      `[store] post_metrics is missing a column (${error.message}). ` +
        `Serving public metrics only — apply the pending migration in supabase/migrations.`,
    );
    ({ data, error } = await query(POST_COLUMNS_BASE));
  }
  if (error) throw new Error(`post_metrics read failed: ${error.message}`);

  return ((data ?? []) as PostRow[]).map((row) => {
    const insight = insightOf(row);
    return {
      platform,
      postId: row.post_id,
      ...(row.url ? { url: row.url } : {}),
      caption: row.caption ?? "",
      format: (row.format ?? "image") as PostRecord["format"],
      publishedAt: row.published_at ?? new Date(0).toISOString(),
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      shares: row.shares,
      pinned: row.pinned === true,
      ...(insight ? { insight } : {}),
      ...(row.content_lane ? { contentLane: row.content_lane } : {}),
    };
  });
}

/** Newest successful sync for a platform, or null if none has ever run. */
export async function lastSyncAt(platform: PlatformId): Promise<string | null> {
  const { data, error } = await db()
    .from("sync_runs")
    .select("started_at")
    .eq("platform", platform)
    .eq("status", "ok")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`sync_runs read failed: ${error.message}`);
  return (data as { started_at: string } | null)?.started_at ?? null;
}

/** True when this Apify run has already been ingested — keeps schedule polling idempotent. */
export async function runAlreadyIngested(apifyRunId: string): Promise<boolean> {
  const { data, error } = await db()
    .from("sync_runs")
    .select("id")
    .eq("apify_run_id", apifyRunId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`sync_runs lookup failed: ${error.message}`);
  return data !== null;
}

function toSnapshot(row: SnapshotRow): AccountSnapshot {
  return {
    handle: row.handle,
    displayName: row.display_name ?? row.handle,
    ...(row.headline ? { headline: row.headline } : {}),
    followers: row.followers ?? 0,
    ...(row.following !== null ? { following: row.following } : {}),
    ...(row.posts_count !== null ? { postsCount: row.posts_count } : {}),
    capturedAt: row.captured_at,
  };
}

/** One cached analysis per platform; regenerating replaces it. */
export async function saveAnalysis(platform: PlatformId, analysis: AiAnalysis): Promise<void> {
  const { error } = await db()
    .from("ai_analyses")
    .upsert(
      {
        platform,
        payload: analysis,
        model: analysis.model || null,
        generated_at: analysis.generatedAt,
      },
      { onConflict: "platform" },
    );
  if (error) throw new Error(`ai_analyses upsert failed: ${error.message}`);
}

export async function readAnalysis(platform: PlatformId): Promise<AiAnalysis | null> {
  const { data, error } = await db()
    .from("ai_analyses")
    .select("payload")
    .eq("platform", platform)
    .maybeSingle();
  if (error) throw new Error(`ai_analyses read failed: ${error.message}`);
  return (data as { payload: AiAnalysis } | null)?.payload ?? null;
}

interface SuggestedIdeaRow {
  id: string;
}

/**
 * Persists every idea a generation produces, append-only — this table is the
 * feedback loop's memory, and unlike ai_analyses it must never be overwritten
 * by the next regeneration.
 *
 * Returns the ideas with `id` replaced by the row each was actually stored
 * under. The model's own id is a kebab-case slug meant only to keep it
 * internally consistent; it is not guaranteed unique across generations and
 * cannot be looked up later. The database id can be, and "I filmed this one"
 * has to send back something that still resolves to a row next week.
 */
export async function saveSuggestedIdeas(
  platform: PlatformId,
  ideas: ContentIdea[],
): Promise<ContentIdea[]> {
  if (!ideas.length) return ideas;

  const base = ideas.map((idea) => ({
    platform,
    hook: idea.hook,
    format: idea.format,
    shot_list: idea.shots ?? [],
    // {} rather than null: until 0010 runs, the column is still NOT NULL, and a
    // LinkedIn written format has no production brief to store.
    production: idea.production ?? {},
    why_now: idea.whyNow,
    winning_trait: idea.winningTrait,
    content_lane: idea.contentLane || null,
    source_signal: idea.sourceSignal,
    status: "suggested",
  }));
  // 0010: the whole script, its features, and the real article it was built on.
  // These are what let the loop learn which SCRIPT shape won, not just which hook.
  const rows = base.map((row, index) => {
    const idea = ideas[index] as ContentIdea;
    return {
      ...row,
      payload: idea,
      script_features: scriptFeatures(idea),
      source_item_id: idea.source?.verified ? (idea.source.sourceId ?? null) : null,
    };
  });

  let { data, error } = await db().from("suggested_ideas").insert(rows).select("id");
  if (error && schemaNotReady(error)) {
    console.warn(
      "[store] 0010 not applied — saving ideas without script or source; run the migration.",
    );
    ({ data, error } = await db().from("suggested_ideas").insert(base).select("id"));
  }
  if (error) throw new Error(`suggested_ideas insert failed: ${error.message}`);

  const ids = (data as SuggestedIdeaRow[]).map((row) => row.id);
  return ideas.map((idea, index) => ({
    ...idea,
    id: ids[index] ?? idea.id,
    status: "suggested" as const,
  }));
}

/**
 * Links a suggestion to the real post made from it.
 *
 * Takes an already-extracted shortcode, not a raw permalink — the caller
 * extracts it with the same shortcodeOf() the Graph adapter uses to match
 * Apify posts, so "the post this idea became" and "the post Graph measured"
 * are guaranteed to agree on what identifies a post. Kept out of this file so
 * the storage layer has no dependency on the graph module.
 */
export async function markIdeaUsed(id: string, shortcode: string): Promise<void> {
  const { error } = await db()
    .from("suggested_ideas")
    .update({
      status: "used",
      published_shortcode: shortcode,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`suggested_ideas update failed: ${error.message}`);
}

/** The stable lane vocabulary for one account, or null if never derived. */
export async function readTaxonomy(
  platform: PlatformId,
  handle: string,
): Promise<ContentLane[] | null> {
  const { data, error } = await db()
    .from("content_taxonomy")
    .select("lanes")
    .eq("platform", platform)
    .eq("handle", handle)
    .maybeSingle();
  if (error) throw new Error(`content_taxonomy read failed: ${error.message}`);
  return (data as { lanes: ContentLane[] } | null)?.lanes ?? null;
}

export async function saveTaxonomy(
  platform: PlatformId,
  handle: string,
  lanes: ContentLane[],
): Promise<void> {
  const { error } = await db()
    .from("content_taxonomy")
    .upsert(
      { platform, handle, lanes, generated_at: new Date().toISOString() },
      { onConflict: "platform,handle" },
    );
  if (error) throw new Error(`content_taxonomy upsert failed: ${error.message}`);
}

/**
 * Writes lane assignments onto already-stored posts.
 *
 * Updated one at a time rather than upserted in bulk on purpose: an upsert
 * carrying only (platform, post_id, content_lane) would null every other column
 * on the row, which is the same trap that once wiped reach and watch time off
 * every post the Graph window did not cover.
 */
export async function savePostLanes(
  platform: PlatformId,
  assignments: Array<{ postId: string; lane: string }>,
): Promise<number> {
  let written = 0;
  for (const { postId, lane } of assignments) {
    const { error } = await db()
      .from("post_metrics")
      .update({ content_lane: lane })
      .eq("platform", platform)
      .eq("post_id", postId);
    if (error) throw new Error(`post_metrics lane update failed: ${error.message}`);
    written += 1;
  }
  return written;
}

/** One past suggestion that a creator linked to a real published post. */
export interface UsedSuggestion {
  id: string;
  hook: string;
  whyNow: string;
  winningTrait: string;
  contentLane: string | null;
  sourceSignal: string | null;
  publishedShortcode: string;
  createdAt: string;
  format: string;
  /**
   * The script's shape. Read from the stored features where 0010 saved them,
   * otherwise recomputed from the shot list every row has always carried — so
   * suggestions filmed before this existed still count toward "which script
   * shape wins".
   */
  features: ScriptFeatures;
  /** Shot types in order, or section headings — the skeleton of the script. */
  outline: string[];
}

interface UsedRow {
  id: string;
  hook: string;
  why_now: string;
  winning_trait: string;
  content_lane: string | null;
  source_signal: string | null;
  published_shortcode: string;
  created_at: string;
  format: string | null;
  shot_list: Array<{ shotType?: string; voiceover?: string; onScreenText?: string }> | null;
  production: { durationSeconds?: number } | null;
  script_features?: ScriptFeatures | null;
  payload?: ContentIdea | null;
}

export async function readUsedSuggestions(platform: PlatformId): Promise<UsedSuggestion[]> {
  const columns =
    "id,hook,why_now,winning_trait,content_lane,source_signal,published_shortcode,created_at,format,shot_list,production";
  const query = (select: string) =>
    db()
      .from("suggested_ideas")
      .select(select)
      .eq("platform", platform)
      .eq("status", "used")
      .not("published_shortcode", "is", null)
      .order("created_at", { ascending: false })
      .limit(60);

  let { data, error } = await query(`${columns},script_features,payload`);
  if (error && schemaNotReady(error)) ({ data, error } = await query(columns));
  if (error) throw new Error(`suggested_ideas read failed: ${error.message}`);

  return ((data ?? []) as UsedRow[]).map((row) => {
    const payload = row.payload ?? null;
    const format = row.format ?? payload?.format ?? "reel";
    const features =
      row.script_features ??
      scriptFeatures(
        payload ?? {
          format,
          hook: row.hook,
          shots: row.shot_list ?? [],
          production: row.production ?? null,
        },
      );
    const outline = payload?.post?.sections?.length
      ? payload.post.sections.map((section) => section.heading)
      : (payload?.shots ?? row.shot_list ?? []).map((shot) => shot.shotType ?? "").filter(Boolean);

    return {
      id: row.id,
      hook: row.hook,
      whyNow: row.why_now,
      winningTrait: row.winning_trait,
      contentLane: row.content_lane,
      sourceSignal: row.source_signal,
      publishedShortcode: row.published_shortcode,
      createdAt: row.created_at,
      format,
      features,
      outline,
    };
  });
}

/**
 * Finds one stored post by the identifier parsed from its permalink.
 *
 * Queries post_metrics directly rather than going through readPosts, which caps
 * at 60 rows — at roughly five posts a week that window closes after about
 * eleven weeks, and an outcome capture that inherited the cap would silently
 * stop finding exactly the older posts it most needs.
 */
export async function findPostByLink(
  platform: PlatformId,
  match: "postId" | "urlContains",
  value: string,
): Promise<PostRecord | null> {
  const query = db().from("post_metrics").select(POST_COLUMNS).eq("platform", platform);
  const { data, error } =
    match === "postId"
      ? await query.eq("post_id", value).maybeSingle()
      : await query.ilike("url", `%${value}%`).limit(1).maybeSingle();

  if (error) throw new Error(`post_metrics lookup failed: ${error.message}`);
  const row = data as PostRow | null;
  if (!row) return null;

  const insight = insightOf(row);
  return {
    platform,
    postId: row.post_id,
    ...(row.url ? { url: row.url } : {}),
    caption: row.caption ?? "",
    format: (row.format ?? "image") as PostRecord["format"],
    publishedAt: row.published_at ?? new Date(0).toISOString(),
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    pinned: row.pinned === true,
    ...(insight ? { insight } : {}),
    ...(row.content_lane ? { contentLane: row.content_lane } : {}),
  };
}

/** One frozen measurement of a published suggestion. */
export interface OutcomeRow {
  suggestionId: string;
  platform: PlatformId;
  postId: string;
  publishedShortcode: string;
  publishedAt: string | null;
  measuredAt: string;
  maturityDays: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  reach: number | null;
  saved: number | null;
  avgWatchMs: number | null;
  vsMedian: number | null;
  baselineMedian: number | null;
  saveRatePct: number | null;
  shareRatePct: number | null;
  contentLane: string | null;
  excludedReason: string | null;
  /** 0010 — the client's goal metric this outcome was graded on. */
  goalMetric: string | null;
  goalVsMedian: number | null;
  /** What the verdict actually rests on: the goal metric, or the fallback when it was not measured. */
  gradedOn: string | null;
  /** 'graph' or 'public' — where the view count came from. */
  viewsSource: string | null;
}

/**
 * Appends one measurement. A duplicate (same suggestion, same maturity) is not
 * an error — it means another sync already captured this reading, and the first
 * one taken is the one to keep.
 */
export async function saveOutcome(outcome: OutcomeRow): Promise<boolean> {
  const row = {
    suggestion_id: outcome.suggestionId,
    platform: outcome.platform,
    post_id: outcome.postId,
    published_shortcode: outcome.publishedShortcode,
    published_at: outcome.publishedAt,
    measured_at: outcome.measuredAt,
    maturity_days: outcome.maturityDays,
    views: outcome.views,
    likes: outcome.likes,
    comments: outcome.comments,
    shares: outcome.shares,
    reach: outcome.reach,
    saved: outcome.saved,
    avg_watch_ms: outcome.avgWatchMs,
    vs_median: outcome.vsMedian,
    baseline_median: outcome.baselineMedian,
    save_rate_pct: outcome.saveRatePct,
    share_rate_pct: outcome.shareRatePct,
    content_lane: outcome.contentLane,
    excluded_reason: outcome.excludedReason,
  };
  let { error } = await db()
    .from("outcomes")
    .insert({
      ...row,
      goal_metric: outcome.goalMetric,
      goal_vs_median: outcome.goalVsMedian,
      graded_on: outcome.gradedOn,
      views_source: outcome.viewsSource,
    });
  if (error && schemaNotReady(error)) {
    // Before 0010 the goal grading cannot be stored, but the raw reading still
    // can — and the goal multiple is recomputable later from what is stored.
    ({ error } = await db().from("outcomes").insert(row));
  }

  // 23505 is unique_violation — already captured, which is the normal path on
  // every sync after the first.
  if (error && (error as { code?: string }).code !== "23505") {
    throw new Error(`outcomes insert failed: ${error.message}`);
  }
  return !error;
}

export async function readOutcomes(platform: PlatformId): Promise<OutcomeRow[]> {
  const { data, error } = await db()
    .from("outcomes")
    .select("*")
    .eq("platform", platform)
    .order("measured_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`outcomes read failed: ${error.message}`);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  return ((data ?? []) as any[]).map((row) => ({
    suggestionId: row.suggestion_id,
    platform: row.platform,
    postId: row.post_id,
    publishedShortcode: row.published_shortcode,
    publishedAt: row.published_at,
    measuredAt: row.measured_at,
    maturityDays: row.maturity_days,
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    reach: row.reach,
    saved: row.saved,
    avgWatchMs: row.avg_watch_ms,
    vsMedian: row.vs_median === null ? null : Number(row.vs_median),
    baselineMedian: row.baseline_median === null ? null : Number(row.baseline_median),
    saveRatePct: row.save_rate_pct === null ? null : Number(row.save_rate_pct),
    shareRatePct: row.share_rate_pct === null ? null : Number(row.share_rate_pct),
    contentLane: row.content_lane,
    excludedReason: row.excluded_reason,
    goalMetric: row.goal_metric ?? null,
    goalVsMedian:
      row.goal_vs_median === null || row.goal_vs_median === undefined
        ? null
        : Number(row.goal_vs_median),
    gradedOn: row.graded_on ?? null,
    viewsSource: row.views_source ?? null,
  }));
}

export async function markIdeaDismissed(id: string): Promise<void> {
  const { error } = await db()
    .from("suggested_ideas")
    .update({ status: "dismissed", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`suggested_ideas update failed: ${error.message}`);
}

/**
 * Handles discovered automatically. Replaces the whole list per platform: a
 * rediscovery is a fresh answer, not an addition to the old one.
 */
export async function saveWatchlist(platform: PlatformId, handles: string[]): Promise<void> {
  const { error: deleteError } = await db()
    .from("competitor_watchlist")
    .delete()
    .eq("platform", platform);
  if (deleteError) throw new Error(`watchlist clear failed: ${deleteError.message}`);
  if (!handles.length) return;

  const { error } = await db()
    .from("competitor_watchlist")
    .insert(handles.map((handle) => ({ platform, handle })));
  if (error) throw new Error(`watchlist insert failed: ${error.message}`);
}

export async function readWatchlist(platform: PlatformId): Promise<string[]> {
  const { data, error } = await db()
    .from("competitor_watchlist")
    .select("handle")
    .eq("platform", platform);
  if (error) throw new Error(`watchlist read failed: ${error.message}`);
  return ((data ?? []) as Array<{ handle: string }>).map((row) => row.handle);
}

// ---------------------------------------------------------------------------
// Layer 4 — predictions and fitted niche models
// ---------------------------------------------------------------------------

export interface PredictionRow {
  suggestionId: string;
  platform: PlatformId;
  niche: string;
  modelVersion: string;
  mode: "cold_start" | "calibrated";
  contentLane: string | null;
  format: string | null;
  durationSeconds: number | null;
  features: Record<string, unknown>;
  laneVsMedian: number | null;
  laneSaveRateVsMedian: number | null;
  laneWatchVsMedian: number | null;
  laneDirectional: boolean | null;
  baselineMedian: number | null;
  predictedMetric: "views" | "saves" | "shares" | null;
  predictedLow: number | null;
  predictedHigh: number | null;
  intervalPct: number | null;
  createdAt?: string;
}

export interface NicheModelRow {
  platform: PlatformId;
  niche: string;
  modelVersion: string;
  calibrated: boolean;
  outcomeCount: number;
  coverage: number | null;
  targetIntervalPct: number | null;
  coefficients: Record<string, unknown>;
  note: string;
  fittedAt?: string;
}

/**
 * One prediction per suggestion, written when the suggestion is made.
 *
 * A duplicate is not an error: 23505 means this suggestion was already
 * predicted, and the original stands. Overwriting it would let a later, better
 * informed model quietly rewrite what it "predicted" before the fact, which
 * destroys the only thing these rows are for.
 */
export async function savePrediction(row: PredictionRow): Promise<boolean> {
  const { error } = await db().from("predictions").insert({
    suggestion_id: row.suggestionId,
    platform: row.platform,
    niche: row.niche,
    model_version: row.modelVersion,
    mode: row.mode,
    content_lane: row.contentLane,
    format: row.format,
    duration_seconds: row.durationSeconds,
    features: row.features,
    lane_vs_median: row.laneVsMedian,
    lane_save_rate_vs_median: row.laneSaveRateVsMedian,
    lane_watch_vs_median: row.laneWatchVsMedian,
    lane_directional: row.laneDirectional,
    baseline_median: row.baselineMedian,
    predicted_metric: row.predictedMetric,
    predicted_low: row.predictedLow,
    predicted_high: row.predictedHigh,
    interval_pct: row.intervalPct,
  });

  if (error && (error as { code?: string }).code !== "23505") {
    throw new Error(`predictions insert failed: ${error.message}`);
  }
  return !error;
}

export async function readPredictions(platform: PlatformId): Promise<PredictionRow[]> {
  const { data, error } = await db()
    .from("predictions")
    .select("*")
    .eq("platform", platform)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`predictions read failed: ${error.message}`);

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    suggestionId: String(row["suggestion_id"]),
    platform,
    niche: String(row["niche"] ?? ""),
    modelVersion: String(row["model_version"] ?? ""),
    mode: (row["mode"] === "calibrated" ? "calibrated" : "cold_start") as PredictionRow["mode"],
    contentLane: (row["content_lane"] as string | null) ?? null,
    format: (row["format"] as string | null) ?? null,
    durationSeconds: (row["duration_seconds"] as number | null) ?? null,
    features: (row["features"] as Record<string, unknown>) ?? {},
    laneVsMedian: (row["lane_vs_median"] as number | null) ?? null,
    laneSaveRateVsMedian: (row["lane_save_rate_vs_median"] as number | null) ?? null,
    laneWatchVsMedian: (row["lane_watch_vs_median"] as number | null) ?? null,
    laneDirectional: (row["lane_directional"] as boolean | null) ?? null,
    baselineMedian: (row["baseline_median"] as number | null) ?? null,
    predictedMetric: (row["predicted_metric"] as PredictionRow["predictedMetric"]) ?? null,
    predictedLow: (row["predicted_low"] as number | null) ?? null,
    predictedHigh: (row["predicted_high"] as number | null) ?? null,
    intervalPct: (row["interval_pct"] as number | null) ?? null,
    createdAt: String(row["created_at"] ?? ""),
  }));
}

export async function saveNicheModel(row: NicheModelRow): Promise<void> {
  const { error } = await db().from("niche_models").upsert(
    {
      platform: row.platform,
      niche: row.niche,
      model_version: row.modelVersion,
      calibrated: row.calibrated,
      outcome_count: row.outcomeCount,
      coverage: row.coverage,
      target_interval_pct: row.targetIntervalPct,
      coefficients: row.coefficients,
      note: row.note,
      fitted_at: new Date().toISOString(),
    },
    { onConflict: "platform,niche" },
  );
  if (error) throw new Error(`niche_models upsert failed: ${error.message}`);
}

export async function readNicheModel(
  platform: PlatformId,
  niche: string,
): Promise<NicheModelRow | null> {
  const { data, error } = await db()
    .from("niche_models")
    .select("*")
    .eq("platform", platform)
    .eq("niche", niche)
    .maybeSingle();
  if (error) throw new Error(`niche_models read failed: ${error.message}`);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    platform,
    niche,
    modelVersion: String(row["model_version"] ?? ""),
    calibrated: Boolean(row["calibrated"]),
    outcomeCount: Number(row["outcome_count"] ?? 0),
    coverage: (row["coverage"] as number | null) ?? null,
    targetIntervalPct: (row["target_interval_pct"] as number | null) ?? null,
    coefficients: (row["coefficients"] as Record<string, unknown>) ?? {},
    note: String(row["note"] ?? ""),
    fittedAt: String(row["fitted_at"] ?? ""),
  };
}

/** One idea this system has proposed before, whatever became of it. */
export interface PriorSuggestion {
  hook: string;
  contentLane: string | null;
  winningTrait: string;
  status: string;
  createdAt: string;
}

/**
 * Every idea recently suggested, regardless of status.
 *
 * Deliberately NOT filtered to 'used' the way readUsedSuggestions is. That one
 * answers "what did we learn from advice that was acted on"; this one answers
 * "what have we already said", and an idea the creator never filmed is still an
 * idea they have already been handed. Without this the strategist has no memory
 * across runs and re-proposes the same subjects indefinitely.
 */
export async function readRecentSuggestions(
  platform: PlatformId,
  limit = 40,
): Promise<PriorSuggestion[]> {
  const { data, error } = await db()
    .from("suggested_ideas")
    .select("hook,content_lane,winning_trait,status,created_at")
    .eq("platform", platform)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`suggested_ideas read failed: ${error.message}`);

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    hook: String(row["hook"] ?? ""),
    contentLane: (row["content_lane"] as string | null) ?? null,
    winningTrait: String(row["winning_trait"] ?? ""),
    status: String(row["status"] ?? "suggested"),
    createdAt: String(row["created_at"] ?? ""),
  }));
}

/** A subject this account has already published. */
export interface PublishedSubject {
  /** The caption's opening — enough to recognise the subject. */
  opening: string;
  publishedAt: string;
  contentLane: string | null;
}

/**
 * Every post ever stored for this account, as subjects.
 *
 * Deliberately separate from readPosts, which caps at 60 because it carries
 * whole records for metric computation. This one carries a caption fragment and
 * a date, so the full history fits comfortably — and the full history is the
 * point: the strategist cannot avoid repeating a subject it has never been
 * shown. A 60-row window meant anything older was invisible and got proposed
 * again as though it were new.
 */
export async function readPublishedSubjects(
  platform: PlatformId,
  handle: string,
  limit = 500,
): Promise<PublishedSubject[]> {
  const { data, error } = await db()
    .from("post_metrics")
    .select("caption,published_at,content_lane")
    .eq("platform", platform)
    .eq("handle", handle)
    .order("published_at", { ascending: false })
    .limit(limit);

  // 42703 is undefined_column — content_lane predates its migration on some
  // installs, and a missing lane must not cost the whole history.
  if (error && (error as { code?: string }).code === "42703") {
    const fallback = await db()
      .from("post_metrics")
      .select("caption,published_at")
      .eq("platform", platform)
      .eq("handle", handle)
      .order("published_at", { ascending: false })
      .limit(limit);
    if (fallback.error)
      throw new Error(`published subjects read failed: ${fallback.error.message}`);
    return ((fallback.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      opening: String(row["caption"] ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120),
      publishedAt: String(row["published_at"] ?? "").slice(0, 10),
      contentLane: null,
    }));
  }
  if (error) throw new Error(`published subjects read failed: ${error.message}`);

  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((row) => ({
      opening: String(row["caption"] ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120),
      publishedAt: String(row["published_at"] ?? "").slice(0, 10),
      contentLane: (row["content_lane"] as string | null) ?? null,
    }))
    .filter((entry) => entry.opening.length > 0);
}

/** The managed client and its growth objective (Addendum A.1). */
export interface ClientRecord {
  id: string;
  displayName: string;
  niche: string | null;
  engagementStart: string | null;
  growthGoal: "grow_following" | "drive_leads" | "maximize_reach" | "build_authority";
  primaryMetric: string;
  secondaryMetrics: string[];
  target: Record<string, unknown> | null;
}

/**
 * The single managed client.
 *
 * Returns null when the clients table does not exist yet (migration 0008
 * unapplied) or is empty, so every caller falls back to the goal-less behaviour
 * rather than failing. Multi-client selection replaces this function; until
 * then "the client" is unambiguous.
 */
export async function readClient(): Promise<ClientRecord | null> {
  const { data, error } = await db()
    .from("clients")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    id: String(row["id"]),
    displayName: String(row["display_name"] ?? ""),
    niche: (row["niche"] as string | null) ?? null,
    engagementStart: (row["engagement_start"] as string | null) ?? null,
    growthGoal: (row["growth_goal"] as ClientRecord["growthGoal"]) ?? "grow_following",
    primaryMetric: String(row["primary_metric"] ?? "follower_growth_rate"),
    secondaryMetrics: (row["secondary_metrics"] as string[]) ?? [],
    target: (row["target"] as Record<string, unknown> | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Addendum B — people, assignments, and the suggestion lifecycle
// ---------------------------------------------------------------------------

export interface UserRow {
  id: string;
  name: string;
  email: string | null;
  role: Role;
}

export async function readUsers(): Promise<UserRow[]> {
  const { data, error } = await db().from("users").select("*").order("name");
  if (error) return [];
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row["id"]),
    name: String(row["name"] ?? ""),
    email: (row["email"] as string | null) ?? null,
    role: (row["role"] as Role) ?? "creator",
  }));
}

export async function saveUser(name: string, role: Role, email?: string): Promise<string | null> {
  const { data, error } = await db()
    .from("users")
    .insert({ name, role, email: email ?? null })
    .select("id")
    .single();
  if (error) throw new Error(`users insert failed: ${error.message}`);
  return data ? String((data as Record<string, unknown>)["id"]) : null;
}

/** Which clients this user works, and in what role (B.6/B.7). */
export async function readAssignments(
  userId: string,
): Promise<Array<{ clientId: string; role: Role }>> {
  const { data, error } = await db()
    .from("client_assignments")
    .select("client_id,role")
    .eq("user_id", userId);
  if (error) return [];
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    clientId: String(row["client_id"]),
    role: (row["role"] as Role) ?? "creator",
  }));
}

export async function assignUser(clientId: string, userId: string, role: Role): Promise<void> {
  const { error } = await db()
    .from("client_assignments")
    .upsert(
      { client_id: clientId, user_id: userId, role },
      { onConflict: "client_id,user_id,role" },
    );
  if (error) throw new Error(`client_assignments upsert failed: ${error.message}`);
}

/** One suggestion as a queue row — enough to triage, not the whole script. */
export interface QueueItem {
  id: string;
  platform: PlatformId;
  hook: string;
  whyNow: string;
  winningTrait: string;
  contentLane: string | null;
  sourceSignal: string | null;
  status: IdeaStatus;
  createdAt: string;
  approvedAt: string | null;
  productionAt: string | null;
  publishedShortcode: string | null;
  assignedTo: string | null;
}

/** The lifecycle queue, newest first. Filtered by status so each role gets its own. */
export async function readQueue(statuses: IdeaStatus[], limit = 60): Promise<QueueItem[]> {
  const { data, error } = await db()
    .from("suggested_ideas")
    .select(
      "id,platform,hook,why_now,winning_trait,content_lane,source_signal,status," +
        "created_at,approved_at,production_at,published_shortcode,assigned_to",
    )
    .in("status", statuses)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`queue read failed: ${error.message}`);

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row["id"]),
    platform: (row["platform"] as PlatformId) ?? "instagram",
    hook: String(row["hook"] ?? ""),
    whyNow: String(row["why_now"] ?? ""),
    winningTrait: String(row["winning_trait"] ?? ""),
    contentLane: (row["content_lane"] as string | null) ?? null,
    sourceSignal: (row["source_signal"] as string | null) ?? null,
    status: (row["status"] as IdeaStatus) ?? "suggested",
    createdAt: String(row["created_at"] ?? ""),
    approvedAt: (row["approved_at"] as string | null) ?? null,
    productionAt: (row["production_at"] as string | null) ?? null,
    publishedShortcode: (row["published_shortcode"] as string | null) ?? null,
    assignedTo: (row["assigned_to"] as string | null) ?? null,
  }));
}

/**
 * Moves one suggestion through the lifecycle, recording who and when (B.3).
 *
 * The permission check lives in the caller (the server function), which knows
 * the acting role; this writes only what it is told. The `eq("status", from)`
 * is the important part: it makes the write conditional on the state the caller
 * believed it was acting on, so two people approving the same idea at once
 * cannot both succeed and produce contradictory timestamps.
 */
export async function transitionIdea(
  id: string,
  from: IdeaStatus,
  to: IdeaStatus,
  actorId: string | null,
  extras: { shortcode?: string } = {},
): Promise<boolean> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: to, updated_at: now };

  if (to === "approved") {
    patch["approved_at"] = now;
    patch["approved_by"] = actorId;
  }
  if (to === "in_production") {
    patch["production_at"] = now;
    patch["assigned_to"] = actorId;
  }
  if (to === "used" || to === "published") {
    patch["published_at"] = now;
    patch["produced_by"] = actorId;
    if (extras.shortcode) patch["published_shortcode"] = extras.shortcode;
  }

  const { data, error } = await db()
    .from("suggested_ideas")
    .update(patch)
    .eq("id", id)
    .eq("status", from)
    .select("id");
  if (error) throw new Error(`suggested_ideas transition failed: ${error.message}`);

  // No row matched: someone else moved it first. Not an error, but not a
  // success either — the caller re-reads rather than reporting a change it did
  // not make.
  return ((data ?? []) as unknown[]).length > 0;
}

// ---------------------------------------------------------------------------
// Addendum C — trend observations and computed signals
// ---------------------------------------------------------------------------

export interface TrendObservationRow {
  niche: string;
  platform: PlatformId | null;
  kind: TrendKind;
  label: string;
  strength: number | null;
  fromQuery: string | null;
  evidence: unknown[];
}

/** Append-only: the history IS the trend. Never upserted. */
export async function saveTrendObservations(rows: TrendObservationRow[]): Promise<number> {
  if (!rows.length) return 0;
  const { error } = await db()
    .from("trend_observations")
    .insert(
      rows.map((row) => ({
        niche: row.niche,
        platform: row.platform,
        kind: row.kind,
        label: row.label,
        strength: row.strength,
        from_query: row.fromQuery,
        evidence: row.evidence,
      })),
    );
  if (error) throw new Error(`trend_observations insert failed: ${error.message}`);
  return rows.length;
}

export async function readTrendObservations(
  niche: string,
  limit = 1000,
): Promise<TrendObservation[]> {
  const { data, error } = await db()
    .from("trend_observations")
    .select("label,kind,strength,observed_at,evidence")
    .eq("niche", niche)
    .order("observed_at", { ascending: true })
    .limit(limit);
  if (error) return [];
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    label: String(row["label"] ?? ""),
    kind: (row["kind"] as TrendKind) ?? "topic",
    strength: Number(row["strength"] ?? 0),
    observedAt: String(row["observed_at"] ?? ""),
    evidence: Array.isArray(row["evidence"]) ? (row["evidence"] as string[]) : [],
  }));
}

/** Replace-per-trend: this table holds the CURRENT state, not history. */
export async function saveTrendSignals(niche: string, signals: TrendSignal[]): Promise<void> {
  if (!signals.length) return;
  const { error } = await db()
    .from("trend_signals")
    .upsert(
      signals.map((s) => ({
        niche,
        label: s.label,
        kind: s.kind,
        first_seen: s.firstSeen,
        last_seen: s.lastSeen,
        observations: s.observations,
        latest_strength: s.latestStrength,
        previous_strength: s.previousStrength,
        momentum: s.momentum,
        directional: s.directional,
        evidence: s.evidence,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "niche,label" },
    );

  // 42703 / PGRST204: the evidence column predates migration 0009 on this
  // install. Retry without it rather than losing the whole run — the same
  // fallback readPosts uses for graph_views. Momentum is the valuable part;
  // evidence links are an enhancement and must not take the run down with them.
  const code = (error as { code?: string } | null)?.code;
  if (error && (code === "42703" || code === "PGRST204")) {
    console.warn(
      "[trends] trend_signals.evidence is missing — run migration 0009. Storing signals without evidence links.",
    );
    const { error: retry } = await db()
      .from("trend_signals")
      .upsert(
        signals.map((s) => ({
          niche,
          label: s.label,
          kind: s.kind,
          first_seen: s.firstSeen,
          last_seen: s.lastSeen,
          observations: s.observations,
          latest_strength: s.latestStrength,
          previous_strength: s.previousStrength,
          momentum: s.momentum,
          directional: s.directional,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "niche,label" },
      );
    if (retry) throw new Error(`trend_signals upsert failed: ${retry.message}`);
    return;
  }
  if (error) throw new Error(`trend_signals upsert failed: ${error.message}`);
}

export async function readTrendSignals(niche: string): Promise<TrendSignal[]> {
  const { data, error } = await db()
    .from("trend_signals")
    .select("*")
    .eq("niche", niche)
    .order("last_seen", { ascending: false })
    .limit(100);
  if (error) return [];
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const latest = Number(row["latest_strength"] ?? 0);
    const previous = row["previous_strength"] == null ? null : Number(row["previous_strength"]);
    return {
      label: String(row["label"] ?? ""),
      kind: (row["kind"] as TrendKind) ?? "topic",
      momentum: (row["momentum"] as TrendSignal["momentum"]) ?? "steady",
      observations: Number(row["observations"] ?? 0),
      firstSeen: String(row["first_seen"] ?? ""),
      lastSeen: String(row["last_seen"] ?? ""),
      latestStrength: latest,
      previousStrength: previous,
      changePct:
        previous != null && previous > 0
          ? Math.round(((latest - previous) / previous) * 100) / 100
          : null,
      directional: Boolean(row["directional"]),
      evidence: Array.isArray(row["evidence"]) ? (row["evidence"] as string[]) : [],
    };
  });
}

/**
 * Stamps the source signal on already-persisted suggestions.
 *
 * Needed because generateIdeas persists before the caller can label a batch as
 * trend-sourced. Without this the label would exist only in memory and the
 * learning loop could never separate trend-driven ideas from the rest — which
 * is the entire reason C.5 asks for the label.
 */
export async function setIdeaSourceSignal(
  ids: string[],
  signal: "owner" | "niche" | "niche_trend",
): Promise<number> {
  if (!ids.length) return 0;
  const { data, error } = await db()
    .from("suggested_ideas")
    .update({ source_signal: signal, updated_at: new Date().toISOString() })
    .in("id", ids)
    .select("id");
  if (error) throw new Error(`suggested_ideas source update failed: ${error.message}`);
  return ((data ?? []) as unknown[]).length;
}

// ---------------------------------------------------------------------------
// Real sources — fetched articles a topic may be built on (0010)
// ---------------------------------------------------------------------------

interface SourceRow {
  id: string;
  platform: PlatformId;
  url: string;
  title: string;
  publisher: string | null;
  publisher_url: string | null;
  published_at: string | null;
  query: string;
  lane: string | null;
  kind: "article" | "video";
  coverage: number;
  fetched_at: string;
}

const toSource = (row: SourceRow): SourceItem => ({
  id: row.id,
  platform: row.platform,
  url: row.url,
  title: row.title,
  publisher: row.publisher,
  publisherUrl: row.publisher_url,
  publishedAt: row.published_at,
  query: row.query,
  lane: row.lane,
  kind: row.kind,
  coverage: row.coverage ?? 1,
  fetchedAt: row.fetched_at,
});

/**
 * Upserts on (platform, url): refetching a story updates its coverage and
 * fetch time rather than duplicating it. Returns 0 — not an error — before
 * 0010 has been applied.
 */
export async function saveSourceItems(
  platform: PlatformId,
  items: Array<SourceDraft & { coverage: number }>,
): Promise<number> {
  if (!items.length) return 0;
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("source_items")
    .upsert(
      items.map((item) => ({
        platform,
        url: item.url,
        title: item.title,
        publisher: item.publisher,
        publisher_url: item.publisherUrl,
        published_at: item.publishedAt,
        query: item.query,
        lane: item.lane,
        kind: item.kind,
        coverage: item.coverage,
        fetched_at: now,
      })),
      { onConflict: "platform,url" },
    )
    .select("id");
  if (error && schemaNotReady(error)) return 0;
  if (error) throw new Error(`source_items upsert failed: ${error.message}`);
  return (data ?? []).length;
}

/** Stored sources published since `sinceIso`, newest first. Empty before 0010. */
export async function readSourceItems(
  platform: PlatformId,
  sinceIso: string,
  limit = 300,
): Promise<SourceItem[]> {
  const { data, error } = await db()
    .from("source_items")
    .select("*")
    .eq("platform", platform)
    .gte("published_at", sinceIso)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error && schemaNotReady(error)) return [];
  if (error) throw new Error(`source_items read failed: ${error.message}`);
  return ((data ?? []) as SourceRow[]).map(toSource);
}

/** Specific sources by id — how a verified idea's link is attached server-side. */
export async function readSourceItemsById(ids: string[]): Promise<SourceItem[]> {
  if (!ids.length) return [];
  const { data, error } = await db().from("source_items").select("*").in("id", ids);
  if (error && schemaNotReady(error)) return [];
  if (error) throw new Error(`source_items read failed: ${error.message}`);
  return ((data ?? []) as SourceRow[]).map(toSource);
}

/** Sources some suggestion has already been built on — so no story is handed out twice. */
export async function readUsedSourceIds(platform: PlatformId): Promise<string[]> {
  const { data, error } = await db()
    .from("suggested_ideas")
    .select("source_item_id")
    .eq("platform", platform)
    .not("source_item_id", "is", null)
    .limit(1000);
  if (error && schemaNotReady(error)) return [];
  if (error) throw new Error(`suggested_ideas source read failed: ${error.message}`);
  return ((data ?? []) as Array<{ source_item_id: string }>).map((row) => row.source_item_id);
}

/** When sources were last fetched for this platform, or null if never. */
export async function lastSourceFetch(platform: PlatformId): Promise<string | null> {
  const { data, error } = await db()
    .from("source_items")
    .select("fetched_at")
    .eq("platform", platform)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && schemaNotReady(error)) return null;
  if (error) throw new Error(`source_items read failed: ${error.message}`);
  return (data as { fetched_at: string } | null)?.fetched_at ?? null;
}
