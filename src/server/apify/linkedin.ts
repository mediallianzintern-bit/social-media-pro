// LinkedIn via two harvestapi actors — the profile scraper for the follower
// counter, and the posts scraper for engagement. Neither needs cookies, so a
// sync doesn't depend on a logged-in session that can expire.
//
// LinkedIn publishes no view count on personal-profile posts, so `views` stays
// 0 and engagement rate is computed against followers instead. See
// analytics-types.engagementRate.
import { datasetItems, runActor } from "./client";
import { POSTS_PER_SYNC, type TrackedAccount } from "./accounts";
import type { AccountSnapshot, PostRecord } from "@/lib/analytics-types";

export const LINKEDIN_PROFILE_ACTOR = "harvestapi/linkedin-profile-scraper";
export const LINKEDIN_POSTS_ACTOR = "harvestapi/linkedin-profile-posts";

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
  author?: { publicIdentifier?: string };
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

export async function fetchLinkedIn(accounts: TrackedAccount[]): Promise<{
  runId: string;
  profiles: LiProfile[];
  posts: LiPost[];
}> {
  // Deliberately sequential. Apify's free plan caps concurrent Actor runs at 5,
  // and running every actor at once trips that limit before any of them finish.
  const profileRun = await runActor(LINKEDIN_PROFILE_ACTOR, linkedInProfileInput(accounts));
  const profiles = await datasetItems<LiProfile>(profileRun.datasetId, accounts.length + 5);

  const postsRun = await runActor(LINKEDIN_POSTS_ACTOR, linkedInPostsInput(accounts));
  const posts = await datasetItems<LiPost>(postsRun.datasetId, POSTS_PER_SYNC * accounts.length);

  return { runId: profileRun.runId, profiles, posts };
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
