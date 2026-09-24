// Measured signals derived from stored posts.
//
// Everything here is a claim about Pritesh's own content, so every claim ships
// with the sample it rests on. With ~10 posts per profile a "median" can be two
// data points, and a recommendation built on two data points is a guess wearing
// a number. `confidence` is how the UI decides whether to state something, and
// nothing below MIN_SAMPLE is stated at all.
import {
  engagementsOf,
  median,
  organicPosts,
  type ContentFormat,
  type PostRecord,
  viewsOf,
} from "@/lib/analytics-types";

/** Below this many posts in a bucket, a comparison is not worth making. */
export const MIN_SAMPLE = 3;
/** At or above this, a comparison is stated plainly rather than hedged. */
export const SOLID_SAMPLE = 6;

export type Confidence = "solid" | "tentative" | "insufficient";

export function confidenceFor(n: number): Confidence {
  if (n >= SOLID_SAMPLE) return "solid";
  if (n >= MIN_SAMPLE) return "tentative";
  return "insufficient";
}

/** A post's headline number: views where the platform publishes them, else interactions. */
function primary(post: PostRecord, useViews: boolean): number {
  return useViews ? viewsOf(post) : engagementsOf(post);
}

export interface Bucket {
  label: string;
  count: number;
  medianPrimary: number;
  medianComments: number;
  confidence: Confidence;
  /** Ratio against the overall median; 1 = average. */
  vsOverall: number;
}

function buildBucket(
  label: string,
  posts: PostRecord[],
  useViews: boolean,
  overall: number,
): Bucket {
  const medianPrimary = median(posts.map((post) => primary(post, useViews)));
  return {
    label,
    count: posts.length,
    medianPrimary,
    medianComments: median(posts.map((post) => post.comments)),
    confidence: confidenceFor(posts.length),
    vsOverall: overall > 0 ? medianPrimary / overall : 0,
  };
}

/** True when the caption asks for a comment — the highest-leverage CTA on Instagram. */
export function hasCommentCta(post: PostRecord): boolean {
  return (
    /comment\s+["“']?[A-Z]{3,}/i.test(post.caption) || /\bcomment\s+\w+\s+and\b/i.test(post.caption)
  );
}

export function hashtagCount(post: PostRecord): number {
  return (post.caption.match(/#\w+/g) ?? []).length;
}

export interface InsightSet {
  sampleSize: number;
  useViews: boolean;
  overallMedian: number;
  formats: Bucket[];
  cta: { withCta: Bucket; withoutCta: Bucket; multiple: number } | null;
  hashtags: { tagged: Bucket; untagged: Bucket } | null;
  hours: Array<{ hourUtc: number; count: number; medianPrimary: number }>;
  weekdays: Array<{ day: string; count: number; medianPrimary: number }>;
  /** Posts at 2× the median or better. */
  outliers: PostRecord[];
  best: PostRecord | null;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function computeInsights(allPosts: PostRecord[]): InsightSet {
  const posts = organicPosts(allPosts);
  const useViews = posts.some((post) => viewsOf(post) > 0);
  const overallMedian = median(posts.map((post) => primary(post, useViews)));

  const byFormat = new Map<ContentFormat, PostRecord[]>();
  for (const post of posts) {
    byFormat.set(post.format, [...(byFormat.get(post.format) ?? []), post]);
  }
  const formats = [...byFormat.entries()]
    .map(([format, group]) => buildBucket(format, group, useViews, overallMedian))
    .sort((a, b) => b.medianPrimary - a.medianPrimary);

  const withCta = posts.filter(hasCommentCta);
  const withoutCta = posts.filter((post) => !hasCommentCta(post));
  const ctaBucket = buildBucket("With a comment CTA", withCta, useViews, overallMedian);
  const noCtaBucket = buildBucket("No comment CTA", withoutCta, useViews, overallMedian);
  const cta =
    withCta.length >= MIN_SAMPLE && withoutCta.length >= MIN_SAMPLE
      ? {
          withCta: ctaBucket,
          withoutCta: noCtaBucket,
          multiple:
            noCtaBucket.medianComments > 0
              ? ctaBucket.medianComments / noCtaBucket.medianComments
              : 0,
        }
      : null;

  const tagged = posts.filter((post) => hashtagCount(post) > 0);
  const untagged = posts.filter((post) => hashtagCount(post) === 0);
  const hashtags =
    tagged.length >= MIN_SAMPLE && untagged.length >= MIN_SAMPLE
      ? {
          tagged: buildBucket("With hashtags", tagged, useViews, overallMedian),
          untagged: buildBucket("No hashtags", untagged, useViews, overallMedian),
        }
      : null;

  const hourMap = new Map<number, PostRecord[]>();
  const dayMap = new Map<number, PostRecord[]>();
  for (const post of posts) {
    const date = new Date(post.publishedAt);
    const hour = date.getUTCHours();
    const day = date.getUTCDay();
    hourMap.set(hour, [...(hourMap.get(hour) ?? []), post]);
    dayMap.set(day, [...(dayMap.get(day) ?? []), post]);
  }

  const hours = [...hourMap.entries()]
    .map(([hourUtc, group]) => ({
      hourUtc,
      count: group.length,
      medianPrimary: median(group.map((post) => primary(post, useViews))),
    }))
    .sort((a, b) => b.medianPrimary - a.medianPrimary);

  const weekdays = [...dayMap.entries()]
    .map(([day, group]) => ({
      day: WEEKDAYS[day] ?? String(day),
      count: group.length,
      medianPrimary: median(group.map((post) => primary(post, useViews))),
    }))
    .sort((a, b) => b.medianPrimary - a.medianPrimary);

  const outliers = posts
    .filter((post) => overallMedian > 0 && primary(post, useViews) >= overallMedian * 2)
    .sort((a, b) => primary(b, useViews) - primary(a, useViews));

  const best = [...posts].sort((a, b) => primary(b, useViews) - primary(a, useViews))[0] ?? null;

  return {
    sampleSize: posts.length,
    useViews,
    overallMedian,
    formats,
    cta,
    hashtags,
    hours,
    weekdays,
    outliers,
    best,
  };
}
