// The client-facing Performance report's figures (26 Nov 2026): what a period
// published and earned, and the period just before it to compare with.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: () => undefined,
  setCookie: () => undefined,
  deleteCookie: () => undefined,
}));

import type { PostRecord } from "@/lib/analytics-types";
import { followerChange, periodTotals, previousWindow } from "@/server/report";
import { monthOptions, periodWindow } from "@/lib/report-periods";
import { monthlyReview, titleOf } from "@/lib/monthly-review";
import { withLinkedIn } from "@/lib/linkedin-review";

const post = (over: Partial<PostRecord>): PostRecord => ({
  platform: "instagram",
  postId: Math.random().toString(36),
  caption: "",
  format: "reel",
  publishedAt: "2026-11-01T10:00:00Z",
  views: 1000,
  likes: 40,
  comments: 10,
  shares: 0,
  pinned: false,
  ...over,
});

describe("Performance report figures", () => {
  it("totals a period's organic posts, by format", () => {
    const totals = periodTotals([
      post({}),
      post({ format: "image", views: 0, likes: 20, comments: 0 }),
      post({ pinned: true, views: 99_999, likes: 9_999 }),
    ]);
    expect(totals).toEqual({
      posts: 2,
      views: 1000,
      likes: 60,
      comments: 10,
      interactionsPerPost: 35,
      formats: { reel: 1, image: 1 },
    });
    expect(periodTotals([]).interactionsPerPost).toBe(0);
  });

  it("compares with the period just before, of the same length", () => {
    const now = Date.parse("2026-11-26T00:00:00Z");
    const before = previousWindow({ period: "30d" }, now)!;
    expect(before.label).toBe("the 30 days before");
    expect(Date.parse(before.until) - Date.parse(before.since)).toBeCloseTo(30 * 86_400_000, -4);
    const custom = previousWindow({ period: "custom", from: "2026-10-05", to: "2026-11-04" }, now)!;
    expect(custom.label).toBe("the 31 days before");
    expect(previousWindow({ period: "all" }, now)).toBeNull();
    expect(previousWindow({ period: "custom", from: "2026-10-01" }, now)).toBeNull();
  });

  it("says nothing about a follower change without two syncs", () => {
    expect(followerChange([])).toBeNull();
    expect(followerChange([{ capturedAt: "a", followers: 10 }])).toBeNull();
    expect(
      followerChange([
        { capturedAt: "a", followers: 10 },
        { capturedAt: "b", followers: 7 },
      ]),
    ).toBe(-3);
  });
});

