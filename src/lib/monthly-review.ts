// The monthly report (26 Nov 2026), for the client-facing Performance report.
//
// Laid out like the agency's own monthly report (the October 2026 workbook for
// Dr. Pritesh Patel): this month against the month before on every figure,
// the follower trend, topics, the day of the week, the best posts of both
// months, every post this month, competitors and the audience, with the
// changes and findings written out in words.
//
// Every figure here is code, from the stored posts and syncs, using the same
// functions as the dashboard (lib/analytics-types.ts), so the sentences quote
// the same numbers as the tables beside them. No model call, nothing spent.
// The planning half of the workbook (positioning, next month's plan and
// targets, who does what) is the team's own writing and is not made up here.
//
// Plain words, per the UI/UX brief of 12 Nov 2026: "topic" not lane,
// "typical" not median, "usual" for the account's own typical post.
import {
  cadence,
  engagementRate,
  engagementsOf,
  lanePerformance,
  median,
  reachEngagementRate,
  viewsOf,
  type ContentFormat,
  type GrowthPoint,
  type InstagramInsights,
  type PlatformId,
  type PostRecord,
} from "@/lib/analytics-types";
import { istDay } from "@/lib/report-periods";
import type { LinkedInReview } from "@/lib/linkedin-review";

/** What a post is judged on: views where the platform publishes them, interactions otherwise. */
export type Basis = "views" | "interactions";

/** One post as the monthly report shows it. */
export interface ReviewPost {
  post: PostRecord;
  /** The caption's first line, clipped: one line per row. */
  title: string;
  /** Monday is 1 ... Sunday 7, in IST. */
  weekday: number;
  /** Views or interactions, per the basis. */
  value: number;
  /** `value` against the period's typical post; null without one. */
  vsTypical: number | null;
  topic: string | null;
}

export interface Figures {
  posts: number;
  postsPerWeek: number;
  /** Followers at the end of the period; null without a sync in it. */
  followersEnd: number | null;
  /** Null without two syncs to compare. */
  followerChange: number | null;
  followerDays: number | null;
  /** When the follower figure starts, if it starts late in the period (tracking began mid-way). */
  followersFrom: string | null;
  /** Likes + comments + shares. */
  interactions: number;
  interactionsPerPost: number;
  typicalInteractions: number;
  /** Interactions ÷ public views; null where too few posts carry a public view count. */
  engagementRate: number | null;
  /** Interactions ÷ reach, owner-only. */
  reachRate: number | null;
  typicalViews: number | null;
  typicalReach: number | null;
  typicalSaves: number | null;
  typicalShares: number | null;
  avgWatchSeconds: number | null;
  best: ReviewPost | null;
  postsAt3x: number;
  postsUnderHalf: number;
  /** Views basis only (Instagram): the period's views, their average, and the spread. */
  totalViews: number | null;
  averageViews: number | null;
  postsOver1000: number | null;
  postsUnder300: number | null;
}

export interface TopicStat {
  posts: number;
  /** Typical post in this topic against the account's typical post that period. */
  vsTypical: number;
  shareOfPostsPct: number;
  shareOfInteractionsPct: number;
  typicalSaves: number | null;
  /** Fewer than three posts: one post moves the figure a long way. */
  fewPosts: boolean;
}

export interface TopicRow {
  topic: string;
  current: TopicStat | null;
  previous: TopicStat | null;
}

export interface WeekdayRow {
  /** Monday is 1 ... Sunday 7. */
  weekday: number;
  current: { typical: number; posts: number };
  previous: { typical: number; posts: number };
}

export interface BenchmarkRow {
  handle: string;
  displayName: string;
  followers: number;
  postsPerWeek: number;
  typicalInteractions: number;
  engagementRate: number | null;
  aspirational?: boolean;
  /** "Engages 2.2× more", "You engage more", "About the same"; null when it cannot be said. */
  gap: string | null;
}

export interface AudienceShare {
  label: string;
  /** 0-1. */
  share: number;
}

