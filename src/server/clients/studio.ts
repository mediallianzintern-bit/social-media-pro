// Reads the clients a manager has linked to Pro in Social Pulse Studio, and
// keeps Pro's `clients` table in step with them (Studio spec §5.2, §7.6).
//
// Studio is reached only through its server, at STUDIO_BRIDGE_URL, with the
// shared PRO_BRIDGE_SECRET. Pro never holds a Studio database key.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  planImport,
  studioClientsResponse,
  type ExistingClient,
  type ImportPlan,
  type StudioClient,
} from "@/lib/studio-clients";

import { replaceClientCompetitors } from "./store";

const TIMEOUT_MS = 15_000;

/**
 * The bridge version Pro speaks, sent on every call. Studio says its own on
 * every answer (Studio: src/lib/pro-bridge.ts, BRIDGE_VERSION); a Studio that
 * says none is version 1.
 *   1  clients, exports, lanes, performance, publications
 *   2  outcomes: a published post's 14-day result and lesson
 */
export const PRO_BRIDGE_VERSION = 2;
/** The first version that takes 14-day results. */
export const OUTCOMES_VERSION = 2;

/** Which bridge version a Studio answer came from. */
export function bridgeVersionOf(body: unknown): number {
  const version = (body as { version?: unknown } | null)?.version;
  return typeof version === "number" && Number.isInteger(version) && version > 0 ? version : 1;
}

/** Why the bridge cannot be used, or null when it is configured. */
export function studioBridgeProblem(): string | null {
  if (!process.env["STUDIO_BRIDGE_URL"]?.trim()) return "STUDIO_BRIDGE_URL is not set.";
  if ((process.env["PRO_BRIDGE_SECRET"]?.trim().length ?? 0) < 32)
    return "PRO_BRIDGE_SECRET is not set (it must match Studio's).";
  return null;
}

/** One call to Studio's bridge. Throws with Studio's own message when it refuses. */
export async function callStudio(path: string, init: RequestInit = {}): Promise<unknown> {
  const problem = studioBridgeProblem();
  if (problem) throw new Error(`Studio is not connected: ${problem}`);
  const base = process.env["STUDIO_BRIDGE_URL"]!.trim().replace(/\/+$/, "");
  const response = await fetch(`${base}/api/pro/${path}`, {
    ...init,
    headers: {
      ...init.headers,
      authorization: `Bearer ${process.env["PRO_BRIDGE_SECRET"]!.trim()}`,
      "x-pro-bridge-version": String(PRO_BRIDGE_VERSION),
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((error: unknown) => {
    throw new Error(
      `Studio could not be reached at ${base}: ${error instanceof Error ? error.message : "network error"}`,
    );
  });
  const body = (await response.json().catch(() => null)) as
    | { ok: true; data: unknown; version?: number }
    | { ok: false; error: string; version?: number }
    | null;
  if (!response.ok || !body?.ok)
    throw new Error(
      `Studio refused the request (${response.status}): ${body && !body.ok ? body.error : "no details"}`,
    );
  return body;
}

export async function fetchStudioClients(): Promise<StudioClient[]> {
  return (await fetchStudioLink()).clients;
}

/** Studio's linked clients, and which bridge version that Studio speaks. */
export async function fetchStudioLink(): Promise<{ clients: StudioClient[]; version: number }> {
  const body = await callStudio("clients");
  return {
    clients: studioClientsResponse.parse(body).data.clients,
    version: bridgeVersionOf(body),
  };
}

/**
 * Brings one client's competitors and aspirational accounts up to date with
 * its Studio brand profile, by the same rules as the import. Called at the
 * start of the client's sync (25 Nov 2026): @bluebottle was added as Tim
 * Hortons' aspirational account in Studio, Refresh was pressed, and it never
 * appeared, because only "Import clients from Studio" read the profile.
 * Returns what it saved, or null when there was nothing to read.
 */
export async function refreshClientRivals(client: {
  id: string;
  studioClientId: string | null;
}): Promise<{ handles: string[]; benchmarks: string[] } | null> {
  if (!client.studioClientId || studioBridgeProblem()) return null;
  const [clients, existing] = await Promise.all([fetchStudioClients(), readExistingClients()]);
  const entry = planImport(clients, existing).competitors.find(
    (c) => c.studioClientId === client.studioClientId,
  );
  if (!entry) return null;
  await replaceClientCompetitors(client.id, entry.handles, entry.benchmarks);
  return { handles: entry.handles, benchmarks: entry.benchmarks };
}

async function readExistingClients(): Promise<ExistingClient[]> {
  const db = supabaseAdmin as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data, error } = await db
    .from("clients")
    .select("id,source,studio_client_id,instagram_handle,status");
  if (error)
    throw new Error(
      `Reading Pro's clients failed (${error.message}). Apply supabase/migrations/0037_studio_clients.sql.`,
    );
  return (data as Array<Record<string, unknown>>).map((row) => ({
    id: String(row["id"]),
    source: row["source"] === "studio" ? "studio" : "pro",
    studioClientId: (row["studio_client_id"] as string | null) ?? null,
    instagramHandle: (row["instagram_handle"] as string | null) ?? null,
    status: (row["status"] as ExistingClient["status"]) ?? "active",
  }));
}

export interface ImportResult {
  added: number;
  updated: number;
  paused: number;
  skipped: ImportPlan["skipped"];
}

/**
 * Brings Pro's client list in step with Studio's linked clients. Pritesh's
 * own row (source "pro") is never touched; a client unlinked in Studio is
 * paused, never deleted, so its history and lessons stay.
 */
export async function importStudioClients(): Promise<ImportResult> {
  const clients = await fetchStudioClients();
  const db = supabaseAdmin as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const existing = await readExistingClients();
  const plan = planImport(clients, existing);

  for (const row of plan.inserts) {
    const { error: e } = await db.from("clients").insert(row);
    if (e) throw new Error(`Adding ${row.display_name} failed: ${e.message}`);
  }
  for (const { id, fields } of plan.updates) {
    const { error: e } = await db
      .from("clients")
      .update(fields)
      .eq("id", id)
      .eq("source", "studio");
    if (e) throw new Error(`Updating ${fields.display_name} failed: ${e.message}`);
  }
  // Each imported client's competitors, from its Studio brand profile.
  if (plan.competitors.length) {
    const { data: rows, error: e } = await db
      .from("clients")
      .select("id,studio_client_id")
      .in(
        "studio_client_id",
        plan.competitors.map((c) => c.studioClientId),
      );
    if (e) throw new Error(`Reading imported clients failed: ${e.message}`);
    const proId = new Map(
      (rows as Array<{ id: string; studio_client_id: string }>).map((r) => [
        r.studio_client_id,
        r.id,
      ]),
    );
    for (const { studioClientId, handles, benchmarks } of plan.competitors) {
      const id = proId.get(studioClientId);
      if (id) await replaceClientCompetitors(id, handles, benchmarks);
    }
  }
  if (plan.pauses.length) {
    const { error: e } = await db
      .from("clients")
      .update({ status: "paused" })
      .in("id", plan.pauses)
      .eq("source", "studio");
    if (e) throw new Error(`Pausing unlinked clients failed: ${e.message}`);
  }
  return {
    added: plan.inserts.length,
    updated: plan.updates.length,
    paused: plan.pauses.length,
    skipped: plan.skipped,
  };
}
