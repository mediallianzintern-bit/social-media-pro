// The LinkedIn monthly report (26 Nov 2026), laid out like the agency's
// LinkedIn strategy workbook for Dr. Pritesh Patel (Sep vs Oct 2026).
//
// LinkedIn's own figures, as its analytics export shows them: impressions,
// members reached, engagements (reactions, comments, reposts, saves and
// sends), the engagement rate on impressions and new followers, day by day
// from LinkedIn's API (server/linkedin-analytics.ts), and each post's
// impressions. Per-post figures are quoted for a period only when most of its
// posts were measured: LinkedIn's per-post figures for this account start on
// 21 Sep 2026, so September's posts mostly have none, and a median of eight
// posts out of twenty-two would read as the month's.
//
// Code only, from stored rows: no model call. The planning half of the
// workbook (positioning, the 90-day plan, targets) is the team's writing.
import { engagementsOf, median, type PostRecord } from "@/lib/analytics-types";
import { num, titleOf, type MonthlyReview } from "@/lib/monthly-review";

/** One LinkedIn day, as stored. */
export interface LinkedInDay {
  day: string;
  impressions: number;
  engagements: number;
  newFollowers: number | null;
}

/** LinkedIn's days for a period: `start` inclusive, `end` exclusive, YYYY-MM-DD. */
export interface LinkedInSpan {
  start: string;
  end: string;
  /** Distinct members reached, LinkedIn's own count; null when it could not be asked. */
  membersReached: number | null;
}

export interface LinkedInAccount {
  /** Days LinkedIn has figures for in the period. */
  days: number;
  impressions: number;
  engagements: number;
  /** Engagements ÷ impressions; null without impressions. */
  engagementRate: number | null;
  membersReached: number | null;
  impressionsPerMember: number | null;
  newFollowers: number | null;
  /** New followers per 1,000 impressions. */
  followersPerThousand: number | null;
  impressionsPerDay: number | null;
  engagementsPerDay: number | null;
  newFollowersPerDay: number | null;
}

export interface LinkedInPost {
  post: PostRecord;
  title: string;
  impressions: number | null;
  engagements: number;
  rate: number | null;
  topic: string | null;
  /** Monday is 1 ... Sunday 7, by LinkedIn's (UTC) day. */
  weekday: number;
  /** The post's share of the period's impressions, 0-1. */
  shareOfPeriod: number | null;
}

export interface LinkedInPostFigures {
  posts: number;
  /** Posts with LinkedIn's impressions. */
  measured: number;
  /** Most posts were measured, so the per-post figures below describe the period. */
  covered: boolean;
  medianImpressions: number | null;
  over1000: number | null;
  topByImpressions: LinkedInPost | null;
  topByEngagements: LinkedInPost | null;
  hashtagFirst: number;
  /** Titles that went out more than once. */
  repeated: string[];
}

export interface LinkedInWeek {
  /** "1–7 Sep". */
  label: string;
  impressions: number;
  engagements: number;
  rate: number | null;
  newFollowers: number | null;
  days: number;
}

export interface LinkedInWeekday {
  weekday: number;
  current: { rate: number | null; avgImpressions: number | null; days: number };
  previous: { rate: number | null; avgImpressions: number | null; days: number };
}

export interface LinkedInTopic {
  topic: string;
  current: { posts: number; rate: number | null };
  previous: { posts: number; rate: number | null };
}

export interface LinkedInReview {
  current: LinkedInAccount;
  previous: LinkedInAccount;
  postFigures: { current: LinkedInPostFigures; previous: LinkedInPostFigures };
  /** Each period's posts, most impressions first (most engagements without them). */
  posts: { current: LinkedInPost[]; previous: LinkedInPost[] };
  weeks: LinkedInWeek[];
  weekdays: LinkedInWeekday[];
  topics: LinkedInTopic[];
}