export interface MonthlyReview {
  platform: PlatformId;
  basis: Basis;
  /** Column headings: "Oct 2026", "Sep 2026". */
  currentShort: string;
  previousShort: string;
  /** Inside a sentence: "October", "September". */
  currentName: string;
  previousName: string;
  current: Figures;
  previous: Figures;
  topics: TopicRow[];
  weekdays: WeekdayRow[];
  best: { current: ReviewPost[]; previous: ReviewPost[] };
  /** Every post this period, oldest first. */
  posts: ReviewPost[];
  /** Every post of the period before, oldest first, breakouts included and marked by `excluded`. */
  previousPosts: ReviewPost[];
  /**
   * The period before's breakout posts, left out of every comparison
   * (Instagram only; empty when there were none, or on LinkedIn). Their
   * `vsTypical` is against all of that period's posts.
   */
  excluded: ReviewPost[];
  /** The account itself, then each tracked competitor. Empty with none tracked. */
  benchmark: { you: BenchmarkRow; rivals: BenchmarkRow[] } | null;
  /** Lifetime follower shares; Instagram with the owner's Meta connection only. */
  audience: {
    age: AudienceShare[];
    country: AudienceShare[];
    gender: AudienceShare[];
    city: AudienceShare[];
  } | null;
  /** Instagram's own last-28-days panel; only when the period ends within the last few days. */
  last28Days: {
    reach: number;
    accountsEngaged: number;
    profileViews: number;
    websiteClicks: number;
    capturedAt: string;
  } | null;
  /** "What changed since September": three or four sentences. */
  changes: string[];
  /** The key findings, numbered on the page. */
  findings: string[];
  /** The account in one or two sentences, to open the report. */
  intro: string;
  /**
   * LinkedIn's own figures (impressions, members reached, engagement rate,
   * new followers), laid out like the LinkedIn strategy workbook. Null on
   * Instagram, and on LinkedIn without the account's LinkedIn connection.
   */
  linkedin: LinkedInReview | null;
}

const WEEKDAY = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const FORMAT_WORD: Record<ContentFormat, string> = {
  reel: "Reel",
  carousel: "carousel",
  image: "image",
  video: "video",
  text: "text post",
  article: "article",
};

/** Mon=1 ... Sun=7, in IST. */
const weekdayOf = (iso: string) => {
  const day = istDay(Date.parse(iso)).weekday;
  return day === 0 ? 7 : day;
};

/**
 * A post's one-line title: the caption's first sentence (its first line when
 * that is shorter), at most `max` characters.
 */
export function titleOf(caption: string, max = 80): string {
  const line =
    caption
      .split("\n")
      .map((part) => part.trim())
      .find(Boolean) ?? "";
  if (!line) return "(no caption)";
  const sentence = line.split(/(?<=[.!?])\s+/)[0] ?? line;
  const title = sentence.length >= 20 ? sentence : line;
  return title.length > max ? `${title.slice(0, max - 1).trimEnd()}…` : title;
}

/** 17,646 in full below a hundred thousand, 197K above: exact where a reader compares. */
export function num(value: number): string {
  if (Math.abs(value) >= 100_000)
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
      value,
    );
  // Whole numbers from 100 up: a typical 635.5 views reads as 636.
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 1,
  }).format(value);
}

/** "a", "a and b", "a, b and c". */
const listOf = (items: string[]) =>
  items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
const pct = (value: number, digits = 2) => `${(value * 100).toFixed(digits)}%`;
const times = (value: number) => `${value.toFixed(2)}×`;
const plural = (count: number, one: string, many = `${one}s`) =>
  `${num(count)} ${count === 1 ? one : many}`;
const capital = (text: string) => text.replace(/^./, (c) => c.toUpperCase());

const organic = (posts: PostRecord[]) => posts.filter((post) => !post.pinned);

/** The basis both periods are judged on, so a month is never views and the next interactions. */
export function basisOf(...groups: PostRecord[][]): Basis {
  return groups.some((posts) => organic(posts).some((post) => viewsOf(post) > 0))
    ? "views"
    : "interactions";
}

function valueOf(post: PostRecord, basis: Basis): number {
  return basis === "views" ? viewsOf(post) : engagementsOf(post);
}

/** The typical post: the median, over posts that carry the figure at all for views. */
function typicalOf(posts: PostRecord[], basis: Basis): number {
  const values = posts.map((post) => valueOf(post, basis));
  return median(basis === "views" ? values.filter((value) => value > 0) : values);
}

