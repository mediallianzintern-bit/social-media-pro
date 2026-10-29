// The past scripts the writer is given as tone references (0030), read from
// the database. Empty before 0030 is applied or with none active, in which
// case scripts are written exactly as before. Free: stored rows only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { PlatformId } from "@/lib/analytics-types";
import type { ToneReference } from "@/lib/tone-references";

import { hasDurableStore } from "../store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

export async function readToneReferences(platform: PlatformId): Promise<ToneReference[]> {
  if (!hasDurableStore()) return [];
  const { data, error } = await db()
    .from("voice_references")
    .select("id,title,script,posted_at,lane")
    .eq("platform", platform)
    .eq("active", true);
  if (error) return [];
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row["id"]),
    title: String(row["title"]),
    script: String(row["script"]),
    postedAt: (row["posted_at"] as string | null) ?? null,
    lane: (row["lane"] as string | null) ?? null,
  }));
}

/**
 * Records the team's check on one script: does it sound like Pritesh? Kept on
 * the idea, beside the references that informed it, so which references make
 * scripts that sound right can be read later.
 */
export async function saveToneCheck(
  ideaId: string,
  verdict: "yes" | "no",
  note: string,
  by: string | null,
): Promise<boolean> {
  if (!hasDurableStore()) return false;
  const { data, error } = await db()
    .from("suggested_ideas")
    .select("payload")
    .eq("id", ideaId)
    .maybeSingle();
  if (error || !data?.payload) return false;
  const payload = {
    ...(data.payload as Record<string, unknown>),
    toneCheck: { verdict, note: note.trim(), by, at: new Date().toISOString() },
  };
  const { error: saveError } = await db()
    .from("suggested_ideas")
    .update({ payload })
    .eq("id", ideaId);
  return !saveError;
}
