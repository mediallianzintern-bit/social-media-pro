// Step 2 of the LinkedIn API work: Pritesh Sir's owner-only figures on every
// sync. See lib/linkedin-analytics.ts for the schedule and supabase/migrations
// 0025 for the tables.
//
// The scrapers stay: LinkedIn's API cannot list his posts (r_member_social is
// closed to new apps) and cannot see competitors. The posts scraper finds each
// post and its LinkedIn ID; this asks LinkedIn for that post's impressions,
// members reached, saves and sends.
//
// Free, and never fatal: without a connection, past the daily limit, or with
// LinkedIn down, the sync carries on exactly as before.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ACCOUNT_CALLS,
  CALLS_PER_RUN,
  duePosts,
  entityParam,
  POST_METRICS,
  type LinkedInPostFigures,
  type PostMetric,
  type TrackedPost,
} from "@/lib/linkedin-analytics";

import { linkedInGet, readToken } from "./linkedin-api";
import { hasDurableStore } from "./store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

export interface ScrapedPostId {
  postId: string;
  shareUrn: string;
  publishedAt: string | null;
}

export interface AnalyticsRefresh {
  ran: boolean;
  reason?: string;
  posts: number;
  calls: number;
  account: boolean;
  errors: string[];
}

/** Keeps each post's LinkedIn ID, so a post the backup scraper brings back still has one. */
async function rememberShareUrns(posts: ScrapedPostId[]): Promise<void> {
  const known = posts.filter((post) => entityParam(post.shareUrn));
  if (!known.length) return;
  const { error } = await db()
    .from("linkedin_post_analytics")
    .upsert(
      known.map((post) => ({
        post_id: post.postId,
        share_urn: post.shareUrn,
        published_at: post.publishedAt,
      })),
      { onConflict: "post_id" },
    );
  if (error) throw new Error(error.message);
}

const stopping = (error: unknown) => {
  const status = (error as { status?: number }).status;
  return status === 401 || status === 403 || status === 429;
};

const restliDate = (date: Date) =>
  `(day:${date.getUTCDate()},month:${date.getUTCMonth() + 1},year:${date.getUTCFullYear()})`;

/**
 * After a LinkedIn sync: remembers the posts' IDs, then asks LinkedIn for the
 * figures that are due, within the day's budget. Free.
 */
