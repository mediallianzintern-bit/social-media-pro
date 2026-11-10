// When a filmed script goes live in a different lane from the one it was
// written for.
//
// A script is written for one lane, but the team can take the story another
// way, and the live reel is filed by what it is actually about (the lane
// classifier on sync, the same lane the lane report counts it in). Its ✓ and
// ✗ then belong to the lane it ran in. Left on the script's lane they pull that
// lane off its subject: the ✓ on "Google Ads tests AI-powered campaign
// creation", ticked under Marketing stunts and posted as a Frontier AI reel
// (3 Nov), taught Marketing stunts to search for Google Ads stories
// (lib/preferences.ts pullQueries).
//
// So once a reel is confirmed as the script's, the story's vote, the script's
// own vote and its script verdict are moved to the lane it went live in. The
// script keeps the lane it was written for, so the Filmed page can show the
// change, and the review's lessons count under the posted lane (lessons.ts).
// Free, idempotent, and never fatal.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { PlatformId } from "@/lib/analytics-types";
import { laneChange } from "@/lib/reel-learning-types";
import { shortcodeFromUrl } from "@/lib/reel-match";

import { OWNER_ACCOUNTS } from "../apify/accounts";
import { hasDurableStore, readIdeaById, readPosts } from "../store";
import { readAllReelLearning } from "./store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

/** Each of the owner's posts' lane, keyed the way a filmed row names its reel. */
export async function postedLanes(platform: PlatformId): Promise<Map<string, string>> {
  const posts = await readPosts(platform, OWNER_ACCOUNTS[platform].handle, 1000).catch(() => []);
  const lanes = new Map<string, string>();
  for (const post of posts) {
    if (post.contentLane) lanes.set(shortcodeFromUrl(post.url) ?? post.postId, post.contentLane);
  }
  return lanes;
}

/** Moves one table's rows for these items to `lane`, touching only rows not there yet. */
async function moveRows(
  table: "topic_feedback" | "script_feedback",
  key: "item_id" | "idea_id",
  platform: PlatformId,
  ids: string[],
  lane: string,
): Promise<number> {
  const { data, error } = await db()
    .from(table)
    .select(`${key},lane`)
    .eq("platform", platform)
    .in(key, ids);
  if (error) return 0; // table not there yet: nothing to move
  const stale = ((data ?? []) as Array<Record<string, string | null>>)
    .filter((row) => row["lane"] !== lane)
    .map((row) => String(row[key]));
  if (!stale.length) return 0;
  const { error: updateError } = await db()
    .from(table)
    .update({ lane })
    .eq("platform", platform)
    .in(key, stale);
  if (updateError) throw new Error(`${table} lane update failed: ${updateError.message}`);
  return stale.length;
}

/**
 * Files every confirmed filmed reel's votes under the lane it went live in.
 * Returns how many votes moved. Runs after every linking pass.
 */
export async function fileUnderPostedLane(platform: PlatformId): Promise<number> {
  if (!hasDurableStore()) return 0;
  try {
    // Confirmed only: a timing guess may be the wrong reel, and so the wrong lane.
    const rows = (await readAllReelLearning(platform)).filter(
      (row) => row.shortcode && row.match?.confirmed,
    );
    if (!rows.length) return 0;
    const lanes = await postedLanes(platform);
    let moved = 0;
    for (const row of rows) {
      const idea = await readIdeaById(row.ideaId).catch(() => null);
      const change = laneChange(idea?.contentLane, lanes.get(row.shortcode!));
      if (!idea || !change) continue;
      const items = [row.ideaId, ...(idea.source?.sourceId ? [idea.source.sourceId] : [])];
      const now =
        (await moveRows("topic_feedback", "item_id", platform, items, change.to)) +
        (await moveRows("script_feedback", "idea_id", platform, [row.ideaId], change.to));
      moved += now;
      if (now) {
        console.log(
          `[reel-learning:${platform}] "${idea.title ?? idea.hook}" went live as ${change.to}, not ${change.from}: its votes moved.`,
        );
      }
    }
    return moved;
  } catch (error) {
    console.error(`[reel-learning:${platform}] filing votes under the posted lane skipped:`, error);
    return 0;
  }
}
