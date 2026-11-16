// Learning from every LinkedIn post he publishes (lib/post-learning.ts,
// server/post-learning).
import { describe, expect, it } from "vitest";

import type { PostRecord } from "@/lib/analytics-types";
import {
  ANALYSE_ESTIMATE_USD,
  planPostSteps,
  postLearningCap,
  REVIEW_ESTIMATE_USD,
  type PostLearningRow,
} from "@/lib/post-learning";
import { POST_REVIEW_DAYS } from "@/lib/reel-learning-types";
import { asReviewedReel } from "@/server/post-learning/lessons";
import { measuredParts } from "@/server/post-learning/analyse";

const NOW = Date.parse("2026-11-16T12:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

const post = (id: string, daysAgo: number, over: Partial<PostRecord> = {}): PostRecord =>
  ({
    postId: id,
    url: `https://www.linkedin.com/feed/update/${id}`,
    caption:
      "Canva just cut 1,271 jobs.\nBut the bigger question is not about AI.\nWhat would you do?",
    publishedAt: ago(daysAgo),
    format: "text",
    pinned: false,
    likes: 0,
    comments: 0,
    shares: 0,
    views: 0,
    ...over,
  }) as PostRecord;

const row = (
  id: string,
  daysAgo: number,
  over: Partial<PostLearningRow> = {},
): PostLearningRow => ({
  postId: id,
  postUrl: null,
  publishedAt: ago(daysAgo),
  format: "text",
  analysis: null,
  analysedAt: null,
  review: null,
  worked: null,
  reviewedAt: null,
  costUsd: 0,
  ...over,
});

const analysis = measuredParts(post("x", 1)) as unknown as PostLearningRow["analysis"];
const analysed = (id: string, daysAgo: number, over: Partial<PostLearningRow> = {}) =>
  row(id, daysAgo, { analysis, analysedAt: ago(daysAgo - 1), costUsd: 0.001, ...over });

describe("planPostSteps", () => {
  it("reviews posts that have run 14 days, then analyses new ones", () => {
    expect(POST_REVIEW_DAYS).toBe(14);
    const plan = planPostSteps(
      [analysed("old", 20), analysed("young", 5)],
      [post("old", 20), post("young", 5), post("new", 1)],
      { now: NOW, cap: 1 },
    );
    expect(plan.steps).toEqual([
      { kind: "review", postId: "old", estimate: REVIEW_ESTIMATE_USD },
      { kind: "analyse", postId: "new", estimate: ANALYSE_ESTIMATE_USD },
    ]);
  });

  it("learns from posts back to the backfill window only, and never from a pinned post", () => {
    const plan = planPostSteps(
      [],
      [post("recent", 30), post("ancient", 200), post("pinned", 3, { pinned: true })],
      { now: NOW, cap: 1 },
    );
    expect(plan.steps.map((step) => step.postId)).toEqual(["recent"]);
  });

  it("never reviews a post twice, nor retries one that keeps failing", () => {
    const plan = planPostSteps(
      [
        analysed("done", 30, { review: {} as never, worked: true }),
        row("stuck", 3, { costUsd: 0.07 }),
      ],
      [post("done", 30), post("stuck", 3)],
      { now: NOW, cap: 1 },
    );
    expect(plan.steps).toEqual([]);
  });

  it("stops at the monthly cap", () => {
    // $0.99 already spent this month on another post: a 2¢ review no longer fits.
    const spent = analysed("earlier", 10, {
      review: {} as never,
      worked: true,
      costUsd: 0.99,
      reviewedAt: ago(1),
    });
    const plan = planPostSteps(
      [spent, analysed("old", 20)],
      [post("earlier", 10), post("old", 20), post("new", 1)],
      { now: NOW, cap: 1 },
    );
    expect(plan.steps).toEqual([]);
    expect(plan.waiting).toBe(2);
  });

  it("reads its cap from LINKEDIN_LEARNING_MONTHLY_USD", () => {
    expect(postLearningCap(undefined)).toBe(1);
    expect(postLearningCap("off")).toBe(0);
    expect(postLearningCap("2.5")).toBe(2.5);
  });
});

describe("measuredParts", () => {
  it("measures the opening, the close and the shape in code", () => {
    const parts = measuredParts(post("p", 1));
    expect(parts.hookType).toBe("statistic");
    expect(parts.opening).toBe(
      "Canva just cut 1,271 jobs.\nBut the bigger question is not about AI.",
    );
    expect(parts.close).toBe("What would you do?");
    expect(parts.shape.closingQuestion).toBe(true);
  });
});

describe("asReviewedReel", () => {
  it("counts a reviewed post in the patterns under the topic it is filed in", () => {
    const reel = asReviewedReel(
      analysed("p", 20, {
        review: { primaryRatio: 2.4 } as never,
        worked: true,
      }),
      "Marketing fundamentals",
    );
    expect(reel).toMatchObject({
      lane: "Marketing fundamentals",
      hookType: "statistic",
      ratio: 2.4,
      worked: true,
      usage: null,
    });
  });
});