describe("Monthly report periods", () => {
  const now = Date.parse("2026-11-26T09:00:00Z");

  it("compares a calendar month with the whole month before, in India days", () => {
    const october = periodWindow({ period: "month", month: "2026-10" }, now);
    expect(october.label).toBe("October 2026 (1–31 Oct)");
    expect(october.since).toBe("2026-09-30T18:30:00.000Z");
    expect(october.until).toBe("2026-10-31T18:30:00.000Z");
    expect(october.monthly).toBe(true);
    const september = previousWindow({ period: "month", month: "2026-10" }, now)!;
    expect(september.label).toBe("September 2026 (1–30 Sep)");
    expect(september.name).toBe("September");
    expect(september.until).toBe(october.since);
  });

  it("reports November as a whole month once it is over", () => {
    const december = Date.parse("2026-12-03T09:00:00Z");
    const november = { period: "month" as const, month: "2026-11" };
    expect(periodWindow(november, december).label).toBe("November 2026 (1–30 Nov)");
    expect(previousWindow(november, december)!.label).toBe("October 2026 (1–31 Oct)");
  });

  it("knows February's length, leap years included", () => {
    expect(previousWindow({ period: "month", month: "2028-03" }, now)!.label).toBe(
      "February 2028 (1–29 Feb)",
    );
    expect(previousWindow({ period: "month", month: "2027-03" }, now)!.label).toBe(
      "February 2027 (1–28 Feb)",
    );
    expect(previousWindow({ period: "month", month: "2027-01" }, now)!.label).toBe(
      "December 2026 (1–31 Dec)",
    );
  });

  it("reads custom dates that are exactly one month as that month", () => {
    const custom = { period: "custom" as const, from: "2026-10-01", to: "2026-10-31" };
    expect(periodWindow(custom, now).label).toBe("October 2026 (1–31 Oct)");
    expect(previousWindow(custom, now)!.label).toBe("September 2026 (1–30 Sep)");
  });

  it("compares a month in progress with the same days of the month before", () => {
    const november = periodWindow({ period: "month", month: "2026-11" }, now);
    expect(november.label).toBe("November 2026 so far (1–26 Nov)");
    expect(november.until).toBeNull();
    const before = previousWindow({ period: "month", month: "2026-11" }, now)!;
    expect(before.label).toBe("1–26 Oct 2026");
    expect(before.name).toBe("the same days of October");
  });

  it("lays out the last 30 days and a month-long custom period as the monthly report", () => {
    expect(periodWindow({ period: "30d" }, now).monthly).toBe(true);
    expect(periodWindow({ period: "90d" }, now).monthly).toBe(false);
    expect(periodWindow({ period: "all" }, now).monthly).toBe(false);
    expect(
      periodWindow({ period: "custom", from: "2026-10-05", to: "2026-11-04" }, now).monthly,
    ).toBe(true);
    expect(
      periodWindow({ period: "custom", from: "2026-08-01", to: "2026-10-31" }, now).monthly,
    ).toBe(false);
  });

  it("offers this month and the eleven before it", () => {
    const options = monthOptions(now);
    expect(options).toHaveLength(12);
    expect(options[0]).toEqual({ month: "2026-11", label: "November 2026 (so far)" });
    expect(options[1]).toEqual({ month: "2026-10", label: "October 2026" });
    expect(options[11]!.month).toBe("2025-12");
  });
});

describe("Monthly review", () => {
  const at = (day: string, over: Partial<PostRecord> = {}) =>
    post({ publishedAt: `${day}T06:30:00Z`, ...over });

  it("compares the two months on the same figures, and says so in words", () => {
    const september = [
      at("2026-09-02", { views: 1000, likes: 50 }),
      at("2026-09-09", { views: 1000, likes: 50 }),
      at("2026-09-16", {
        views: 9000,
        likes: 400,
        caption: "A tax problem became an idea. More here",
      }),
    ];
    const october = [
      at("2026-10-05", { views: 500, likes: 20 }),
      at("2026-10-12", { views: 600, likes: 20 }),
      at("2026-10-13", { views: 2000, likes: 60, caption: "Dhoni at your door?\nMore" }),
    ];
    const review = monthlyReview({
      platform: "instagram",
      current: {
        posts: october,
        since: "2026-09-30T18:30:00.000Z",
        until: "2026-10-31T18:30:00.000Z",
        days: 31,
      },
      previous: {
        posts: september,
        since: "2026-08-31T18:30:00.000Z",
        until: "2026-09-30T18:30:00.000Z",
        days: 30,
      },
      growth: [
        { capturedAt: "2026-09-08T12:00:00Z", followers: 11_069 },
        { capturedAt: "2026-09-30T12:00:00Z", followers: 10_989 },
        { capturedAt: "2026-10-30T12:00:00Z", followers: 10_871 },
      ],
      handle: "brand",
      displayName: "Brand",
      labels: {
        currentShort: "Oct 2026",
        previousShort: "Sep 2026",
        currentName: "October",
        previousName: "September",
      },
      rivals: [],
      insights: null,
      periodIsRecent: false,
    });
    expect(review.basis).toBe("views");
    expect(review.current.typicalViews).toBe(600);
    expect(review.previous.typicalViews).toBe(1000);
    // October starts from September's last sync, the day before it began.
    expect(review.current.followerChange).toBe(-118);
    expect(review.previous.followersFrom).toBe("2026-09-08T12:00:00Z");
    expect(review.current.best?.title).toBe("Dhoni at your door?");
    expect(review.current.postsAt3x).toBe(1);
    expect(review.changes[0]).toBe(
      'The best post in September ("A tax problem became an idea.") reached 9,000 views; the best in October ("Dhoni at your door?") reached 2,000.',
    );
    expect(review.changes[2]).toBe(
      "The account lost 118 followers in October, after losing 80 in September (counted from 8 Sep).",
    );
    // Monday 5 Oct and Monday 12 Oct, in India.
    expect(review.weekdays.find((row) => row.weekday === 1)?.current.posts).toBe(2);
  });

  it("titles a post with its caption's first sentence", () => {
    expect(titleOf("This brand did a thing. Then another.\nSecond line")).toBe(
      "This brand did a thing.",
    );
    expect(titleOf("Short. And more")).toBe("Short. And more");
    expect(titleOf("")).toBe("(no caption)");
  });
});

