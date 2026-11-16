// Followed and unfollowed on Instagram for a period (server/graph/follows.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<Record<string, string>> = [];
vi.mock("@/server/graph/client", () => ({
  hasInstagramGraph: () => true,
  igAccountId: () => "ig",
  graphOptional: async (_path: string, params: Record<string, string>) => {
    calls.push(params);
    return {
      data: [
        {
          total_value: {
            breakdowns: [
              {
                results: [
                  { dimension_values: ["FOLLOWER"], value: 10 },
                  { dimension_values: ["NON_FOLLOWER"], value: 4 },
                ],
              },
            ],
          },
        },
      ],
    };
  },
}));

const { fetchFollowFlow } = await import("@/server/graph/follows");
const NOW = Date.parse("2026-11-16T12:00:00Z");

describe("fetchFollowFlow", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("adds follows and unfollows across the period", async () => {
    const flow = await fetchFollowFlow({ start: "2026-11-10", end: "2026-11-17" }, NOW);
    expect(flow).toEqual({ followed: 10, unfollowed: 4, from: "2026-11-10", capped: false });
    expect(calls).toHaveLength(1);
    expect(calls[0]!["metric"]).toBe("follows_and_unfollows");
    expect(calls[0]!["breakdown"]).toBe("follow_type");
  });

  it("asks in windows of at most 30 days", async () => {
    const flow = await fetchFollowFlow({ start: "2026-08-18", end: "2026-11-16" }, NOW);
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(Number(call["until"]) - Number(call["since"])).toBeLessThanOrEqual(30 * 86_400);
    }
    expect(flow?.followed).toBe(30);
    expect(flow?.unfollowed).toBe(12);
  });

  it("starts all time a year back, and says so", async () => {
    const flow = await fetchFollowFlow({ start: null, end: "2026-11-17" }, NOW);
    expect(flow?.capped).toBe(true);
    expect(flow?.from).toBe("2025-11-16");
    expect(calls).toHaveLength(13);
  });
});
