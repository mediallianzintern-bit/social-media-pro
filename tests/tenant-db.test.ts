// Multi-client steps 1-3: every client-owned row is read and written as one
// client, Pritesh by default, and nothing changes until migration 0040 exists.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import {
  activeClient,
  currentClientId,
  resetDefaultClientId,
  runAsClient,
  runAsDefault,
  type ActiveClient,
} from "@/server/clients/context";
import {
  scopedClient,
  setTenantKeysReady,
  setTenantReady,
  TENANT_TABLES,
  WIDENED_KEYS,
} from "@/server/tenant/db";

const PRITESH = "a9e5c9b5-3417-44c3-a998-c37c482a629c";
const tim: ActiveClient = {
  id: "461b9414-36b0-433b-9dde-c7b83c7a0f8d",
  displayName: "Tim Hortons",
  instagramHandle: "timhortons",
  linkedinHandle: null,
  source: "studio",
  studioClientId: "0c7290b1-1436-4170-9f43-b559946e379c",
};

/** A stand-in for supabase-js that records what each query was asked. */
function fakeClient() {
  const calls: Array<{ table: string; op: string; args: unknown[]; filters: unknown[][] }> = [];
  const client = {
    from(table: string) {
      const entry = (op: string, args: unknown[]) => {
        const call = { table, op, args, filters: [] as unknown[][] };
        calls.push(call);
        const filter: Record<string, unknown> = {
          eq: (...f: unknown[]) => (call.filters.push(f), filter),
          order: () => filter,
          limit: () => filter,
        };
        return filter;
      };
      return {
        select: (...args: unknown[]) => entry("select", args),
        update: (...args: unknown[]) => entry("update", args),
        delete: (...args: unknown[]) => entry("delete", args),
        insert: (...args: unknown[]) => entry("insert", args),
        upsert: (...args: unknown[]) => entry("upsert", args),
      };
    },
  };
  return { db: scopedClient(client) as typeof client, calls };
}

afterEach(() => {
  setTenantReady(null);
  setTenantKeysReady(null);
  resetDefaultClientId();
});

describe("request tenant", () => {
  it("runs Pritesh's requests as his own client row, still 'no Studio client'", () => {
    runAsDefault(PRITESH, () => {
      expect(activeClient()).toBeNull();
      expect(currentClientId()).toBe(PRITESH);
    });
  });

  it("runs a chosen client's requests as that client", () => {
    runAsClient(tim, () => expect(currentClientId()).toBe(tim.id));
  });

  it("falls back to Pritesh outside a request once his id is known, and to nothing before", () => {
    expect(currentClientId()).toBeNull();
    runAsDefault(PRITESH, () => undefined);
    expect(currentClientId()).toBe(PRITESH);
  });
});

describe("scoped database", () => {
  it("filters every read, update and delete on a client table by the request's client", () => {
    setTenantReady(true);
    const { db, calls } = fakeClient();
    runAsClient(tim, () => {
      db.from("suggested_ideas").select("*");
      db.from("reel_learning").update({ a: 1 });
      db.from("platform_tokens").delete();
    });
    expect(calls.map((c) => c.filters)).toEqual([
      [["client_id", tim.id]],
      [["client_id", tim.id]],
      [["client_id", tim.id]],
    ]);
  });

  it("files every inserted or upserted row under the request's client", () => {
    setTenantReady(true);
    const { db, calls } = fakeClient();
    runAsDefault(PRITESH, () => {
      db.from("saved_topics").insert({ title: "a" });
      db.from("linkedin_articles").upsert([{ id: 1 }, { id: 2, client_id: "kept" }], {
        onConflict: "id",
      });
    });
    expect(calls[0]!.args[0]).toEqual({ title: "a", client_id: PRITESH });
    expect(calls[1]!.args).toEqual([
      [
        { id: 1, client_id: PRITESH },
        { id: 2, client_id: "kept" },
      ],
      { onConflict: "id" },
    ]);
  });

  it("keeps two overlapping requests apart", async () => {
    setTenantReady(true);
    const { db, calls } = fakeClient();
    await Promise.all([
      runAsClient(tim, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        db.from("suggested_ideas").select("*");
      }),
      runAsDefault(PRITESH, async () => db.from("suggested_ideas").select("*")),
    ]);
    expect(calls.map((c) => c.filters[0]![1]).sort()).toEqual([PRITESH, tim.id].sort());
  });

  it("leaves shared tables and clients' own tracking tables alone", () => {
    setTenantReady(true);
    const { db, calls } = fakeClient();
    runAsClient(tim, () => {
      db.from("decoded_links").select("*");
      db.from("clients").select("*");
      db.from("post_metrics").insert({ handle: "timhortons" });
    });
    expect(calls.every((c) => c.filters.length === 0)).toBe(true);
    expect(calls[2]!.args[0]).toEqual({ handle: "timhortons" });
  });

  it("changes nothing until migration 0040 is applied", () => {
    setTenantReady(false);
    const { db, calls } = fakeClient();
    runAsClient(tim, () => {
      db.from("suggested_ideas").select("*");
      db.from("saved_topics").insert({ title: "a" });
    });
    expect(calls[0]!.filters).toEqual([]);
    expect(calls[1]!.args[0]).toEqual({ title: "a" });
  });

  it("adds client_id to the conflict key of a widened table once 0042 has run", () => {
    setTenantReady(true);
    setTenantKeysReady(true);
    const { db, calls } = fakeClient();
    runAsDefault(PRITESH, () => {
      db.from("topic_feedback").upsert(
        { item_id: "a" },
        { onConflict: "platform,item_kind,item_id" },
      );
      // Not widened: a post id belongs to one account.
      db.from("linkedin_articles").upsert({ post_id: "1" }, { onConflict: "post_id" });
      // Already names it.
      db.from("platform_tokens").upsert(
        { platform: "linkedin" },
        { onConflict: "client_id,platform" },
      );
    });
    expect(calls.map((c) => (c.args[1] as { onConflict: string }).onConflict)).toEqual([
      "client_id,platform,item_kind,item_id",
      "post_id",
      "client_id,platform",
    ]);
  });

  it("keeps the old conflict key until 0042 has run", () => {
    setTenantReady(true);
    setTenantKeysReady(false);
    const { db, calls } = fakeClient();
    runAsDefault(PRITESH, () => {
      db.from("saved_topics").upsert(
        { item_id: "a" },
        { onConflict: "platform,item_kind,item_id" },
      );
    });
    expect(calls[0]!.args[1]).toEqual({ onConflict: "platform,item_kind,item_id" });
  });

  it("widens the same 14 keys as migration 0042", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync("supabase/migrations/0042_client_keys.sql", "utf8");
    const block = /from \(values([\s\S]*?)\) as v\(/.exec(sql)![1]!;
    const listed = [...block.matchAll(/\('([a-z_]+)', '[pu]'/g)].map((m) => m[1]!);
    expect(new Set(listed)).toEqual(new Set(WIDENED_KEYS));
    expect(WIDENED_KEYS.size).toBe(14);
    for (const table of WIDENED_KEYS) expect(TENANT_TABLES.has(table)).toBe(true);
  });

  it("covers the same 24 tables as migration 0040", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync("supabase/migrations/0040_client_id_everywhere.sql", "utf8");
    const array = /tenant_tables text\[\] := array\[([\s\S]*?)\];/.exec(sql)![1]!;
    const listed = [...array.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
    expect(new Set(listed)).toEqual(new Set(TENANT_TABLES));
    expect(TENANT_TABLES.size).toBe(24);
  });
});