function reviewPosts(posts: PostRecord[], basis: Basis): ReviewPost[] {
  const typical = typicalOf(posts, basis);
  return posts.map((post) => {
    const value = valueOf(post, basis);
    return {
      post,
      title: titleOf(post.caption),
      weekday: weekdayOf(post.publishedAt),
      value,
      vsTypical: typical > 0 && (basis === "interactions" || value > 0) ? value / typical : null,
      topic: post.contentLane ?? null,
    };
  });
}

const medianOrNull = (values: number[]) => (values.length ? median(values) : null);

/**
 * The follower change across a period: from the last sync before it starts
 * (when there is one within four days) or its first sync, to its last sync.
 */
export function followersIn(
  growth: GrowthPoint[],
  since: string | null,
  until: string | null,
): Pick<Figures, "followersEnd" | "followerChange" | "followerDays" | "followersFrom"> {
  const inside = growth.filter(
    (point) => (!since || point.capturedAt >= since) && (!until || point.capturedAt < until),
  );
  const last = inside[inside.length - 1];
  if (!last)
    return { followersEnd: null, followerChange: null, followerDays: null, followersFrom: null };
  const before = since ? growth.filter((point) => point.capturedAt < since).pop() : undefined;
  const sinceMs = since ? Date.parse(since) : null;
  const start =
    before && sinceMs !== null && sinceMs - Date.parse(before.capturedAt) <= 4 * 86_400_000
      ? before
      : inside[0]!;
  const startMs = Date.parse(start.capturedAt);
  const lateStart = sinceMs !== null && startMs - sinceMs > 2 * 86_400_000;
  return {
    followersEnd: last.followers,
    followerChange: start === last ? null : last.followers - start.followers,
    followerDays:
      start === last
        ? null
        : Math.max(1, Math.round((Date.parse(last.capturedAt) - startMs) / 86_400_000)),
    followersFrom: lateStart ? start.capturedAt : null,
  };
}

function figuresOf(
  posts: PostRecord[],
  basis: Basis,
  days: number,
  followers: ReturnType<typeof followersIn>,
): Figures {
  const list = organic(posts);
  const reviewed = reviewPosts(list, basis);
  const measured = list.filter((post) => post.insight);
  const interactions = list.reduce((sum, post) => sum + engagementsOf(post), 0);
  const withPublicViews = list.filter((post) => post.views > 0).length;
  const watch = list
    .map((post) => post.insight?.avgWatchMs)
    .filter((value): value is number => value !== undefined && value > 0);
  const best = reviewed.reduce<ReviewPost | null>(
    (top, row) => (!top || row.value > top.value ? row : top),
    null,
  );
  return {
    posts: list.length,
    // The dashboard's own figure (cadence: posts between the first and the
    // last), so the report, the Instagram page and the competitor table all
    // say the same 5.6 a week for October (27 Nov 2026).
    postsPerWeek: list.length ? Number(cadence(list).toFixed(1)) : 0,
    ...followers,
    interactions,
    interactionsPerPost: list.length ? Number((interactions / list.length).toFixed(1)) : 0,
    typicalInteractions: list.length ? median(list.map((post) => engagementsOf(post))) : 0,
    // The dashboard's own rate, on public views: comparable with competitors.
    // Only when most posts carry a public view count, or it is not that rate.
    engagementRate:
      basis === "views" && list.length && withPublicViews * 2 >= list.length
        ? engagementRate(list, followers.followersEnd ?? 0)
        : null,
    reachRate: reachEngagementRate(list),
    typicalViews: basis === "views" && list.length ? typicalOf(list, "views") || null : null,
    typicalReach: medianOrNull(measured.map((post) => post.insight!.reach)),
    typicalSaves: medianOrNull(measured.map((post) => post.insight!.saved)),
    typicalShares: medianOrNull(measured.map((post) => post.insight!.shares)),
    // The middle Reel's average watch, as the dashboard's "Avg watch time"
    // shows it (27 Nov 2026): October's 9.8s on both.
    avgWatchSeconds: watch.length ? Number((median(watch) / 1000).toFixed(1)) : null,
    best,
    postsAt3x: reviewed.filter((row) => row.vsTypical !== null && row.vsTypical >= 3).length,
    postsUnderHalf: reviewed.filter((row) => row.vsTypical !== null && row.vsTypical < 0.5).length,
    ...viewSpread(list, basis),
  };
}

