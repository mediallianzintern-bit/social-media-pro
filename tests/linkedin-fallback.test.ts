// The LinkedIn fallback scrapers' output, converted to harvestapi's shape.
// Fixtures are trimmed from real runs on 22 Oct 2026 (Pritesh's own profile).
import { describe, expect, it } from "vitest";

import {
  fromFallbackPost,
  fromFallbackProfile,
  normalizeLinkedInPosts,
  normalizeLinkedInProfile,
} from "@/server/apify/linkedin";

const profile = {
  success: true,
  name: "Dr. Pritesh Patel",
  followers: 8585,
  connections: "500+",
  url: "https://www.linkedin.com/in/digitalmarketingtrainer",
  input_url: "https://www.linkedin.com/in/digitalmarketingtrainer/",
};

const post = {
  author: {
    username: "digitalmarketingtrainer",
    headline: "Making AI, Automation & Digital Marketing Simple",
  },
  comments: 2,
  post_type: "regular",
  posted_at: { date: "2026-10-21 14:45:44", timestamp: 1792586744500 },
  reposts: 0,
  stats: { comments: 2, like: 6, insight: 0, reposts: 0, total_reactions: 6 },
  text: "Your next customer may never visit your website.",
  timestamp: 1792586744500,
  total_reactions: 6,
  url: "https://www.linkedin.com/posts/digitalmarketingtrainer_your-next-customer-activity-7518653752803966977-hu2m?utm_source=share&rcm=abc",
  urn: { activity_urn: "7518653752803966977" },
  input: "digitalmarketingtrainer",
};

describe("LinkedIn fallback scrapers", () => {
  it("reads a fallback profile as the owner's snapshot", () => {
    const snapshot = normalizeLinkedInProfile(fromFallbackProfile(profile), "2026-10-22T09:00:00Z");
    expect(snapshot).toMatchObject({
      handle: "digitalmarketingtrainer",
      displayName: "Dr. Pritesh Patel",
      followers: 8585,
      following: 500,
    });
  });

  it("reads a fallback post with the same id harvestapi uses, and a clean link", () => {
    const [record] = normalizeLinkedInPosts([fromFallbackPost(post)], "digitalmarketingtrainer");
    expect(record).toMatchObject({
      postId: "7518653752803966977",
      url: "https://www.linkedin.com/posts/digitalmarketingtrainer_your-next-customer-activity-7518653752803966977-hu2m",
      // From the UTC timestamp: the "date" text is in the scraper's own time zone (UTC+2).
      publishedAt: "2026-10-21T12:45:44.500Z",
      likes: 6,
      comments: 2,
      shares: 0,
    });
  });

  it("keeps each author's posts apart", () => {
    const rival = fromFallbackPost({
      ...post,
      author: { username: "arjun-m-d" },
      input: "arjun-m-d",
    });
    expect(
      normalizeLinkedInPosts([fromFallbackPost(post), rival], "digitalmarketingtrainer"),
    ).toHaveLength(1);
  });
});
