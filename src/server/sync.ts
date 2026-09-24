// Sync orchestration: scrape → normalize → persist.
//
// A sync is per-platform and independent: LinkedIn failing must not lose the
// Instagram snapshot, because a missed snapshot is a permanent hole in the
// growth curve.
import { mergeCompetitors, OWNER_ACCOUNTS } from "./apify/accounts";
import { apifyToken } from "./apify/client";
import { fetchInstagram, normalizeInstagram } from "./apify/instagram";
import { fetchLinkedIn, normalizeLinkedInPosts, normalizeLinkedInProfile } from "./apify/linkedin";
import { captureOutcomes } from "./outcomes";
import { refitCurrentNiche } from "./predict";
import { refreshSources } from "./sources";
import { hasInstagramGraph } from "./graph/client";
import { fetchInstagramInsights, fetchMediaInsights, shortcodeOf } from "./graph/instagram";
import {
  finishRun,
  readWatchlist,
  recordFailedRun,
  recordRun,
  saveInsights,
  savePosts,
  saveSnapshots,
} from "./store";
import {
  PLATFORM_IDS,
  type MediaInsight,
  type PlatformId,
  type SyncOutcome,
  type SyncResult,
} from "@/lib/analytics-types";

/** Owner plus every competitor, whether configured in env or discovered. */
async function trackedAccounts(platform: PlatformId) {
  const discovered = await readWatchlist(platform).catch(() => [] as string[]);
  return [OWNER_ACCOUNTS[platform], ...mergeCompetitors(platform, discovered)];
}

/**
 * Owner-only Graph metrics, keyed by shortcode. Never fatal: the Graph token can
 * be revoked or rate-limited independently of Apify, and losing reach data must
 * not cost us the follower snapshot, which is the one thing a sync cannot
 * backfill later.
 */
async function graphInsights(): Promise<Map<string, MediaInsight>> {
  if (!hasInstagramGraph()) return new Map();
  try {
    return await fetchMediaInsights();
  } catch (error) {
    console.error("[sync:instagram] Graph media insights unavailable:", error);
    return new Map();
  }
}

export async function syncInstagram(trigger: "manual" | "schedule"): Promise<SyncOutcome> {
  const accounts = await trackedAccounts("instagram");
  const capturedAt = new Date().toISOString();
  const [{ runId, profiles }, mediaInsights] = await Promise.all([
    fetchInstagram(accounts),
    graphInsights(),
  ]);

  const dbRunId = await recordRun("instagram", trigger, runId);
  const byHandle = new Map(accounts.map((account) => [account.handle.toLowerCase(), account]));

  const snapshots: Array<{
    snapshot: ReturnType<typeof normalizeInstagram>["snapshot"];
    role: "owner" | "competitor";
  }> = [];
  let postsIngested = 0;
  let ownerFollowers: number | undefined;

  let measured = 0;

  for (const profile of profiles) {
    if (!profile?.username) continue;
    const account = byHandle.get(profile.username.toLowerCase());
    const role = account?.role ?? "competitor";
    const { snapshot, posts } = normalizeInstagram(profile, capturedAt);
    snapshots.push({ snapshot, role });

    // Graph only ever knows about the owner's own posts — a token cannot read
    // anyone else's insights, so competitors stay on public numbers alone.
    const enriched =
      role === "owner" && mediaInsights.size
        ? posts.map((post) => {
            const insight = mediaInsights.get(shortcodeOf(post.url) ?? "");
            if (!insight) return post;
            measured += 1;
            // `views` deliberately keeps the SCRAPED number. Graph's view count
            // is roughly double it on this account (1,314 vs 620 on one reel),
            // and competitors only ever have the scraped kind — so overwriting
            // the owner's would make every shared rate compare two different
            // measurements. Graph's figure lives on `insight.views` and is what
            // the owner-only panels report.
            //
            // `shares` is different: Apify hardcodes it to 0 because Instagram
            // publishes no share count at all, so there is nothing to preserve.
            //
            // `likes` and `comments` are different again. They are the SAME
            // quantity Apify reads, not a rival measurement — so there is no
            // like-for-like argument for keeping the scraped one, and the
            // scrape is demonstrably unreliable: it reported 0 comments on a
            // reel with 164 likes, 106 shares and 9,000 reach. Where Graph
            // supplies a number it wins; where it does not, the scraped value
            // stands untouched.
            return {
              ...post,
              shares: insight.shares,
              ...(typeof insight.likes === "number" ? { likes: insight.likes } : {}),
              ...(typeof insight.comments === "number" ? { comments: insight.comments } : {}),
              insight,
            };
          })
        : posts;

    postsIngested += await savePosts(snapshot.handle, enriched);
    if (role === "owner") ownerFollowers = snapshot.followers;
  }

  await saveSnapshots("instagram", dbRunId, snapshots);

  // Close the coverage gap every run, not just for posts this scrape returned.
  // Without it, backfilled history keeps Graph figures on recent posts and
  // scraped ones on older posts — a split by date, which makes every median
  // compare two different measurements and flatters whatever is newest.
  // Graph calls cost nothing, so this is cheap insurance against that drift.
  if (hasInstagramGraph()) {
    try {
      const { backfillMediaInsights } = await import("./graph/instagram");
      const filled = await backfillMediaInsights(OWNER_ACCOUNTS.instagram.handle);
      if (filled.updated) {
        console.log(`[sync:instagram] Graph insights applied to ${filled.updated} stored posts.`);
      }
    } catch (error) {
      console.error("[sync:instagram] insight backfill skipped:", error);
    }
  }

  if (hasInstagramGraph()) {
    try {
      const owner = OWNER_ACCOUNTS.instagram.handle;
      await saveInsights("instagram", owner, await fetchInstagramInsights(measured));
    } catch (error) {
      console.error("[sync:instagram] Graph account insights unavailable:", error);
    }
  }

  await finishRun(dbRunId);

  return {
    platform: "instagram",
    status: "ok",
    ...(ownerFollowers !== undefined ? { followers: ownerFollowers } : {}),
    postsIngested,
  };
}

