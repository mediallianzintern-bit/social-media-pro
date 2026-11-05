// Analyse and review filmed reels by themselves, after each sync (2 Nov 2026).
//
// Both used to wait for a button. By 2 Nov, nine reels had been filmed and
// found, and one had a full review: three sat analysed past their 14 days,
// three were never analysed, and the writer had learned from a single reel.
// Now every sync that succeeds also:
//   - REVIEWS each analysed reel whose 14 days are up (or that had only an
//     early check), the same review as the button, ~2¢;
//   - ANALYSES each found reel not analysed yet, the same analysis as the
//     button: the transcript (~1.5¢, Apify) and one comparison call (~2¢).
// Reviews first: they are what the writer learns from, and they cost less.
//
// Bounded three ways, so an unattended pass can never run away:
//   - a MONTHLY CAP on what filmed reels cost (REEL_LEARNING_MONTHLY_USD,
//     default $1; "0" turns it off), counted from what is stored;
//   - a few steps per sync, inside a time budget, the rest on the next sync;
//   - a reel that has already cost RETRY_LIMIT_USD without a result is left
//     for a person, so a reel whose transcript keeps failing is not paid for
//     on every sync.
// Instagram only: a published LinkedIn post (Phase 3, 5 Nov 2026) is analysed
// and reviewed from its buttons, as the team chose.
import { REEL_REVIEW_DAYS } from "@/lib/reel-learning-types";
import { shortcodeFromUrl } from "@/lib/reel-match";
import type { PlatformId } from "@/lib/analytics-types";

import { hasOpenAi } from "../ai/client";
import { OWNER_ACCOUNTS } from "../apify/accounts";
import { readPosts } from "../store";
import { readAllReelLearning, type ReelLearningRow } from "./store";

/** What one analysis costs at most: the transcript and one comparison call. */
export const ANALYSE_ESTIMATE_USD = 0.05;
/** What one review costs at most: one call. */
export const REVIEW_ESTIMATE_USD = 0.03;
/** Spent on a reel without a result past this, and it is left for a person. */
export const RETRY_LIMIT_USD = 0.12;
/** Steps one sync takes on; the rest wait for the next sync. */
export const STEPS_PER_SYNC = 3;
/** No new step starts this long after the pass began, to stay inside the sync's 300 s. */
export const TIME_BUDGET_MS = 150_000;
const DEFAULT_MONTHLY_USD = 1;
const DAY_MS = 86_400_000;

/** The monthly cap in dollars; 0 when automatic learning is turned off. */
export function monthlyCap(value = process.env["REEL_LEARNING_MONTHLY_USD"]): number {
  if (value === undefined || value.trim() === "") return DEFAULT_MONTHLY_USD;
  if (/^(off|false|no)$/i.test(value.trim())) return 0;
  const cap = Number(value);
  return Number.isFinite(cap) && cap >= 0 ? cap : DEFAULT_MONTHLY_USD;
}

/**
 * What filmed reels have cost this calendar month, as stored. A reel's cost
 * is a running total, so one analysed last month and reviewed this month
 * counts in full: the cap errs towards spending less.
 */
export function spentThisMonth(rows: ReelLearningRow[], now = Date.now()): number {
  const start = new Date(now);
  const monthStart = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1);
  return rows
    .filter((row) =>
      [row.analysedAt, row.reviewedAt].some((at) => at && Date.parse(at) >= monthStart),
    )
    .reduce((total, row) => total + row.costUsd, 0);
}

export interface AutoStep {
  kind: "review" | "analyse";
  ideaId: string;
  estimate: number;
}

/**
 * The steps due, cheapest learning first, within the month's remaining
 * budget. Pure: the plan can be read before anything is spent.
 */
