// Storage for what every LinkedIn post taught (0036_linkedin_post_learning).
// Supabase only: without it, or before the migration is applied, reads are
// empty and the pass skips itself.
// Scoped: client-owned tables are read and written as the request's client.
import { supabaseAdmin } from "@/server/tenant/db";
import { NOT_FROM_THE_TOOL, type PostAnalysis, type PostLearningRow } from "@/lib/post-learning";
import type { ReelReview } from "@/lib/reel-learning-types";

import { hasDurableStore } from "../store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

/** Table missing (migration 0036 not applied yet) or a column missing. */
export function schemaNotReady(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code ?? "";
  return ["42703", "42P01", "PGRST204", "PGRST205"].includes(code);
}

export class PostLearningNotReady extends Error {
  constructor() {
    super("Learning from every LinkedIn post needs migration 0036_linkedin_post_learning.sql.");
  }
}

interface Row {
  post_id: string;
  post_url: string | null;
  published_at: string;
  format: string | null;
  analysis: PostAnalysis | null;
  analysed_at: string | null;
  review: ReelReview | null;
  worked: boolean | null;
  reviewed_at: string | null;
  cost_usd: number | string | null;
}

const fromRow = (row: Row): PostLearningRow => ({
  postId: row.post_id,
  postUrl: row.post_url,
  publishedAt: row.published_at,
  format: row.format,
  analysis: row.analysis,
  analysedAt: row.analysed_at,
  review: row.review,
  worked: row.worked,
  reviewedAt: row.reviewed_at,
  costUsd: Number(row.cost_usd ?? 0),
});

/**
 * Every stored row, newest post first, less the posts not from the tool
 * (NOT_FROM_THE_TOOL), so nothing reads them. Throws PostLearningNotReady before 0036.
 */
export async function readPostLearning(): Promise<PostLearningRow[]> {
  if (!hasDurableStore()) return [];
  const { data, error } = await db()
    .from("linkedin_post_learning")
    .select("*")
    .order("published_at", { ascending: false });
  if (error) {
    if (schemaNotReady(error)) throw new PostLearningNotReady();
    throw new Error(`linkedin_post_learning read failed: ${error.message}`);
  }
  return ((data ?? []) as Row[]).map(fromRow).filter((row) => !NOT_FROM_THE_TOOL.has(row.postId));
}

/**
 * Writes one post's row, adding `cost` to what it has cost so far. A call
 * that failed still records its cost, so a post that keeps failing stops
 * being retried (RETRY_LIMIT_USD).
 */
export async function savePostLearning(
  post: { postId: string; url: string | null; publishedAt: string; format: string | null },
  fields: Partial<Pick<Row, "analysis" | "analysed_at" | "review" | "worked" | "reviewed_at">>,
  cost: number,
): Promise<void> {
  if (!hasDurableStore()) return;
  const { data: existing, error: readError } = await db()
    .from("linkedin_post_learning")
    .select("cost_usd")
    .eq("post_id", post.postId)
    .maybeSingle();
  if (readError) {
    if (schemaNotReady(readError)) throw new PostLearningNotReady();
    throw new Error(`linkedin_post_learning read failed: ${readError.message}`);
  }
  const before = Number((existing as { cost_usd?: number | string } | null)?.cost_usd ?? 0);
  const { error } = await db()
    .from("linkedin_post_learning")
    .upsert(
      {
        post_id: post.postId,
        post_url: post.url,
        published_at: post.publishedAt,
        format: post.format,
        ...fields,
        cost_usd: Math.round((before + cost) * 1_000_000) / 1_000_000,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "post_id" },
    );
  if (error) {
    if (schemaNotReady(error)) throw new PostLearningNotReady();
    throw new Error(`linkedin_post_learning write failed: ${error.message}`);
  }
}