/** Total and average views, and how many posts passed 1,000 or stayed under 300. */
function viewSpread(
  list: PostRecord[],
  basis: Basis,
): Pick<Figures, "totalViews" | "averageViews" | "postsOver1000" | "postsUnder300"> {
  const views = list.map((post) => viewsOf(post)).filter((value) => value > 0);
  if (basis !== "views" || !views.length)
    return { totalViews: null, averageViews: null, postsOver1000: null, postsUnder300: null };
  const total = views.reduce((sum, value) => sum + value, 0);
  return {
    totalViews: total,
    averageViews: Math.round(total / views.length),
    postsOver1000: views.filter((value) => value >= 1000).length,
    postsUnder300: views.filter((value) => value < 300).length,
  };
}

/**
 * The period before's breakout posts (Instagram, 26 Nov 2026): 3× its typical
 * post or more. The monthly Instagram report compares against the period
 * without them, so a single viral Reel last month does not make this month
 * look like a collapse; they are listed on their own instead. Left in when
 * taking them out would leave fewer than three posts to compare with.
 */
export function breakoutsOf(posts: PostRecord[], basis: Basis): ReviewPost[] {
  const rows = reviewPosts(organic(posts), basis);
  const out = rows.filter((row) => row.vsTypical !== null && row.vsTypical >= 3);
  return rows.length - out.length >= 3 ? out.sort((a, b) => b.value - a.value) : [];
}

const topicKey = (name: string) => name.trim().toLowerCase();
const isOther = (name: string) => topicKey(name) === "other";

function topicRows(current: PostRecord[], previous: PostRecord[]): TopicRow[] {
  const stat = (posts: PostRecord[]) =>
    new Map(
      lanePerformance(organic(posts)).map((lane) => [
        topicKey(lane.lane),
        {
          name: lane.lane,
          stat: {
            posts: lane.postCount,
            vsTypical: lane.medianVsMedian,
            shareOfPostsPct: lane.shareOfOutputPct,
            shareOfInteractionsPct: lane.shareOfPerformancePct,
            typicalSaves: lane.medianSaves ?? null,
            fewPosts: lane.directional,
          } satisfies TopicStat,
        },
      ]),
    );
  const now = stat(current);
  const before = stat(previous);
  const keys = [...new Set([...now.keys(), ...before.keys()])];
  return keys
    .map((key) => ({
      topic: now.get(key)?.name ?? before.get(key)?.name ?? key,
      current: now.get(key)?.stat ?? null,
      previous: before.get(key)?.stat ?? null,
    }))
    .sort(
      (a, b) =>
        Number(isOther(a.topic)) - Number(isOther(b.topic)) ||
        (b.current?.posts ?? 0) - (a.current?.posts ?? 0) ||
        (b.previous?.posts ?? 0) - (a.previous?.posts ?? 0),
    );
}

function weekdayRows(current: PostRecord[], previous: PostRecord[], basis: Basis): WeekdayRow[] {
  const group = (posts: PostRecord[], weekday: number) => {
    const on = organic(posts).filter((post) => weekdayOf(post.publishedAt) === weekday);
    return { typical: on.length ? typicalOf(on, basis) : 0, posts: on.length };
  };
  return [1, 2, 3, 4, 5, 6, 7]
    .map((weekday) => ({
      weekday,
      current: group(current, weekday),
      previous: group(previous, weekday),
    }))
    .filter((row) => row.current.posts || row.previous.posts);
}

function topBy(rows: ReviewPost[], count: number): ReviewPost[] {
  return rows
    .slice()
    .sort((a, b) => b.value - a.value)
    .slice(0, count);
}

function gapOf(theirs: number | null, yours: number | null): string | null {
  if (theirs === null || yours === null || theirs <= 0 || yours <= 0) return null;
  const ratio = theirs / yours;
  if (ratio >= 1.1) return `Engages ${ratio.toFixed(1)}× more`;
  if (ratio <= 1 / 1.1) return `You engage ${(1 / ratio).toFixed(1)}× more`;
  return "About the same";
}

