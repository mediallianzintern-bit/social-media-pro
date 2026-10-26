// Watching creators for reel ideas: AI tool workflows, phase 1.
//
// On every Instagram sync each active creator in `watched_creators` (0021) is
// read through Instagram's own business-discovery API: free, no Apify, for any
// Business or Creator account. The reels that beat that creator's own normal
// (lib/creator-reels.ts) are stored as topics beside the news, in the
// creator's lane, so the lane's topic list, ticks and crosses, Save, Write
// script and the writer's own suggestions all work on them unchanged. Since
// phase 2 a reel must also fit the lane's pattern, learned from these
// creators' own posts (server/creator-pattern.ts).
//
// Never fatal: a creator that cannot be read is skipped and named in the log.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fitOf } from "@/lib/creator-pattern";
import { reelAsTopic, standoutReels, type CreatorPost } from "@/lib/creator-reels";
import type { PlatformId } from "@/lib/analytics-types";

import { patternFor } from "./creator-pattern";
import { graph, hasInstagramGraph } from "./graph/client";
import { hasDurableStore, saveSourceItems } from "./store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

/** Recent posts read per creator: enough for a normal, few enough for a prolific account. */
const POSTS_PER_CREATOR = 25;

export interface WatchedCreator {
  handle: string;
  lane: string;
  role: "reference" | "found";
}

/** Active watched creators; empty before 0021 is applied. */
export async function readWatchedCreators(platform: PlatformId): Promise<WatchedCreator[]> {
  if (!hasDurableStore()) return [];
  const { data, error } = await db()
    .from("watched_creators")
    .select("handle,lane,role")
    .eq("platform", platform)
    .eq("active", true);
  if (error) return [];
  return (data ?? []) as WatchedCreator[];
}

export interface WatchedCreatorRow extends WatchedCreator {
  active: boolean;
  /** Share of recent posts that fit the lane's pattern, 0-1 (phase 3). */
  fit: number | null;
  foundBy: string | null;
  retiredReason: string | null;
  lastChecked: string | null;
}

/** Every watched creator, active or not, for the Data sources panel. */
export async function readAllWatchedCreators(platform: PlatformId): Promise<WatchedCreatorRow[]> {
  if (!hasDurableStore()) return [];
  const full = await db()
    .from("watched_creators")
    .select("handle,lane,role,active,fit,found_by,retired_reason,last_checked")
    .eq("platform", platform)
    .order("added_at", { ascending: true });
  // Before 0023 the phase 3 columns are missing: read what 0021 has.
  const { data, error } = full.error
    ? await db()
        .from("watched_creators")
        .select("handle,lane,role,active")
        .eq("platform", platform)
        .order("added_at", { ascending: true })
    : full;
  if (error) return [];
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    handle: String(row["handle"]),
    lane: String(row["lane"]),
    role: row["role"] as WatchedCreator["role"],
    active: Boolean(row["active"]),
    fit: row["fit"] == null ? null : Number(row["fit"]),
    foundBy: (row["found_by"] as string | null) ?? null,
    retiredReason: (row["retired_reason"] as string | null) ?? null,
    lastChecked: (row["last_checked"] as string | null) ?? null,
  }));
}

interface DiscoveryMedia {
  id: string;
  permalink?: string;
  caption?: string;
  like_count?: number;
  comments_count?: number;
  timestamp: string;
  media_product_type?: string;
}

/** A creator's recent posts, read through Instagram's business discovery. */
export async function fetchCreatorPosts(handle: string): Promise<CreatorPost[]> {
  const igId = process.env["INSTAGRAM_BUSINESS_ACCOUNT_ID"]?.trim();
  if (!igId) throw new Error("INSTAGRAM_BUSINESS_ACCOUNT_ID is not set");
  const fields =
    `business_discovery.username(${handle}){media.limit(${POSTS_PER_CREATOR})` +
    "{id,permalink,caption,like_count,comments_count,timestamp,media_product_type}}";
  const body = await graph<{ business_discovery?: { media?: { data?: DiscoveryMedia[] } } }>(igId, {
    fields,
  });
  return (body.business_discovery?.media?.data ?? [])
    .filter((media) => media.permalink)
    .map((media) => ({
      id: media.id,
      permalink: media.permalink!.split("?")[0]!,
      caption: media.caption ?? "",
      likes: typeof media.like_count === "number" ? media.like_count : null,
      comments: media.comments_count ?? 0,
      postedAt: media.timestamp,
      isReel: media.media_product_type === "REELS",
    }));
}

export interface WatchResult {
  creators: number;
  read: number;
  standouts: number;
  failures: string[];
}

/**
 * Reads every active creator and stores their standout reels as topics. Free.
 *
 * A reel is kept when it beat its creator's normal AND fits the lane's learned
 * pattern (server/creator-pattern.ts). The pattern is built from these same
 * posts the first time and whenever it is a month old, or now with
 * `rebuildPattern`.
 */
export async function watchCreators(
  platform: PlatformId,
  options: { rebuildPattern?: boolean } = {},
): Promise<WatchResult> {
  const result: WatchResult = { creators: 0, read: 0, standouts: 0, failures: [] };
  if (platform !== "instagram" || !hasInstagramGraph()) return result;
  const creators = await readWatchedCreators(platform);
  result.creators = creators.length;

  // One at a time: a handful of small requests, well inside Instagram's limits.
  const read: Array<{ creator: WatchedCreator; posts: CreatorPost[] }> = [];
  for (const creator of creators) {
    try {
      read.push({ creator, posts: await fetchCreatorPosts(creator.handle) });
      result.read += 1;
    } catch (error) {
      result.failures.push(
        `@${creator.handle}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const topics: Array<ReturnType<typeof reelAsTopic>> = [];
  for (const lane of new Set(read.map((entry) => entry.creator.lane))) {
    const inLane = read.filter((entry) => entry.creator.lane === lane);
    const pattern = await patternFor(
      platform,
      lane,
      inLane.flatMap(({ creator, posts }) =>
        posts.map((post) => ({ creator: creator.handle, text: post.caption })),
      ),
      { force: options.rebuildPattern ?? false },
    ).catch((error: unknown) => {
      result.failures.push(`pattern: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
    if (pattern) {
      // Found creators who drifted off the subject or went quiet are paused
      // (phase 3). Free: it judges the posts just read.
      const { retireDrifted } = await import("./creator-finder");
      await retireDrifted(
        platform,
        pattern,
        inLane.map(({ creator, posts }) => ({ handle: creator.handle, role: creator.role, posts })),
      ).catch((error: unknown) =>
        result.failures.push(`retire: ${error instanceof Error ? error.message : String(error)}`),
      );
    }
    for (const { creator, posts } of inLane) {
      const onTopic = pattern ? (caption: string) => fitOf(pattern, caption).passes : undefined;
      for (const standout of standoutReels(posts, Date.now(), onTopic)) {
        const fit = pattern ? fitOf(pattern, standout.post.caption).fit : null;
        topics.push(reelAsTopic(creator.handle, creator.lane, standout, fit));
      }
    }
  }

  result.standouts = await saveSourceItems(platform, topics).catch((error: unknown) => {
    result.failures.push(`storage: ${error instanceof Error ? error.message : String(error)}`);
    return 0;
  });
  if (result.failures.length) {
    console.warn(`[creators:${platform}] skipped: ${result.failures.join("; ")}`);
  }
  return result;
}
