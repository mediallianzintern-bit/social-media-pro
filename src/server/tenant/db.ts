// The database, scoped to the client a request runs as (multi-client step 3,
// 25 Nov 2026).
//
// 24 tables hold one client's own work: ideas, saved topics, learning,
// LinkedIn data, feedback, calendar, creators, tokens. Migration 0040 gives
// each a client_id. Rather than add a filter by hand at some 120 call sites
// across 16 files (and miss one), every server file that touches them imports
// `supabaseAdmin` from here instead of from the generated client:
//
//   - a read, update or delete on one of these tables gets
//     `client_id = <the request's client>`;
//   - an insert or upsert gets that client_id on every row that has none.
//
// Every other table passes straight through to the generated client.
//
// The filter switches on only once 0040 is applied (`tenantReady`, checked by
// the clientScope middleware before each request). Until then, and outside a
// request before Pritesh's id is known, queries run exactly as they always
// have, and the column's default files new rows under Pritesh.
//
// Migration 0042 adds client_id to the unique keys of the 14 tables where two
// clients can hold the same item (`WIDENED_KEYS`). Once it has run, an upsert
// on one of them gets client_id added to its conflict key, so the call sites
// keep naming the old key and work before and after 0042.
import { supabaseAdmin as generated } from "@/integrations/supabase/client.server";

import { currentClientId } from "../clients/context";

/** The tables that belong to one client. `decoded_links` is a shared cache of resolved URLs, not here. */
export const TENANT_TABLES: ReadonlySet<string> = new Set([
  "suggested_ideas",
  "saved_topics",
  "reel_learning",
  "linkedin_post_learning",
  "linkedin_articles",
  "linkedin_post_analytics",
  "linkedin_reach_cache",
  "linkedin_content",
  "linkedin_account_daily",
  "linkedin_member_daily",
  "voice_references",
  "script_feedback",
  "topic_feedback",
  "content_calendar",
  "content_eras",
  "content_proposals",
  "lane_patterns",
  "niche_models",
  "discovered_reels",
  "watched_creators",
  "creator_search_runs",
  "competitor_watchlist",
  "platform_tokens",
  "trend_observations",
]);

/** The tables whose unique key 0042 widens to (client_id, ...). */
export const WIDENED_KEYS: ReadonlySet<string> = new Set([
  "saved_topics",
  "topic_feedback",
  "voice_references",
  "content_calendar",
  "lane_patterns",
  "discovered_reels",
  "watched_creators",
  "niche_models",
  "competitor_watchlist",
  "platform_tokens",
  "linkedin_reach_cache",
  "linkedin_content",
  "linkedin_account_daily",
  "linkedin_member_daily",
]);

type Row = Record<string, unknown>;
// The builders are supabase-js's own; only the five entry points are wrapped.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Builder = any;

let ready: boolean | null = null;
let checkedAt = 0;
/** Re-check this often while 0040 is missing, so applying it needs no restart. */
const RECHECK_MS = 60_000;

/**
 * Whether migration 0040 is applied. True is remembered for good; false is
 * re-checked a minute later. Never throws: an unreachable database leaves the
 * filter off, as before 0040, and the query itself reports the outage.
 */
export async function tenantReady(): Promise<boolean> {
  if (ready === true || (ready === false && Date.now() - checkedAt < RECHECK_MS)) return ready;
  checkedAt = Date.now();
  try {
    // saved_topics, because only 0040 gives it a client_id (suggested_ideas has
    // had an unused one since 0008), and 0040 adds all 24 in one block. A real
    // read, not a head-only one: PostgREST does not report a missing column on
    // a HEAD request.
    const { error } = await (generated as Builder)
      .from("saved_topics")
      .select("client_id")
      .limit(1);
    ready = !error;
    if (error && !/client_id/.test(error.message))
      console.warn(`[tenant] could not check migration 0040: ${error.message}`);
  } catch (error) {
    ready = false;
    console.warn("[tenant] could not check migration 0040:", error);
  }
  return ready;
}

/** Test seam: set whether 0040 counts as applied. */
export function setTenantReady(value: boolean | null): void {
  ready = value;
  checkedAt = Date.now();
}

let keysReady: boolean | null = null;
let keysCheckedAt = 0;

/**
 * Whether migration 0042 has widened the unique keys, asked of the
 * pro_tenant_keys() function it creates. Remembered and re-checked like
 * tenantReady. Never throws.
 */
export async function tenantKeysReady(): Promise<boolean> {
  if (keysReady === true || (keysReady === false && Date.now() - keysCheckedAt < RECHECK_MS))
    return keysReady;
  keysCheckedAt = Date.now();
  try {
    const { data, error } = await (generated as Builder).rpc("pro_tenant_keys");
    keysReady = !error && data === true;
  } catch {
    keysReady = false;
  }
  return keysReady;
}

/** Test seam: set whether 0042 counts as applied. */
export function setTenantKeysReady(value: boolean | null): void {
  keysReady = value;
  keysCheckedAt = Date.now();
}

/** The conflict key an upsert on `table` should use: with client_id once 0042 has run. */
function conflictKey(table: string, options: unknown): unknown {
  if (keysReady !== true || !WIDENED_KEYS.has(table)) return options;
  if (!options || typeof options !== "object") return options;
  const onConflict = (options as { onConflict?: unknown }).onConflict;
  if (typeof onConflict !== "string" || /\bclient_id\b/.test(onConflict)) return options;
  return { ...options, onConflict: `client_id,${onConflict}` };
}

/** The client id to scope by, or null when scoping is off. */
function scopeId(): string | null {
  return ready === true ? currentClientId() : null;
}

function withClient(rows: unknown, clientId: string): unknown {
  const stamp = (row: unknown) =>
    row && typeof row === "object" && !("client_id" in (row as Row))
      ? { ...(row as Row), client_id: clientId }
      : row;
  return Array.isArray(rows) ? rows.map(stamp) : stamp(rows);
}

/** One table's query builder, with its reads and writes kept to the client. */
export function scopedTable(builder: Builder, table = ""): Builder {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof original !== "function") return original;
      switch (prop) {
        case "select":
        case "update":
        case "delete":
          return (...args: unknown[]) => {
            const query = original.apply(target, args);
            const id = scopeId();
            return id ? query.eq("client_id", id) : query;
          };
        case "insert":
          return (rows: unknown, ...rest: unknown[]) => {
            const id = scopeId();
            return original.call(target, id ? withClient(rows, id) : rows, ...rest);
          };
        case "upsert":
          return (rows: unknown, options?: unknown) => {
            const id = scopeId();
            return original.call(
              target,
              id ? withClient(rows, id) : rows,
              id ? conflictKey(table, options) : options,
            );
          };
        default:
          return original.bind(target);
      }
    },
  });
}

/** Wraps a Supabase client so its client-owned tables are scoped. */
export function scopedClient<T extends object>(client: T): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop !== "from") return Reflect.get(target, prop, receiver);
      return (table: string) => {
        const builder = (target as Builder).from(table);
        return TENANT_TABLES.has(table) ? scopedTable(builder, table) : builder;
      };
    },
  });
}

/** The generated service-role client, with client-owned tables scoped. */
export const supabaseAdmin = scopedClient(generated);
