// The learned pattern of a creator-fed lane (AI tool workflows, phase 2).
import { describe, expect, it } from "vitest";

import { buildPattern, fitOf, isStale, patternTokens } from "@/lib/creator-pattern";

// Six creators who each post about one AI tool workflow in their own words, plus
// a giveaway word only one of them uses.
const creators = ["ana", "ben", "cai", "dev", "eli", "fay"];
const tools = ["Claude Code", "Google Flow", "Runway", "Gemini", "ChatGPT", "Canva"];
const creatorPosts = creators.flatMap((creator, c) =>
  Array.from({ length: 8 }, (_, n) => ({
    creator,
    text:
      `${tools[(c + n) % tools.length]} motion graphics workflow: upload your reference, ` +
      `write the prompt, export the animation ${n}. ${creator === "ana" ? "Comment PYNK" : ""} #aitools`,
  })),
);
// Ordinary news and marketing captions: the background.
const background = Array.from(
  { length: 60 },
  (_, n) =>
    [
      `Brand launches new campaign across ${n} cities with a celebrity`,
      `OpenAI raises funding as investors bet on AI growth ${n}`,
      `How this retailer rebuilt its loyalty programme for ${n} million customers`,
    ][n % 3]!,
);

describe("learned lane pattern", () => {
  const pattern = buildPattern("AI tool workflows", creatorPosts, background);
  const terms = pattern.terms.map((term) => term.term);

  it("learns the subject's words, phrases and hashtags from the creators", () => {
    expect(terms).toEqual(
      expect.arrayContaining(["motion", "graphics", "prompt", "motion graphics", "#aitools"]),
    );
  });

  it("never learns one creator's own giveaway word", () => {
    expect(terms).not.toContain("pynk");
  });

  it("does not learn words that are just as common in the background", () => {
    expect(terms).not.toContain("campaign");
    expect(terms).not.toContain("funding");
  });

  // A full caption, as a real reel's would be: a caption's score adds up its
  // matching terms, so a one-liner needs to be strongly on topic to pass.
  it("passes a workflow caption and fails ordinary news", () => {
    expect(
      fitOf(
        pattern,
        "Runway motion graphics workflow: upload your reference, write the prompt, export the animation #aitools",
      ).passes,
    ).toBe(true);
    expect(fitOf(pattern, "OpenAI raises funding as investors bet on AI growth").passes).toBe(
      false,
    );
  });

  it("explains a decision with the terms it matched", () => {
    expect(fitOf(pattern, "a motion graphics prompt").matched).toEqual(
      expect.arrayContaining(["motion graphics", "prompt"]),
    );
  });

  it("reports how much of the creators' posts and of the background pass", () => {
    expect(pattern.stats.creatorPosts).toBe(48);
    expect(pattern.stats.creators).toBe(6);
    expect(pattern.stats.backgroundPass).toBe(0);
  });

  it("reads hashtags and phrases out of a caption", () => {
    expect([...patternTokens("Claude Code tips #AITools @someone")]).toEqual(
      expect.arrayContaining(["#aitools", "claude", "code", "claude code"]),
    );
  });

  it("is rebuilt once it is a month old", () => {
    const now = Date.parse("2026-11-30T00:00:00Z");
    expect(isStale({ builtAt: "2026-10-23T00:00:00Z" }, now)).toBe(true);
    expect(isStale({ builtAt: "2026-11-20T00:00:00Z" }, now)).toBe(false);
    expect(isStale(null)).toBe(true);
  });
});
