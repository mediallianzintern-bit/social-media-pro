// The topic list's order: ticked, then new, then the rest, in every lane.
import { describe, expect, it } from "vitest";

import { ticksThenNew } from "@/lib/sources";

const topic = (id: string, voted: "like" | "dislike" | null, isNew: boolean, lane = "A") => ({
  id,
  lane,
  isNew,
  preference: { voted },
});

describe("topic order", () => {
  it("puts ticked topics first, new ones next, the rest after, each keeping its order", () => {
    const ordered = ticksThenNew([
      topic("old-1", null, false),
      topic("new-1", null, true),
      topic("tick-1", "like", false),
      topic("old-2", null, false),
      topic("tick-new", "like", true),
      topic("new-2", null, true),
    ]);
    expect(ordered.map((item) => item.id)).toEqual([
      "tick-1",
      "tick-new",
      "new-1",
      "new-2",
      "old-1",
      "old-2",
    ]);
  });

  it("holds in a single lane too, as the lane filter keeps the order", () => {
    const ordered = ticksThenNew([
      topic("b-old", null, false, "B"),
      topic("a-new", null, true, "A"),
      topic("b-new", null, true, "B"),
      topic("b-tick", "like", false, "B"),
    ]);
    expect(ordered.filter((item) => item.lane === "B").map((item) => item.id)).toEqual([
      "b-tick",
      "b-new",
      "b-old",
    ]);
  });
});
