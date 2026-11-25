// Phase 5: lane figures and published-post matches sent back to Studio.
import { describe, expect, it } from "vitest";

import type { PostRecord } from "@/lib/analytics-types";
import {
  captionSimilarity,
  confirmedLanes,
  laneSnapshot,
  laneSuggestions,
  matchPublications,
  sameVocabulary,
  type ExportedPost,
} from "@/lib/client-lanes";

const NOW = new Date("2026-11-20T12:00:00Z");

let n = 0;
const post = (over: Partial<PostRecord>): PostRecord => ({
  platform: "instagram",
  postId: `p${++n}`,
  url: `https://www.instagram.com/p/X${n}/`,
  caption: "",
  format: "image",
  publishedAt: "2026-11-01T10:00:00Z",
  views: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  pinned: false,
  ...over,
});

describe("lanes Studio confirmed", () => {
  it("keeps confirmed lanes only and compares vocabularies by name and definition", () => {
    const lanes = confirmedLanes([
      { name: "Bakes", definition: "Fresh bread", status: "confirmed" },
      { name: "Team", definition: "", status: "suggested" },
      { name: "Old", definition: "", status: "retired" },
    ]);
    expect(lanes).toEqual([{ name: "Bakes", definition: "Fresh bread" }]);
    expect(sameVocabulary(lanes, [{ name: "bakes ", definition: "Fresh bread" }])).toBe(true);
    expect(sameVocabulary(lanes, [{ name: "Bakes", definition: "Cakes" }])).toBe(false);
    expect(sameVocabulary(lanes, [])).toBe(false);
  });

  it("sends suggestions Studio accepts: no 'other', no duplicates, trimmed", () => {
    expect(
      laneSuggestions([
        { name: " Bakes ", definition: "x".repeat(400) },
        { name: "bakes", definition: "again" },
        { name: "Other", definition: "" },
        { name: "", definition: "" },
      ]),
    ).toEqual([{ name: "Bakes", definition: "x".repeat(300) }]);
  });
});

describe("lane snapshot", () => {
  const lanes = [{ name: "Bakes" }, { name: "Team" }];

  it("scores confirmed lanes on likes + comments over the last 90 days", () => {
    const posts = [
      post({ contentLane: "Bakes", likes: 90, comments: 10 }), // 100
      post({ contentLane: "Bakes", likes: 190, comments: 10 }), // 200
      post({ contentLane: "Bakes", likes: 300, comments: 0 }), // 300
      post({ contentLane: "Team", likes: 50, comments: 0, shares: 999 }), // 50: shares ignored
      post({ contentLane: "other", likes: 100, comments: 0 }), // counts to the baseline only
      post({ contentLane: "Bakes", likes: 9999, publishedAt: "2026-07-01T00:00:00Z" }), // too old
      post({ contentLane: "Bakes", likes: 9999, pinned: true }), // pinned
    ];
    const snap = laneSnapshot({ handle: "maple.bakery", posts, lanes, now: NOW })!;
    expect(snap).toMatchObject({
      platform: "instagram",
      handle: "maple.bakery",
      windowFrom: "2026-08-22",
      windowTo: "2026-11-20",
      basis: "interactions",
      postCount: 5,
    });
    // Baseline: median of 100, 200, 300, 50, 100 = 100.
    expect(snap.lanes).toEqual([
      {
        lane: "Bakes",
        postCount: 3,
        shareOfOutputPct: 60,
        shareOfPerformancePct: 80,
        medianVsMedian: 2,
        medianInteractions: 200,
        directional: false,
      },
      {
        lane: "Team",
        postCount: 1,
        shareOfOutputPct: 20,
        shareOfPerformancePct: 7,
        medianVsMedian: 0.5,
        medianInteractions: 50,
        directional: true,
      },
    ]);
  });

  it("matches lane names case-insensitively and reports Studio's spelling", () => {
    const snap = laneSnapshot({
      handle: "m",
      posts: [post({ contentLane: "bakes", likes: 5 })],
      lanes,
      now: NOW,
    })!;
    expect(snap.lanes.map((l) => l.lane)).toEqual(["Bakes"]);
  });

  it("is null when no post in the window is in a confirmed lane", () => {
    expect(
      laneSnapshot({ handle: "m", posts: [post({ contentLane: "other" })], lanes, now: NOW }),
    ).toBeNull();
    expect(laneSnapshot({ handle: "m", posts: [], lanes, now: NOW })).toBeNull();
  });
});

describe("publication matching", () => {
  const exported = (over: Partial<ExportedPost>): ExportedPost => ({
    postId: "10000000-0000-4000-8000-000000000001",
    slotDate: "2026-11-05",
    exportedAt: "2026-11-01T09:00:00Z",
    caption: "Our sourdough is back this Saturday. Come early, it sells out by noon!",
    hashtags: ["#sourdough"],
    publication: null,
    ...over,
  });

  it("ignores hashtags, mentions and punctuation when comparing captions", () => {
    expect(
      captionSimilarity(
        "Our sourdough is back this Saturday!",
        "our sourdough is back this saturday #bread #local @maple.bakery",
      ),
    ).toBe(1);
    expect(captionSimilarity("", "anything")).toBe(0);
  });

  it("matches the live post a manager published from the export", () => {
    const live = post({
      postId: "IG1",
      url: "https://www.instagram.com/p/IG1/",
      caption:
        "Our sourdough is back this Saturday 🍞 Come early, it sells out by noon! #sourdough #maple",
      publishedAt: "2026-11-05T15:00:00Z",
    });
    const other = post({ caption: "Meet Sam, our new baker", publishedAt: "2026-11-06T15:00:00Z" });
    expect(matchPublications([exported({})], [other, live])).toEqual([
      {
        postId: "10000000-0000-4000-8000-000000000001",
        platform: "instagram",
        platformPostId: "IG1",
        url: "https://www.instagram.com/p/IG1/",
        publishedAt: "2026-11-05T15:00:00.000Z",
        matchedBy: "caption",
        score: 1,
      },
    ]);
  });

  it("never guesses: a reworded caption, an earlier post or a matched one is left alone", () => {
    const reworded = post({ caption: "Sourdough Saturday is here, see you soon" });
    const before = post({
      caption: "Our sourdough is back this Saturday. Come early, it sells out by noon!",
      publishedAt: "2026-10-20T10:00:00Z",
    });
    expect(matchPublications([exported({})], [reworded, before])).toEqual([]);

    const live = post({
      postId: "IG2",
      caption: "Our sourdough is back this Saturday. Come early, it sells out by noon!",
    });
    const done = exported({
      publication: {
        platformPostId: "IG2",
        url: "https://www.instagram.com/p/IG2/",
        publishedAt: "2026-11-01T10:00:00Z",
      },
    });
    expect(matchPublications([done], [live])).toEqual([]);
  });

  it("pairs one to one, best first", () => {
    const a = exported({ postId: "10000000-0000-4000-8000-00000000000a" });
    const b = exported({
      postId: "10000000-0000-4000-8000-00000000000b",
      caption: "Our sourdough is back this Saturday. Come early, it sells out by noon",
    });
    const live = post({
      postId: "IG3",
      caption: "Our sourdough is back this Saturday. Come early, it sells out by noon!",
    });
    const matches = matchPublications([a, b], [live]);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.platformPostId).toBe("IG3");
  });
});
