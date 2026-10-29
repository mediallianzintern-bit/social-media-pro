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

import {
  DAILY_HISTORY_DAYS,
  DAILY_METRICS,
  priorPeriodOf,
  sumPeriod,
  type DailyRow,
  type LinkedInPeriod,
  type PeriodTotals,
} from "@/lib/linkedin-analytics";

import type { LinkedInArticle } from "@/lib/linkedin-articles";

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
    // LinkedIn's end date is exclusive: tomorrow, so today's figures are included.
    const end = new Date(Date.now() + 86_400_000);
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
    // His account day by day, for the Discovery and Engagement cards.
    await refreshMemberDaily(token).catch((error: unknown) =>
      result.errors.push(`daily: ${(error as Error).message}`),
    );
  }

  // His posts, the ones due, newest first. "*" so this still runs before 0027
  // adds impressions_at.
  const { data } = await db().from("linkedin_post_analytics").select("*");
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const hasImpressionsAt = rows.some((row) => "impressions_at" in row);
  const tracked: TrackedPost[] = rows.map((row) => ({
    postId: String(row["post_id"]),
    shareUrn: String(row["share_urn"]),
    publishedAt: (row["published_at"] as string | null) ?? null,
    fetchedAt: (row["fetched_at"] as string | null) ?? null,
    // Without the column there is no record of an impressions-only read, so
    // none is done: it would repeat on every sync.
    impressionsAt: hasImpressionsAt
      ? ((row["impressions_at"] as string | null) ?? null)
      : new Date().toISOString(),
  }));
  const field: Record<PostMetric, string> = {
    IMPRESSION: "impressions",
    MEMBERS_REACHED: "members_reached",
    POST_SAVE: "saves",
    POST_SEND: "sends",
  };
  for (const { post, metrics } of duePosts(tracked, budget)) {
    const entity = entityParam(post.shareUrn)!;
    const figures: Record<string, number | null> = {};
    let stop = false;
    for (const metric of metrics) {
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
    if (Object.keys(figures).length !== metrics.length) continue;
    const at = new Date().toISOString();
    const stamps =
      metrics.length === POST_METRICS.length
        ? { fetched_at: at, ...(hasImpressionsAt ? { impressions_at: at } : {}) }
        : { impressions_at: at };
    const { error } = await db()
      .from("linkedin_post_analytics")
      .update({ ...figures, ...stamps })
      .eq("post_id", post.postId);
    if (!error) result.posts += 1;
  }
  return result;
}

/**
 * His LinkedIn articles, from the posts that share them. Free: the scraper
 * already returned them. Never fatal: before 0028 the write simply fails.
 */