export function planAutoSteps(
  rows: ReelLearningRow[],
  publishedAtOf: (row: ReelLearningRow) => string | null,
  options: { now?: number; cap?: number; limit?: number } = {},
): { steps: AutoStep[]; spent: number; cap: number; waiting: number } {
  const now = options.now ?? Date.now();
  const cap = options.cap ?? monthlyCap();
  const spent = spentThisMonth(rows, now);
  const stuck = (row: ReelLearningRow) => row.costUsd >= RETRY_LIMIT_USD;

  const reviews = rows
    // Never reviewed, or only an early check: the full review replaces it.
    .filter((row) => row.comparison && row.shortcode && (!row.review || row.review.early))
    .map((row) => ({ row, publishedAt: publishedAtOf(row) }))
    .filter(
      ({ publishedAt }) =>
        publishedAt && Date.parse(publishedAt) + REEL_REVIEW_DAYS * DAY_MS <= now,
    )
    // Its analysis (and any early check) is already in its cost.
    .filter(({ row }) => row.costUsd < RETRY_LIMIT_USD + REVIEW_ESTIMATE_USD)
    .sort((a, b) => a.publishedAt!.localeCompare(b.publishedAt!))
    .map(({ row }) => ({
      kind: "review" as const,
      ideaId: row.ideaId,
      estimate: REVIEW_ESTIMATE_USD,
    }));

  const analyses = rows
    .filter((row) => row.shortcode && row.reelUrl && !row.comparison && !stuck(row))
    .sort((a, b) => a.filmedAt.localeCompare(b.filmedAt))
    .map((row) => ({
      kind: "analyse" as const,
      ideaId: row.ideaId,
      estimate: ANALYSE_ESTIMATE_USD,
    }));

  const due = [...reviews, ...analyses];
  const steps: AutoStep[] = [];
  let budget = cap - spent;
  for (const step of due) {
    if (steps.length >= (options.limit ?? STEPS_PER_SYNC)) break;
    // In cents, so $0.10 left still pays for two 5¢ steps.
    if (Math.round(step.estimate * 100) > Math.round(budget * 100)) break;
    steps.push(step);
    budget -= step.estimate;
  }
  return { steps, spent, cap, waiting: due.length - steps.length };
}

/**
 * Runs the steps due for a platform after a sync. Never fatal: a step that
 * fails is logged and the pass moves on; the next sync tries again.
 */
export async function learnFromFilmedReels(
  platform: PlatformId,
): Promise<{ reviewed: number; analysed: number; skipped: string | null }> {
  const done = { reviewed: 0, analysed: 0 };
  if (platform !== "instagram") return { ...done, skipped: "Instagram only for now." };
  if (!hasOpenAi()) return { ...done, skipped: "OPENAI_API_KEY is not set." };
  const started = Date.now();
  try {
    const rows = await readAllReelLearning(platform);
    if (!rows.length) return { ...done, skipped: null };
    const posts = await readPosts(platform, OWNER_ACCOUNTS[platform].handle, 1000);
    const published = new Map(
      posts.map((post) => [shortcodeFromUrl(post.url) ?? post.postId, post.publishedAt]),
    );
    const plan = planAutoSteps(rows, (row) =>
      row.shortcode ? (published.get(row.shortcode) ?? null) : null,
    );
    if (!plan.cap) return { ...done, skipped: "Turned off (REEL_LEARNING_MONTHLY_USD=0)." };

    const [{ analyseFilmedReel }, { reviewFilmedReel }] = await Promise.all([
      import("./analyse"),
      import("./review"),
    ]);
    for (const step of plan.steps) {
      if (Date.now() - started > TIME_BUDGET_MS) break;
      const result =
        step.kind === "review"
          ? await reviewFilmedReel(step.ideaId).catch((error: unknown) => ({
              reason: error instanceof Error ? error.message : String(error),
            }))
          : await analyseFilmedReel(step.ideaId).catch((error: unknown) => ({
              reason: error instanceof Error ? error.message : String(error),
            }));
      if ("reason" in result) {
        console.warn(`[reel-learning:auto] ${step.kind} ${step.ideaId} not done: ${result.reason}`);
        continue;
      }
      done[step.kind === "review" ? "reviewed" : "analysed"] += 1;
    }
    console.info(
      `[reel-learning:auto] ${platform}: reviewed ${done.reviewed}, analysed ${done.analysed}; ` +
        `$${plan.spent.toFixed(3)} of $${plan.cap.toFixed(2)} spent this month before this pass; ` +
        `${plan.waiting} step(s) left for later syncs.`,
    );
    return {
      ...done,
      skipped:
        !plan.steps.length && plan.waiting
          ? `This month's $${plan.cap.toFixed(2)} for filmed reels is spent.`
          : null,
    };
  } catch (error) {
    console.error("[reel-learning:auto] skipped:", error);
    return { ...done, skipped: error instanceof Error ? error.message : String(error) };
  }
}
