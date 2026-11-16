// Learning from every LinkedIn post he publishes, drafted here or not
// (16 Nov 2026; server/post-learning, table 0036).
//
// After each sync every new post is ANALYSED (its opening, body shape,
// example and close: code measures what it can, one small model call names
// the rest, ~0.1¢), and once it has run REVIEW_DAYS it is REVIEWED against
// his typical post on LinkedIn's own impressions (worked or not is decided in
// code; one call explains why and writes lessons, ~1-2¢). The reviews feed the
// same patterns, rules and lessons the filmed reels do (reel-learning/lessons).
//
// Bounded like the reels' pass (reel-learning/auto.ts): a monthly cap
// (LINKEDIN_LEARNING_MONTHLY_USD, default $1, "0" or "off" turns it off),
// a few steps per sync, reviews first, and a post that has cost
// RETRY_LIMIT_USD without a result is left alone.
//
// Pure and client-safe: the plan can be read before anything is spent.
import type { PostRecord } from "@/lib/analytics-types";
import type { PostShape, ReelReview } from "@/lib/reel-learning-types";
import { POST_REVIEW_DAYS } from "@/lib/reel-learning-types";
import type { CtaType, HookType } from "@/lib/reel-parts";

/** How long a post runs before it is reviewed. */
export const REVIEW_DAYS = POST_REVIEW_DAYS;
/** On the first run, posts this far back are learned from too, so lessons start now. */
export const BACKFILL_DAYS = 45;
export const ANALYSE_ESTIMATE_USD = 0.005;
export const REVIEW_ESTIMATE_USD = 0.02;
/** Spent on a post without a result past this, and it is left alone. */
export const RETRY_LIMIT_USD = 0.06;
export const STEPS_PER_SYNC = 6;
const DEFAULT_MONTHLY_USD = 1;
const DAY_MS = 86_400_000;

export interface PostAnalysis {
  /** The opening as a phone shows it before "see more". */
  opening: string;
  hookType: HookType;
  /** In a word or two: story twist, lesson, question, statistic… */
  hookStyle: string;
  bodyShape: string;
  exampleType: string;
  /** The order the post takes, in a sentence. */
  structure: string;
  close: string;
  ctaType: CtaType;
  shape: PostShape;
  hashtags: string[];
}

export interface PostLearningRow {
  postId: string;
  postUrl: string | null;
  publishedAt: string;
  format: string | null;
  analysis: PostAnalysis | null;
  analysedAt: string | null;
  review: ReelReview | null;
  worked: boolean | null;
  reviewedAt: string | null;
  costUsd: number;
}

/** The monthly cap in dollars; 0 when it is turned off. */
export function postLearningCap(value = process.env["LINKEDIN_LEARNING_MONTHLY_USD"]): number {
  if (value === undefined || value.trim() === "") return DEFAULT_MONTHLY_USD;
  if (/^(off|false|no)$/i.test(value.trim())) return 0;
  const cap = Number(value);
  return Number.isFinite(cap) && cap >= 0 ? cap : DEFAULT_MONTHLY_USD;
}

/** What this has cost this calendar month, as stored. Errs towards spending less. */
export function spentThisMonth(rows: PostLearningRow[], now = Date.now()): number {
  const date = new Date(now);
  const monthStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  return rows
    .filter((row) =>
      [row.analysedAt, row.reviewedAt].some((at) => at && Date.parse(at) >= monthStart),
    )
    .reduce((total, row) => total + row.costUsd, 0);
}

export interface PostStep {
  kind: "review" | "analyse";
  postId: string;
  estimate: number;
}

/**
 * The steps due, reviews first (they are what the writer learns from), then
 * the oldest posts not analysed yet, within the month's remaining budget.
 * `posts` are his synced posts; a post with no row yet is analysed when it
 * was published inside BACKFILL_DAYS.
 */
export function planPostSteps(
  rows: PostLearningRow[],
  posts: PostRecord[],
  options: { now?: number; cap?: number; limit?: number } = {},
): { steps: PostStep[]; spent: number; cap: number; waiting: number } {
  const now = options.now ?? Date.now();
  const cap = options.cap ?? postLearningCap();
  const spent = spentThisMonth(rows, now);
  const byId = new Map(rows.map((row) => [row.postId, row]));

  const reviews = rows
    .filter((row) => row.analysis && !row.review)
    .filter((row) => Date.parse(row.publishedAt) + REVIEW_DAYS * DAY_MS <= now)
    .filter((row) => row.costUsd < RETRY_LIMIT_USD)
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
    .map((row) => ({ kind: "review" as const, postId: row.postId, estimate: REVIEW_ESTIMATE_USD }));

  const analyses = posts
    .filter((post) => !post.pinned && post.caption.trim())
    .filter((post) => Date.parse(post.publishedAt) >= now - BACKFILL_DAYS * DAY_MS)
    .filter((post) => {
      const row = byId.get(post.postId);
      return !row || (!row.analysis && row.costUsd < RETRY_LIMIT_USD);
    })
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
    .map((post) => ({
      kind: "analyse" as const,
      postId: post.postId,
      estimate: ANALYSE_ESTIMATE_USD,
    }));

  const due = [...reviews, ...analyses];
  const steps: PostStep[] = [];
  let budget = cap - spent;
  for (const step of due) {
    if (steps.length >= (options.limit ?? STEPS_PER_SYNC)) break;
    // In tenths of a cent, so a small balance still pays for a small step.
    if (Math.round(step.estimate * 1000) > Math.round(budget * 1000)) break;
    steps.push(step);
    budget -= step.estimate;
  }
  return { steps, spent, cap, waiting: due.length - steps.length };
}
