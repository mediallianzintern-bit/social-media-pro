// Lanes judged on engagement per 1,000 followers, not on who is bigger.
import { describe, expect, it } from "vitest";

import type { LanePerformance } from "@/lib/analytics-types";
import { laneBenchmark } from "@/lib/lane-benchmark";

const lane = (name: string, postCount: number, medianInteractions: number) =>
  ({ lane: name, postCount, medianInteractions }) as LanePerformance;

describe("lane benchmark", () => {
  it("puts a small account ahead when its engagement per follower is higher", () => {
    const rows = laneBenchmark(
      {
        handle: "owner",
        followers: 8600,
        lanes: [lane("Reflections", 6, 18), lane("Ads", 19, 11)],
      },
      [
        {
          handle: "big",
          followers: 220000,
          lanes: [lane("Reflections", 2, 50), lane("Ads", 5, 460)],
        },
        { handle: "mid", followers: 60000, lanes: [lane("Security", 4, 300)] },
      ],
    );
    const by = Object.fromEntries(rows.map((row) => [row.lane, row]));
    expect(by["Reflections"]).toMatchObject({ standing: "ahead", ownerPer1k: 2.09 });
    expect(by["Ads"]).toMatchObject({ standing: "behind", leader: { handle: "big" } });
    expect(by["Security"]!.standing).toBe("competitors-only");
  });
});
