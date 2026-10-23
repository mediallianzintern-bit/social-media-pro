// Watching creators for reel ideas: AI tool workflows, phase 1.
//
// On every Instagram sync each active creator in `watched_creators` (0021) is
// read through Instagram's own business-discovery API: free, no Apify, for any
// Business or Creator account. The reels that beat that creator's own normal
// (lib/creator-reels.ts) are stored as topics beside the news, in the
// creator's lane, so the lane's topic list, ticks and crosses, Save, Write
// script and the writer's own suggestions all work on them unchanged.
//
// Never fatal: a creator that cannot be read is skipped and named in the log.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reelAsTopic, standoutReels, type CreatorPost } from "@/lib/creator-reels";
import type { PlatformId } from "@/lib/analytics-types";

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

/** Reads every active creator and stores their standout reels as topics. Free. */
export async function watchCreators(platform: PlatformId): Promise<WatchResult> {
  const result: WatchResult = { creators: 0, read: 0, standouts: 0, failures: [] };
  if (platform !== "instagram" || !hasInstagramGraph()) return result;
  const creators = await readWatchedCreators(platform);
  result.creators = creators.length;

  const topics: Array<ReturnType<typeof reelAsTopic>> = [];
  // One at a time: a handful of small requests, well inside Instagram's limits.
  for (const creator of creators) {
    try {
      const posts = await fetchCreatorPosts(creator.handle);
      result.read += 1;
      for (const standout of standoutReels(posts)) {
        topics.push(reelAsTopic(creator.handle, creator.lane, standout));
      }
    } catch (error) {
      result.failures.push(
        `@${creator.handle}: ${error instanceof Error ? error.message : String(error)}`,
      );
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
