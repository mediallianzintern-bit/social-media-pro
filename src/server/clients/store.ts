// What a Studio client's sync reads and writes beyond posts and snapshots
// (Studio Phase 5; migration 0038). Kept apart from Pritesh's store so none of
// his reads change: his runs have no client_id, his competitors are the
// 'competitor' role, and nothing here touches either.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AccountSnapshot, PlatformId } from "@/lib/analytics-types";

const db = () => supabaseAdmin as any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The role a client's competitors are stored under; Pritesh's readers never ask for it. */
export const CLIENT_COMPETITOR_ROLE = "client_competitor";

const notReady = (what: string, message: string) =>
  new Error(`${what} failed (${message}). Apply supabase/migrations/0038_client_sync.sql.`);

export async function readClientCompetitors(
  clientId: string,
  platform: PlatformId,
): Promise<string[]> {
  const { data, error } = await db()
    .from("client_competitors")
    .select("handle")
    .eq("client_id", clientId)
    .eq("platform", platform)
    .order("handle");
  if (error) throw notReady("Reading the client's competitors", error.message);
  return (data as Array<{ handle: string }>).map((row) => row.handle);
}

/** Before 0039 there is no `kind` column, and so no benchmarks. */
const noKindColumn = (message: string) => /\bkind\b/.test(message);

/**
 * The client's aspirational accounts (Studio spec §3.11), collected with its
 * competitors and labelled as benchmarks. Empty before 0039 is applied.
 */
export async function readClientBenchmarks(
  clientId: string,
  platform: PlatformId,
): Promise<string[]> {
  const { data, error } = await db()
    .from("client_competitors")
    .select("handle")
    .eq("client_id", clientId)
    .eq("platform", platform)
    .eq("kind", "benchmark")
    .order("handle");
  if (error) {
    if (noKindColumn(error.message)) return [];
    throw notReady("Reading the client's benchmarks", error.message);
  }
  return (data as Array<{ handle: string }>).map((row) => row.handle);
}

/**
 * Sets a client's Instagram competitors (peers) and aspirational accounts
 * (benchmarks) to exactly these handles. Before 0039 only the competitors
 * are saved, and the log says why.
 */
export async function replaceClientCompetitors(
  clientId: string,
  handles: string[],
  benchmarks: string[] = [],
): Promise<void> {
  const { error } = await db()
    .from("client_competitors")
    .delete()
    .eq("client_id", clientId)
    .eq("platform", "instagram");
  if (error) throw notReady("Clearing the client's competitors", error.message);
  const rows = [
    ...handles.map((handle) => ({ handle, kind: "peer" })),
    ...benchmarks.map((handle) => ({ handle, kind: "benchmark" })),
  ].map((row) => ({ client_id: clientId, platform: "instagram", ...row }));
  if (!rows.length) return;
  const { error: insertError } = await db().from("client_competitors").insert(rows);
  if (!insertError) return;
  if (!noKindColumn(insertError.message))
    throw notReady("Saving the client's competitors", insertError.message);
  console.warn(
    "[clients] aspirational accounts not saved: apply supabase/migrations/0039_client_benchmarks.sql.",
  );
  if (!handles.length) return;
  const { error: retryError } = await db()
    .from("client_competitors")
    .insert(handles.map((handle) => ({ client_id: clientId, platform: "instagram", handle })));
  if (retryError) throw notReady("Saving the client's competitors", retryError.message);
}

export async function recordClientRun(
  clientId: string,
  platform: PlatformId,
  trigger: "manual" | "schedule",
  apifyRunId: string | null,
): Promise<string | null> {
  const { data, error } = await db()
    .from("sync_runs")
    .insert({ platform, trigger, apify_run_id: apifyRunId, status: "ok", client_id: clientId })
    .select("id")
    .single();
  if (error) throw notReady("Recording the sync", error.message);
  return data?.id ?? null;
}

export async function recordClientFailure(
  clientId: string,
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
    client_id: clientId,
  });
  if (error) console.error(`[clients] could not record failed run: ${error.message}`);
}

/** The client's newest successful sync on a platform, or null if it has none. */
export async function lastClientSyncAt(
  clientId: string,
  platform: PlatformId,
): Promise<string | null> {
  const { data, error } = await db()
    .from("sync_runs")
    .select("started_at")
    .eq("client_id", clientId)
    .eq("platform", platform)
    .eq("status", "ok")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw notReady("Reading the client's last sync", error.message);
  return (data as { started_at: string } | null)?.started_at ?? null;
}

/** Newest snapshot of each of these client competitors. */
export async function clientCompetitorSnapshots(
  platform: PlatformId,
  handles: string[],
): Promise<AccountSnapshot[]> {
  if (!handles.length) return [];
  const { data, error } = await db()
    .from("account_snapshots")
    .select("handle,display_name,headline,followers,following,posts_count,captured_at")
    .eq("platform", platform)
    .eq("role", CLIENT_COMPETITOR_ROLE)
    .in("handle", handles)
    .order("captured_at", { ascending: false });
  if (error) throw notReady("Reading the client's competitors", error.message);
  const newest = new Map<string, Record<string, unknown>>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const handle = String(row["handle"]);
    if (!newest.has(handle)) newest.set(handle, row);
  }
  return [...newest.values()].map((row) => {
    const headline = row["headline"] as string | null;
    const following = row["following"] as number | null;
    const postsCount = row["posts_count"] as number | null;
    return {
      handle: String(row["handle"]),
      displayName: (row["display_name"] as string | null) ?? String(row["handle"]),
      ...(headline ? { headline } : {}),
      followers: (row["followers"] as number | null) ?? 0,
      ...(following !== null ? { following } : {}),
      ...(postsCount !== null ? { postsCount } : {}),
      capturedAt: String(row["captured_at"]),
    };
  });
}