describe("LinkedIn monthly review", () => {
  const li = (day: string, over: Partial<PostRecord> = {}) =>
    post({ platform: "linkedin", publishedAt: `${day}T06:30:00Z`, views: 0, ...over });
  const days = (from: string, count: number, impressions: number, engagements: number) =>
    Array.from({ length: count }, (_, index) => ({
      day: new Date(Date.parse(`${from}T00:00:00Z`) + index * 86_400_000)
        .toISOString()
        .slice(0, 10),
      impressions,
      engagements,
      newFollowers: 2,
    }));

  it("uses LinkedIn's own figures, and compares per-post figures only where most posts were measured", () => {
    const september = [li("2026-09-02", { postId: "s1" }), li("2026-09-09", { postId: "s2" })];
    const october = [
      li("2026-10-05", { postId: "o1", likes: 20 }),
      li("2026-10-12", { postId: "o2", likes: 10 }),
      li("2026-10-13", { postId: "o3", likes: 10, caption: "Same post\nA" }),
      li("2026-10-21", { postId: "o4", likes: 10, caption: "Same post\nB" }),
    ];
    const base = monthlyReview({
      platform: "linkedin",
      current: {
        posts: october,
        since: "2026-09-30T18:30:00.000Z",
        until: "2026-10-31T18:30:00.000Z",
        days: 31,
      },
      previous: {
        posts: september,
        since: "2026-08-31T18:30:00.000Z",
        until: "2026-09-30T18:30:00.000Z",
        days: 30,
      },
      growth: [],
      handle: "brand",
      displayName: "Brand",
      labels: {
        currentShort: "Oct 2026",
        previousShort: "Sep 2026",
        currentName: "October",
        previousName: "September",
      },
      rivals: [],
      insights: null,
      periodIsRecent: false,
    });
    const review = withLinkedIn(base, {
      days: [...days("2026-09-01", 30, 300, 12), ...days("2026-10-01", 31, 200, 8)],
      current: { start: "2026-10-01", end: "2026-11-01", membersReached: 1500 },
      previous: { start: "2026-09-01", end: "2026-10-01", membersReached: 3000 },
      impressions: { o1: 1200, o2: 300, o3: 200, o4: 100, s1: 3000 },
      currentPosts: october,
      previousPosts: september,
    });
    const linkedin = review.linkedin!;
    expect(linkedin.current).toMatchObject({
      days: 31,
      impressions: 6200,
      engagements: 248,
      membersReached: 1500,
      newFollowers: 62,
    });
    expect(linkedin.current.engagementRate).toBeCloseTo(0.04);
    expect(linkedin.previous.impressionsPerMember).toBe(3);
    expect(linkedin.postFigures.current).toMatchObject({
      covered: true,
      medianImpressions: 250,
      over1000: 1,
    });
    // One of September's two posts measured: not enough to quote its median.
    expect(linkedin.postFigures.previous).toMatchObject({
      covered: false,
      medianImpressions: null,
    });
    expect(linkedin.postFigures.current.repeated).toEqual(["Same post"]);
    expect(linkedin.posts.current[0]!.post.postId).toBe("o1");
    expect(review.changes[0]).toBe(
      "In simple words: the posts are as engaging as before, but fewer people are seeing them.",
    );
    // Thirty and thirty-one days: compared a day at a time too.
    expect(linkedin.current.impressionsPerDay).toBe(200);
    expect(linkedin.previous.impressionsPerDay).toBe(300);
  });
});

