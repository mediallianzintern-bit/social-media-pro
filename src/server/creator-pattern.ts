// Building, storing and reading a creator-fed lane's learned pattern
// (lane_patterns, 0022). The method is in lib/creator-pattern.ts; this file
// gathers what it learns from and keeps the result.
//
// What it learns FROM: the watched creators' recent posts (read through
// Instagram's API by server/creators.ts). What it learns AGAINST, the
// background: the last 30 days of news headlines, the account's own posts in
// its other lanes, and the tracked competitors' captions. Free: stored rows only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildPattern, isStale, type CreatorPattern } from "@/lib/creator-pattern";
import type { PlatformId } from "@/lib/analytics-types";

import { OWNER_ACCOUNTS } from "./apify/accounts";
import { trackedCompetitorSnapshots } from "./competitors";
import { hasDurableStore, readPosts, readSourceItems } from "./store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

/** Fewer creator posts than this and no pattern is built: too little to learn from. */
const MIN_CREATOR_POSTS = 40;

const sameLane = (a: string | null | undefined, b: string) =>
  (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

export async function readPattern(
  platform: PlatformId,
  lane: string,
): Promise<CreatorPattern | null> {
  if (!hasDurableStore()) return null;
  const { data, error } = await db()
    .from("lane_patterns")
    .select("pattern")
    .eq("platform", platform)
    .eq("lane", lane)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { pattern: CreatorPattern }).pattern;
}

async function savePattern(platform: PlatformId, pattern: CreatorPattern): Promise<void> {
  if (!hasDurableStore()) return;
  const { error } = await db()
    .from("lane_patterns")
    .upsert(
      { platform, lane: pattern.lane, pattern, built_at: pattern.builtAt },
      { onConflict: "platform,lane" },
    );
  if (error) throw new Error(`lane_patterns save failed: ${error.message}`);
}

/** The background a lane's pattern is learned against: everything that is NOT this lane. */
async function backgroundFor(platform: PlatformId, lane: string): Promise<string[]> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [news, own, rivals] = await Promise.all([
    readSourceItems(platform, since).catch(() => []),
    readPosts(platform, OWNER_ACCOUNTS[platform].handle, 200).catch(() => []),
    trackedCompetitorSnapshots(platform).catch(() => []),
  ]);
  const rivalPosts = await Promise.all(
    rivals.map((rival) => readPosts(platform, rival.handle, 200).catch(() => [])),
  );
  return [
    ...news.filter((item) => item.kind !== "video").map((item) => item.title),
    ...own.filter((post) => !sameLane(post.contentLane, lane)).map((post) => post.caption),
    ...rivalPosts.flat().map((post) => post.caption),
  ].filter((text) => text.trim());
}

/**
 * The lane's pattern: the stored one while it is fresh, otherwise (or when
 * `force`) rebuilt from these creator posts and stored. Null when there is
 * too little to learn from and nothing stored.
 */
export async function patternFor(
  platform: PlatformId,
  lane: string,
  creatorPosts: Array<{ creator: string; text: string }>,
  options: { force?: boolean } = {},
): Promise<CreatorPattern | null> {
  const stored = await readPattern(platform, lane);
  if (stored && !options.force && !isStale(stored)) return stored;
  if (creatorPosts.length < MIN_CREATOR_POSTS) return stored;
  const pattern = buildPattern(lane, creatorPosts, await backgroundFor(platform, lane));
  await savePattern(platform, pattern).catch((error: unknown) =>
    console.error(`[pattern:${platform}] could not store the ${lane} pattern:`, error),
  );
  console.info(
    `[pattern:${platform}] ${lane}: ${pattern.terms.length} terms from ${pattern.stats.creatorPosts} posts by ` +
      `${pattern.stats.creators} creators; ${Math.round(pattern.stats.creatorPass * 100)}% of them pass, ` +
      `${(pattern.stats.backgroundPass * 100).toFixed(1)}% of the background`,
  );
  return pattern;
}
