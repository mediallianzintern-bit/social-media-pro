// What every reviewed LinkedIn post taught, for the card on the LinkedIn page
// (components/dashboard/post-lessons.tsx). Free: stored rows only.
import type { PostLessonsView } from "@/lib/post-learning";
import { REVIEW_DAYS } from "@/lib/post-learning";
import { HOOK_TYPE_LABEL } from "@/lib/reel-parts";

import { ownerAccount } from "../apify/accounts";
import { readPosts } from "../store";
import { PostLearningNotReady, readPostLearning } from "./store";

const DAY_MS = 86_400_000;

export async function postLessonsView(): Promise<PostLessonsView> {
  let rows;
  try {
    rows = await readPostLearning();
  } catch (error) {
    if (error instanceof PostLearningNotReady) {
      return { ready: false, analysed: 0, waiting: 0, nextReviewAt: null, posts: [] };
    }
    throw error;
  }
  const synced = await readPosts("linkedin", ownerAccount("linkedin").handle, 1000).catch(() => []);
  const lanes = new Map(synced.map((post) => [post.postId, post.contentLane ?? null]));
  const waiting = rows.filter((row) => row.analysis && !row.review);
  const next = waiting
    .map((row) => Date.parse(row.publishedAt) + REVIEW_DAYS * DAY_MS)
    .sort((a, b) => a - b)[0];
  return {
    ready: true,
    analysed: rows.filter((row) => row.analysis).length,
    waiting: waiting.length,
    nextReviewAt: next ? new Date(Math.max(next, Date.now())).toISOString() : null,
    posts: rows
      .filter((row) => row.review && row.analysis)
      .map((row) => ({
        postId: row.postId,
        url: row.postUrl,
        publishedAt: row.publishedAt,
        lane: lanes.get(row.postId) ?? null,
        ratio: row.review!.primaryRatio,
        worked: Boolean(row.worked),
        summary: row.review!.summary,
        lessons: row.review!.lessons,
        opening: row.analysis!.opening,
        hookType: HOOK_TYPE_LABEL[row.analysis!.hookType],
        bodyShape: row.analysis!.bodyShape,
        structure: row.analysis!.structure,
      })),
  };
}
