// Instagram Graph API adapter — the owner-only metrics.
//
// Verified live against @priteshpatel.co on v21.0. What this account actually
// serves, which is narrower than the docs suggest:
//
//   account   reach · views · profile_views · accounts_engaged ·
//             total_interactions · website_clicks        (period=day)
//   audience  follower_demographics, broken down by age+gender, country, city
//   media     reach · saved · shares · views · likes · comments  (all types)
//             ig_reels_avg_watch_time, ig_reels_video_view_total_time  (reels)
//             follows, profile_visits                    (feed posts only)
//
// `impressions` is gone — Graph rejects it outright and names `views` as the
// replacement, so nothing here asks for it.
import { graph, graphOptional, igAccountId } from "./client";
import type {
  AccountInsights,
  AccountSnapshot,
  AudienceBreakdowns,
  AudienceSlice,
  ContentFormat,
  InstagramInsights,
  MediaInsight,
  PostRecord,
} from "@/lib/analytics-types";

/** How far back to walk the media list. Graph pages at 25 by default. */
const MEDIA_LIMIT = 60;

interface InsightValue {
  value?: number;
}
interface InsightEntry {
  name: string;
  values?: InsightValue[];
  total_value?: {
    value?: number;
    breakdowns?: Array<{
      dimension_keys: string[];
      results: Array<{ dimension_values: string[]; value: number }>;
    }>;
  };
}
interface InsightResponse {
  data?: InsightEntry[];
}

interface GraphMedia {
  id: string;
  permalink?: string;
  media_product_type?: string;
  media_type?: string;
  timestamp?: string;
  /** Authoritative counts for the owner's own post. */
  like_count?: number;
  comments_count?: number;
}

// ---------------------------------------------------------------------------
// Account level
// ---------------------------------------------------------------------------

const ACCOUNT_METRICS = [
  ["reach", "reach"],
  ["views", "views"],
  ["profile_views", "profileViews"],
  ["accounts_engaged", "accountsEngaged"],
  ["total_interactions", "totalInteractions"],
  ["website_clicks", "websiteClicks"],
] as const satisfies ReadonlyArray<readonly [string, keyof AccountInsights]>;

/**
 * Trailing-window account totals, plus how many of them actually came back.
 *
 * Requested one metric at a time on purpose: Graph fails the whole call if any
 * single metric in it is unavailable, and these six have historically moved in
 * and out of availability independently. Six small calls that degrade to zero
 * beat one call that degrades to nothing.
 *
 * `retrieved` exists because that degrade-to-zero is indistinguishable from a
 * real zero once it is written down. When Meta blocked the app, every one of the
 * six calls failed, each fell back to 0, and a tidy row of zeroes was persisted
 * over a good capture — so the dashboard reported an account with no reach and
 * no audience rather than an outage. The caller uses this count to refuse to
 * store a capture that measured nothing.
 */
async function fetchAccountInsights(
  igId: string,
  since: Date,
  until: Date,
): Promise<{ totals: AccountInsights; retrieved: number }> {
  const totals: AccountInsights = {
    reach: 0,
    views: 0,
    profileViews: 0,
    accountsEngaged: 0,
    totalInteractions: 0,
    websiteClicks: 0,
  };
  let retrieved = 0;

  await Promise.all(
    ACCOUNT_METRICS.map(async ([metric, key]) => {
      const body = await graphOptional<InsightResponse>(`${igId}/insights`, {
        metric,
        period: "day",
        metric_type: "total_value",
        since: String(Math.floor(since.getTime() / 1000)),
        until: String(Math.floor(until.getTime() / 1000)),
      });
      if (body) retrieved += 1;
      totals[key] = body?.data?.[0]?.total_value?.value ?? 0;
    }),
  );

  return { totals, retrieved };
}

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------

const GENDER_LABELS: Record<string, string> = { F: "Women", M: "Men", U: "Unspecified" };

function sliceOf(
  body: InsightResponse | null,
  label: (dimensions: string[]) => string,
): AudienceSlice[] {
  const results = body?.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
  return results
    .map((row) => ({ label: label(row.dimension_values), value: row.value }))
    .filter((slice) => slice.value > 0)
    .sort((a, b) => b.value - a.value);
}

