// His LinkedIn articles: read from the scraper, and compared with his posts.
import { describe, expect, it } from "vitest";

import type { PostRecord } from "@/lib/analytics-types";
import { articleOf, articlesVsPosts } from "@/lib/linkedin-articles";
import { normalizeLinkedInPosts } from "@/server/apify/linkedin";

describe("LinkedIn articles", () => {
  it("reads the shared article's title, link and read time", () => {
    const article = articleOf(
      "7",
      {
        title: "Black October:  The Cybersecurity Wake-Up Call",
        link: "https://www.linkedin.com/pulse/black-october-patel-5cpqc?trackingId=abc",
        linkLabel: "Open article: Black October by Dr. Pritesh Patel • 3 min read",
      },
      "2026-10-24T09:00:00Z",
    );
    expect(article).toEqual({
      postId: "7",
      title: "Black October: The Cybersecurity Wake-Up Call",
      url: "https://www.linkedin.com/pulse/black-october-patel-5cpqc",
      readMinutes: 3,
      publishedAt: "2026-10-24T09:00:00Z",
    });
    expect(articleOf("8", undefined, null)).toBeNull();
  });

  it("stores a post that shares an article as an article", () => {
    const [shared, plain] = normalizeLinkedInPosts([
      {
        id: "1",
        content: "Read it",
        postedAt: { date: "2026-10-24" },
        article: { title: "An article" },
      },
      { id: "2", content: "Just a post", postedAt: { date: "2026-10-23" } },
    ]);
    expect(shared!.format).toBe("article");
    expect(plain!.format).toBe("text");
  });

  it("compares articles with posts on what LinkedIn measured", () => {
    const row = (format: PostRecord["format"], impressions: number, likes: number) => ({
      post: { format, likes, comments: 0, shares: 0 } as PostRecord,
      figures: {
        postId: "",
        impressions,
        membersReached: null,
        saves: null,
        sends: null,
        fetchedAt: null,
      },
    });
    const result = articlesVsPosts([
      row("article", 400, 8),
      row("text", 200, 10),
      row("text", 100, 2),
    ]);
    expect(result.articles).toMatchObject({
      posts: 1,
      medianImpressions: 400,
      engagementRate: 0.02,
    });
    expect(result.posts).toMatchObject({ posts: 2, medianImpressions: 150, medianEngagements: 6 });
  });
});