function shares(slices: Array<{ label: string; value: number }>, top: number): AudienceShare[] {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (!(total > 0)) return [];
  return slices
    .slice()
    .sort((a, b) => b.value - a.value)
    .slice(0, top)
    .map((slice) => ({ label: slice.label, share: slice.value / total }));
}

/** How a change between two figures reads: "fell from 986 to 636". */
function moved(before: number, after: number, format: (value: number) => string = num): string {
  if (before === after) return `held at ${format(after)}`;
  return `${after > before ? "rose" : "fell"} from ${format(before)} to ${format(after)}`;
}

const pctChange = (before: number, after: number) =>
  before > 0
    ? `${after >= before ? "+" : "−"}${Math.abs(Math.round(((after - before) / before) * 100))}%`
    : null;

export interface MonthlyInput {
  platform: PlatformId;
  current: { posts: PostRecord[]; since: string | null; until: string | null; days: number };
  previous: { posts: PostRecord[]; since: string | null; until: string | null; days: number };
  growth: GrowthPoint[];
  handle: string;
  displayName: string;
  labels: {
    currentShort: string;
    previousShort: string;
    currentName: string;
    previousName: string;
  };
  /** Tracked competitors with their stored posts; empty with none. */
  rivals: Array<{
    handle: string;
    displayName: string;
    followers: number;
    posts: PostRecord[];
    aspirational?: boolean;
  }>;
  insights: InstagramInsights | null;
  /** The period ends within the last few days, so Instagram's last-28-days panel describes it. */
  periodIsRecent: boolean;
}

export function monthlyReview(input: MonthlyInput): MonthlyReview {
  const { labels } = input;
  const basis = basisOf(input.current.posts, input.previous.posts);
  // Instagram compares with the period before minus its breakout posts.
  const excluded = input.platform === "instagram" ? breakoutsOf(input.previous.posts, basis) : [];
  const left = new Set(excluded.map((row) => row.post.postId));
  const compared = input.previous.posts.filter((post) => !left.has(post.postId));
  const current = figuresOf(
    input.current.posts,
    basis,
    input.current.days,
    followersIn(input.growth, input.current.since, input.current.until),
  );
  const previous = figuresOf(
    compared,
    basis,
    input.previous.days,
    followersIn(input.growth, input.previous.since, input.previous.until),
  );
  const posts = reviewPosts(organic(input.current.posts), basis).sort((a, b) =>
    a.post.publishedAt.localeCompare(b.post.publishedAt),
  );
  const before = reviewPosts(organic(compared), basis);
  const previousPosts = reviewPosts(organic(input.previous.posts), basis).sort((a, b) =>
    a.post.publishedAt.localeCompare(b.post.publishedAt),
  );
  const topics = topicRows(input.current.posts, compared);
  const weekdays = weekdayRows(input.current.posts, compared, basis);

  const you: BenchmarkRow = {
    handle: input.handle,
    displayName: input.displayName,
    followers: current.followersEnd ?? 0,
    postsPerWeek: current.postsPerWeek,
    typicalInteractions: current.typicalInteractions,
    engagementRate:
      basis === "views"
        ? current.engagementRate
        : engagementRateOrNull(input.current.posts, current.followersEnd),
    gap: null,
  };
  const rivals: BenchmarkRow[] = input.rivals.map((rival) => {
    const list = organic(rival.posts);
    const rate = list.length ? engagementRate(list, rival.followers) : null;
    return {
      handle: rival.handle,
      displayName: rival.displayName,
      followers: rival.followers,
      postsPerWeek: Number(cadenceOf(list).toFixed(1)),
      typicalInteractions: list.length ? median(list.map((post) => engagementsOf(post))) : 0,
      engagementRate: rate && rate > 0 ? rate : null,
      gap: gapOf(rate, you.engagementRate),
      ...(rival.aspirational ? { aspirational: true } : {}),
    };
  });

  const audience =
    input.insights && input.platform === "instagram"
      ? {
          age: shares(input.insights.audience.age, 7),
          country: shares(input.insights.audience.country, 6),
          gender: shares(input.insights.audience.gender, 3),
          city: shares(input.insights.audience.city, 6),
        }
      : null;
  const last28Days =
    input.insights && input.periodIsRecent
      ? {
          reach: input.insights.account.reach,
          accountsEngaged: input.insights.account.accountsEngaged,
          profileViews: input.insights.account.profileViews,
          websiteClicks: input.insights.account.websiteClicks,
          capturedAt: input.insights.capturedAt,
        }
      : null;

  const review: Omit<MonthlyReview, "changes" | "findings" | "intro" | "linkedin"> = {
    platform: input.platform,
    basis,
    ...labels,
    current,
    previous,
    topics,
    weekdays,
    best: { current: topBy(posts, 4), previous: topBy(before, 4) },
    posts,
    previousPosts,
    excluded,
    benchmark: rivals.length ? { you, rivals } : null,
    audience: audience && (audience.age.length || audience.country.length) ? audience : null,
    last28Days,
  };
  return { ...review, linkedin: null, ...words(review, input) };
}