export interface LinkedInInput {
  days: LinkedInDay[];
  current: LinkedInSpan;
  previous: LinkedInSpan;
  /** LinkedIn's impressions per post id. */
  impressions: Record<string, number>;
  currentPosts: PostRecord[];
  previousPosts: PostRecord[];
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_MS = 86_400_000;

const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const weekdayOfDay = (day: string) => {
  const value = new Date(dayMs(day)).getUTCDay();
  return value === 0 ? 7 : value;
};
const label = (day: string) => {
  const date = new Date(dayMs(day));
  return `${date.getUTCDate()} ${MONTH[date.getUTCMonth()]}`;
};

const pct = (value: number, digits = 2) => `${(value * 100).toFixed(digits)}%`;
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const round1 = (value: number | null) => (value === null ? null : Number(value.toFixed(1)));
const organic = (posts: PostRecord[]) => posts.filter((post) => !post.pinned);
const inSpan = (span: LinkedInSpan) => (day: string) => day >= span.start && day < span.end;

/** Most posts measured: below this share, per-post figures are left out. */
const COVERED = 0.8;

function account(days: LinkedInDay[], span: LinkedInSpan): LinkedInAccount {
  const rows = days.filter((row) => inSpan(span)(row.day));
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const engagements = rows.reduce((sum, row) => sum + row.engagements, 0);
  const followerRows = rows.filter((row) => row.newFollowers !== null);
  const newFollowers = followerRows.length
    ? followerRows.reduce((sum, row) => sum + (row.newFollowers ?? 0), 0)
    : null;
  const reached = span.membersReached;
  return {
    days: rows.length,
    impressions,
    engagements,
    engagementRate: ratio(engagements, impressions),
    membersReached: reached,
    impressionsPerMember: reached ? round1(impressions / reached) : null,
    newFollowers,
    followersPerThousand:
      newFollowers !== null && impressions > 0 ? round1((newFollowers / impressions) * 1000) : null,
    impressionsPerDay: rows.length ? round1(impressions / rows.length) : null,
    engagementsPerDay: rows.length ? round1(engagements / rows.length) : null,
    newFollowersPerDay:
      newFollowers !== null && followerRows.length
        ? round1(newFollowers / followerRows.length)
        : null,
  };
}

function linkedInPosts(
  posts: PostRecord[],
  impressions: Record<string, number>,
  periodImpressions: number,
): LinkedInPost[] {
  return organic(posts)
    .map((post) => {
      const seen = impressions[post.postId] ?? null;
      const engagements = engagementsOf(post);
      return {
        post,
        title: titleOf(post.caption),
        impressions: seen,
        engagements,
        rate: seen ? engagements / seen : null,
        topic: post.contentLane ?? null,
        weekday: weekdayOfDay(post.publishedAt.slice(0, 10)),
        shareOfPeriod: seen !== null && periodImpressions > 0 ? seen / periodImpressions : null,
      };
    })
    .sort(
      (a, b) =>
        (b.impressions ?? -1) - (a.impressions ?? -1) ||
        b.engagements - a.engagements ||
        b.post.publishedAt.localeCompare(a.post.publishedAt),
    );
}

const titleKey = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 60);