export async function saveLinkedInArticles(articles: LinkedInArticle[]): Promise<number> {
  if (!hasDurableStore() || !articles.length) return 0;
  const { error } = await db()
    .from("linkedin_articles")
    .upsert(
      articles.map((article) => ({
        post_id: article.postId,
        title: article.title,
        url: article.url,
        read_minutes: article.readMinutes,
        published_at: article.publishedAt,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "post_id" },
    );
  return error ? 0 : articles.length;
}

export interface LinkedInAnalytics {
  connected: boolean;
  posts: LinkedInPostFigures[];
  /** His LinkedIn articles, by the post that shares each one. */
  articles: LinkedInArticle[];
  account: {
    day: string;
    followers: number | null;
    impressions30d: number | null;
    membersReached30d: number | null;
  } | null;
}

/** Every stored figure, for the LinkedIn page. Free: stored rows only. */
export async function readLinkedInAnalytics(): Promise<LinkedInAnalytics> {
  const empty: LinkedInAnalytics = { connected: false, posts: [], articles: [], account: null };
  if (!hasDurableStore()) return empty;
  const [token, posts, account, articles] = await Promise.all([
    readToken(),
    db().from("linkedin_post_analytics").select("*").not("fetched_at", "is", null),
    db()
      .from("linkedin_account_daily")
      .select("day,followers,impressions_30d,members_reached_30d")
      .order("day", { ascending: false })
      .limit(1),
    // Empty before 0028 is applied.
    db().from("linkedin_articles").select("post_id,title,url,read_minutes,published_at"),
  ]);
  const num = (value: unknown) => (value == null ? null : Number(value));
  const latest = ((account.data ?? []) as Array<Record<string, unknown>>)[0];
  return {
    connected: Boolean(token),
    articles: ((articles.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      postId: String(row["post_id"]),
      title: String(row["title"]),
      url: (row["url"] as string | null) ?? null,
      readMinutes: num(row["read_minutes"]),
      publishedAt: (row["published_at"] as string | null) ?? null,
    })),
    posts: ((posts.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      postId: String(row["post_id"]),
      impressions: num(row["impressions"]),
      membersReached: num(row["members_reached"]),
      saves: num(row["saves"]),
      sends: num(row["sends"]),
      // The latest read of any figure: impressions are read more often.
      fetchedAt:
        [row["fetched_at"], row["impressions_at"]]
          .filter((at): at is string => typeof at === "string")
          .sort()
          .at(-1) ?? null,
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

/**
 * His account's last 180 days, one row per UTC day, one call per figure. Free.
 * The whole history is asked for each time because LinkedIn keeps adding to
 * recent days as late impressions are counted.
 */
export async function refreshMemberDaily(token: string): Promise<number> {
  // LinkedIn's end date is exclusive: tomorrow, so today's figures are included.
  const end = new Date(Date.now() + 86_400_000);
  const start = new Date(end.getTime() - DAILY_HISTORY_DAYS * 86_400_000);
  const byDay = new Map<string, Record<string, number | string>>();
  for (const [metric, field] of Object.entries(DAILY_METRICS)) {
    const body = await linkedInGet<{
      elements?: Array<{
        count?: number;
        dateRange?: { start?: { year: number; month: number; day: number } };
      }>;
    }>(
      `memberCreatorPostAnalytics?q=me&queryType=${metric}&aggregation=DAILY` +
        `&dateRange=(start:${restliDate(start)},end:${restliDate(end)})`,
      token,
    );
    for (const row of body.elements ?? []) {
      const at = row.dateRange?.start;
      if (!at) continue;
      const day = `${at.year}-${String(at.month).padStart(2, "0")}-${String(at.day).padStart(2, "0")}`;
      const entry = byDay.get(day) ?? { day };
      entry[field] = row.count ?? 0;
      byDay.set(day, entry);
    }
  }
  // New followers each day, LinkedIn's own count (0029). One more call; a
  // failure leaves the other figures stored as before.
  try {
    const followers = await linkedInGet<{
      elements?: Array<{
        memberFollowersCount?: number;
        dateRange?: { start?: { year: number; month: number; day: number } };
      }>;
    }>(
      `memberFollowersCount?q=dateRange&dateRange=(start:${restliDate(start)},end:${restliDate(end)})`,
      token,
    );
    for (const row of followers.elements ?? []) {
      const at = row.dateRange?.start;
      if (!at) continue;
      const day = `${at.year}-${String(at.month).padStart(2, "0")}-${String(at.day).padStart(2, "0")}`;
      const entry = byDay.get(day) ?? { day };
      entry["new_followers"] = row.memberFollowersCount ?? 0;
      byDay.set(day, entry);
    }
  } catch (error) {
    console.warn("[linkedin] daily new followers not read:", (error as Error).message);
  }
  if (!byDay.size) return 0;
  const fetchedAt = new Date().toISOString();
  const { error } = await db()
    .from("linkedin_member_daily")
    .upsert(
      [...byDay.values()].map((entry) => ({ ...entry, fetched_at: fetchedAt })),
      { onConflict: "day" },
    );
  if (error) throw new Error(error.message);
  return byDay.size;
}

export interface LinkedInPeriodFigures {
  connected: boolean;
  period: PeriodTotals | null;
  prior: PeriodTotals | null;
  /** Distinct people reached in the period. Null when LinkedIn could not be asked. */
  membersReached: number | null;
  /** The latest day stored, so the card can say how fresh it is. */
  lastDay: string | null;
  /** New followers in the period, LinkedIn's own daily count. Null before 0029 or its first read. */
  newFollowers: number | null;
}

const REACH_FRESH_MS = 24 * 3_600_000;

/**
 * Discovery and Engagement for one period: summed from the stored days, and
 * members reached asked of LinkedIn once per period per day. Free.
 */
export async function readLinkedInPeriod(period: LinkedInPeriod): Promise<LinkedInPeriodFigures> {
  const none: LinkedInPeriodFigures = {
    connected: false,
    period: null,
    prior: null,
    membersReached: null,
    lastDay: null,
    newFollowers: null,
  };
  if (!hasDurableStore()) return none;
  const [token, daily] = await Promise.all([
    readToken(),
    db().from("linkedin_member_daily").select("*").order("day", { ascending: true }),
  ]);
  const raw = (daily.data ?? []) as Array<Record<string, unknown>>;
  const inPeriod = (day: string) => (!period.start || day >= period.start) && day < period.end;
  const followerDays = raw.filter(
    (row) => row["new_followers"] != null && inPeriod(String(row["day"])),
  );
  const newFollowers = followerDays.length
    ? followerDays.reduce((sum, row) => sum + Number(row["new_followers"]), 0)
    : null;
  const rows = raw.map((row) => {
    const entry: Record<string, unknown> = { day: String(row["day"]) };
    for (const field of Object.values(DAILY_METRICS)) entry[field] = Number(row[field] ?? 0);
    return entry as DailyRow;
  });
  if (!rows.length) return { ...none, connected: Boolean(token) };

  const prior = priorPeriodOf(period);
  const earliest = rows[0]!.day;
  const result: LinkedInPeriodFigures = {
    connected: Boolean(token),
    period: sumPeriod(rows, period),
    // Only when the stored days reach back far enough to cover it.
    prior: prior && prior.start && prior.start >= earliest ? sumPeriod(rows, prior) : null,
    membersReached: null,
    lastDay: rows.at(-1)!.day,
    newFollowers,
  };

  const key = `${period.start ?? "all"}..${period.end}`;
  const { data: cached } = await db()
    .from("linkedin_reach_cache")
    .select("members_reached,fetched_at")
    .eq("period", key)
    .maybeSingle();
  if (cached && Date.now() - Date.parse(cached.fetched_at) < REACH_FRESH_MS) {
    result.membersReached = cached.members_reached ?? null;
    return result;
  }
  if (!token) return { ...result, membersReached: cached?.members_reached ?? null };
  const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
  const range = period.start
    ? `(start:${restliDate(asDate(period.start))},end:${restliDate(asDate(period.end))})`
    : `(end:${restliDate(asDate(period.end))})`;
  try {
    const body = await linkedInGet<{ elements?: Array<{ count?: number }> }>(
      `memberCreatorPostAnalytics?q=me&queryType=MEMBERS_REACHED&aggregation=TOTAL&dateRange=${range}`,
      token,
    );
    result.membersReached = (body.elements ?? []).reduce((sum, row) => sum + (row.count ?? 0), 0);
    await db().from("linkedin_reach_cache").upsert(
      {
        period: key,
        members_reached: result.membersReached,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "period" },
    );
  } catch {
    result.membersReached = cached?.members_reached ?? null;
  }
  return result;
}
