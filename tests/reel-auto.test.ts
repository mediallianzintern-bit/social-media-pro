// Filmed reels analysed and reviewed by themselves after each sync, within a cap.
import { describe, expect, it } from "vitest";

import {
  ANALYSE_ESTIMATE_USD,
  monthlyCap,
  planAutoSteps,
  REVIEW_ESTIMATE_USD,
  spentThisMonth,
} from "@/server/reel-learning/auto";
import type { ReelLearningRow } from "@/server/reel-learning/store";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const row = (patch: Partial<ReelLearningRow>): ReelLearningRow =>
  ({
    ideaId: "i",
    platform: "instagram",
    filmedAt: "2026-10-20T00:00:00Z",
    filmedBy: null,
    shortcode: "s",
    reelUrl: "https://www.instagram.com/reel/s/",
    matchedAt: null,
    match: null,
    sourceWords: null,
    transcript: null,
    comparison: null,
    usage: null,
    analysedAt: null,
    review: null,
    worked: null,
    reviewedAt: null,
    costUsd: 0,
    ...patch,
  }) as ReelLearningRow;
const analysed = { comparison: {} as never, analysedAt: "2026-10-21T00:00:00Z", costUsd: 0.03 };
const published: Record<string, string> = {
  due: "2026-10-15T00:00:00Z",
  early: "2026-10-16T00:00:00Z",
  young: "2026-10-25T00:00:00Z",
  found: "2026-10-26T00:00:00Z",
};
const publishedAtOf = (r: ReelLearningRow) => published[r.ideaId] ?? null;

describe("automatic learning from filmed reels", () => {
  it("reviews what is 14 days old (or only had an early check) first, then analyses what was found", () => {
    const plan = planAutoSteps(
      [
        row({ ideaId: "found", filmedAt: "2026-10-27T00:00:00Z" }),
        row({ ideaId: "young", ...analysed }),
        row({ ideaId: "early", ...analysed, review: { early: { days: 4 } } as never }),
        row({ ideaId: "due", ...analysed }),
        row({
          ideaId: "done",
          ...analysed,
          review: {} as never,
          reviewedAt: "2026-10-29T00:00:00Z",
        }),
        row({ ideaId: "waiting", shortcode: null, reelUrl: null }),
      ],
      publishedAtOf,
      { now: NOW, cap: 1 },
    );
    expect(plan.steps.map((step) => `${step.kind}:${step.ideaId}`)).toEqual([
      "review:due",
      "review:early",
      "analyse:found",
    ]);
  });

  it("stops at the monthly cap and leaves the rest for later", () => {
    const plan = planAutoSteps(
      [
        row({ ideaId: "a", filmedAt: "2026-10-01T00:00:00Z" }),
        row({ ideaId: "b", filmedAt: "2026-10-02T00:00:00Z" }),
        row({ ideaId: "spent", ...analysed, costUsd: 0.9, analysedAt: "2026-11-01T00:00:00Z" }),
      ],
      () => null,
      { now: NOW, cap: 1 },
    );
    expect(plan.spent).toBeCloseTo(0.9);
    expect(plan.steps).toHaveLength(Math.floor(0.1 / ANALYSE_ESTIMATE_USD));
    expect(plan.waiting).toBe(2 - plan.steps.length);
    expect(REVIEW_ESTIMATE_USD).toBeLessThan(ANALYSE_ESTIMATE_USD);
  });

  it("never retries a reel that has already cost too much without a result", () => {
    const plan = planAutoSteps([row({ ideaId: "stuck", costUsd: 0.15 })], () => null, {
      now: NOW,
      cap: 1,
    });
    expect(plan.steps).toEqual([]);
  });

  it("counts only this month's spend, and reads the cap from the setting", () => {
    expect(
      spentThisMonth(
        [
          row({ costUsd: 0.05, analysedAt: "2026-10-21T00:00:00Z" }),
          row({ costUsd: 0.04, reviewedAt: "2026-11-01T00:00:00Z" }),
        ],
        NOW,
      ),
    ).toBeCloseTo(0.04);
    expect(monthlyCap(undefined)).toBe(1);
    expect(monthlyCap("2.5")).toBe(2.5);
    expect(monthlyCap("off")).toBe(0);
    expect(monthlyCap("0")).toBe(0);
  });
});
