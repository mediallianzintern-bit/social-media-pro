// Field names in AI text, put into plain words: real cases from 22 Oct 2026.
import { describe, expect, it } from "vitest";

import { plainFigures, plainFiguresDeep } from "@/lib/plain-figures";

describe("plain figures", () => {
  it("rewrites the field name the saved analysis actually used", () => {
    expect(
      plainFigures(
        "The AI tool workflows lane, though currently struggling at a medianVsMedian of 0.29, highlights a gap.",
      ),
    ).toBe(
      "The AI tool workflows lane, though currently struggling at 0.29x a typical post, highlights a gap.",
    );
  });

  it("handles the other names the agents are told never to write", () => {
    expect(plainFigures("medianViews 1,170 across postsAnalysed 60")).toBe(
      "1,170 views on a typical post across 60 posts",
    );
    expect(plainFigures("shareOfOutputPct 23% and shareOfPerformancePct 24")).toBe(
      "23% of the posts and 24% of the engagement",
    );
    expect(plainFigures("ratePerWeek -31")).toBe("-31 followers a week");
  });

  it("puts a field name with no figure into words", () => {
    expect(plainFigures("ranked by medianVsMedian")).toBe(
      "ranked by performance against a typical post",
    );
  });

  it("leaves ordinary words and brand names alone", () => {
    const text = "Apple's iPhone ad on YouTube got 1.34x a typical post, and LinkedIn copied it.";
    expect(plainFigures(text)).toBe(text);
  });

  it("cleans every string inside an analysis, and nothing else", () => {
    const read = {
      headline: "vsMedian 3.9",
      count: 3,
      lanes: [{ why: "a medianVsMedian of 1.34" }],
    };
    expect(plainFiguresDeep(read)).toEqual({
      headline: "3.9x a typical post",
      count: 3,
      lanes: [{ why: "1.34x a typical post" }],
    });
  });
});
