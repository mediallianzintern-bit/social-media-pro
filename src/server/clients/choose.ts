// Which client a person has chosen in the sidebar, and the list they choose
// from (Studio Phase 5; tracker T12).
//
// The choice is a cookie, so it follows the person, not the server: two people
// can look at two clients at once. It is only ever an id; the client itself is
// read from the `clients` table, and only an active client linked from Studio
// can be chosen. Pritesh is the default, so choosing him clears the cookie.
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

import type { ServiceLevel } from "@/lib/service-level";

import type { ActiveClient } from "./context";

export const CLIENT_COOKIE = "pro_client";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ClientOption {
  id: string;
  displayName: string;
  instagramHandle: string | null;
  linkedinHandle: string | null;
  /** True for Pritesh, the default client. */
  isDefault: boolean;
  /** What it gets (migration 0041). */
  service: ServiceLevel;
}

const db = () => supabaseAdmin as any; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * What a client gets. A Studio client set to full is still served as tracking
 * until it has its own voice and connections (plan steps 4 and 5): every
 * script, hook and review prompt is still written as Pritesh, so "full" would
 * put his voice under another brand's name.
 */
export function effectiveService(row: Record<string, unknown>): ServiceLevel {
  const source = row["source"] === "studio" ? "studio" : "pro";
  const service: ServiceLevel =
    row["service"] === "full" || row["service"] === "tracking"
      ? row["service"]
      : source === "pro"
        ? "full" // before 0041, Pritesh's kind of client had everything
        : "tracking";
  if (service === "full" && source === "studio") {
    console.warn(
      `[clients] ${String(row["display_name"])} is set to full service, but served as tracking until it has its own voice and connections.`,
    );
    return "tracking";
  }
  return service;
}

function toActive(row: Record<string, unknown>): ActiveClient {
  return {
    id: String(row["id"]),
    displayName: String(row["display_name"] ?? ""),
    instagramHandle: (row["instagram_handle"] as string | null) ?? null,
    linkedinHandle: (row["linkedin_handle"] as string | null) ?? null,
    source: row["source"] === "studio" ? "studio" : "pro",
    studioClientId: (row["studio_client_id"] as string | null) ?? null,
    service: effectiveService(row),
  };
}

/** Every client that can be chosen: Pritesh first, then Studio's linked clients. */
export async function listClients(): Promise<ClientOption[]> {
  const read = (columns: string) =>
    db()
      .from("clients")
      .select(columns)
      .eq("status", "active")
      .order("created_at", { ascending: true });
  const base = "id,display_name,instagram_handle,linkedin_handle,source,status,created_at";
  let { data, error } = await read(`${base},service`);
  if (error && /service/.test(error.message)) ({ data, error } = await read(base));
  if (error) throw new Error(`Reading clients failed: ${error.message}`);
  return (data as Array<Record<string, unknown>>)
    .map((row) => ({
      id: String(row["id"]),
      displayName: String(row["display_name"] ?? ""),
      instagramHandle: (row["instagram_handle"] as string | null) ?? null,
      linkedinHandle: (row["linkedin_handle"] as string | null) ?? null,
      isDefault: row["source"] !== "studio",
      service: effectiveService(row),
    }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

let pritesh: Promise<{ id: string; service: ServiceLevel } | null> | null = null;

/**
 * Pritesh's own `clients` row: the first Pro client, as readClient has always
 * picked him. Read once per server; a failed read is retried next time.
 */
export function defaultClient(): Promise<{ id: string; service: ServiceLevel } | null> {
  pritesh ??= (async () => {
    const first = (columns: string, withSource: boolean) => {
      const query = db().from("clients").select(columns);
      return (withSource ? query.eq("source", "pro") : query)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
    };
    let { data, error } = await first("id,source,service,display_name", true);
    // Before 0041 there is no service column, and before 0037 no source column.
    if (error && /service/.test(error.message))
      ({ data, error } = await first("id,source,display_name", true));
    if (error && /source/.test(error.message))
      ({ data, error } = await first("id,display_name", false));
    if (error) throw new Error(`Reading the default client failed: ${error.message}`);
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return { id: String(row["id"]), service: effectiveService({ source: "pro", ...row }) };
  })().catch((error: unknown) => {
    pritesh = null;
    console.error("[clients]", error instanceof Error ? error.message : error);
    return null;
  });
  return pritesh;
}

/** Pritesh's client id; see defaultClient. */
export async function defaultClientId(): Promise<string | null> {
  return (await defaultClient())?.id ?? null;
}

/**
 * The client this request should run as, or null for Pritesh. A cookie naming
 * a client that is gone, paused or not from Studio counts as no choice.
 */
export async function chosenClient(): Promise<ActiveClient | null> {
  const id = getCookie(CLIENT_COOKIE);
  if (!id || !UUID.test(id)) return null;
  const read = (columns: string) =>
    db()
      .from("clients")
      .select(columns)
      .eq("id", id)
      .eq("source", "studio")
      .eq("status", "active")
      .maybeSingle();
  const base = "id,display_name,instagram_handle,linkedin_handle,source,studio_client_id,status";
  let { data, error } = await read(`${base},service`);
  // Before 0041 there is no service column; a Studio client is then tracking.
  if (error && /service/.test(error.message)) ({ data, error } = await read(base));
  if (error || !data) return null;
  return toActive(data as Record<string, unknown>);
}

/** Remembers the choice for this browser. Choosing Pritesh (or nothing) clears it. */
export async function chooseClient(id: string | null): Promise<void> {
  if (!id) {
    deleteCookie(CLIENT_COOKIE, { path: "/" });
    return;
  }
  const clients = await listClients();
  const client = clients.find((c) => c.id === id);
  if (!client) throw new Error("That client is not active in Pro.");
  if (client.isDefault) {
    deleteCookie(CLIENT_COOKIE, { path: "/" });
    return;
  }
  setCookie(CLIENT_COOKIE, id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
}
