// What his reviewed LinkedIn posts taught, in the shapes the filmed reels'
// lessons use (reel-learning/lessons.ts), so they join the same patterns,
// rules and lessons the writer and the rewrite read. Free: stored rows.
import type { PostRecord } from "@/lib/analytics-types";
import type { PostLearningRow } from "@/lib/post-learning";
import { REVIEW_DAYS } from "@/lib/post-learning";
import { VIRAL_RATIO } from "@/lib/reel-learning-types";
import { shortcodeFromUrl } from "@/lib/reel-match";
import { CTA_TYPE_LABEL, HOOK_TYPE_LABEL } from "@/lib/reel-parts";
import type { ReviewedReel } from "@/lib/reel-patterns";

import { OWNER_ACCOUNTS } from "../apify/accounts";
import { readPosts } from "../store";
import { readPostLearning } from "./store";

export interface ReviewedPost {
  row: PostLearningRow & { review: NonNullable<PostLearningRow["review"]> };
  lane: string | null;
  /** The key a reel_learning row would name this post by. */
  key: string;
  reel: ReviewedReel;
}

const keyOf = (row: { postId: string; postUrl: string | null }) =>
  (row.postUrl ? shortcodeFromUrl(row.postUrl) : null) ?? row.postId;

/** The analysed post as one reviewed item for the patterns (lib/reel-patterns.ts). Exported for the tests. */
export function asReviewedReel(row: PostLearningRow, lane: string | null): ReviewedReel {
  const analysis = row.analysis;
  return {
    lane,
    hookStyle: analysis?.hookStyle ?? null,
    // Written by the team, not from a draft: there is nothing to compare.
    hookVerdict: null,
    scriptVerdict: null,
    captionVerdict: null,
    usage: null,
    hookType: analysis?.hookType ?? null,
    ctaType: analysis?.ctaType ?? null,
    bodyShape: analysis?.bodyShape ?? null,
    exampleType: analysis?.exampleType ?? null,
    hashtags: analysis?.hashtags ?? null,
    postWords: analysis?.shape.words ?? null,
    grade: analysis?.shape.grade ?? null,
    points: analysis?.shape.points ?? null,
    ratio: row.review?.primaryRatio ?? 0,
    worked: Boolean(row.worked),
  };
}

/**
 * Every reviewed post, newest first, with the topic it is filed under now.
 * `exclude` holds posts already reviewed as dashboard drafts (reel_learning),
 * so one post is never counted twice.
 */
export async function reviewedPublishedPosts(
  exclude: Set<string> = new Set(),
  posts?: PostRecord[],
): Promise<ReviewedPost[]> {
  const rows = (await readPostLearning()).filter((row): row is ReviewedPost["row"] =>
    Boolean(row.review && row.analysis),
  );
  if (!rows.length) return [];
  const synced = posts ?? (await readPosts("linkedin", OWNER_ACCOUNTS.linkedin.handle, 1000));
  const lanes = new Map(synced.map((post) => [post.postId, post.contentLane ?? null]));
  return rows
    .map((row) => {
      const lane = lanes.get(row.postId) ?? null;
      return { row, lane, key: keyOf(row), reel: asReviewedReel(row, lane) };
    })
    .filter((entry) => !exclude.has(entry.key) && !exclude.has(entry.row.postId));
}

/** One reviewed post as the writer reads it: result, how it was built, its lessons. */
export function publishedPostLines(entry: ReviewedPost, repeatOnly = false): string {
  const { row, lane } = entry;
  const review = row.review;
  const a = row.analysis!;
  const verdict =
    review.primaryRatio >= VIRAL_RATIO ? "AT 3X OR MORE" : row.worked ? "WORKED" : "DID NOT WORK";
  const lessons = review.lessons
    .filter((lesson) => !repeatOnly || lesson.kind === "repeat")
    .map(
      (lesson) =>
        `    ${lesson.kind === "repeat" ? "REPEAT" : "AVOID"} [${lesson.element}] ${lesson.lesson} (${lesson.evidence})`,
    );
  return [
    `- ${verdict} (${review.primaryRatio.toFixed(2)}x his typical impressions${lane ? `; ${lane}` : ""}; written by the team): ${review.summary}`,
    `    OPENING (${HOOK_TYPE_LABEL[a.hookType]}, ${a.hookStyle}): "${a.opening.replace(/\n/g, " / ")}"`,
    `    BODY: ${a.bodyShape}; example: ${a.exampleType}. ORDER: ${a.structure}`,
    `    CLOSE (${CTA_TYPE_LABEL[a.ctaType]}); ${a.shape.words} words, about Grade ${a.shape.grade}, ${a.shape.points} numbered points`,
    ...lessons,
  ].join("\n");
}

export const PUBLISHED_HEADER = `Every post he published counts here, drafted on this dashboard or written by the team, each
reviewed after ${REVIEW_DAYS} days on LinkedIn's own impressions against his typical post.`;
