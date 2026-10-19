// Storage for filmed reels (0020_reel_learning).
//
// Its own module rather than another block in store.supabase.ts: the table is
// read and written only by this feature. Supabase only; without a durable store
// there is nothing to learn across restarts, so every read is empty and every
// write is a no-op, and the drawer says the feature needs Supabase.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  ReelComparison,
  ReelLearning,
  ReelMatch,
  ReelReview,
  ReelUsage,
} from "@/lib/reel-learning-types";
import type { PlatformId } from "@/lib/analytics-types";

import { hasDurableStore } from "../store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

/** Table missing (migration 0020 not applied yet) or a column missing. */
function schemaNotReady(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code ?? "";
  return ["42703", "42P01", "PGRST204", "PGRST205"].includes(code);
}

export class ReelLearningNotReady extends Error {
  constructor() {
    super("Learning from filmed reels needs migration 0020_reel_learning.sql applied in Supabase.");
  }
}

interface Row {
  idea_id: string;
  platform: PlatformId;
  filmed_at: string;
  filmed_by: string | null;
  shortcode: string | null;
  reel_url: string | null;
  matched_at: string | null;
  match: ReelMatch | null;
  source_words: SourceWords | null;
  transcript: string | null;
  comparison: ReelComparison | null;
  usage: ReelUsage | null;
  analysed_at: string | null;
  review: ReelReview | null;
  worked: boolean | null;
  reviewed_at: string | null;
  cost_usd: number | string | null;
}

/** The source article's names and distinctive words, kept for matching. */
export interface SourceWords {
  names: string[];
  words: string[];
}

export type ReelLearningRow = Omit<ReelLearning, "publishedAt" | "reviewableAt"> & {
  costUsd: number;
  sourceWords: SourceWords | null;
};

function fromRow(row: Row): ReelLearningRow {
  return {
    ideaId: row.idea_id,
    platform: row.platform,
    filmedAt: row.filmed_at,
    filmedBy: row.filmed_by,
    shortcode: row.shortcode,
    reelUrl: row.reel_url,
    matchedAt: row.matched_at,
    match: row.match,
    sourceWords: row.source_words ?? null,
    transcript: row.transcript,
    comparison: row.comparison,
    usage: row.usage,
    analysedAt: row.analysed_at,
    review: row.review,
    worked: row.worked,
    reviewedAt: row.reviewed_at,
    costUsd: Number(row.cost_usd ?? 0),
  };
}

export async function readReelLearning(ideaId: string): Promise<ReelLearningRow | null> {
  if (!hasDurableStore()) return null;
  const { data, error } = await db()
    .from("reel_learning")
    .select("*")
    .eq("idea_id", ideaId)
    .maybeSingle();
  if (error && schemaNotReady(error)) return null;
  if (error) throw new Error(`reel_learning read failed: ${error.message}`);
  return data ? fromRow(data as Row) : null;
}

/** Every filmed idea for a platform, newest first. */
export async function readAllReelLearning(platform: PlatformId): Promise<ReelLearningRow[]> {
  if (!hasDurableStore()) return [];
  const { data, error } = await db()
    .from("reel_learning")
    .select("*")
    .eq("platform", platform)
    .order("filmed_at", { ascending: false })
    .limit(200);
  if (error && schemaNotReady(error)) return [];
  if (error) throw new Error(`reel_learning read failed: ${error.message}`);
  return ((data ?? []) as Row[]).map(fromRow);
}

/** Records "I filmed this". Pressing it again keeps the first time and person. */
export async function recordFilmed(
  ideaId: string,
  platform: PlatformId,
  filmedBy: string | null,
): Promise<void> {
  if (!hasDurableStore()) throw new ReelLearningNotReady();
  const { error } = await db()
    .from("reel_learning")
    .upsert(
      { idea_id: ideaId, platform, filmed_by: filmedBy },
      { onConflict: "idea_id", ignoreDuplicates: true },
    );
  if (error && schemaNotReady(error)) throw new ReelLearningNotReady();
  if (error) throw new Error(`reel_learning insert failed: ${error.message}`);
}

/** Writes some of a row's columns, and adds `cost` to what it has spent. */
export async function updateReelLearning(
  ideaId: string,
  patch: Partial<{
    shortcode: string | null;
    reel_url: string | null;
    matched_at: string | null;
    match: ReelMatch | null;
    source_words: SourceWords | null;
    transcript: string | null;
    comparison: ReelComparison | null;
    usage: ReelUsage | null;
    analysed_at: string | null;
    review: ReelReview | null;
    worked: boolean | null;
    reviewed_at: string | null;
  }>,
  cost = 0,
): Promise<void> {
  const current = await readReelLearning(ideaId);
  if (!current) throw new Error("That idea has not been marked filmed.");
  const { error } = await db()
    .from("reel_learning")
    .update({
      ...patch,
      cost_usd: current.costUsd + cost,
      updated_at: new Date().toISOString(),
    })
    .eq("idea_id", ideaId);
  if (error) throw new Error(`reel_learning update failed: ${error.message}`);
}

/** Shortcodes already linked to some idea, through this table or the older link. */
export async function linkedShortcodes(platform: PlatformId): Promise<Set<string>> {
  const taken = new Set<string>();
  if (!hasDurableStore()) return taken;
  const [learning, ideas] = await Promise.all([
    db().from("reel_learning").select("shortcode").eq("platform", platform),
    db()
      .from("suggested_ideas")
      .select("published_shortcode")
      .eq("platform", platform)
      .not("published_shortcode", "is", null),
  ]);
  for (const row of (learning.data ?? []) as Array<{ shortcode: string | null }>) {
    if (row.shortcode) taken.add(row.shortcode);
  }
  for (const row of (ideas.data ?? []) as Array<{ published_shortcode: string | null }>) {
    if (row.published_shortcode) taken.add(row.published_shortcode);
  }
  return taken;
}

/** When an idea was written: the start of the window its reel can appear in. */
export async function ideaCreatedAt(ideaId: string): Promise<string | null> {
  if (!hasDurableStore()) return null;
  const { data } = await db()
    .from("suggested_ideas")
    .select("created_at")
    .eq("id", ideaId)
    .maybeSingle();
  return (data as { created_at?: string } | null)?.created_at ?? null;
}

/**
 * Undoes the older link on an idea when its reel turns out to be the wrong
 * one, so the outcome capture does not score a reel about a different story.
 */
export async function unlinkIdea(ideaId: string): Promise<void> {
  if (!hasDurableStore()) return;
  const { error } = await db()
    .from("suggested_ideas")
    .update({
      status: "suggested",
      published_shortcode: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ideaId);
  if (error) throw new Error(`suggested_ideas unlink failed: ${error.message}`);
}
