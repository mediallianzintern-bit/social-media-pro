// His LinkedIn posts that worked, given to the writer for their own topic
// (lib/linkedin-lane-posts.ts).
import { describe, expect, it } from "vitest";

import type { PostRecord } from "@/lib/analytics-types";
import { lanePostsBlock, pickLanePosts } from "@/lib/linkedin-lane-posts";

const NOW = Date.parse("2026-11-16T00:00:00Z");
const DAY = 86_400_000;
const long = (word: string) => Array.from({ length: 150 }, () => word).join(" ");

const post = (id: string, over: Partial<PostRecord> = {}): PostRecord =>
  ({
    postId: id,
    url: `https://www.linkedin.com/feed/update/${id}`,
    caption: long(id),
    publishedAt: new Date(NOW - 20 * DAY).toISOString(),
    format: "text",
    contentLane: "Marketing fundamentals",
    likes: 0,
    comments: 0,
    shares: 0,
    views: 0,
    ...over,
  }) as PostRecord;

// Typical (median) of these five is 200.
const base = [
  post("a", { contentLane: "AI X Marketing Bridge" }),
  post("b", { contentLane: "AI X Marketing Bridge" }),
  post("c"),
  post("d"),
  post("e"),
];
const impressions = new Map([
  ["a", 100],
  ["b", 150],
  ["c", 200],
  ["d", 500],
  ["e", 300],
]);

describe("pickLanePosts", () => {
  it("shows only the topic asked for, above typical, furthest above first", () => {
    const picked = pickLanePosts(base, impressions, "marketing fundamentals", { now: NOW });
    expect(picked.map((entry) => entry.post.postId)).toEqual(["d", "e"]);
    expect(picked[0]!.ratio).toBeCloseTo(2.5);
    expect(picked[0]!.typical).toBe(200);
  });

  it("never shows a post at or below his typical post", () => {
    const picked = pickLanePosts(base, impressions, "AI X Marketing Bridge", { now: NOW });
    expect(picked).toEqual([]);
  });

  it("waits until a post's impressions have settled", () => {
    const fresh = [...base, post("new", { publishedAt: new Date(NOW - 2 * DAY).toISOString() })];
    const counts = new Map([...impressions, ["new", 5000]]);
    const picked = pickLanePosts(fresh, counts, "Marketing fundamentals", { now: NOW });
    expect(picked.map((entry) => entry.post.postId)).not.toContain("new");
  });

  it("measures articles against articles, and Write article is shown articles only", () => {
    const articles = ["p", "q", "r", "s", "t"].map((id) =>
      post(id, { format: "article", caption: "A short teaser." }),
    );
    const counts = new Map([
      ...impressions,
      ["p", 100],
      ["q", 100],
      ["r", 100],
      ["s", 100],
      ["t", 900],
    ]);
    const all = [...base, ...articles];
    const asArticle = pickLanePosts(all, counts, "Marketing fundamentals", {
      now: NOW,
      kind: "article",
      titles: new Map([["t", "Why brand recall still matters"]]),
    });
    expect(asArticle.map((entry) => entry.post.postId)).toEqual(["t"]);
    expect(asArticle[0]!.title).toBe("Why brand recall still matters");
    const asPost = pickLanePosts(all, counts, "Marketing fundamentals", { now: NOW });
    expect(asPost.map((entry) => entry.post.postId)).toEqual(["d", "e"]);
  });

  it("leaves out posts already quoted as tone references", () => {
    const picked = pickLanePosts(base, impressions, "Marketing fundamentals", {
      now: NOW,
      exclude: new Set(["d"]),
    });
    expect(picked.map((entry) => entry.post.postId)).toEqual(["e"]);
  });

  it("says nothing until enough posts are measured to know his typical one", () => {
    expect(
      pickLanePosts(base.slice(0, 4), impressions, "Marketing fundamentals", { now: NOW }),
    ).toEqual([]);
  });
});

describe("lanePostsBlock", () => {
  it("quotes the posts with their result and forbids reusing their facts", () => {
    const picked = pickLanePosts(base, impressions, "Marketing fundamentals", { now: NOW });
    const block = lanePostsBlock(picked, "Marketing fundamentals");
    expect(block).toContain("HOW HIS MARKETING FUNDAMENTALS POSTS THAT WORKED ARE BUILT");
    expect(block).toContain("2.5x his typical post: 500 impressions against 200");
    expect(block).toContain("STRUCTURE ONLY");
  });

  it("is empty when the topic has nothing that worked", () => {
    expect(lanePostsBlock([], "Reflections")).toBe("");
  });
});