function postFigures(rows: LinkedInPost[]): LinkedInPostFigures {
  const measured = rows.filter((row) => row.impressions !== null);
  const covered = rows.length > 0 && measured.length / rows.length >= COVERED;
  const counts = new Map<string, { title: string; count: number }>();
  for (const row of rows) {
    // A post without a caption is not "the same post" as another without one.
    const key = row.post.caption.trim() ? titleKey(row.title) : "";
    if (!key) continue;
    const entry = counts.get(key) ?? { title: row.title, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  const byEngagements = rows.slice().sort((a, b) => b.engagements - a.engagements)[0] ?? null;
  return {
    posts: rows.length,
    measured: measured.length,
    covered,
    medianImpressions: covered ? median(measured.map((row) => row.impressions!)) : null,
    over1000: covered ? measured.filter((row) => row.impressions! >= 1000).length : null,
    topByImpressions: covered ? (measured[0] ?? null) : null,
    topByEngagements: byEngagements,
    hashtagFirst: rows.filter((row) => row.post.caption.trim().startsWith("#")).length,
    repeated: [...counts.values()].filter((entry) => entry.count > 1).map((entry) => entry.title),
  };
}

function weeks(days: LinkedInDay[], from: string, to: string): LinkedInWeek[] {
  const rows = days.filter((row) => row.day >= from && row.day < to);
  if (!rows.length) return [];
  // Seven-day blocks from the first day of the earlier period (1-7 Sep,
  // 8-14 Sep, ...), the last one cut short at the end: how the LinkedIn
  // workbook lays its weekly trend out (27 Nov 2026).
  const out: LinkedInWeek[] = [];
  let start = dayMs(from);
  const end = dayMs(to);
  while (start < end) {
    const stop = Math.min(start + 7 * DAY_MS, end);
    const span = { start: isoDay(start), end: isoDay(stop), membersReached: null };
    const inWeek = rows.filter((row) => inSpan(span)(row.day));
    if (inWeek.length) {
      const impressions = inWeek.reduce((sum, row) => sum + row.impressions, 0);
      const engagements = inWeek.reduce((sum, row) => sum + row.engagements, 0);
      const followers = inWeek.filter((row) => row.newFollowers !== null);
      const last = isoDay(stop - DAY_MS);
      out.push({
        label: span.start === last ? label(span.start) : `${label(span.start)} – ${label(last)}`,
        impressions,
        engagements,
        rate: ratio(engagements, impressions),
        newFollowers: followers.length
          ? followers.reduce((sum, row) => sum + (row.newFollowers ?? 0), 0)
          : null,
        days: inWeek.length,
      });
    }
    start = stop;
  }
  return out;
}

function weekdays(
  days: LinkedInDay[],
  current: LinkedInSpan,
  previous: LinkedInSpan,
): LinkedInWeekday[] {
  const group = (span: LinkedInSpan, weekday: number) => {
    const rows = days.filter((row) => inSpan(span)(row.day) && weekdayOfDay(row.day) === weekday);
    const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
    const engagements = rows.reduce((sum, row) => sum + row.engagements, 0);
    return {
      rate: ratio(engagements, impressions),
      avgImpressions: rows.length ? Math.round(impressions / rows.length) : null,
      days: rows.length,
    };
  };
  return [1, 2, 3, 4, 5, 6, 7]
    .map((weekday) => ({
      weekday,
      current: group(current, weekday),
      previous: group(previous, weekday),
    }))
    .filter((row) => row.current.days || row.previous.days);
}

function topics(current: LinkedInPost[], previous: LinkedInPost[]): LinkedInTopic[] {
  const group = (rows: LinkedInPost[], key: string) => {
    const mine = rows.filter((row) => (row.topic ?? "").trim().toLowerCase() === key);
    const measured = mine.filter((row) => row.impressions);
    const seen = measured.reduce((sum, row) => sum + (row.impressions ?? 0), 0);
    const engaged = measured.reduce((sum, row) => sum + row.engagements, 0);
    return { posts: mine.length, rate: measured.length ? ratio(engaged, seen) : null };
  };
  const names = new Map<string, string>();
  for (const row of [...current, ...previous])
    if (row.topic) names.set(row.topic.trim().toLowerCase(), row.topic);
  return [...names.entries()]
    .map(([key, topic]) => ({
      topic,
      current: group(current, key),
      previous: group(previous, key),
    }))
    .sort(
      (a, b) =>
        Number(a.topic.toLowerCase() === "other") - Number(b.topic.toLowerCase() === "other") ||
        b.current.posts - a.current.posts ||
        b.previous.posts - a.previous.posts,
    );
}

/** Ten or more percent either way counts as a move; less is "held steady". */
const relative = (a: number, b: number) => (a > 0 ? (b - a) / a : null);
const signedPct = (a: number, b: number) => {
  const change = relative(a, b);
  return change === null
    ? ""
    : ` (${change >= 0 ? "+" : "−"}${Math.abs(Math.round(change * 100))}%)`;
};
const moved = (a: number, b: number, format: (value: number) => string = num) =>
  a === b ? `held at ${format(b)}` : `${b > a ? "rose" : "fell"} from ${format(a)} to ${format(b)}`;

/**
 * The LinkedIn layout of a monthly review: LinkedIn's own figures, and the
 * changes and findings written from them in place of the public-count ones.
 */
export function withLinkedIn(review: MonthlyReview, input: LinkedInInput): MonthlyReview {
  const current = account(input.days, input.current);
  const previous = account(input.days, input.previous);
  if (!current.days) return review;
  const nowPosts = linkedInPosts(input.currentPosts, input.impressions, current.impressions);
  const thenPosts = linkedInPosts(input.previousPosts, input.impressions, previous.impressions);
  const linkedin: LinkedInReview = {
    current,
    previous,
    postFigures: { current: postFigures(nowPosts), previous: postFigures(thenPosts) },
    posts: { current: nowPosts, previous: thenPosts },
    weeks: weeks(input.days, input.previous.start, input.current.end),
    weekdays: weekdays(input.days, input.current, input.previous),
    topics: topics(nowPosts, thenPosts),
  };
  return { ...review, linkedin, ...words(review, linkedin) };
}

function words(
  review: MonthlyReview,
  linkedin: LinkedInReview,
): Pick<MonthlyReview, "changes" | "findings"> {
  const { currentName: cur, previousName: prev } = review;
  const { current: now, previous: then } = linkedin;
  const posts = linkedin.postFigures;
  const changes: string[] = [];
  const findings: string[] = [];
  const hasBefore = then.days > 0;

  const rateChange =
    now.engagementRate !== null && then.engagementRate !== null
      ? relative(then.engagementRate, now.engagementRate)
      : null;
  const reachChange =
    now.membersReached !== null && then.membersReached !== null
      ? relative(then.membersReached, now.membersReached)
      : relative(then.impressions, now.impressions);

  // 1. In simple words: engagement against reach.
  if (hasBefore && rateChange !== null && reachChange !== null) {
    const steady = Math.abs(rateChange) < 0.1;
    const fewer = reachChange <= -0.15;
    const more = reachChange >= 0.15;
    const simple = steady
      ? fewer
        ? "the posts are as engaging as before, but fewer people are seeing them"
        : more
          ? "the posts are as engaging as before, and more people are seeing them"
          : "the posts are as engaging as before, and reach is about the same"
      : rateChange > 0
        ? fewer
          ? "fewer people saw the posts, but more of them engaged"
          : more
            ? "more people saw the posts, and more of them engaged"
            : "reach is about the same, and more people engaged"
        : fewer
          ? "fewer people saw the posts, and fewer of them engaged"
          : more
            ? "more people saw the posts, but fewer of them engaged"
            : "reach is about the same, but fewer people engaged";
    changes.push(`In simple words: ${simple}.`);
  }

  // 2. The account's numbers.
  if (hasBefore) {
    const parts: string[] = [];
    if (now.engagementRate !== null && then.engagementRate !== null)
      parts.push(
        rateChange !== null && Math.abs(rateChange) < 0.1
          ? `The engagement rate held steady (${pct(then.engagementRate)} in ${prev}, ${pct(now.engagementRate)} in ${cur})`
          : `The engagement rate ${moved(then.engagementRate, now.engagementRate, (v) => pct(v))}`,
      );
    if (now.newFollowers !== null && then.newFollowers !== null)
      parts.push(`new followers ${moved(then.newFollowers, now.newFollowers)}`);
    parts.push(
      `impressions ${moved(then.impressions, now.impressions)}${signedPct(then.impressions, now.impressions)}`,
    );
    if (now.membersReached !== null && then.membersReached !== null)
      parts.push(
        `members reached ${moved(then.membersReached, now.membersReached)}${signedPct(then.membersReached, now.membersReached)}`,
      );
    let sentence = `${parts.join(", ")}.`;
    sentence = sentence.replace(/^./, (c) => c.toUpperCase());
    if (now.impressionsPerMember !== null && then.impressionsPerMember !== null)
      sentence += ` Each person reached saw the content ${num(now.impressionsPerMember)} times, ${now.impressionsPerMember >= then.impressionsPerMember ? "up" : "down"} from ${num(then.impressionsPerMember)}.`;
    changes.push(sentence);
    findings.push(
      now.engagementRate !== null && then.engagementRate !== null
        ? `Engagement rate: ${pct(then.engagementRate)} in ${prev}, ${pct(now.engagementRate)} in ${cur}.`
        : `Engagements ${moved(then.engagements, now.engagements)}.`,
    );
    findings.push(
      now.membersReached !== null && then.membersReached !== null
        ? `Members reached ${moved(then.membersReached, now.membersReached)}${signedPct(then.membersReached, now.membersReached)}, and impressions ${moved(then.impressions, now.impressions)}${signedPct(then.impressions, now.impressions)}.`
        : `Impressions ${moved(then.impressions, now.impressions)}${signedPct(then.impressions, now.impressions)}.`,
    );
  }

  // 3. The typical post and the breakout.
  const top = (figures: LinkedInPostFigures) => figures.topByImpressions;
  if (
    posts.current.covered &&
    posts.previous.covered &&
    top(posts.current) &&
    top(posts.previous)
  ) {
    const a = top(posts.previous)!;
    const b = top(posts.current)!;
    const share = (row: LinkedInPost) =>
      row.shareOfPeriod !== null
        ? `, ${Math.round(row.shareOfPeriod * 100)}% of all impressions`
        : "";
    const sentence =
      `The typical post ${moved(posts.previous.medianImpressions!, posts.current.medianImpressions!)} impressions. ` +
      `The best post in ${prev} ("${a.title}") had ${num(a.impressions!)} impressions${share(a)}; the best in ${cur} ("${b.title}") had ${num(b.impressions!)}${share(b)}.`;
    changes.push(sentence);
    findings.push(
      `${sentence} ${
        posts.previous.over1000 || posts.current.over1000
          ? `Posts over 1,000 impressions: ${num(posts.previous.over1000!)} in ${prev}, ${num(posts.current.over1000!)} in ${cur}.`
          : "No post passed 1,000 impressions in either period."
      }`,
    );
  } else if (posts.current.covered && top(posts.current)) {
    const b = top(posts.current)!;
    findings.push(
      `The typical post in ${cur} had ${num(posts.current.medianImpressions!)} impressions, and the best ("${b.title}") had ${num(b.impressions!)}. ${posts.current.over1000 ? `${num(posts.current.over1000)} ${posts.current.over1000 === 1 ? "post" : "posts"} passed 1,000 impressions.` : "No post passed 1,000 impressions."}` +
        (posts.previous.posts && !posts.previous.covered
          ? ` LinkedIn has per-post figures for only ${num(posts.previous.measured)} of ${prev}'s ${num(posts.previous.posts)} posts, so they are not compared.`
          : ""),
    );
  }

  // 4. New followers against the follower count.
  const net = review.current.followerChange;
  if (now.newFollowers !== null) {
    let sentence = `${num(now.newFollowers)} new followers in ${cur}`;
    if (then.newFollowers !== null && hasBefore)
      sentence += `, against ${num(then.newFollowers)} in ${prev}`;
    sentence += now.newFollowersPerDay !== null ? ` (${num(now.newFollowersPerDay)} a day).` : ".";
    if (net !== null && now.newFollowers > 0 && net < now.newFollowers / 2)
      sentence += ` But the follower count ${net >= 0 ? `rose by only ${num(net)}` : `fell by ${num(Math.abs(net))}`}${review.current.followersFrom ? " over the days it was tracked" : ""}, so some people also left: worth checking on LinkedIn's follower page.`;
    changes.push(sentence);
    findings.push(sentence);
  }

  // 5. Topics: the best and weakest engagement, with at least two measured posts.
  const rated = linkedin.topics.filter(
    (row) =>
      row.current.rate !== null && row.current.posts >= 2 && row.topic.toLowerCase() !== "other",
  );
  const best = rated.slice().sort((a, b) => b.current.rate! - a.current.rate!)[0];
  const worst = rated.slice().sort((a, b) => a.current.rate! - b.current.rate!)[0];
  if (best)
    findings.push(
      `${best.topic} engaged best: ${pct(best.current.rate!)} across ${num(best.current.posts)} posts${best.previous.rate !== null ? ` (${pct(best.previous.rate)} in ${prev})` : ""}.`,
    );
  if (worst && worst !== best)
    findings.push(
      `${worst.topic} engaged least: ${pct(worst.current.rate!)} across ${num(worst.current.posts)} posts${worst.previous.rate !== null ? ` (${pct(worst.previous.rate)} in ${prev})` : ""}.`,
    );

  // 6. Openers and repeats.
  if (posts.current.hashtagFirst || posts.previous.hashtagFirst)
    findings.push(
      `Posts that open with hashtags: ${num(posts.previous.hashtagFirst)} in ${prev}, ${num(posts.current.hashtagFirst)} in ${cur}. The first line should be a hook in plain words.`,
    );
  if (posts.current.repeated.length)
    findings.push(
      `The same post went out more than once in ${cur}: ${posts.current.repeated.map((title) => `"${title}"`).join(", ")}.`,
    );

  // 7. Days of the week, from LinkedIn's daily figures.
  const pick = (which: "current" | "previous", by: "rate" | "avgImpressions", lowest = false) => {
    const rows = linkedin.weekdays.filter((row) => row[which][by] !== null && row[which].days > 0);
    const sorted = rows.sort((a, b) => (b[which][by] ?? 0) - (a[which][by] ?? 0));
    return lowest ? sorted.at(-1) : sorted[0];
  };
  const bestDay = pick("current", "rate");
  const worstDay = pick("current", "rate", true);
  const busiest = pick("current", "avgImpressions");
  if (bestDay && worstDay && busiest) {
    const thenBest = pick("previous", "rate");
    findings.push(
      `Best engagement day: ${WEEKDAY[bestDay.weekday]} (${pct(bestDay.current.rate!, 1)})${thenBest ? `; in ${prev}, ${WEEKDAY[thenBest.weekday]}` : ""}. Weakest: ${WEEKDAY[worstDay.weekday]} (${pct(worstDay.current.rate!, 1)}). Most impressions a day: ${WEEKDAY[busiest.weekday]} (${num(busiest.current.avgImpressions!)}).`,
    );
  }

  return { changes, findings };
}
