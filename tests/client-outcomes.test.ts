// A Studio client's published posts after 14 days, sent back to Studio
// (lib/client-outcomes.ts, server/clients/outcomes.ts).
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import type { PostRecord } from "@/lib/analytics-types";
import type { ExportedPost } from "@/lib/client-lanes";
import { dueOutcomes, lessonSpendThisMonth, typicalBefore, verdictOf } from "@/lib/client-outcomes";
import { lessonCap } from "@/server/clients/outcomes";
import { bridgeVersionOf } from "@/server/clients/studio";

const NOW = new Date("2026-11-25T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

let n = 0;
const post = (over: Partial<PostRecord>): PostRecord => ({
  platform: "instagram",
  postId: `p${++n}`,
  url: `https://www.instagram.com/p/X${n}/`,
  caption: "A post",
  format: "image",
  publishedAt: day(30),
  views: 0,
  likes: 100,
  comments: 0,
  shares: 0,
  pinned: false,
  measuredAt: day(0),
  ...over,
});

const exported = (over: Partial<ExportedPost>): ExportedPost => ({
  postId: "10000000-0000-4000-8000-000000000001",
  slotDate: "2026-11-01",
  exportedAt: day(40),
  caption: "Studio's caption",
  hashtags: [],
  publication: {
    platformPostId: "live",
    url: "https://www.instagram.com/p/live/",
    publishedAt: day(20),
  },
  lane: "Behind the bakery",
  outcome: null,
  ...over,
});

// Four earlier posts at 100 likes: the client's typical post is 100.
const history = () => [40, 35, 30, 25].map((d) => post({ publishedAt: day(d) }));

describe("14-day results", () => {
  it("sends a matched post 14 days old, against the posts before it", () => {
    const live = post({ postId: "live", publishedAt: day(20), likes: 200, comments: 24, views: 0 });
    // A newer post, still climbing, is not part of the typical post.
    const newer = post({ publishedAt: day(2), likes: 5 });
    const [due, ...rest] = dueOutcomes({
      exported: [exported({})],
      posts: [live, newer, ...history()],
      now: NOW,
    });
    expect(rest).toEqual([]);
    expect(due!.figures).toMatchObject({
      postId: "10000000-0000-4000-8000-000000000001",
      platformPostId: "live",
      ageDays: 20,
      interactions: 224,
      typicalInteractions: 100,
      comparedWith: 4,
      vsTypical: 2.24,
      verdict: "above",
      views: null,
      lane: "Behind the bakery",
    });
  });

  it("waits for day 14, and sends each post once", () => {
    const young = post({ postId: "live", publishedAt: day(10) });
    expect(
      dueOutcomes({
        exported: [
          exported({ publication: { ...exported({}).publication!, publishedAt: day(10) } }),
        ],
        posts: [young, ...history()],
        now: NOW,
      }),
    ).toEqual([]);
    const old = post({ postId: "live", publishedAt: day(20) });
    expect(
      dueOutcomes({
        exported: [exported({ outcome: { measuredAt: day(3), lessonCostUsd: 0.001 } })],
        posts: [old, ...history()],
        now: NOW,
      }),
    ).toEqual([]);
  });

  it("sends a post that stopped being re-measured with the age it was last measured at", () => {
    // Last scraped on day 9 of its life, eleven days ago: no newer figure is coming.
    const dropped = post({ postId: "live", publishedAt: day(20), measuredAt: day(11) });
    const [due] = dueOutcomes({
      exported: [exported({})],
      posts: [dropped, ...history()],
      now: NOW,
    });
    expect(due!.figures.ageDays).toBe(9);
    // Fifteen days old, last measured two days ago at day 13: it may still be
    // re-measured, so wait.
    const fresh = post({ postId: "live", publishedAt: day(15), measuredAt: day(2) });
    expect(
      dueOutcomes({ exported: [exported({})], posts: [fresh, ...history()], now: NOW }),
    ).toEqual([]);
  });

  it("uses a match recorded on this sync, and skips a post with nothing to compare", () => {
    const live = post({ postId: "fresh-match", publishedAt: day(16) });
    const item = exported({ publication: null });
    const matches = [
      {
        postId: item.postId,
        platform: "instagram" as const,
        platformPostId: "fresh-match",
        url: "https://www.instagram.com/p/fresh-match/",
        publishedAt: day(16),
        matchedBy: "caption" as const,
        score: 0.9,
      },
    ];
    expect(
      dueOutcomes({ exported: [item], matches, posts: [live, ...history()], now: NOW }),
    ).toHaveLength(1);
    expect(dueOutcomes({ exported: [item], matches, posts: [live], now: NOW })).toEqual([]);
  });

  it("calls a result above, typical or below", () => {
    expect(verdictOf(1.25)).toBe("above");
    expect(verdictOf(1.1)).toBe("typical");
    expect(verdictOf(0.8)).toBe("below");
    const live = post({ publishedAt: day(20) });
    expect(typicalBefore(live, [live, ...history()])).toEqual({ typical: 100, comparedWith: 4 });
  });

  it("counts this month's lesson spend from Studio's record, and caps it", () => {
    const spent = lessonSpendThisMonth(
      [
        exported({ outcome: { measuredAt: "2026-11-03T00:00:00Z", lessonCostUsd: 0.002 } }),
        exported({ outcome: { measuredAt: "2026-11-20T00:00:00Z", lessonCostUsd: 0.003 } }),
        exported({ outcome: { measuredAt: "2026-10-30T00:00:00Z", lessonCostUsd: 0.5 } }),
        exported({ outcome: null }),
      ],
      NOW,
    );
    expect(spent).toBeCloseTo(0.005);
    expect(lessonCap(undefined)).toBe(0.5);
    expect(lessonCap("off")).toBe(0);
    expect(lessonCap("2")).toBe(2);
    expect(lessonCap("nonsense")).toBe(0.5);
  });

  it("reads Studio's bridge version, 1 when it names none", () => {
    expect(bridgeVersionOf({ ok: true, data: {}, version: 2 })).toBe(2);
    expect(bridgeVersionOf({ ok: true, data: {} })).toBe(1);
    expect(bridgeVersionOf(null)).toBe(1);
  });
});