export async function syncLinkedIn(trigger: "manual" | "schedule"): Promise<SyncOutcome> {
  const accounts = await trackedAccounts("linkedin");
  const capturedAt = new Date().toISOString();
  const { runId, profiles, posts } = await fetchLinkedIn(accounts);

  const dbRunId = await recordRun("linkedin", trigger, runId);
  const byHandle = new Map(accounts.map((account) => [account.handle.toLowerCase(), account]));

  const snapshots: Array<{
    snapshot: ReturnType<typeof normalizeLinkedInProfile>;
    role: "owner" | "competitor";
  }> = [];
  let postsIngested = 0;
  let ownerFollowers: number | undefined;

  for (const profile of profiles) {
    const snapshot = normalizeLinkedInProfile(profile, capturedAt);
    if (!snapshot.handle) continue;
    const account = byHandle.get(snapshot.handle.toLowerCase());
    const role = account?.role ?? "competitor";
    snapshots.push({ snapshot, role });

    // The posts actor returns every tracked profile's posts in one dataset, so
    // attribute by author before storing — otherwise every competitor's posts
    // would land under the owner's handle.
    const mine = normalizeLinkedInPosts(posts, snapshot.handle);
    postsIngested += await savePosts(snapshot.handle, mine);
    if (role === "owner") ownerFollowers = snapshot.followers;
  }

  await saveSnapshots("linkedin", dbRunId, snapshots);
  await finishRun(dbRunId);

  return {
    platform: "linkedin",
    status: "ok",
    ...(ownerFollowers !== undefined ? { followers: ownerFollowers } : {}),
    postsIngested,
  };
}

/**
 * One platform, on its own.
 *
 * Exported because the two platforms cost very different amounts — LinkedIn's
 * actor is roughly ten times Instagram's — so "the Instagram data looks stale"
 * should not have to buy a LinkedIn run to fix.
 */
const SYNCERS: Record<PlatformId, (trigger: "manual" | "schedule") => Promise<SyncOutcome>> = {
  instagram: syncInstagram,
  linkedin: syncLinkedIn,
};

/**
 * Turns Apify's raw quota errors into something actionable.
 *
 * Matched against a normalised copy of the message — lowercased, with hyphens
 * and underscores flattened to spaces — because Apify states the same condition
 * two different ways in one payload: a machine `type` of
 * "platform-feature-disabled" and a human `message` of "Monthly usage hard
 * limit exceeded". The original checks looked only for the hyphenated slug, so
 * a real monthly-limit failure fell through and surfaced as a raw 403 JSON blob
 * on the dashboard — the least actionable form of the most actionable error.
 */