export async function refreshLinkedInAnalytics(
  scraped: ScrapedPostId[],
): Promise<AnalyticsRefresh> {
  const result: AnalyticsRefresh = { ran: false, posts: 0, calls: 0, account: false, errors: [] };
  if (!hasDurableStore()) return { ...result, reason: "No database." };
  await rememberShareUrns(scraped);
  const token = await readToken();
  if (!token) return { ...result, reason: "LinkedIn is not connected." };
  result.ran = true;
  let budget = CALLS_PER_RUN;

  // His account, once a day.
  const today = new Date().toISOString().slice(0, 10);
  const { data: todayRow } = await db()
    .from("linkedin_account_daily")
    .select("day")
    .eq("day", today)
    .maybeSingle();
  if (!todayRow) {
    budget -= ACCOUNT_CALLS;
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 86_400_000);
    const total = (metric: string) =>
      linkedInGet<{ elements?: Array<{ count?: number }> }>(
        `memberCreatorPostAnalytics?q=me&queryType=${metric}&aggregation=TOTAL` +
          `&dateRange=(start:${restliDate(start)},end:${restliDate(end)})`,
        token,
      ).then((body) => (body.elements ?? []).reduce((sum, row) => sum + (row.count ?? 0), 0));
    const settled = await Promise.allSettled([
      linkedInGet<{ elements?: Array<{ memberFollowersCount?: number }> }>(
        "memberFollowersCount?q=me",
        token,
      ).then((body) => body.elements?.[0]?.memberFollowersCount ?? null),
      total("IMPRESSION"),
      total("MEMBERS_REACHED"),
    ]);
    result.calls += ACCOUNT_CALLS;
    const [followers, impressions, reached] = settled.map((outcome) =>
      outcome.status === "fulfilled" ? outcome.value : null,
    );
    for (const outcome of settled) {
      if (outcome.status === "rejected")
        result.errors.push(String(outcome.reason?.message ?? outcome.reason));
    }
    if (settled.some((outcome) => outcome.status === "rejected" && stopping(outcome.reason))) {
      return { ...result, reason: "LinkedIn refused: the connection or the daily limit." };
    }
    const { error } = await db().from("linkedin_account_daily").upsert(
      {
        day: today,
        followers,
        impressions_30d: impressions,
        members_reached_30d: reached,
        captured_at: new Date().toISOString(),
      },
      { onConflict: "day" },
    );
    if (!error) result.account = true;
  }

  // His posts, the ones due, newest first.
  const { data } = await db()
    .from("linkedin_post_analytics")
    .select("post_id,share_urn,published_at,fetched_at");
  const tracked: TrackedPost[] = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    postId: String(row["post_id"]),
    shareUrn: String(row["share_urn"]),
    publishedAt: (row["published_at"] as string | null) ?? null,
    fetchedAt: (row["fetched_at"] as string | null) ?? null,
  }));
  const field: Record<PostMetric, string> = {
    IMPRESSION: "impressions",
    MEMBERS_REACHED: "members_reached",
    POST_SAVE: "saves",
    POST_SEND: "sends",
  };
  for (const post of duePosts(tracked, budget)) {
    const entity = entityParam(post.shareUrn)!;
    const figures: Record<string, number | null> = {};
    let stop = false;
    for (const metric of POST_METRICS) {
      result.calls += 1;
      try {
        const body = await linkedInGet<{ elements?: Array<{ count?: number }> }>(
          `memberCreatorPostAnalytics?q=entity&entity=${entity}&queryType=${metric}&aggregation=TOTAL`,
          token,
        );
        figures[field[metric]] = body.elements?.[0]?.count ?? 0;
      } catch (error) {
        result.errors.push(`${post.postId} ${metric}: ${(error as Error).message}`);
        if (stopping(error)) stop = true;
        break;
      }
    }
    if (stop) return { ...result, reason: "LinkedIn refused: the connection or the daily limit." };
    // Only a complete set is stored, so a half-fetched post is asked again next time.
    if (Object.keys(figures).length !== POST_METRICS.length) continue;
    const { error } = await db()
      .from("linkedin_post_analytics")
      .update({ ...figures, fetched_at: new Date().toISOString() })
      .eq("post_id", post.postId);
    if (!error) result.posts += 1;
  }
  return result;
}

export interface LinkedInAnalytics {
  connected: boolean;
  posts: LinkedInPostFigures[];
  account: {
    day: string;
    followers: number | null;
    impressions30d: number | null;
    membersReached30d: number | null;
  } | null;
}

/** Every stored figure, for the LinkedIn page. Free: stored rows only. */
export async function readLinkedInAnalytics(): Promise<LinkedInAnalytics> {
  const empty: LinkedInAnalytics = { connected: false, posts: [], account: null };
  if (!hasDurableStore()) return empty;
  const [token, posts, account] = await Promise.all([
    readToken(),
    db()
      .from("linkedin_post_analytics")
      .select("post_id,impressions,members_reached,saves,sends,fetched_at")
      .not("fetched_at", "is", null),
    db()
      .from("linkedin_account_daily")
      .select("day,followers,impressions_30d,members_reached_30d")
      .order("day", { ascending: false })
      .limit(1),
  ]);
  const num = (value: unknown) => (value == null ? null : Number(value));
  const latest = ((account.data ?? []) as Array<Record<string, unknown>>)[0];
  return {
    connected: Boolean(token),
    posts: ((posts.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      postId: String(row["post_id"]),
      impressions: num(row["impressions"]),
      membersReached: num(row["members_reached"]),
      saves: num(row["saves"]),
      sends: num(row["sends"]),
      fetchedAt: (row["fetched_at"] as string | null) ?? null,
    })),
    account: latest
      ? {
          day: String(latest["day"]),
          followers: num(latest["followers"]),
          impressions30d: num(latest["impressions_30d"]),
          membersReached30d: num(latest["members_reached_30d"]),
        }
      : null,
  };
}
