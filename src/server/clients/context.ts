// Which client a server request is working for (Studio spec Phase 5; build
// tracker T12).
//
// Pro was built for one client, Pritesh, and 32 server files read his accounts
// directly. Rather than thread a client through every call, a request runs
// "as" a client and those files ask `ownerAccount(platform)` (apify/accounts)
// for that client's handle. Nothing runs as a client unless it is asked to, so
// any path that does not choose one still means Pritesh — exactly as before.
//
// AsyncLocalStorage keeps the choice per request: two people looking at two
// different clients at the same time never see each other's.
import { AsyncLocalStorage } from "node:async_hooks";

import type { ServiceLevel } from "@/lib/service-level";

/** A client Pro measures: Pritesh (source "pro") or one linked from Studio. */
export interface ActiveClient {
  id: string;
  displayName: string;
  /** Bare handles, no "@". Null when the client has no account on that platform. */
  instagramHandle: string | null;
  linkedinHandle: string | null;
  source: "pro" | "studio";
  /** The client's id in Social Pulse Studio, for clients Studio describes. */
  studioClientId: string | null;
  /** What it gets (migration 0041); missing means tracking, as before 0041. */
  service?: ServiceLevel;
}

/**
 * What a request runs as. `client` is a client chosen in the sidebar (null for
 * Pritesh, so every "is this a Studio client?" check keeps its meaning);
 * `clientId` is the tenant its rows belong to, which is never empty inside a
 * request: Pritesh's own `clients` row when no client is chosen (multi-client
 * step 1, 25 Nov 2026).
 */
interface RequestTenant {
  client: ActiveClient | null;
  clientId: string;
  service: ServiceLevel;
}

const store = new AsyncLocalStorage<RequestTenant>();

/** Pritesh's client id once it has been read, for work that runs outside a request. */
let defaultId: string | null = null;

/** Runs `work` as `client`; everything it awaits sees the same client. */
export function runAsClient<T>(client: ActiveClient, work: () => T): T {
  return store.run({ client, clientId: client.id, service: client.service ?? "tracking" }, work);
}

/** Runs `work` as Pritesh, the default client, whose id is `clientId`. */
export function runAsDefault<T>(
  clientId: string,
  work: () => T,
  service: ServiceLevel = "full",
): T {
  defaultId = clientId;
  return store.run({ client: null, clientId, service }, work);
}

/**
 * The level of service of the client this request runs as. Outside a request
 * it is Pritesh's, full, as everything was before 0041.
 */
export function currentService(): ServiceLevel {
  return store.getStore()?.service ?? "full";
}

/** The client this request runs as, or null for the default (Pritesh). */
export function activeClient(): ActiveClient | null {
  return store.getStore()?.client ?? null;
}

/**
 * The tenant every client-owned row is read and written as: the chosen
 * client, else Pritesh. Null only outside any request before Pritesh's id has
 * been read (a script, a test); the tenant filter then stays off and new rows
 * take the column's default, Pritesh, exactly as before migration 0040.
 */
export function currentClientId(): string | null {
  return store.getStore()?.clientId ?? defaultId;
}

/** Test seam: forget Pritesh's remembered id. */
export function resetDefaultClientId(): void {
  defaultId = null;
}
