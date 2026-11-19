import { describe, expect, it } from "vitest";

import type { ContentIdea } from "@/lib/ai-types";
import type { PostRecord } from "@/lib/analytics-types";
import { findArticleByTitle } from "@/lib/reel-match";

const post = (patch: Partial<PostRecord>): PostRecord =>
  ({
    postId: "1",
    url: "",
    caption: "",
    publishedAt: "2026-11-20T10:00:00Z",
    format: "article",
    likes: 0,
    comments: 0,
    shares: 0,
    ...patch,
  }) as PostRecord;

const draft = (title: string, body = "A short introduction."): ContentIdea =>
  ({
    id: title,
    title,
    format: "article",
    hook: body,
    post: { body, sections: [] },
  }) as unknown as ContentIdea;

const window = {
  earliest: Date.parse("2026-11-16T00:00:00Z"),
  filmedAt: "2026-11-21T00:00:00Z",
  taken: new Set<string>(),
};

// Titles of three real drafts on one story (17 Nov 2026).
const shoppers = draft("OpenAI's ChatGPT Wallet: Are AI Agents the New Personal Shoppers?");
const launch = draft("OpenAI Launches ChatGPT Wallet For AI Agent Purchases");

describe("finding a published LinkedIn article", () => {
  it("finds it by its title, even lightly edited", () => {
    const live = post({ postId: "w" });
    const titles = new Map([
      ["w", "ChatGPT Wallet: Are AI Agents Becoming Our Personal Shoppers?"],
    ]);
    expect(findArticleByTitle(shoppers, [live], titles, window)?.shortcode).toBe("w");
  });

  it("does not take an article that only shares the story's name", () => {
    const live = post({ postId: "w" });
    const titles = new Map([["w", "Is ChatGPT Wallet Safe for Your Money?"]]);
    expect(findArticleByTitle(launch, [live], titles, window)).toBeNull();
  });

  it("only looks at articles, and only after the draft's story", () => {
    const titles = new Map([
      ["t", "OpenAI's ChatGPT Wallet: Are AI Agents the New Personal Shoppers?"],
      ["old", "OpenAI's ChatGPT Wallet: Are AI Agents the New Personal Shoppers?"],
    ]);
    const text = post({ postId: "t", format: "text" });
    const old = post({ postId: "old", publishedAt: "2026-11-01T10:00:00Z" });
    expect(findArticleByTitle(shoppers, [text, old], titles, window)).toBeNull();
  });
});
