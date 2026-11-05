// Phase 3: LinkedIn posts the team published from the dashboard (5 Nov 2026).
import { describe, expect, it } from "vitest";

import type { ContentIdea } from "@/lib/ai-types";
import type { PostRecord } from "@/lib/analytics-types";
import { reelPatterns } from "@/lib/reel-patterns";
import { findPostByText, findReelForIdea, LINKEDIN_MATCH, linkedInPostId } from "@/lib/reel-match";
import { postParts, postShape } from "@/server/reel-learning/analyse-post";
import { measurePost, reviewableAt } from "@/server/reel-learning/review";

const model = [
  "Can a brand's mascot have a funeral and go viral?",
  "Duolingo's marketing team did just that.",
  'In February 2025, they held a "funeral" for Duo, their green owl.',
  "The TikTok livestream drew 66 million viewers.",
  "I see three lessons here:",
  "1. Go where your audience already is",
  "Duolingo didn't wait for Gen Z to see an ad. It went to TikTok.",
  "2. Tie the joke back to the product",
  "The way to save Duo was to do a lesson.",
  "Polished ads get seen.",
  "Stories people can join get shared.",
  'Would your brand be brave enough to "kill" its mascot?',
  "♻️ Repost to help a marketer rethink how to reach Gen Z.",
].join("\n\n");

const post = (patch: Partial<PostRecord>): PostRecord =>
  ({
    postId: "1",
    url: "",
    caption: "",
    publishedAt: "2026-11-01T10:00:00Z",
    format: "text",
    likes: 0,
    comments: 0,
    shares: 0,
    ...patch,
  }) as PostRecord;

describe("a published LinkedIn post", () => {
  it("splits into the opening pair, the body and the close", () => {
    const parts = postParts(model, 2);
    expect(parts.hook).toBe(
      "Can a brand's mascot have a funeral and go viral?\nDuolingo's marketing team did just that.",
    );
    expect(parts.cta).toBe(
      'Would your brand be brave enough to "kill" its mascot?\n♻️ Repost to help a marketer rethink how to reach Gen Z.',
    );
    expect(parts.body.startsWith("In February 2025")).toBe(true);
  });

  it("is measured the way a draft is", () => {
    expect(postShape(model)).toMatchObject({
      points: 2,
      repost: true,
      closingQuestion: true,
    });
    expect(postShape(model).grade).toBeLessThanOrEqual(6);
  });

  it("is found by its LinkedIn link", () => {
    expect(
      linkedInPostId(
        "https://www.linkedin.com/posts/digitalmarketingtrainer_chatgpt-ads-activity-7523723511094292481-5Ujj",
      ),
    ).toBe("7523723511094292481");
    expect(
      linkedInPostId("https://www.linkedin.com/feed/update/urn:li:activity:7521911503843950592/"),
    ).toBe("7521911503843950592");
    expect(linkedInPostId("https://www.instagram.com/reel/abc/")).toBeNull();
  });

  it("is reviewed after 7 days, a reel after 14", () => {
    expect(reviewableAt("2026-11-01T00:00:00.000Z", "linkedin")).toBe("2026-11-08T00:00:00.000Z");
    expect(reviewableAt("2026-11-01T00:00:00.000Z")).toBe("2026-11-15T00:00:00.000Z");
  });

  it("is judged on LinkedIn's impressions against his typical post", () => {
    const mine = post({ postId: "9", publishedAt: "2026-11-01T10:00:00Z", likes: 30, comments: 6 });
    const others = [1, 2, 3].map((n) =>
      post({ postId: String(n), publishedAt: `2026-10-2${n}T10:00:00Z`, likes: 10, comments: 2 }),
    );
    const stats = new Map(
      [
        ["9", 600],
        ["1", 200],
        ["2", 180],
        ["3", 220],
      ].map(([id, impressions]) => [
        String(id),
        { impressions: Number(impressions), membersReached: 0, saves: 0, sends: 0 },
      ]),
    );
    const impressions = measurePost(mine, [mine, ...others], stats).find(
      (metric) => metric.label === "Impressions",
    )!;
    expect(impressions.typical).toBe(200);
    expect(impressions.ratio).toBe(3);
  });
});

describe("finding the published post", () => {
  const idea = {
    title: "OpenAI Uncovers 948 Security Flaws in Linux Kernel",
    angle: "",
    hook: "OpenAI found 948 security flaws in the Linux kernel.",
    source: { publishedAt: "2026-11-04T00:00:00Z" },
    post: {
      body: "OpenAI found 948 security flaws in the Linux kernel.\n\nIts pipeline ran for 30 hours and cost $1.2 million in credits.\n\nThe flaws could give an ordinary user full control of a server.\n\nAttackers could automate the same search.\n\nPatching faster now matters more than finding flaws.\n\nAre your systems patched within days, or months?",
      sections: [],
    },
  } as unknown as ContentIdea;
  const window = {
    earliest: Date.parse("2026-11-03T00:00:00Z"),
    filmedAt: "2026-11-05T00:00:00Z",
    taken: new Set<string>(),
  };

  it("finds the post the team edited, by its own words", () => {
    const edited = post({
      postId: "a",
      publishedAt: "2026-11-05T09:00:00Z",
      caption: idea.post!.body.replace(
        "Attackers could automate the same search.",
        "Hackers can run the same search.",
      ),
    });
    expect(findPostByText(idea, [edited], window)?.shortcode).toBe("a");
  });

  it("never takes a post about another story that names the same company", () => {
    const other = post({
      postId: "b",
      publishedAt: "2026-11-04T12:00:00Z",
      caption:
        "ChatGPT ads are evolving.\n\nOpenAI is testing product ads inside answers.\n\nDigital advertising could look very different.",
    });
    expect(findPostByText(idea, [other], window)).toBeNull();
    expect(
      findReelForIdea(idea, [other], {
        createdAt: "2026-11-05T00:00:00Z",
        filmedAt: "2026-11-05T00:00:00Z",
        taken: new Set(),
        ...LINKEDIN_MATCH,
      }),
    ).toBeNull();
  });
});

describe("what published posts teach", () => {
  it("counts posts by length, grade, points and which opening was published", () => {
    const base = {
      lane: null,
      hookStyle: null,
      hookVerdict: null,
      scriptVerdict: null,
      captionVerdict: null,
      usage: null,
    };
    const patterns = reelPatterns([
      { ...base, postWords: 180, grade: 4, points: 3, openingVariant: "A", ratio: 2, worked: true },
      {
        ...base,
        postWords: 260,
        grade: 9,
        points: 0,
        openingVariant: null,
        ratio: 0.5,
        worked: false,
      },
    ]);
    const values = patterns.map((pattern) => `${pattern.dimension}: ${pattern.value}`);
    expect(values).toEqual(
      expect.arrayContaining([
        "Post length: 150 to 220 words",
        "Reading grade: Over Grade 8",
        "Numbered points: Has numbered points",
        "Opening published: Hook A",
        "Opening published: The team's own opening",
      ]),
    );
  });
});
