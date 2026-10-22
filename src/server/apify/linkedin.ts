// LinkedIn via two harvestapi actors — the profile scraper for the follower
// counter, and the posts scraper for engagement. Neither needs cookies, so a
// sync doesn't depend on a logged-in session that can expire.
//
// Each has a fallback, used only when harvestapi fails or returns nothing. On
// a free Apify plan harvestapi allows 50 runs, and once they were used up
// LinkedIn stopped updating for a month (23 Sep to 22 Oct 2026). The fallbacks
// have no such cap: thescrappa for profiles, datadoping for posts (tested on
// 22 Oct 2026). Their output is converted to harvestapi's shape, so the rest
// of the sync does not know which one ran. Post ids are the same in both (the
// activity number in the post's link), so a switch never stores a post twice.
//
// LinkedIn publishes no view count on personal-profile posts, so `views` stays
// 0 and engagement rate is computed against followers instead. See
// analytics-types.engagementRate.
import { datasetItems, runActor } from "./client";
import { POSTS_PER_SYNC, type TrackedAccount } from "./accounts";
import type { AccountSnapshot, PostRecord } from "@/lib/analytics-types";

export const LINKEDIN_PROFILE_ACTOR = "harvestapi/linkedin-profile-scraper";
export const LINKEDIN_POSTS_ACTOR = "harvestapi/linkedin-profile-posts";
/** Fallbacks, used only when the harvestapi actor above fails or returns nothing. */
export const LINKEDIN_PROFILE_FALLBACK = "thescrappa/linkedin-profile-scraper";
export const LINKEDIN_POSTS_FALLBACK = "datadoping/linkedin-profile-posts-scraper";
/** The posts fallback takes at most 4 profiles per run on a free Apify plan. */
const POSTS_FALLBACK_BATCH = 4;

interface LiProfile {
  firstName?: string;
  lastName?: string;
  headline?: string;
  publicIdentifier?: string;
  followerCount?: number;
  connectionsCount?: number;
}

interface LiPost {
  id?: string;
  type?: string;
  content?: string;
  linkedinUrl?: string;
  postedAt?: { date?: string; timestamp?: number };
  engagement?: { likes?: number; comments?: number; shares?: number };
  author?: { publicIdentifier?: string; headline?: string };
}

/**
 * Which profile a post belongs to. The actor returns every tracked profile's
 * posts in one dataset, so without this every competitor's posts would be
 * attributed to the owner. `author.publicIdentifier` is authoritative; the URL
 * slug is the fallback for older payload shapes.
 */
export function authorOf(post: {
  linkedinUrl?: string;
  author?: { publicIdentifier?: string };
}): string | null {
  if (post.author?.publicIdentifier) return post.author.publicIdentifier;
  const match = /linkedin\.com\/posts\/([^_]+)_/.exec(post.linkedinUrl ?? "");
  return match?.[1] ?? null;
}

export function normalizeLinkedInProfile(profile: LiProfile, capturedAt: string): AccountSnapshot {
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  return {
    handle: profile.publicIdentifier ?? "",
    displayName: name || (profile.publicIdentifier ?? ""),
    ...(profile.headline ? { headline: profile.headline } : {}),
    followers: profile.followerCount ?? 0,
    following: profile.connectionsCount ?? 0,
    capturedAt,
  };
}

export function normalizeLinkedInPosts(posts: LiPost[], handle?: string): PostRecord[] {
  return posts
    .filter((post) => (handle ? authorOf(post) === handle : true))
    .filter((post) => post.id && post.postedAt?.date)
    .map((post) => ({
      platform: "linkedin" as const,
      postId: post.id!,
      ...(post.linkedinUrl ? { url: post.linkedinUrl } : {}),
      caption: (post.content ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
      format: "text" as const,
      publishedAt: post.postedAt!.date!,
      views: 0,
      likes: post.engagement?.likes ?? 0,
      comments: post.engagement?.comments ?? 0,
      shares: post.engagement?.shares ?? 0,
      pinned: false,
    }))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, POSTS_PER_SYNC);
}

export function linkedInProfileInput(accounts: TrackedAccount[]): unknown {
  return {
    profileScraperMode: "Profile details no email ($4 per 1k)",
    queries: accounts.map((account) => account.profileUrl),
  };
}

