// Keeping the cover frame of a post, so the poster wall is real artwork.
//
// Instagram publishes a thumbnail for every post, but on a signed CDN link
// that expires within days. Storing that link gives a wall of broken images a
// week later, which is worse than no images — so the link is treated as a
// source to copy FROM, never as something to keep. Each cover is downloaded
// once and written into our own public bucket, and the post row then points at
// that copy, which does not expire.
//
// Copying is once per post for the life of the post: a cover frame does not
// change after publication, so a sync re-reading the same sixty posts
// downloads nothing. Nothing here is billed — these are plain image fetches,
// not an Apify run.
//
// Every failure is survivable by design. A cover that will not download leaves
// the post without one, and the tile falls back to its opening line.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { postsMissingThumbnails, postsWithThumbnails, saveThumbnailUrl } from "./store";
import type { PlatformId } from "@/lib/analytics-types";

const BUCKET = "post-thumbnails";

/** A cover frame is ~100-200KB. Anything far past that is not one. */
const MAX_BYTES = 5 * 1024 * 1024;

/** A slow CDN should not hold up a sync. */
const FETCH_TIMEOUT_MS = 15_000;

/** Downloads in flight at once. Polite to the CDN, still finishes in seconds. */
const CONCURRENCY = 4;

/**
 * What the mirror needs of a post: which row to point at the copy, and where
 * the cover can be read from right now. A PostRecord satisfies it, and so does
 * a row pulled straight from the database during a backfill.
 */
export interface MirrorTarget {
  postId: string;
  thumbnailUrl?: string;
}

export interface MirrorResult {
  stored: number;
  failed: number;
}

/** Post ids come from the platform and land in a URL path, so keep them tame. */
const safeId = (postId: string) => postId.replace(/[^A-Za-z0-9_-]/g, "");

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Downloads one cover and returns its permanent link, or why there isn't one. */
async function mirrorOne(
  platform: PlatformId,
  post: MirrorTarget,
): Promise<{ url: string } | { reason: string }> {
  const response = await fetch(post.thumbnailUrl!, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  }).catch((error: unknown) => error as Error);

  if (response instanceof Error) return { reason: response.message };
  if (!response.ok) return { reason: `HTTP ${response.status}` };

  const contentType = (response.headers.get("content-type") ?? "").split(";")[0]!.trim();
  const extension = EXTENSIONS[contentType];
  // An expired link does not 404 — Instagram serves an HTML error page with a
  // 200. Trusting the status alone would store that page as a post's cover.
  if (!extension) return { reason: `not an image (${contentType || "no content-type"})` };

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) return { reason: `too large (${bytes.byteLength} bytes)` };
  if (bytes.byteLength === 0) return { reason: "empty response" };

  const path = `${platform}/${safeId(post.postId)}.${extension}`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType, upsert: true, cacheControl: "31536000" });
  if (error) return { reason: error.message };

  return { url: supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
}

/**
 * Copies the cover frame of every post that does not have one yet.
 *
 * Call after the posts themselves are saved — it updates rows that must
 * already exist. Returns counts for the sync log rather than throwing: a sync
 * that captured the numbers has done its job whether or not the pictures
 * arrived.
 */
export async function mirrorThumbnails(
  platform: PlatformId,
  posts: MirrorTarget[],
): Promise<MirrorResult> {
  const candidates = posts.filter((post) => post.thumbnailUrl);
  if (!candidates.length) return { stored: 0, failed: 0 };

  const done = await postsWithThumbnails(
    platform,
    candidates.map((post) => post.postId),
  ).catch((error: unknown) => {
    console.warn(`[thumbnails] could not read existing covers: ${String(error)}`);
    return null;
  });
  if (!done) return { stored: 0, failed: 0 };

  const queue = candidates.filter((post) => !done.has(post.postId));
  if (!queue.length) return { stored: 0, failed: 0 };

  const result: MirrorResult = { stored: 0, failed: 0 };
  let next = 0;

  const worker = async () => {
    for (let index = next++; index < queue.length; index = next++) {
      const post = queue[index]!;
      const mirrored = await mirrorOne(platform, post).catch((error: unknown) => ({
        reason: error instanceof Error ? error.message : String(error),
      }));
      if ("reason" in mirrored) {
        result.failed += 1;
        console.warn(`[thumbnails] ${platform}:${post.postId} — ${mirrored.reason}`);
        continue;
      }
      try {
        await saveThumbnailUrl(platform, post.postId, mirrored.url);
        result.stored += 1;
      } catch (error) {
        result.failed += 1;
        console.warn(`[thumbnails] ${platform}:${post.postId} — ${String(error)}`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return result;
}

/**
 * How many covers one backfill pass will fetch.
 *
 * A back catalogue of a few hundred posts is too much to download inside a
 * single sync request, so a pass takes a slice of it and the next sync takes
 * the next. The newest posts are always first in the queue, which is the half
 * of the dashboard anyone is looking at.
 */
export const BACKFILL_PER_RUN = 40;

/**
 * Fills in covers for posts the scrape never carried one for.
 *
 * A profile page renders about a dozen posts, so that is all a sync's scrape
 * can see — everything older would stay a text poster forever. Graph lists the
 * owner's whole catalogue instead, and it is free, so the back catalogue costs
 * nothing to fill: no Apify run, no model call.
 *
 * Owner-only by nature. A token reads the account it belongs to and no other,
 * which is exactly the account whose posters the dashboard shows.
 */
export async function backfillThumbnails(
  handle: string,
  budget = BACKFILL_PER_RUN,
): Promise<MirrorResult & { pending: number }> {
  const { fetchMediaCovers, shortcodeOf } = await import("./graph/instagram");

  const waiting = await postsMissingThumbnails("instagram", handle, budget);
  if (!waiting.length) return { stored: 0, failed: 0, pending: 0 };

  const covers = await fetchMediaCovers();
  if (!covers.size) return { stored: 0, failed: 0, pending: waiting.length };

  const targets: MirrorTarget[] = waiting.flatMap((post) => {
    const cover = covers.get(shortcodeOf(post.url) ?? "");
    return cover ? [{ postId: post.postId, thumbnailUrl: cover }] : [];
  });

  const result = await mirrorThumbnails("instagram", targets);
  return { ...result, pending: waiting.length - result.stored };
}
