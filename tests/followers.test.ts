// Followers for a period: as of its end, never today's total for a past period.
import { describe, expect, it } from "vitest";

import { periodFollowers } from "@/lib/followers";

const growth = [
  { capturedAt: "2026-09-08T06:00:00Z", followers: 8511 },
  { capturedAt: "2026-09-23T06:00:00Z", followers: 8515 },
  { capturedAt: "2026-10-28T06:00:00Z", followers: 8618 },
  { capturedAt: "2026-10-29T06:00:00Z", followers: 8626 },
];
const now = Date.parse("2026-10-29T12:00:00Z");

describe("followers in a period", () => {
  it("reads 1-28 September as of its end, not today's total", () => {
    const period = periodFollowers(
      growth,
      { from: new Date("2026-09-01T00:00:00Z"), to: new Date("2026-09-29T00:00:00Z") },
      now,
    );
    expect(period.end?.followers).toBe(8515);
    expect(period.current).toBe(false);
    // History begins on 8 Sep, inside the period: the change is since then.
    expect(period).toMatchObject({ partial: true, change: 4 });
  });

  it("says nothing was recorded for a period before history began", () => {
    const period = periodFollowers(
      growth,
      { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-09-01T00:00:00Z") },
      now,
    );
    expect(period.end).toBeNull();
    expect(period.change).toBeNull();
  });

  it("runs to today's total for a period that ends now", () => {
    const period = periodFollowers(
      growth,
      { from: new Date("2026-10-01T00:00:00Z"), to: null },
      now,
    );
    // From the first count inside October (28 Oct, 8,618), not 23 Sep's.
    expect(period).toMatchObject({ current: true, change: 8, partial: false });
    expect(period.start?.followers).toBe(8618);
    expect(period.end?.followers).toBe(8626);
  });

  it("does not reach back past a gap in the syncs to before the period", () => {
    // 21 Oct to now: the last count before it is 23 Sep's; the change is the
    // chart's, from the first count inside the period.
    const period = periodFollowers(
      growth,
      { from: new Date("2026-10-21T00:00:00Z"), to: null },
      now,
    );
    expect(period.start?.capturedAt).toBe("2026-10-28T06:00:00Z");
    expect(period.change).toBe(8);
  });
});
