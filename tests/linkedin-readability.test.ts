// A LinkedIn post that reads like his: skimmed on a phone, in plain words.
import { describe, expect, it } from "vitest";

import type { PostRecord } from "@/lib/analytics-types";
import {
  jargonIn,
  layoutOf,
  readabilityProblems,
  readingEase,
  stockPhrasesIn,
  writingProblems,
} from "@/lib/linkedin-readability";
import { bestRecentPosts } from "@/server/ai/linkedin-references";

// Written the way his posts are: one short sentence a line, a blank line between.
const scannable = [
  "Can a brand be so helpful that it feels creepy?",
  "Imagine talking about a new phone with a friend.",
  "An hour later, you see an ad for that exact phone.",
  "Handy? Maybe.",
  "But your next thought might be: how did they know?",
  "That is where personal ads get tricky.",
  "People like ads that help them.",
  "They do not like ads that seem to watch them.",
  "So I would check three things before the next campaign.",
  "Does it help the customer?",
  "Is the timing right?",
  "Would they be happy to know how we chose it?",
  "Have you ever felt watched by an ad?",
  "♻️ Repost to help a marketer keep customer trust.",
].join("\n\n");

// The dashboard's Gen Z draft of 3 Nov: the same kind of idea, as paragraphs.
const paragraphs = `Could traditional marketing be missing the mark with Gen Z?

Duolingo thinks so. They've taken a different route, focusing on authenticity and a social-first strategy to engage younger audiences.

Duolingo's social media presence isn't just about posting updates. It's a key driver for retention and new user acquisition. According to MarkHub24, their creative approach includes everything from playful TikTok videos to bold stunts like a live-streamed funeral for their mascot, which drew 66 million viewers.

This strategy isn't about following trends; it's about creating genuine connections. Their content is fun, entertaining, and authentic, setting them apart from traditional edtech marketing.`;

describe("LinkedIn readability", () => {
  it("passes a post written his way", () => {
    expect(readabilityProblems(scannable)).toEqual([]);
    expect(layoutOf(scannable).medianLineWords).toBeLessThan(10);
    expect(readingEase(scannable)).toBeGreaterThan(60);
  });

  it("sends back a post written as paragraphs", () => {
    const problems = readabilityProblems(paragraphs);
    expect(problems.some((problem) => problem.startsWith("reads as paragraphs"))).toBe(true);
    expect(problems.some((problem) => /over 22 words/.test(problem))).toBe(true);
    expect(problems.some((problem) => problem.startsWith("packs three or more sentences"))).toBe(
      true,
    );
  });

  it("names the jargon and what to say instead", () => {
    expect(jargonIn("Favorability and purchase consideration stayed flat.")).toEqual([
      { term: "favorability", plain: "how much people like the brand" },
      { term: "purchase consideration", plain: "whether people would think of buying it" },
    ]);
    // An acronym is fine once it is spelled out.
    expect(jargonIn("AEO, answer engine optimisation, rewards focus.")).toEqual([]);
    expect(jargonIn("AEO rewards focus.").map((entry) => entry.term)).toEqual(["AEO"]);
  });

  it("lets one term pass in the body, but not two, and not one in the opening", () => {
    const body = (opening: string, rest: string) =>
      [opening, "A short line.", "Another short line.", "One more.", rest].join("\n\n");
    expect(
      readabilityProblems(body("A plain first line.", "It is one touchpoint among many.")),
    ).toEqual([]);
    expect(
      readabilityProblems(body("A plain first line.", "Favorability moved, and so did UGC.")).some(
        (problem) => problem.startsWith("uses jargon"),
      ),
    ).toBe(true);
    expect(
      readabilityProblems(body("Favorability is the wrong goal.", "Plain words after.")).some(
        (problem) => problem.startsWith("uses jargon"),
      ),
    ).toBe(true);
  });
});

