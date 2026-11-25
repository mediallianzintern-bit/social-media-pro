// Studio's linked clients, as Pro stores them (Studio spec §5.2: "Pro adopts
// the shared brand schema").
//
// Studio is the source of truth for who a client is: name, Instagram handle,
// industry, competitors. Pro keeps one `clients` row per linked client for
// the Pro-only settings Studio does not hold, and refreshes the shared fields
// from Studio. Pure, so the mapping is tested without a network or database.
import { z } from "zod";

/** One client as Studio's bridge lists it (GET /api/pro/clients). */
export const studioClient = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  handle: z.string(),
  country: z.string(),
  industry: z.string(),
  captionFooter: z.string(),
  linkedAt: z.string().nullable(),
  competitors: z.array(
    z.object({ platform: z.string(), handle: z.string(), verified: z.boolean() }),
  ),
  inspiration: z.array(
    z.object({
      platform: z.string(),
      handle: z.string(),
      admiredTraits: z.string(),
      verified: z.boolean(),
    }),
  ),
  lanes: z.array(
    z.object({
      name: z.string(),
      definition: z.string(),
      status: z.enum(["suggested", "confirmed", "retired"]),
      source: z.enum(["pro", "manual"]),
    }),
  ),
});
export type StudioClient = z.infer<typeof studioClient>;

export const studioClientsResponse = z.object({
  ok: z.literal(true),
  data: z.object({ clients: z.array(studioClient) }),
});

/** "@Maple.Bakery" -> "maple.bakery"; anything that is not a valid handle -> null. */
export function bareHandle(raw: string): string | null {
  const handle = raw.trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(handle) ? handle : null;
}

/** A Pro `clients` row, as far as the import needs to know it. */
export interface ExistingClient {
  id: string;
  source: "pro" | "studio";
  studioClientId: string | null;
  instagramHandle: string | null;
  status: "active" | "paused" | "ended";
}

/**
 * The shared fields Studio owns, written on every import. `status` is left out
 * for a client paused in Pro, so an import never undoes an admin's pause.
 */
export interface StudioFields {
  display_name: string;
  instagram_handle: string;
  niche: string | null;
  status?: "active";
}

export interface ImportPlan {
  inserts: Array<StudioFields & { studio_client_id: string; source: "studio" }>;
  updates: Array<{ id: string; fields: StudioFields }>;
  /** Studio clients no longer linked. Paused, never deleted: their history stays. */
  pauses: string[];
  /** Studio clients that cannot be measured, and why. Never silently dropped. */
  skipped: Array<{ name: string; reason: string }>;
  /**
   * Each imported client's Instagram competitors, from its Studio brand
   * profile. A handle that is itself a client in Pro (Pritesh included) is
   * left out: it is measured as an owner, never as someone's rival.
   * `benchmarks` are its aspirational accounts (Studio spec §3.11: peers from
   * the competitors, a benchmark from the aspirational account); a handle that
   * is also a competitor stays a competitor.
   */
  competitors: Array<{ studioClientId: string; handles: string[]; benchmarks: string[] }>;
}

/**
 * What an import should change. A client whose handle is invalid, or already
 * belongs to another client (Pritesh's included), is skipped with a reason:
 * two clients on one account would split or double count the same posts.
 */
export function planImport(clients: StudioClient[], existing: ExistingClient[]): ImportPlan {
  const plan: ImportPlan = { inserts: [], updates: [], pauses: [], skipped: [], competitors: [] };
  const byStudioId = new Map(
    existing.filter((c) => c.studioClientId).map((c) => [c.studioClientId!, c]),
  );
  // Who holds each handle now; a Studio client may keep (or move to) a handle
  // only if no other client holds it.
  const owner = new Map<string, string>();
  for (const c of existing)
    if (c.instagramHandle) owner.set(c.instagramHandle.toLowerCase(), c.studioClientId ?? c.id);

  const accepted: StudioClient[] = [];
  for (const client of clients) {
    const handle = bareHandle(client.handle);
    if (!handle) {
      plan.skipped.push({
        name: client.name,
        reason: `"${client.handle}" is not an Instagram handle`,
      });
      continue;
    }
    const holder = owner.get(handle);
    if (holder && holder !== client.id) {
      plan.skipped.push({
        name: client.name,
        reason: `@${handle} already belongs to another client`,
      });
      continue;
    }
    owner.set(handle, client.id);
    const fields: StudioFields = {
      display_name: client.name,
      instagram_handle: handle,
      niche: client.industry.trim() || null,
      status: "active",
    };
    const row = byStudioId.get(client.id);
    // Paused in Pro (by an admin, or because Studio once unlinked it): it
    // stays paused until an admin resumes it in Settings.
    if (row?.status === "paused") delete fields.status;
    if (row) plan.updates.push({ id: row.id, fields });
    else plan.inserts.push({ ...fields, studio_client_id: client.id, source: "studio" });
    accepted.push(client);
  }

  // Every account that is a client's own, after this import.
  const owned = new Set(owner.keys());
  for (const client of accepted) {
    const handles = [
      ...new Set(
        client.competitors
          .filter((c) => c.platform === "instagram")
          .map((c) => bareHandle(c.handle))
          .filter((h): h is string => h !== null && !owned.has(h)),
      ),
    ];
    const peers = new Set(handles);
    const benchmarks = [
      ...new Set(
        client.inspiration
          .filter((c) => c.platform === "instagram")
          .map((c) => bareHandle(c.handle))
          .filter((h): h is string => h !== null && !owned.has(h) && !peers.has(h)),
      ),
    ];
    plan.competitors.push({ studioClientId: client.id, handles, benchmarks });
  }

  const linked = new Set(clients.map((c) => c.id));
  for (const c of existing)
    if (
      c.source === "studio" &&
      c.studioClientId &&
      !linked.has(c.studioClientId) &&
      c.status === "active"
    )
      plan.pauses.push(c.id);
  return plan;
}
