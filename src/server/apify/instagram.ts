// Instagram via apify/instagram-profile-scraper.
//
// One call returns the profile counters AND the most recent posts with their
// public engagement, which is why this actor is preferred over a separate
// profile + posts pair. Verified shape against @priteshpatel.co.
import { datasetItems, runActor } from "./client";
import { POSTS_PER_SYNC, type TrackedAccount } from "./accounts";
import type { AccountSnapshot, ContentFormat, PostRecord } from "@/lib/analytics-types";

export const INSTAGRAM_ACTOR = "apify/instagram-profile-scraper";

interface IgPost {
  id: string;
  type?: string;
  productType?: string;
  shortCode?: string;
  caption?: string;
  url?: string;
  commentsCount?: number;
  likesCount?: number;
  videoViewCount?: number;
  timestamp?: string;
  isPinned?: boolean;
}

interface IgProfile {
  username: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  latestPosts?: IgPost[];
}

/** `productType: "clips"` is Instagram's internal name for a reel. */
function formatOf(post: IgPost): ContentFormat {
  if (post.productType === "clips") return "reel";
  if (post.type === "Sidecar") return "carousel";
  if (post.type === "Video") return "video";
  return "image";
}

/**
 * Maps raw Instagram post items to PostRecords.
 *
 * Shared by the profile scraper (recent posts, cheap, every sync) and the
 * deep-history scraper (the back catalogue, priced per post, run rarely). Both
 * actors return the same post shape — verified against live output — so a
 * second copy of this mapping would only be a place for the two to drift.
 */
export function toPostRecords(raw: IgPost[], limit: number): PostRecord[] {
  return raw
    .filter((post) => post.id && post.timestamp)
    .map((post) => ({
      platform: "instagram" as const,
      postId: post.id,
      ...(post.url ? { url: post.url } : {}),
      caption: (post.caption ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
      format: formatOf(post),
      publishedAt: post.timestamp!,
      views: post.videoViewCount ?? 0,
      likes: post.likesCount ?? 0,
      comments: post.commentsCount ?? 0,
      // Instagram does not expose share or save counts publicly.
      shares: 0,
      pinned: post.isPinned === true,
    }))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, limit);
}

export function normalizeInstagram(
  profile: IgProfile,
  capturedAt: string,
): { snapshot: AccountSnapshot; posts: PostRecord[] } {
  const snapshot: AccountSnapshot = {
    handle: profile.username,
    displayName: profile.fullName ?? profile.username,
    ...(profile.biography ? { headline: profile.biography.split("\n")[0] ?? "" } : {}),
    followers: profile.followersCount ?? 0,
    following: profile.followsCount ?? 0,
    postsCount: profile.postsCount ?? 0,
    capturedAt,
  };

  return { snapshot, posts: toPostRecords(profile.latestPosts ?? [], POSTS_PER_SYNC) };
}

export function instagramInput(accounts: TrackedAccount[]): unknown {
  return { usernames: accounts.map((account) => account.handle) };
}

export async function fetchInstagram(accounts: TrackedAccount[]): Promise<{
  runId: string;
  profiles: IgProfile[];
}> {
  const { runId, datasetId } = await runActor(INSTAGRAM_ACTOR, instagramInput(accounts));
  const profiles = await datasetItems<IgProfile>(datasetId, accounts.length + 5);
  return { runId, profiles };
}

export async function readInstagramDataset(datasetId: string): Promise<IgProfile[]> {
  return datasetItems<IgProfile>(datasetId, 20);
}

/** The actor that can reach past the profile scraper's handful of recent posts. */
export const INSTAGRAM_HISTORY_ACTOR = "apify/instagram-scraper";

/**
 * Pulls the back catalogue for ONE account.
 *
 * Deliberately not part of the sync. History does not change, so it is fetched
 * once and kept; the per-sync path stays on the cheap profile scraper, which is
 * all that is needed to keep recent metrics current. Wiring this into every
 * sync would re-buy the same old posts forever.
 *
 * Priced per result returned, not per result requested, so an over-large limit
 * on a small account costs only what actually comes back.
 */
export async function fetchInstagramHistory(
  profileUrl: string,
  limit: number,
  newerThan?: string,
): Promise<PostRecord[]> {
  const { datasetId } = await runActor(INSTAGRAM_HISTORY_ACTOR, {
    resultsType: "posts",
    directUrls: [profileUrl],
    resultsLimit: limit,
    addParentData: false,
    ...(newerThan ? { onlyPostsNewerThan: newerThan } : {}),
  });

  const raw = await datasetItems<IgPost>(datasetId, limit + 20);
  const posts = toPostRecords(raw, limit);

  if (raw.length && !posts.length) {
    // Items came back but none mapped — the shape changed. Loud, because the
    // silent version is a backfill that bills and stores nothing.
    console.warn(
      `[instagram:history] ${raw.length} items returned but none mapped to a post. ` +
        `Keys seen: ${[...new Set(raw.flatMap((item) => Object.keys(item)))].join(", ")}`,
    );
  }
  return posts;
}