describe("Instagram breakout posts", () => {
  it("leaves last month's breakouts out of the comparison, and lists them", () => {
    const at = (day: string, views: number) =>
      post({ postId: `${day}-${views}`, publishedAt: `${day}T06:30:00Z`, views, likes: 10 });
    const september = [
      at("2026-09-01", 1000),
      at("2026-09-03", 900),
      at("2026-09-08", 800),
      at("2026-09-10", 700),
      at("2026-09-17", 17_600),
    ];
    const october = [at("2026-10-05", 600), at("2026-10-12", 500), at("2026-10-13", 2000)];
    const labels = {
      currentShort: "Oct 2026",
      previousShort: "Sep 2026",
      currentName: "October",
      previousName: "September",
    };
    const input = {
      current: {
        posts: october,
        since: "2026-09-30T18:30:00.000Z",
        until: "2026-10-31T18:30:00.000Z",
        days: 31,
      },
      previous: {
        posts: september,
        since: "2026-08-31T18:30:00.000Z",
        until: "2026-09-30T18:30:00.000Z",
        days: 30,
      },
      growth: [],
      handle: "brand",
      displayName: "Brand",
      labels,
      rivals: [],
      insights: null,
      periodIsRecent: false,
    };
    const instagram = monthlyReview({ ...input, platform: "instagram" });
    expect(instagram.excluded.map((row) => row.value)).toEqual([17_600]);
    expect(instagram.previous.posts).toBe(4);
    expect(instagram.previous.typicalViews).toBe(850);
    expect(instagram.previous.best?.value).toBe(1000);
    expect(instagram.previousPosts).toHaveLength(5);
    expect(instagram.changes[0]).toContain("breakout post (17,600 views");
    expect(instagram.current).toMatchObject({
      totalViews: 3100,
      postsOver1000: 1,
      postsUnder300: 0,
    });
    // LinkedIn's report compares every post: its workbook leaves nothing out.
    const linkedin = monthlyReview({ ...input, platform: "linkedin" });
    expect(linkedin.excluded).toEqual([]);
    expect(linkedin.previous.posts).toBe(5);
  });
});

describe("Who sees the Technical performance report", () => {
  it("sends its figures to admins only", async () => {
    const { forViewer } = await import("@/server/report");
    const calibration = {
      made: 4,
      scored: 3,
      directionalHits: 2,
      insideRange: 1,
      calibrated: true,
      note: "n",
      samples: [],
    };
    const report = {
      generatedAt: "",
      period: "30d" as const,
      periodLabel: "Last 30 days",
      previousLabel: null,
      previousName: null,
      monthly: true,
      goal: { growthGoal: "followers", primaryMetric: "follower_growth_rate", label: "Grow" },
      platforms: [
        {
          handle: "x",
          trajectory: { status: "declining" },
          goalScore: { weeks: 3 },
          eras: [{ startsAt: "2026-05-05", label: "May" }],
          calibration,
          followers: 10,
        },
      ],
      benchmarkedAgainst: 12,
      suggestions: true,
      admin: false,
      ephemeral: false,
    } as unknown as Parameters<typeof forViewer>[0];
    const admin = forViewer(report, true);
    expect(admin.admin).toBe(true);
    expect(admin.platforms[0]!.calibration.made).toBe(4);
    const other = forViewer(report, false);
    expect(other.admin).toBe(false);
    expect(other.goal).toBeNull();
    expect(other.benchmarkedAgainst).toBe(0);
    expect(other.platforms[0]).toMatchObject({
      trajectory: null,
      goalScore: null,
      eras: [],
      followers: 10,
    });
    expect(other.platforms[0]!.calibration.made).toBe(0);
  });
});
