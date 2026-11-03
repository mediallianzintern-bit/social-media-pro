// The competitor table, decided in code from the lane benchmark.
import { describe, expect, it } from "vitest";

import type { LanePerformance } from "@/lib/analytics-types";
import { laneBenchmark } from "@/lib/lane-benchmark";
import {
  benchmarkHeadline,
  benchmarkTakeaways,
  laneLabel,
  laneVerdicts,
} from "@/lib/lane-verdicts";

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
    // One row per ACCOUNT: he appears once, not once per lane.
    const his = verdicts.filter((row) => row.handle === owner.handle);
    expect(his).toHaveLength(1);
    expect(his[0]!.gap).toBe("baseline");
    // Middle of Lily (8 per 1k) and Rand (0.5 per 1k) is 4.25: he is behind it.
    expect(his[0]!.reasoning).toContain("behind in AI risks and security (1.2 against 4.25)");
    expect(JSON.stringify(verdicts)).not.toMatch(/leading/i);
    // The lane-by-lane figures still exist, under Contested lanes.
    expect(contestedLanes.some((line) => line.startsWith("AI risks and security: behind"))).toBe(
      true,
    );
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

  it("writes takeaways that agree with the table and name who to read", () => {
    const takeaways = benchmarkTakeaways(owner, rivals, laneBenchmark(owner, rivals));
    const text = JSON.stringify(takeaways);
    expect(takeaways.length).toBeGreaterThanOrEqual(3);
    expect(takeaways.length).toBeLessThanOrEqual(4);
    // The gap comes first, and says who to read rather than "adjust strategy".
    expect(takeaways[0]!.takeaway).toContain(
      "Behind the middle competitor in AI risks and security",
    );
    expect(takeaways[0]!.soWhat).toContain("Lily Ray");
    // Never claims a lane is too thin to call while the table judges it.
    const judged = laneBenchmark(owner, rivals)
      .filter((row) => row.ownerPosts >= 3 && row.standing !== "competitors-only")
      .map((row) => row.lane);
    for (const lane of judged) {
      expect(text).not.toMatch(new RegExp(`too few posts[^"]*${lane}`, "i"));
    }
    expect(text).not.toMatch(/content strategy|leverage|double down/i);
  });
});
