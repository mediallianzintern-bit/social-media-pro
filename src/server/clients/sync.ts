// Sync for a client linked from Studio (Studio Phase 5; tracker T12).
//
// Deliberately smaller than Pritesh's sync (server/sync.ts), which also reads
// his Meta Graph insights, links filmed reels, scores outcomes and files posts
// into lanes. A Studio client gets what can be measured from public data:
// its Instagram profile and posts, and the competitors in its Studio brand
// profile — one Apify run. Afterwards it sends Studio the client's lane
// figures and published-post matches (clients/lanes.ts); the only model calls
// there are filing new posts into lanes and a one-off lane suggestion.
import type { PlatformId, SyncOutcome, SyncResult } from "@/lib/analytics-types";

import { toCompetitor, ownerAccount } from "../apify/accounts";
import { apifyToken } from "../apify/client";
import { fetchInstagram, normalizeInstagram } from "../apify/instagram";
import { finishRun, savePosts, saveSnapshots } from "../store";
import { mirrorThumbnails } from "../thumbnails";
import type { ActiveClient } from "./context";
import { sendToStudio } from "./lanes";
import { refreshClientRivals } from "./studio";
import {
  CLIENT_COMPETITOR_ROLE,
  readClientCompetitors,
  recordClientFailure,
  recordClientRun,
} from "./store";

// One sync per client at a time; a second press waits for the first.
const inFlight = new Map<string, Promise<SyncResult>>();

export function syncClient(
  client: ActiveClient,
  trigger: "manual" | "schedule",
): Promise<SyncResult> {
  const running = inFlight.get(client.id);
  if (running) return running;
  const work = syncClientOnce(client, trigger).finally(() => inFlight.delete(client.id));
  inFlight.set(client.id, work);
  return work;
}

async function syncClientOnce(
  client: ActiveClient,
  trigger: "manual" | "schedule",
): Promise<SyncResult> {
  const startedAt = new Date().toISOString();
  const outcomes: SyncOutcome[] = [];
  if (!apifyToken()) {
    outcomes.push({
      platform: "instagram",
      status: "error",
      error: "APIFY_TOKEN is not set — add it to .env and restart the dev server.",
    });
  } else {
    outcomes.push(await syncClientInstagram(client, trigger));
  }
  // LinkedIn for Studio clients is not collected yet: Studio holds Instagram handles only.
  if (client.linkedinHandle) {
    outcomes.push({
      platform: "linkedin",
      status: "skipped",
      reason: "LinkedIn is not collected for clients from Studio yet.",
    });
  }
  return { startedAt, finishedAt: new Date().toISOString(), outcomes };
}

async function syncClientInstagram(
  client: ActiveClient,
  trigger: "manual" | "schedule",
): Promise<SyncOutcome> {
  const platform: PlatformId = "instagram";
  try {
    // Runs inside the client's context, so this is the client's own account.
    const owner = ownerAccount(platform);
    // Its competitors and aspirational accounts as Studio has them now, so a
    // change in the brand profile is collected on this Refresh. Free, and
    // never fatal: if Studio cannot be reached, the saved list is used.
    await refreshClientRivals(client).catch((error: unknown) => {
      console.warn(
        `[clients:sync] competitors not refreshed from Studio for ${client.displayName}:`,
        error instanceof Error ? error.message : error,
      );
    });
    const rivals = (await readClientCompetitors(client.id, platform))
      .map((handle) => toCompetitor(platform, handle))
      .filter((account): account is NonNullable<typeof account> => account !== null)
      .filter((account) => account.handle.toLowerCase() !== owner.handle.toLowerCase());

    const capturedAt = new Date().toISOString();
    const { runId, profiles } = await fetchInstagram([owner, ...rivals]);
    const dbRunId = await recordClientRun(client.id, platform, trigger, runId);

    const snapshots: Parameters<typeof saveSnapshots>[2] = [];
    let postsIngested = 0;
    let followers: number | undefined;
    for (const profile of profiles) {
      if (!profile?.username) continue;
      const isOwner = profile.username.toLowerCase() === owner.handle.toLowerCase();
      const { snapshot, posts } = normalizeInstagram(profile, capturedAt);
      snapshots.push({ snapshot, role: isOwner ? "owner" : CLIENT_COMPETITOR_ROLE });
      postsIngested += await savePosts(snapshot.handle, posts);
      if (isOwner) {
        followers = snapshot.followers;
        // The client's own poster wall, as for Pritesh. Never fails the sync.
        await mirrorThumbnails(platform, posts).catch((error: unknown) => {
          console.warn(`[clients:sync] thumbnails skipped for ${client.displayName}:`, error);
        });
      }
    }
    if (followers === undefined)
      throw new Error(
        `Instagram returned nothing for @${owner.handle}. Check the handle in Studio, or that the account is public.`,
      );

    await saveSnapshots(platform, dbRunId, snapshots);
    await finishRun(dbRunId);
    // Lanes, lane figures and published-post matches back to Studio. Never
    // fails the sync: the figures above are already saved.
    const { notes, lanesAssigned } = await sendToStudio(client);
    return {
      platform,
      status: "ok",
      followers,
      postsIngested,
      ...(lanesAssigned ? { lanesAssigned } : {}),
      ...(notes.length ? { studio: notes } : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[clients:sync] ${client.displayName}:`, message);
    await recordClientFailure(client.id, platform, trigger, message).catch(() => undefined);
    return { platform, status: "error", error: message };
  }
}