function engagementRateOrNull(posts: PostRecord[], followers: number | null): number | null {
  const list = organic(posts);
  if (!list.length || !followers) return null;
  const rate = engagementRate(list, followers);
  return rate > 0 ? rate : null;
}

/** Posts a week across a list's own span (competitors: no period to divide by). */
function cadenceOf(posts: PostRecord[]): number {
  if (posts.length < 2) return posts.length;
  const stamps = posts.map((post) => Date.parse(post.publishedAt)).sort((a, b) => a - b);
  const weeks = (stamps[stamps.length - 1]! - stamps[0]!) / (7 * 86_400_000);
  return weeks > 0 ? posts.length / weeks : posts.length;
}

const COUNTRY = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

/** "IN" as "India"; anything else as it came. */
export function countryName(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  try {
    return COUNTRY?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** "M" as "Men", "F" as "Women", "U" as "Unspecified". */
export function genderName(code: string): string {
  const key = code.trim().toUpperCase();
  return key === "M" ? "Men" : key === "F" ? "Women" : key === "U" ? "Unspecified" : code;
}

/** The changes, the findings and the opening, in words, from the figures above only. */
function words(
  review: Omit<MonthlyReview, "changes" | "findings" | "intro" | "linkedin">,
  input: MonthlyInput,
): Pick<MonthlyReview, "changes" | "findings" | "intro"> {
  const { current: now, previous: then, currentName: cur, previousName: prev, basis } = review;
  const unit = basis === "views" ? "views" : "likes, comments and shares";
  const changes: string[] = [];
  const findings: string[] = [];

  // The opening: the account in a sentence.
  const formats = new Map<ContentFormat, number>();
  for (const row of review.posts)
    formats.set(row.post.format, (formats.get(row.post.format) ?? 0) + 1);
  const mainFormat = [...formats.entries()].sort((a, b) => b[1] - a[1])[0];
  const introParts = [
    `@${input.handle} published ${plural(now.posts, "post")} in ${cur}` +
      (now.posts
        ? ` (about ${num(now.postsPerWeek)} a week${mainFormat && mainFormat[1] * 2 > now.posts ? `, mostly ${FORMAT_WORD[mainFormat[0]]}s` : ""})`
        : "") +
      (now.followersEnd !== null ? ` and has ${num(now.followersEnd)} followers.` : "."),
  ];
  const age = review.audience?.age[0];
  const country = review.audience?.country[0];
  if (age && country)
    introParts.push(
      `Most followers are ${age.label} year-olds (${pct(age.share, 0)}) and in ${countryName(country.label)} (${pct(country.share, 0)}).`,
    );

  // 0. What the comparison leaves out.
  if (review.excluded.length) {
    const n = review.excluded.length;
    const sentence = `${capital(prev)} had ${n === 1 ? "a breakout post" : `${num(n)} breakout posts`} (${listOf(review.excluded.map((row) => num(row.value)))} ${unit}, 3× its typical post or more). ${n === 1 ? "It is" : "They are"} left out, so the comparison shows normal performance, not one-off spikes: ${num(then.posts)} posts against ${num(now.posts)}.`;
    changes.push(sentence);
    findings.push(sentence);
  }

  // 1. The best post of each period.
  if (now.best && then.best) {
    changes.push(
      `The best post in ${prev} ("${then.best.title}") reached ${num(then.best.value)} ${unit}; the best in ${cur} ("${now.best.title}") reached ${num(now.best.value)}.`,
    );
    findings.push(
      `Best post: ${num(now.best.value)} ${unit} in ${cur}, against ${num(then.best.value)} in ${prev}. ${plural(now.postsAt3x, "post")} reached 3× the typical post or better, against ${num(then.postsAt3x)} in ${prev}.`,
    );
  }

  // 2. The main numbers, and which way most of them went.
  const pairs: Array<[string, number | null, number | null, (value: number) => string]> = [
    ["total interactions", then.interactions, now.interactions, num],
    ["interactions per post", then.interactionsPerPost, now.interactionsPerPost, num],
    ["the engagement rate", then.engagementRate, now.engagementRate, (v) => pct(v)],
    ["typical views per post", then.typicalViews, now.typicalViews, num],
    ["typical reach per post", then.typicalReach, now.typicalReach, num],
  ];
  const usable = pairs.filter(
    (pair): pair is [string, number, number, (value: number) => string] =>
      pair[1] !== null && pair[2] !== null && then.posts > 0,
  );
  if (usable.length) {
    const ups = usable.filter(([, a, b]) => b > a).length;
    const downs = usable.filter(([, a, b]) => b < a).length;
    // "Most numbers fell" only when there are enough of them to say "most";
    // and with every one going the lead's way, each needs no verb of its own.
    const oneWay = (downs === usable.length || ups === usable.length) && usable.length >= 3;
    const lead =
      usable.length < 3
        ? null
        : downs === usable.length
          ? "Every main number fell"
          : ups === usable.length
            ? "Every main number rose"
            : downs > ups
              ? "Most numbers fell"
              : ups > downs
                ? "Most numbers rose"
                : "The numbers were mixed";
    const items = usable.map(([name, a, b, f]) =>
      oneWay ? `${name} from ${f(a)} to ${f(b)}` : `${name} ${moved(a, b, f)}`,
    );
    const saves =
      then.typicalSaves !== null && now.typicalSaves !== null
        ? ` Typical saves per post ${moved(then.typicalSaves, now.typicalSaves)}` +
          (then.typicalShares !== null && now.typicalShares !== null
            ? ` and typical shares ${moved(then.typicalShares, now.typicalShares)}.`
            : ".")
        : "";
    changes.push(
      `${lead ? `${lead}: ${items.join(", ")}` : capital(items.join(", and "))}.${saves}`,
    );
    const reach = usable.filter(([name]) => name.startsWith("typical"));
    if (reach.length)
      findings.push(
        `${capital(reach.map(([name, a, b, f]) => `${name} ${moved(a, b, f)}${pctChange(a, b) ? ` (${pctChange(a, b)})` : ""}`).join("; "))}.`,
      );
    findings.push(
      `Interactions ${moved(then.interactions, now.interactions)} (about ${num(then.interactionsPerPost)} to ${num(now.interactionsPerPost)} a post)` +
        (now.engagementRate !== null && then.engagementRate !== null
          ? `, and the engagement rate ${moved(then.engagementRate, now.engagementRate, (v) => pct(v))}${benchmarkClause(review)}`
          : "") +
        ".",
    );
  }

  // 2b. How many posts travelled, and how many barely did.
  if (
    now.postsUnder300 !== null &&
    then.postsUnder300 !== null &&
    now.postsOver1000 !== null &&
    then.postsOver1000 !== null &&
    then.posts > 0
  )
    findings.push(
      `Posts with 1,000+ views: ${num(then.postsOver1000)} in ${prev}, ${num(now.postsOver1000)} in ${cur}. Posts under 300 views: ${num(then.postsUnder300)} in ${prev}, ${num(now.postsUnder300)} in ${cur}.`,
    );

  // 3. Followers.
  if (now.followerChange !== null) {
    const verb = (change: number) => (change >= 0 ? "gained" : "lost");
    const span = (figures: Figures) =>
      figures.followersFrom ? ` (counted from ${shortDay(figures.followersFrom)})` : "";
    const sentence =
      `The account ${verb(now.followerChange)} ${plural(Math.abs(now.followerChange), "follower")} in ${cur}${span(now)}` +
      (then.followerChange !== null
        ? `, after ${then.followerChange >= 0 ? "gaining" : "losing"} ${num(Math.abs(then.followerChange))} in ${prev}${span(then)}.`
        : ".");
    changes.push(sentence);
    if (now.followerDays)
      findings.push(
        `Followers: ${now.followerChange >= 0 ? "+" : "−"}${num(Math.abs(now.followerChange))} in ${cur}, about ${num(Math.abs(now.followerChange) / now.followerDays)} a day ${now.followerChange >= 0 ? "gained" : "lost"}${now.followersEnd !== null ? `, to ${num(now.followersEnd)}` : ""}.`,
      );
  }

  // 4. Topics: what carried the period and what held it back.
  const named = review.topics.filter(
    (row) => row.current && !row.current.fewPosts && !isOther(row.topic),
  );
  const strongest = named.slice().sort((a, b) => b.current!.vsTypical - a.current!.vsTypical)[0];
  const weakest = named.slice().sort((a, b) => a.current!.vsTypical - b.current!.vsTypical)[0];
  const usual = basis === "views" ? "usual views" : "usual interactions";
  if (strongest && strongest.current!.vsTypical > 1) {
    const s = strongest.current!;
    const sentence = `${strongest.topic} worked best: ${s.shareOfPostsPct}% of posts and ${s.shareOfInteractionsPct}% of interactions, at ${times(s.vsTypical)} the ${usual}.`;
    changes.push(sentence);
    findings.push(sentence);
  }
  if (weakest && weakest !== strongest && weakest.current!.vsTypical < 0.8) {
    const w = weakest.current!;
    const savedMore =
      w.typicalSaves !== null && now.typicalSaves !== null && w.typicalSaves > now.typicalSaves
        ? `, though its posts are saved more than the typical post (${num(w.typicalSaves)} against ${num(now.typicalSaves)})`
        : "";
    const sentence = `${weakest.topic} held the period back: ${plural(w.posts, "post")} at ${times(w.vsTypical)} the ${usual}${savedMore}.`;
    changes.push(sentence);
    findings.push(sentence);
  }

  // 5. Profile visits and website taps, when the panel describes this period.
  if (review.last28Days)
    findings.push(
      `${num(review.last28Days.profileViews)} profile visits and ${num(review.last28Days.websiteClicks)} website taps in the last 28 days.`,
    );

  // 6. The best weekday.
  const bestDay = (pick: "current" | "previous") =>
    review.weekdays
      .filter((row) => row[pick].posts > 0)
      .sort((a, b) => b[pick].typical - a[pick].typical)[0];
  const dayNow = bestDay("current");
  const dayThen = bestDay("previous");
  if (dayNow)
    findings.push(
      `Best day by typical ${basis === "views" ? "views" : "interactions"}: ${WEEKDAY[dayNow.weekday]} in ${cur}${dayThen ? `, ${WEEKDAY[dayThen.weekday]} in ${prev}` : ""}. With only a few posts each day, read this as something to test, not a rule.`,
    );

  // 7. The audience.
  if (age && country)
    findings.push(
      `The audience: ${pct(age.share, 0)} of followers are ${age.label}, and ${pct(country.share, 0)} are in ${countryName(country.label)}.`,
    );

  return { changes, findings, intro: introParts.join(" ") };
}

function benchmarkClause(
  review: Omit<MonthlyReview, "changes" | "findings" | "intro" | "linkedin">,
): string {
  const rivals = review.benchmark?.rivals.filter((row) => row.engagementRate !== null) ?? [];
  const yours = review.benchmark?.you.engagementRate ?? null;
  if (!rivals.length || yours === null) return "";
  const behind = rivals.filter((row) => row.engagementRate! < yours).length;
  return behind ? `, higher than ${num(behind)} of ${num(rivals.length)} tracked competitors` : "";
}

function shortDay(iso: string): string {
  const { day, month } = istDay(Date.parse(iso));
  return `${day} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month]}`;
}
