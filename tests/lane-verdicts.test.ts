// The competitor table, decided in code from the lane benchmark.
import { describe, expect, it } from "vitest";

import type { LanePerformance } from "@/lib/analytics-types";
import { laneBenchmark } from "@/lib/lane-benchmark";
import { benchmarkHeadline, laneLabel, laneVerdicts } from "@/lib/lane-verdicts";

const lane = (name: string, postCount: number, medianInteractions: number, medianVsMedian = 1) =>
  ({
    lane: name,
    postCount,
    medianInteractions,
    medianVsMedian,
    shareOfOutputPct: 0,
    shareOfPerformancePct: 0,
    directional: postCount < 3,
  }) as LanePerformance;

const owner = {
  handle: "digitalmarketingtrainer",
  displayName: "Dr. Pritesh Patel",
  followers: 10_000,
  lanes: [lane("AI risks and security", 4, 12), lane("Reflections", 3, 14), lane("Solo", 5, 10)],
};
const rivals = [
  {
    handle: "lily",
    displayName: "Lily Ray",
    followers: 1_000,
    lanes: [lane("AI risks and security", 2, 8, 1.02), lane("AI X Marketing Bridge", 7, 5, 0.94)],
  },
  {
    handle: "rand",
    displayName: "Rand Fishkin",
    followers: 100_000,
    lanes: [lane("AI risks and security", 8, 50, 1.44), lane("Reflections", 1, 10, 0.2)],
  },
  { handle: "new", displayName: "New One", followers: 500, lanes: [] },
];

describe("lane verdicts decided in code", () => {
  it("labels a lane by fixed thresholds, and never calls a handful of posts", () => {
    expect(laneLabel(1.44, 8)).toEqual({ label: "Strong", tone: "good" });
    expect(laneLabel(1.01, 8)).toEqual({ label: "Typical", tone: "warn" });
    expect(laneLabel(0.5, 8)).toEqual({ label: "Weak", tone: "bad" });
    expect(laneLabel(1.63, 3)).toEqual({ label: "Too few posts", tone: "neutral" });
  });

  it("says ahead of the middle competitor, names the best one, and never says leading", () => {
    const benchmark = laneBenchmark(owner, rivals);
    const { verdicts, contestedLanes, openLanes } = laneVerdicts(owner, rivals, benchmark);
    const risks = verdicts.find(
      (row) => row.handle === owner.handle && row.lane === "AI risks and security",
    )!;
    // Middle of Lily (8 per 1k) and Rand (0.5 per 1k) is 4.25: he is behind it.
    expect(risks.gap).toBe("Behind the middle");
    expect(risks.reasoning).toContain("the best of them, Lily Ray, 8");
    expect(JSON.stringify(verdicts)).not.toMatch(/leading/i);
    expect(contestedLanes.some((line) => line.startsWith("AI risks and security: behind"))).toBe(
      true,
    );
    // Only he publishes in "Solo"; only Lily in AI X Marketing Bridge.
    expect(openLanes.some((line) => line.startsWith("Solo: only Dr. Pritesh Patel"))).toBe(true);
    expect(openLanes.some((line) => line.startsWith("AI X Marketing Bridge: a gap"))).toBe(true);
  });

  it("gives every competitor a row: its main lane against its own typical post", () => {
    const { verdicts } = laneVerdicts(owner, rivals, laneBenchmark(owner, rivals));
    const rand = verdicts.find((row) => row.handle === "rand")!;
    expect(rand).toMatchObject({ lane: "AI risks and security", gap: "Strong", tone: "good" });
    expect(rand.reasoning).toContain("1.44x their own typical post across 8 posts");
    expect(verdicts.find((row) => row.handle === "lily")).toMatchObject({
      lane: "AI X Marketing Bridge",
      gap: "Typical",
    });
    expect(verdicts.find((row) => row.handle === "new")).toMatchObject({ gap: "Too few posts" });
  });

  it("writes a headline that only says leads where he is above every competitor", () => {
    const headline = benchmarkHeadline(owner, rivals, laneBenchmark(owner, rivals));
    // Reflections: his 1.4 against Rand's 0.1, the only competitor there.
    expect(headline).toBe(
      "On engagement per 1,000 followers, Dr. Pritesh Patel leads Reflections and is behind the middle competitor in AI risks and security (1.2 against 4.25).",
    );
  });
});