/** Collapses a two-key breakdown down to one of its dimensions. */
function foldBy(slices: AudienceSlice[], pick: (label: string) => string): AudienceSlice[] {
  const totals = new Map<string, number>();
  for (const slice of slices) {
    const key = pick(slice.label);
    totals.set(key, (totals.get(key) ?? 0) + slice.value);
  }
  return [...totals].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

async function fetchAudience(igId: string): Promise<AudienceBreakdowns> {
  const ask = (breakdown: string) =>
    graphOptional<InsightResponse>(`${igId}/insights`, {
      metric: "follower_demographics",
      period: "lifetime",
      metric_type: "total_value",
      breakdown,
    });

  const [ageGenderBody, countryBody, cityBody] = await Promise.all([
    ask("age,gender"),
    ask("country"),
    ask("city"),
  ]);

  // Comes back as pairs like ["25-34", "M"]; keep the pair, and fold it two ways
  // so the UI can show an age curve and a gender split without a second call.
  const ageGender = sliceOf(
    ageGenderBody,
    ([age, gender]) => `${age ?? "?"} · ${GENDER_LABELS[gender ?? ""] ?? gender ?? "?"}`,
  );

  return {
    ageGender,
    age: foldBy(ageGender, (label) => label.split(" · ")[0] ?? label).sort((a, b) =>
      a.label.localeCompare(b.label),
    ),
    gender: foldBy(ageGender, (label) => label.split(" · ")[1] ?? label),
    country: sliceOf(countryBody, ([code]) => code ?? "?"),
    city: sliceOf(cityBody, ([city]) => city ?? "?"),
  };
}

// ---------------------------------------------------------------------------
// Per-post
// ---------------------------------------------------------------------------

/** The shortcode in an Instagram permalink — the only id both APIs agree on. */
export function shortcodeOf(url: string | undefined): string | null {
  if (!url) return null;
  const match = /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/.exec(url);
  return match?.[1] ?? null;
}

const MEDIA_METRICS = ["reach", "saved", "shares", "views"] as const;
const REEL_METRICS = ["ig_reels_avg_watch_time", "ig_reels_video_view_total_time"] as const;
const FEED_METRICS = ["follows", "profile_visits"] as const;

async function insightsForMedia(media: GraphMedia): Promise<MediaInsight> {
  const isReel = media.media_product_type === "REELS";
  const wanted = [...MEDIA_METRICS, ...(isReel ? REEL_METRICS : FEED_METRICS)];

  // One call, but tolerant: if the batch is rejected because a metric does not
  // apply to this media type, retry metric-by-metric rather than losing all of
  // them. The happy path stays at a single request per post.
  let entries = (
    await graphOptional<InsightResponse>(`${media.id}/insights`, {
      metric: wanted.join(","),
    })
  )?.data;

  if (!entries) {
    const settled = await Promise.all(
      wanted.map((metric) => graphOptional<InsightResponse>(`${media.id}/insights`, { metric })),
    );
    entries = settled.flatMap((body) => body?.data ?? []);
  }

  const value = (name: string): number | undefined =>
    entries?.find((entry) => entry.name === name)?.values?.[0]?.value;

  const insight: MediaInsight = {
    reach: value("reach") ?? 0,
    saved: value("saved") ?? 0,
    shares: value("shares") ?? 0,
    views: value("views") ?? 0,
  };

  const avgWatchMs = value("ig_reels_avg_watch_time");
  const totalWatchMs = value("ig_reels_video_view_total_time");
  const follows = value("follows");
  const profileVisits = value("profile_visits");
  if (avgWatchMs !== undefined) insight.avgWatchMs = avgWatchMs;
  if (totalWatchMs !== undefined) insight.totalWatchMs = totalWatchMs;
  if (follows !== undefined) insight.follows = follows;
  if (profileVisits !== undefined) insight.profileVisits = profileVisits;
  return insight;
}

/**
 * Per-post insights keyed by shortcode.
 *
 * Keyed by shortcode rather than media id because Apify's scraper and the Graph
 * API assign different ids to the same post; the shortcode in the permalink is
 * the only identifier both of them expose.
 */
export async function fetchMediaInsights(): Promise<Map<string, MediaInsight>> {
  const igId = igAccountId();
  if (!igId) return new Map();

  const media = await graph<{ data?: GraphMedia[] }>(`${igId}/media`, {
    // like_count and comments_count come free with the media listing — one
    // field list, no extra request — and are the platform's own figures for
    // the owner's posts rather than whatever the public page rendered.
    fields: "id,permalink,media_product_type,media_type,timestamp,like_count,comments_count",
    limit: String(MEDIA_LIMIT),
  });

  const items = (media.data ?? []).filter((item) => shortcodeOf(item.permalink));
  const byShortcode = new Map<string, MediaInsight>();

  // Serial in small batches: this is one request per post, and firing 60 at once
  // is what Graph's per-app rate limiter is there to stop.
  const BATCH = 6;
  for (let index = 0; index < items.length; index += BATCH) {
    const batch = items.slice(index, index + BATCH);
    const results = await Promise.all(batch.map((item) => insightsForMedia(item)));
    batch.forEach((item, offset) => {
      const code = shortcodeOf(item.permalink);
      const insight = results[offset];
      if (!code || !insight) return;
      // Carry the media-level counts alongside the insight metrics. Only when
      // Graph actually returned a number — an absent field must not become 0
      // and overwrite a scraped value that was right.
      byShortcode.set(code, {
        ...insight,
        ...(typeof item.like_count === "number" ? { likes: item.like_count } : {}),
        ...(typeof item.comments_count === "number" ? { comments: item.comments_count } : {}),
      });
    });
  }

  return byShortcode;
}

// ---------------------------------------------------------------------------

/** Everything the account level and audience panels need, in one call. */
export async function fetchInstagramInsights(postsMeasured: number): Promise<InstagramInsights> {
  const igId = igAccountId();
  if (!igId) throw new Error("INSTAGRAM_BUSINESS_ACCOUNT_ID is not set");

  const until = new Date();
  // Graph caps a single insights window at 30 days; 28 keeps it inside that and
  // lines up with the four-week rhythm the rest of the dashboard reports on.
  const since = new Date(until.getTime() - 28 * 86_400_000);

  const [{ totals, retrieved }, audience] = await Promise.all([
    fetchAccountInsights(igId, since, until),
    fetchAudience(igId),
  ]);

  // Nothing came back at all — an outage, a revoked token, or a blocked app.
  // Throwing hands the decision to the caller, which logs it and moves on
  // WITHOUT persisting, so the last good capture stays on screen. Writing zeroes
  // here would silently replace real history with a fabricated flat line.
  const audienceSlices = audience.age.length + audience.country.length + audience.city.length;
  if (retrieved === 0 && audienceSlices === 0) {
    throw new Error(
      "Instagram Graph returned no insights at all — token, permissions or app access is broken. " +
        "Keeping the previous capture rather than overwriting it with zeroes.",
    );
  }

  return { capturedAt: until.toISOString(), account: totals, audience, postsMeasured };
}

/**
 * Attaches Graph insights to every stored post Graph can still see.
 *
 * The sync only enriches posts returned by that run's scrape — roughly the
 * newest 18 — so a backfilled history ends up with Graph figures on recent
 * posts and scraped figures on older ones. That split is by DATE, which is the
 * worst possible shape for it: every median then compares recent posts counted
 * one way against older posts counted another, and recent work looks several
 * times better than it is.
 *
 * Graph exposes the newest MEDIA_LIMIT posts regardless of what was scraped, so
 * this closes the gap for all of them. Graph calls cost nothing, so this is
 * cheap to re-run.
 */
export async function backfillMediaInsights(handle: string): Promise<{
  covered: number;
  updated: number;
}> {
  const { readPosts, savePosts } = await import("../store");
  const insights = await fetchMediaInsights();
  if (!insights.size) return { covered: 0, updated: 0 };

  const posts = await readPosts("instagram", handle);
  const enriched = posts
    .map((post) => {
      const code = shortcodeOf(post.url);
      const insight = code ? insights.get(code) : undefined;
      if (!insight) return null;
      // Same precedence the sync uses: Graph wins on shares, likes and
      // comments; `views` keeps the scraped column and Graph's lives on the
      // insight, so both remain available.
      return {
        ...post,
        shares: insight.shares,
        ...(typeof insight.likes === "number" ? { likes: insight.likes } : {}),
        ...(typeof insight.comments === "number" ? { comments: insight.comments } : {}),
        insight,
      };
    })
    .filter((post): post is NonNullable<typeof post> => post !== null);

  if (!enriched.length) return { covered: insights.size, updated: 0 };
  const updated = await savePosts(handle, enriched);
  return { covered: insights.size, updated };
}

// ---------------------------------------------------------------------------
// Owner-only sync from Graph — used when Apify cannot run
// ---------------------------------------------------------------------------

const SHORTCODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/**
 * The numeric media id encoded in a shortcode — the same id Apify stores as
 * post_id.
 *
 * Graph and Apify give one post different ids, so a Graph-sourced post stored
 * under Graph's own id would duplicate the Apify row for the same reel. The
 * shortcode is base-64 of the id Apify uses; decoding it was checked against
 * every stored post (60 of 60 matched) before this was relied on. BigInt,
 * because these ids exceed Number's exact range.
 */
export function mediaIdFromShortcode(code: string): string | null {
  let id = 0n;
  for (const char of code) {
    const digit = SHORTCODE_ALPHABET.indexOf(char);
    if (digit < 0) return null;
    id = id * 64n + BigInt(digit);
  }
  return id > 0n ? id.toString() : null;
}

function graphFormat(item: { media_product_type?: string; media_type?: string }): ContentFormat {
  if (item.media_product_type === "REELS") return "reel";
  if (item.media_type === "CAROUSEL_ALBUM") return "carousel";
  if (item.media_type === "VIDEO") return "video";
  return "image";
}

/**
 * The owner's profile and posts, entirely from the Graph API.
 *
 * The fallback for when Apify cannot run — its monthly limit reached, the
 * token rejected, the service down. Graph is free and reads only the account
 * we hold a token for, so this covers the owner and nothing else: competitors
 * genuinely need Apify and stay on their last scrape.
 *
 * Posts come back with Graph insights attached and stored under the SAME id
 * Apify uses, so when Apify returns it updates these rows rather than adding
 * duplicates. `views` on a post first seen here is Graph's count, because no
 * scraped count exists yet; the next Apify scrape replaces it with the scraped
 * figure, and every owner panel reads Graph's number from `insight` anyway.
 */
export async function fetchOwnerFromGraph(capturedAt: string): Promise<{
  snapshot: AccountSnapshot;
  posts: PostRecord[];
}> {
  const igId = igAccountId();
  if (!igId) throw new Error("INSTAGRAM_BUSINESS_ACCOUNT_ID is not set");

  const [profile, media, insights] = await Promise.all([
    graph<{
      username?: string;
      name?: string;
      biography?: string;
      followers_count?: number;
      follows_count?: number;
      media_count?: number;
    }>(igId, { fields: "username,name,biography,followers_count,follows_count,media_count" }),
    graph<{ data?: Array<GraphMedia & { caption?: string }> }>(`${igId}/media`, {
      fields:
        "id,caption,permalink,media_product_type,media_type,timestamp,like_count,comments_count",
      limit: String(MEDIA_LIMIT),
    }),
    fetchMediaInsights(),
  ]);

  if (!profile.username || typeof profile.followers_count !== "number") {
    // A snapshot of 0 followers would draw a cliff in the growth curve that
    // never happened. Refuse instead, and the caller reports it.
    throw new Error("Graph returned no follower count — token or permissions are broken.");
  }

  const snapshot: AccountSnapshot = {
    handle: profile.username,
    displayName: profile.name ?? profile.username,
    ...(profile.biography ? { headline: profile.biography.split("\n")[0] ?? "" } : {}),
    followers: profile.followers_count,
    following: profile.follows_count ?? 0,
    postsCount: profile.media_count ?? 0,
    capturedAt,
  };

  const posts: PostRecord[] = [];
  for (const item of media.data ?? []) {
    const code = shortcodeOf(item.permalink);
    const postId = code ? mediaIdFromShortcode(code) : null;
    if (!postId || !item.timestamp) continue;
    const insight = insights.get(code ?? "");
    posts.push({
      platform: "instagram",
      postId,
      ...(item.permalink ? { url: item.permalink } : {}),
      caption: (item.caption ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
      format: graphFormat(item),
      publishedAt: new Date(item.timestamp).toISOString(),
      views: insight?.views ?? 0,
      likes: item.like_count ?? 0,
      comments: item.comments_count ?? 0,
      shares: insight?.shares ?? 0,
      // Graph does not expose pinning. New posts are almost never pinned, and
      // stored posts keep their scraped flag because only NEW posts are
      // written from this path.
      pinned: false,
      ...(insight ? { insight } : {}),
    });
  }

  return { snapshot, posts };
}
