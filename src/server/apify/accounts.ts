// Which accounts this dashboard tracks.
//
// The owner accounts are fixed. Competitors are read from env so the watchlist
// can change without a code edit — and because every handle added is scraped on
// every sync and billed by Apify, the list is opt-in rather than guessed.
import type { PlatformId } from "@/lib/analytics-types";

export interface TrackedAccount {
  platform: PlatformId;
  /** Instagram username, or LinkedIn public identifier. */
  handle: string;
  profileUrl: string;
  role: "owner" | "competitor";
}

export const OWNER_ACCOUNTS: Record<PlatformId, TrackedAccount> = {
  instagram: {
    platform: "instagram",
    handle: "priteshpatel.co",
    profileUrl: "https://www.instagram.com/priteshpatel.co/",
    role: "owner",
  },
  linkedin: {
    platform: "linkedin",
    handle: "digitalmarketingtrainer",
    profileUrl: "https://www.linkedin.com/in/digitalmarketingtrainer/",
    role: "owner",
  },
};

/** Accepts a bare handle, an @handle, or a full profile URL. */
function parseHandle(platform: PlatformId, raw: string): TrackedAccount | null {
  const value = raw.trim().replace(/\/+$/, "");
  if (!value) return null;

  const fromUrl =
    platform === "instagram"
      ? /instagram\.com\/([^/?#]+)/i.exec(value)
      : /linkedin\.com\/in\/([^/?#]+)/i.exec(value);

  const handle = (fromUrl?.[1] ?? value).replace(/^@/, "");
  if (!handle || handle.includes(" ")) return null;

  return {
    platform,
    handle,
    profileUrl:
      platform === "instagram"
        ? `https://www.instagram.com/${handle}/`
        : `https://www.linkedin.com/in/${handle}/`,
    role: "competitor",
  };
}

function competitorsFromEnv(platform: PlatformId): TrackedAccount[] {
  const raw =
    process.env[platform === "instagram" ? "COMPETITORS_INSTAGRAM" : "COMPETITORS_LINKEDIN"];
  if (!raw) return [];
  return (
    raw
      .split(",")
      .map((entry) => parseHandle(platform, entry))
      .filter((account): account is TrackedAccount => account !== null)
      // Never let a competitor entry shadow the owner account.
      .filter((account) => account.handle !== OWNER_ACCOUNTS[platform].handle)
  );
}

export function competitorsFor(platform: PlatformId): TrackedAccount[] {
  return competitorsFromEnv(platform);
}

/** Turns a discovered handle into a tracked account. */
export function toCompetitor(platform: PlatformId, handle: string): TrackedAccount | null {
  return parseHandle(platform, handle);
}

/**
 * Env-configured competitors plus any discovered automatically, deduplicated.
 * Env entries win, so a hand-picked account is never displaced by discovery.
 */
export function mergeCompetitors(platform: PlatformId, discovered: string[]): TrackedAccount[] {
  const accounts = competitorsFromEnv(platform);
  const seen = new Set([
    OWNER_ACCOUNTS[platform].handle.toLowerCase(),
    ...accounts.map((account) => account.handle.toLowerCase()),
  ]);

  for (const handle of discovered) {
    const account = toCompetitor(platform, handle);
    if (!account || seen.has(account.handle.toLowerCase())) continue;
    seen.add(account.handle.toLowerCase());
    accounts.push(account);
  }
  return accounts;
}

export function accountsFor(platform: PlatformId): TrackedAccount[] {
  return [OWNER_ACCOUNTS[platform], ...competitorsFor(platform)];
}

/**
 * Posts scraped per profile per sync. Bounds both runtime and Apify spend.
 *
 * Raise it with POSTS_PER_SYNC to pull more history — but know what it does and
 * does not buy. LinkedIn's actor honours it directly (`maxPosts`), so LinkedIn
 * history deepens immediately. Instagram's does NOT: apify/instagram-profile-scraper
 * takes only `usernames`, returns whatever `latestPosts` it chooses, and has no
 * depth parameter at all — so this caps Instagram, it cannot extend it. Reaching
 * further back on Instagram means a different, per-post-priced actor, which is a
 * spending decision rather than a config change.
 */
export const POSTS_PER_SYNC = Math.max(
  10,
  Math.min(200, Number(process.env["POSTS_PER_SYNC"]) || 30),
);
