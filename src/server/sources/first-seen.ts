// Which topics are new: first seen in the last day (0034_source_first_seen).
//
// Its own small read rather than another field on every stored source: only
// the topic list's order uses it. Empty, never an error, before the migration
// is applied or without Supabase, and the list is then ordered without a new
// group, exactly as before.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { PlatformId } from "@/lib/analytics-types";

import { hasDurableStore } from "../store";

/** A topic first seen this recently counts as new. */
export const NEW_TOPIC_HOURS = 24;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

/** Ids of the stories first seen in the last NEW_TOPIC_HOURS. */
export async function newSourceIds(platform: PlatformId, now = Date.now()): Promise<Set<string>> {
  if (!hasDurableStore()) return new Set();
  const since = new Date(now - NEW_TOPIC_HOURS * 3_600_000).toISOString();
  const { data, error } = await db()
    .from("source_items")
    .select("id")
    .eq("platform", platform)
    .gte("first_seen_at", since)
    .limit(3000);
  if (error) return new Set();
  return new Set(((data ?? []) as Array<{ id: string }>).map((row) => String(row.id)));
}
