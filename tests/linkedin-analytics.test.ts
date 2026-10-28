// Which LinkedIn posts are asked about, within LinkedIn's daily limit.
import { describe, expect, it } from "vitest";

import {
  CALLS_PER_RUN,
  duePosts,
  entityParam,
  POST_METRICS,
  trueEngagementRate,
  type TrackedPost,
} from "@/lib/linkedin-analytics";

const now = Date.parse("2026-10-28T12:00:00Z");
const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString();
const hoursAgo = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
const post = (id: string, publishedDays: number, fetchedHours: number | null): TrackedPost => ({
  postId: id,
  shareUrn: `urn:li:share:${id}`,
  publishedAt: daysAgo(publishedDays),
  fetchedAt: fetchedHours === null ? null : hoursAgo(fetchedHours),
});

describe("LinkedIn refresh schedule", () => {
  it("asks about a new post at once, and a fresh one once a day", () => {
    const due = duePosts([post("1", 1, null), post("2", 2, 21), post("3", 3, 5)], 80, now);
    expect(due.map((p) => p.postId)).toEqual(["1", "2"]);
  });

  it("asks about a settled post every 3 days, and never after 30 days", () => {
    const due = duePosts([post("4", 10, 30), post("5", 10, 80), post("6", 40, null)], 80, now);
    expect(due.map((p) => p.postId)).toEqual(["5"]);
  });

  it("stays inside the call budget, newest first", () => {
    const many = Array.from({ length: 40 }, (_, n) => post(String(n), n * 0.5, null));
    const due = duePosts(many, CALLS_PER_RUN, now);
    expect(due.length * POST_METRICS.length).toBeLessThanOrEqual(CALLS_PER_RUN);
    expect(due[0]!.postId).toBe("0");
  });
});

describe("LinkedIn post IDs", () => {
  it("writes a share and a ugcPost the way LinkedIn wants them", () => {
    expect(entityParam("urn:li:share:7501881006313062400")).toBe(
      "(share:urn%3Ali%3Ashare%3A7501881006313062400)",
    );
    expect(entityParam("urn:li:ugcPost:7515400558309208064")).toBe(
      "(ugc:urn%3Ali%3AugcPost%3A7515400558309208064)",
    );
    expect(entityParam("7520824150148558849")).toBeNull();
  });

  it("measures engagement on impressions, not followers", () => {
    expect(trueEngagementRate(14, 499)).toBeCloseTo(0.028, 3);
    expect(trueEngagementRate(3, 0)).toBeNull();
  });
});
