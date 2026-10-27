// The team's standing on each watched creator, from the ticks and crosses on
// their reels (AI tool workflows, phase 4). See lib/creator-standing.ts.
//
// Free: stored rows only. The standing is shown on Data sources and nothing
// else; the drop rule retires found creators the team keeps crossing.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildCreatorStandings,
  creatorKey,
  dropReason,
  type CreatorReelVote,
  type CreatorStanding,
} from "@/lib/creator-standing";
import type { PlatformId } from "@/lib/analytics-types";

import { hasDurableStore, readTopicVotes } from "./store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

/** Every creator's standing, keyed by handle without the "@". Empty before 0010/0021. */
export async function readCreatorStandings(
  platform: PlatformId,
): Promise<Map<string, CreatorStanding>> {
  if (!hasDurableStore()) return new Map();
  const [{ data: creators }, votes] = await Promise.all([
    db().from("watched_creators").select("handle,lane").eq("platform", platform),
    readTopicVotes(platform).catch(() => []),
  ]);
  const watched = (creators ?? []) as Array<{ handle: string; lane: string }>;
  if (!watched.length) return new Map();

  const { data, error } = await db()
    .from("source_items")
    .select("id,publisher,published_at")
    .eq("platform", platform)
    .eq("kind", "video")
    .in("lane", [...new Set(watched.map((creator) => creator.lane))])
    .in(
      "publisher",
      watched.map((creator) => `@${creator.handle}`),
    );
  if (error) return new Map();

  const verdicts = new Map(
    votes.filter((vote) => vote.kind === "source").map((vote) => [vote.itemId, vote] as const),
  );
  const reels: CreatorReelVote[] = ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const vote = verdicts.get(String(row["id"]));
    return {
      handle: String(row["publisher"]),
      reelId: String(row["id"]),
      postedAt: (row["published_at"] as string | null) ?? null,
      verdict: vote?.verdict ?? null,
      votedAt: vote?.createdAt ?? null,
    };
  });
  return buildCreatorStandings(reels);
}

/**
 * Retires found creators who meet the drop rule (10 crosses in their last 15
 * reels). Reference creators are never touched. Returns who was retired.
 */
export async function retireCrossed(platform: PlatformId): Promise<string[]> {
  if (!hasDurableStore()) return [];
  const standings = await readCreatorStandings(platform);
  const { data } = await db()
    .from("watched_creators")
    .select("handle")
    .eq("platform", platform)
    .eq("role", "found")
    .eq("active", true);
  const retired: string[] = [];
  for (const { handle } of (data ?? []) as Array<{ handle: string }>) {
    const standing = standings.get(creatorKey(handle));
    if (!standing?.drop) continue;
    const reason = dropReason(standing);
    const { error } = await db()
      .from("watched_creators")
      .update({ active: false, retired_reason: reason })
      .eq("platform", platform)
      .eq("handle", handle);
    if (!error) retired.push(`@${handle}: ${reason}`);
  }
  if (retired.length) console.info(`[standing:${platform}] retired ${retired.join("; ")}`);
  return retired;
}
