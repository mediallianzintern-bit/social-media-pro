// A LinkedIn post's figures come from the story it was written from (5 Nov 2026).
import { describe, expect, it } from "vitest";

import { earlyYears, figuresOf, sharesFigures, unsupportedFigures } from "@/lib/fact-check";
import { withFactNotes } from "@/server/ai/linkedin-review";

const story = `OpenAI's pipeline found 948 unique vulnerabilities in the Linux kernel.
The total cost of the research run was $1,213,430 in API credits.
The October 2026 run found five times as many as the July run.`;

describe("the figures in a post", () => {
  it("reads amounts, percentages and years, but not a list's numbers", () => {
    expect(
      figuresOf("1. Data over visuals\n\n10% to 20% of spending by 2030.\n\n66 million viewers."),
    ).toEqual(["10", "20", "2030", "66 million"]);
  });

  it("finds a figure the story never gives, and lets its rounding through", () => {
    expect(unsupportedFigures("948 flaws, for over $1.2 million, in October 2026.", story)).toEqual(
      [],
    );
    expect(unsupportedFigures("In September 2023, 948 flaws were found.", story)).toEqual(["2023"]);
    expect(unsupportedFigures("It cost $2 million.", story)).toEqual(["2 million"]);
  });

  it("checks nothing against an empty story", () => {
    expect(unsupportedFigures("It cost $2 million.", "")).toEqual([]);
  });

  it("flags a year well before the story's own date, the research's misdating", () => {
    expect(earlyYears("In September 2023, Amazon banned Muse.", "2026-11-04T20:32:57Z")).toEqual([
      "2023",
    ]);
    expect(
      earlyYears("In February 2025, Duolingo held a funeral.", "2026-11-03T03:30:18Z"),
    ).toEqual([]);
  });

  it("knows when a post states a fact", () => {
    expect(
      sharesFigures("The livestream drew 66 million viewers.", "It drew 66 million viewers."),
    ).toBe(true);
    expect(sharesFigures("The livestream drew a crowd.", "It drew 66 million viewers.")).toBe(
      false,
    );
  });
});

describe("the facts to check before posting", () => {
  const sources = [
    {
      id: "s1",
      title: "Duolingo's mascot funeral",
      publishedAt: "2026-11-03T03:30:18Z",
      research: {
        sources: [],
        facts: [
          {
            text: "The livestream drew 66 million viewers.",
            category: "figure",
            sources: [1, 2],
            conflict: "a second outlet says 60 million",
          },
        ],
        missing: [],
        sufficient: true,
        stages: 1,
        unreadable: 0,
      },
    },
  ] as never;

  it("adds every figure not in the story, and every fact the outlets disagree on", () => {
    const data = {
      ideas: [
        {
          format: "text_post",
          source: { sourceId: "s1" },
          post: { body: "66 million people watched.\n\nAnd 12 million joined in.", sections: [] },
        },
      ],
    };
    const notes = (
      withFactNotes(data, sources) as typeof data & {
        ideas: Array<{ post: { notes: string[] } }>;
      }
    ).ideas[0]!.post.notes;
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatch(/"12 million" is not in the story/);
    expect(notes[1]).toMatch(/outlets disagree/);
  });

  it("asks for every figure to be checked when there is no story", () => {
    const data = {
      ideas: [{ format: "text_post", post: { body: "It cost $2 million.", sections: [] } }],
    };
    const notes = (
      withFactNotes(data, []) as typeof data & {
        ideas: Array<{ post: { notes: string[] } }>;
      }
    ).ideas[0]!.post.notes;
    expect(notes[0]).toMatch(/no stored source/);
  });
});
