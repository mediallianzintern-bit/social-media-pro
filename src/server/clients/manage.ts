// Active accounts in Settings (25 Nov 2026): every client Pro measures, with
// Pause, Resume and Delete for an admin.
//
// Everyone on the team sees every client; only an admin (team_manager) may
// pause, resume or delete one, and that is checked here, from the verified
// session, never from the request. Pritesh, the default client, can be
// neither paused nor deleted.
//
//   Pause   status 'paused': the client leaves the switcher and is no longer
//           synced; its data is kept. A Studio import does not bring it back
//           (lib/studio-clients.ts); only Resume does.
//   Delete  the client and everything Pro holds for it, for good. The public
//           posts collected for its handle stay in the shared store, where a
//           client that tracks the same account as a competitor still reads
//           them.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ServiceLevel } from "@/lib/service-level";

import { accessFor } from "../workspace";
import { TENANT_TABLES } from "../tenant/db";
import { effectiveService } from "./choose";

// The generated client, unscoped: these act on whole clients, not as one.
const db = () => supabaseAdmin as any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface ClientAccount {
  id: string;
  displayName: string;
  instagramHandle: string | null;
  linkedinHandle: string | null;
  source: "pro" | "studio";
  service: ServiceLevel;
  status: "active" | "paused" | "ended";
  /** True for Pritesh: never paused or deleted. */
  isDefault: boolean;
  /** Its newest successful sync, or null if it has none. */
  lastSyncedAt: string | null;
}

export interface ClientAccountsView {
  accounts: ClientAccount[];
  /** Whether the person asking may pause, resume and delete. */
  canManage: boolean;
}

type Result = { ok: true } | { ok: false; reason: string };

/** Every client, active and paused, with whether the asker is an admin. */
export async function loadClientAccounts(staffEmail: string): Promise<ClientAccountsView> {
  const [access, rows] = await Promise.all([accessFor(staffEmail), readClientRows()]);
  const defaultId = rows.find((row) => row["source"] !== "studio")?.["id"];
  const ids = rows.map((row) => String(row["id"]));
  const lastSync = new Map<string, string>();
  if (ids.length) {
    const { data } = await db()
      .from("sync_runs")
      .select("client_id,started_at")
      .in("client_id", ids)
      .eq("status", "ok")
      .order("started_at", { ascending: false })
      .limit(500);
    for (const run of (data ?? []) as Array<{ client_id: string; started_at: string }>)
      if (!lastSync.has(run.client_id)) lastSync.set(run.client_id, run.started_at);
  }
  const accounts = rows.map((row): ClientAccount => {
    const id = String(row["id"]);
    const isDefault = id === defaultId;
    return {
      id,
      displayName: String(row["display_name"] ?? ""),
      instagramHandle: (row["instagram_handle"] as string | null) ?? null,
      linkedinHandle: (row["linkedin_handle"] as string | null) ?? null,
      source: row["source"] === "studio" ? "studio" : "pro",
      service: effectiveService(row),
      status: (row["status"] as ClientAccount["status"]) ?? "active",
      isDefault,
      // Pritesh's runs carry no client_id; his last sync is on his dashboard.
      lastSyncedAt: lastSync.get(id) ?? null,
    };
  });
  return { accounts, canManage: access.canManageTeam };
}

async function readClientRows(): Promise<Array<Record<string, unknown>>> {
  const read = (columns: string) =>
    db().from("clients").select(columns).order("created_at", { ascending: true });
  const base = "id,display_name,instagram_handle,linkedin_handle,source,status,created_at";
  let { data, error } = await read(`${base},service`);
  if (error && /service/.test(error.message)) ({ data, error } = await read(base));
  if (error) throw new Error(`Reading clients failed: ${error.message}`);
  return (data ?? []) as Array<Record<string, unknown>>;
}

/** The client an admin may change: one from Studio, never Pritesh. */
async function manageable(
  staffEmail: string,
  id: string,
): Promise<{ ok: true; row: Record<string, unknown> } | { ok: false; reason: string }> {
  const access = await accessFor(staffEmail);
  if (!access.canManageTeam) return { ok: false, reason: "Only an admin can do this." };
  const { data, error } = await db()
    .from("clients")
    .select("id,display_name,source,status")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, reason: `Reading the client failed: ${error.message}` };
  if (!data) return { ok: false, reason: "That client is no longer in Pro." };
  const row = data as Record<string, unknown>;
  if (row["source"] !== "studio")
    return {
      ok: false,
      reason: "Dr. Pritesh Patel is the main client and cannot be changed here.",
    };
  return { ok: true, row };
}

/** Pauses or resumes a client. */
export async function setClientStatus(input: {
  staffEmail: string;
  id: string;
  status: "active" | "paused";
}): Promise<Result> {
  const check = await manageable(input.staffEmail, input.id);
  if (!check.ok) return check;
  const { error } = await db()
    .from("clients")
    .update({ status: input.status })
    .eq("id", input.id)
    .eq("source", "studio");
  if (error) return { ok: false, reason: `Saving failed: ${error.message}` };
  console.info(
    `[clients] ${input.staffEmail} ${input.status === "paused" ? "paused" : "resumed"} ${String(check.row["display_name"])}`,
  );
  return { ok: true };
}

/**
 * Tables whose client_id does not cascade from `clients`, so their rows go
 * first. suggested_ideas last: reel learning and script feedback point at it.
 */
const BEFORE_DELETE = [
  ...[...TENANT_TABLES].filter((table) => table !== "suggested_ideas"),
  "suggested_ideas",
  "sync_runs",
  "outcomes",
  "predictions",
];

/**
 * Deletes a client and everything Pro holds for it. `confirmName` must be its
 * name exactly, so a slip of the mouse cannot delete one.
 */
export async function deleteClient(input: {
  staffEmail: string;
  id: string;
  confirmName: string;
}): Promise<Result> {
  const check = await manageable(input.staffEmail, input.id);
  if (!check.ok) return check;
  const name = String(check.row["display_name"]);
  if (input.confirmName.trim() !== name.trim())
    return { ok: false, reason: `Type the client's name exactly, "${name}", to delete it.` };

  for (const table of BEFORE_DELETE) {
    const { error } = await db().from(table).delete().eq("client_id", input.id);
    // A table without a client_id column (a migration not applied) holds none of its rows.
    if (error && !/client_id|does not exist|schema cache/i.test(error.message))
      return {
        ok: false,
        reason: `Deleting its ${table} failed: ${error.message}. Nothing else was removed after this.`,
      };
  }
  // The rest (competitors, snapshots, insights, lanes, assignments) cascade.
  const { error } = await db().from("clients").delete().eq("id", input.id).eq("source", "studio");
  if (error) return { ok: false, reason: `Deleting the client failed: ${error.message}` };
  console.info(`[clients] ${input.staffEmail} deleted ${name} (${input.id})`);
  return { ok: true };
}