export function linkedInPostsInput(accounts: TrackedAccount[]): unknown {
  return {
    targetUrls: accounts.map((account) => account.profileUrl),
    maxPosts: POSTS_PER_SYNC,
    scrapeReactions: false,
    scrapeComments: false,
  };
}

/** thescrappa/linkedin-profile-scraper: one item per profile URL. */
interface FallbackProfile {
  success?: boolean;
  name?: string;
  followers?: number;
  connections?: string | number;
  url?: string;
  input_url?: string;
  normalized_url?: string;
}

/** datadoping/linkedin-profile-posts-scraper: one item per post. */
interface FallbackPost {
  text?: string;
  url?: string;
  post_type?: string;
  timestamp?: number;
  posted_at?: { date?: string; timestamp?: number };
  urn?: { activity_urn?: string | null };
  total_reactions?: number;
  stats?: { total_reactions?: number; comments?: number; reposts?: number };
  comments?: number;
  reposts?: number;
  author?: { username?: string; headline?: string; first_name?: string; last_name?: string };
  input?: string;
}

const slugOf = (url: string | undefined) => /linkedin\.com\/in\/([^/?#]+)/i.exec(url ?? "")?.[1];

/** A fallback profile in harvestapi's shape. The name comes as one string. */
export function fromFallbackProfile(profile: FallbackProfile): LiProfile {
  const connections =
    typeof profile.connections === "number"
      ? profile.connections
      : Number.parseInt(String(profile.connections ?? "").replace(/\D/g, ""), 10);
  const slug = slugOf(profile.url) ?? slugOf(profile.normalized_url) ?? slugOf(profile.input_url);
  return {
    ...(profile.name ? { firstName: profile.name } : {}),
    ...(slug ? { publicIdentifier: slug } : {}),
    ...(profile.followers !== undefined ? { followerCount: profile.followers } : {}),
    ...(Number.isFinite(connections) ? { connectionsCount: connections } : {}),
  };
}

/** A fallback post in harvestapi's shape. Reactions stand in for likes, as harvestapi counts them. */
export function fromFallbackPost(post: FallbackPost): LiPost {
  // The timestamp, not the "date" text: the text is in the scraper's own time
  // zone (UTC+2 on 22 Oct 2026), the timestamp is UTC.
  const timestamp = post.posted_at?.timestamp ?? post.timestamp;
  // Its links carry share-tracking parameters; harvestapi's are clean.
  const url = post.url?.split("?")[0];
  const id = post.urn?.activity_urn ?? /activity-(\d+)/.exec(post.url ?? "")?.[1] ?? undefined;
  return {
    ...(id ? { id } : {}),
    ...(post.post_type ? { type: post.post_type } : {}),
    ...(post.text ? { content: post.text } : {}),
    ...(url ? { linkedinUrl: url } : {}),
    ...(timestamp ? { postedAt: { date: new Date(timestamp).toISOString(), timestamp } } : {}),
    engagement: {
      likes: post.stats?.total_reactions ?? post.total_reactions ?? 0,
      comments: post.stats?.comments ?? post.comments ?? 0,
      shares: post.stats?.reposts ?? post.reposts ?? 0,
    },
    author: {
      publicIdentifier: post.author?.username ?? post.input ?? "",
      ...(post.author?.headline ? { headline: post.author.headline } : {}),
    },
  };
}

async function profilesFromHarvest(accounts: TrackedAccount[]) {
  const run = await runActor(LINKEDIN_PROFILE_ACTOR, linkedInProfileInput(accounts));
  const profiles = await datasetItems<LiProfile>(run.datasetId, accounts.length + 5);
  return { runId: run.runId, profiles };
}

async function profilesFromFallback(accounts: TrackedAccount[]) {
  // The cache is off: a follower count up to 30 days old would draw a flat line.
  const run = await runActor(LINKEDIN_PROFILE_FALLBACK, {
    urls: accounts.map((account) => account.profileUrl),
    use_cache: false,
  });
  const items = await datasetItems<FallbackProfile>(run.datasetId, accounts.length + 5);
  return {
    runId: run.runId,
    profiles: items.filter((item) => item.success !== false).map(fromFallbackProfile),
  };
}

async function postsFromHarvest(accounts: TrackedAccount[]) {
  const run = await runActor(LINKEDIN_POSTS_ACTOR, linkedInPostsInput(accounts));
  return datasetItems<LiPost>(run.datasetId, POSTS_PER_SYNC * accounts.length);
}

async function postsFromFallback(accounts: TrackedAccount[]) {
  const posts: LiPost[] = [];
  for (let i = 0; i < accounts.length; i += POSTS_FALLBACK_BATCH) {
    const batch = accounts.slice(i, i + POSTS_FALLBACK_BATCH);
    const run = await runActor(LINKEDIN_POSTS_FALLBACK, {
      profiles: batch.map((account) => account.handle),
      max_posts: POSTS_PER_SYNC,
    });
    const items = await datasetItems<FallbackPost>(run.datasetId, POSTS_PER_SYNC * batch.length);
    posts.push(...items.map(fromFallbackPost));
  }
  return posts;
}

/**
 * The first source that works: a source fails when its run throws or comes back
 * empty. When every source fails, the first one's error is the one raised, so
 * the explanation shown (sync.ts explain) is about the main scraper.
 */
async function firstWorking<T>(
  what: string,
  sources: Array<{ actor: string; run: () => Promise<T>; empty: (result: T) => boolean }>,
): Promise<{ result: T; actor: string }> {
  let firstError: unknown = null;
  for (const source of sources) {
    try {
      const result = await source.run();
      if (!source.empty(result)) return { result, actor: source.actor };
      firstError ??= new Error(`${source.actor} returned no ${what}.`);
    } catch (error) {
      firstError ??= error;
    }
    console.warn(`[linkedin] ${what} from ${source.actor} failed; trying the next source.`);
  }
  throw firstError;
}

export async function fetchLinkedIn(accounts: TrackedAccount[]): Promise<{
  runId: string;
  profiles: LiProfile[];
  posts: LiPost[];
  /** Which actor supplied each part: the harvestapi one, or a fallback. */
  sources: { profiles: string; posts: string };
}> {
  // Deliberately sequential. Apify's free plan caps concurrent Actor runs at 5,
  // and running every actor at once trips that limit before any of them finish.
  const profiles = await firstWorking("profiles", [
    {
      actor: LINKEDIN_PROFILE_ACTOR,
      run: () => profilesFromHarvest(accounts),
      empty: (got) => !got.profiles.length,
    },
    {
      actor: LINKEDIN_PROFILE_FALLBACK,
      run: () => profilesFromFallback(accounts),
      empty: (got) => !got.profiles.length,
    },
  ]);
  const posts = await firstWorking("posts", [
    {
      actor: LINKEDIN_POSTS_ACTOR,
      run: () => postsFromHarvest(accounts),
      empty: (got) => !got.length,
    },
    {
      actor: LINKEDIN_POSTS_FALLBACK,
      run: () => postsFromFallback(accounts),
      empty: (got) => !got.length,
    },
  ]);

  // The profile fallback has no headline; the posts fallback carries each
  // author's, so a profile without one takes it from there.
  const headlines = new Map<string, string>();
  for (const post of posts.result) {
    const handle = post.author?.publicIdentifier?.toLowerCase();
    if (handle && post.author?.headline) headlines.set(handle, post.author.headline);
  }
  return {
    runId: profiles.result.runId,
    profiles: profiles.result.profiles.map((profile) => {
      const headline = headlines.get((profile.publicIdentifier ?? "").toLowerCase());
      return profile.headline || !headline ? profile : { ...profile, headline };
    }),
    posts: posts.result,
    sources: { profiles: profiles.actor, posts: posts.actor },
  };
}

export async function readLinkedInDatasets(
  profileDatasetId: string,
  postsDatasetId: string,
): Promise<{ profiles: LiProfile[]; posts: LiPost[] }> {
  const [profiles, posts] = await Promise.all([
    datasetItems<LiProfile>(profileDatasetId, 20),
    datasetItems<LiPost>(postsDatasetId, 200),
  ]);
  return { profiles, posts };
}
