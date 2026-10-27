// The team's standing on each creator, and the drop rule (AI tool workflows, phase 4).
import { describe, expect, it } from "vitest";

import {
  buildCreatorStandings,
  creatorKey,
  dropReason,
  type CreatorReelVote,
} from "@/lib/creator-standing";

const now = Date.parse("2026-10-27T12:00:00Z");

/** `verdicts` newest reel first: "x" cross, "v" tick, "-" no vote. */
const reels = (handle: string, verdicts: string): CreatorReelVote[] =>
  [...verdicts].map((mark, n) => ({
    handle,
    reelId: `${handle}-${n}`,
    postedAt: new Date(now - n * 86_400_000).toISOString(),
    verdict: mark === "x" ? "dislike" : mark === "v" ? "like" : null,
    votedAt: mark === "-" ? null : new Date(now).toISOString(),
  }));

describe("creator standing", () => {
  it("matches handles with or without the @", () => {
    expect(creatorKey("@MavGPT ")).toBe("mavgpt");
    const standings = buildCreatorStandings(reels("@mavgpt", "vvv"), now);
    expect(standings.get("mavgpt")?.ticks).toBe(3);
  });

  it("drops at 10 crosses in the last 15 reels", () => {
    const standing = buildCreatorStandings(reels("@a", "xxxxxxxxxx-----"), now).get("a")!;
    expect(standing.recentCrosses).toBe(10);
    expect(standing.drop).toBe(true);
    expect(dropReason(standing)).toBe("crossed 10 of their last 15 reels");
  });

  it("does not drop at 9 crosses in the last 15", () => {
    expect(buildCreatorStandings(reels("@a", "xxxxxxxxx------"), now).get("a")!.drop).toBe(false);
  });

  it("only counts the 15 most recent reels", () => {
    // Ten crosses, but five of them are older than the last 15 reels.
    const standing = buildCreatorStandings(reels("@a", "xxxxx----------xxxxx"), now).get("a")!;
    expect(standing.crosses).toBe(10);
    expect(standing.recentCrosses).toBe(5);
    expect(standing.drop).toBe(false);
  });

  it("is backed by repeated ticks and untested on a single vote", () => {
    const standings = buildCreatorStandings([...reels("@a", "vvvvv"), ...reels("@b", "x")], now);
    expect(standings.get("a")!.standing).toBe("backed");
    expect(standings.get("b")!.standing).toBe("untested");
  });

  it("is often crossed once crosses clearly outweigh ticks", () => {
    expect(buildCreatorStandings(reels("@a", "xxxxxv"), now).get("a")!.standing).toBe("crossed");
  });
});