describe("his best recent posts as references", () => {
  const NOW = Date.parse("2026-11-04T12:00:00Z");
  const post = (postId: string, daysAgo: number, words = 150) =>
    ({
      postId,
      publishedAt: new Date(NOW - daysAgo * 86_400_000).toISOString(),
      caption: Array.from({ length: words }, () => "word").join(" "),
      likes: 0,
      comments: 0,
      shares: 0,
    }) as unknown as PostRecord;

  it("takes the best by impressions from the last 30 days, never an article teaser", () => {
    const best = bestRecentPosts(
      [post("old", 40), post("mid", 5), post("top", 10), post("teaser", 3, 90), post("low", 20)],
      new Map([
        ["old", 900],
        ["mid", 300],
        ["top", 619],
        ["teaser", 800],
        ["low", 100],
      ]),
      NOW,
    );
    expect(best.map((entry) => entry.post.postId)).toEqual(["top", "mid", "low"]);
  });

  it("looks back further when the last 30 days hold too few posts", () => {
    const best = bestRecentPosts(
      [post("recent", 5), post("older", 45)],
      new Map([["older", 500]]),
      NOW,
    );
    expect(best.map((entry) => entry.post.postId)).toEqual(["older", "recent"]);
  });
});

describe("writing like him, beyond layout", () => {
  // The dashboard's Duolingo post of 4 Nov: scannable, but not his writing.
  const generated = [
    "How did Duolingo's owl become a Gen Z icon?",
    "Duolingo's strategy isn't about big ad budgets.",
    "It's about being where Gen Z spends time: social media.",
    "Take Duo the Owl, their mascot.",
    "For example, suppose you’re a marketer planning a campaign.",
    "So, what can brands do?",
    "1. Be present on platforms like TikTok.",
    "2. Create content that's fun and engaging.",
    "3. Encourage participation and interaction.",
    "One mistake brands make is assuming traditional methods will still resonate.",
  ].join("\n\n");
  // The same facts, written his way.
  const his = [
    "One brand held a funeral for its mascot.",
    "66 million people watched.",
    "And to bring the mascot back, fans had to do their homework.",
    "The brand was Duolingo. The mascot was Duo, its green owl.",
    "I see three lessons for brands trying to reach Gen Z:",
    "1. Show up where they already are",
    "Duolingo didn't wait for Gen Z to see an ad. It went to TikTok.",
    "2. Laugh at yourself",
    "A brand killing its own mascot feels human, not corporate.",
    "3. Relevance: does the joke end in the product?",
    "You don't win Gen Z by shouting louder.",
    "You win by giving them something worth joining in.",
  ].join("\n\n");

  it("catches the stock example, the answer up front and bare points", () => {
    const problems = writingProblems(generated);
    expect(problems.some((problem) => problem.startsWith("uses a stock example line"))).toBe(true);
    expect(problems.some((problem) => problem.startsWith("gives the answer away"))).toBe(true);
    expect(problems.some((problem) => problem.startsWith("has bare numbered points"))).toBe(true);
  });

  it("passes the same facts written his way, with either of his point formats", () => {
    expect(writingProblems(his)).toEqual([]);
  });
});

describe("stock marketing phrases", () => {
  it("names each one with what to say instead", () => {
    const found = stockPhrasesIn(
      "Gen Z values authenticity.\n\nThe real edge is creating genuine connections with your audience.",
    );
    expect(found.map((entry) => entry.phrase.toLowerCase())).toEqual([
      "authenticity",
      "genuine connections",
    ]);
    expect(found[0]!.instead).toBe("say what they did that felt real");
  });

  it("lets him quote bad copy on purpose", () => {
    // From his own post "I almost approved an AI-generated campaign".
    expect(
      stockPhrasesIn('It read: "Take your business to the next level with intelligent solutions."'),
    ).toEqual([]);
  });

  it("is flagged as a writing problem", () => {
    expect(
      writingProblems("Let your brand's personality shine through.").some((problem) =>
        problem.startsWith("uses stock marketing phrases"),
      ),
    ).toBe(true);
  });
});