function explain(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalised = message.toLowerCase().replace(/[-_]+/g, " ");

  if (normalised.includes("monthly usage hard limit") || normalised.includes("usage hard limit")) {
    return "Apify has hit its monthly usage limit, so no data can be fetched. Raise the limit or top up the account at apify.com/billing, then press Sync again. Stored data is untouched.";
  }
  if (normalised.includes("concurrent runs limit")) {
    return "Apify hit its concurrent-run limit (5 on the free plan). Wait for the running jobs to finish and press Sync again.";
  }
  if (normalised.includes("monthly usage limit") || normalised.includes("usage limit exceeded")) {
    return "This Apify account has hit its monthly usage limit. Top up or upgrade the plan to keep syncing.";
  }
  if (
    normalised.includes("free users are limited to") ||
    normalised.includes("upgrade to a paid plan")
  ) {
    return "The LinkedIn scraper only allows 50 runs on a free Apify plan, and this Apify account has used them — so LinkedIn was not updated and stays on its last sync. Upgrading the Apify plan, or switching to a different LinkedIn scraper, fixes it. Instagram is unaffected.";
  }
  // Credentials are the other failure a person can act on immediately.
  if (
    normalised.includes("401") ||
    normalised.includes("unauthorized") ||
    normalised.includes("invalid token")
  ) {
    return "Apify rejected the API token. Check APIFY_TOKEN in .env, then restart the dev server.";
  }
  return message;
}

/**
 * The sync currently running in this server, if any.
 *
 * Every sync is a paid scrape, and until one FINISHES the dashboard still
 * reports the data as stale — so a page reload, a second tab, or a teammate
 * opening the dashboard mid-sync each started another full, billed sync. That
 * happened: three syncs in forty seconds on 23 Sep 2026, two of them wasted.
 * A request that arrives while one is running now joins it and gets the same
 * result, so concurrent triggers cost one sync, not one each.
 */
let inFlight: Promise<SyncResult> | null = null;

export function runSync(trigger: "manual" | "schedule" = "manual"): Promise<SyncResult> {
  if (inFlight) return inFlight;
  inFlight = runSyncOnce(trigger).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSyncOnce(trigger: "manual" | "schedule"): Promise<SyncResult> {
  const startedAt = new Date().toISOString();

  if (!apifyToken()) {
    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      outcomes: PLATFORM_IDS.map((platform) => ({
        platform,
        status: "error" as const,
        error: "APIFY_TOKEN is not set — add it to .env and restart the dev server.",
      })),
    };
  }

  // Sequential by design: Apify caps concurrent Actor runs (5 on the free plan),
  // and a parallel fan-out across platforms trips that limit rather than going
  // faster. A sync takes ~20s; nothing is waiting on it.
  const outcomes: SyncOutcome[] = [];
  for (const platform of PLATFORM_IDS) {
    try {
      outcomes.push(await SYNCERS[platform](trigger));
      // Fresh metrics are now stored, so this is the moment any matured
      // suggestion can be frozen. Deterministic, and never fatal.
      await captureOutcomes(platform);
      // Refitting here is what gives the graduation gate its auto-revert: the
      // model is re-derived from every measured outcome each time, so a niche
      // that drifts out of its coverage band loses calibrated mode by itself
      // rather than needing anyone to notice.
      await refitCurrentNiche(platform);
    } catch (error) {
      const message = explain(error);
      console.error(`[sync:${platform}] failed:`, message);
      await recordFailedRun(platform, trigger, message).catch(() => undefined);
      outcomes.push({ platform, status: "error", error: message });
    }

    // Fresh topics for the inbox. Free — a public news feed, no key, no
    // credit — so it rides on the sync behind its own few-hours floor. Outside
    // the try above on purpose: a news hiccup must never mark a sync failed.
    await refreshSources(platform).catch((error: unknown) =>
      console.error(`[sync:${platform}] topic refresh failed:`, error),
    );
  }

  return { startedAt, finishedAt: new Date().toISOString(), outcomes };
}
