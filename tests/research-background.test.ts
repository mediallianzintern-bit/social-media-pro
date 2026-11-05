// More outlets for a short headline, and background on the story's subject
// (5 Nov 2026): the Meta Andromeda story was read from two outlets only, and
// no older article explaining Andromeda was ever looked for.
import { describe, expect, it } from "vitest";

import { factSheetText, sourceLabel, type StoryResearch } from "@/lib/research";
import { withFactNotes } from "@/server/ai/linkedin-review";
import { nearMatchCovers, storySubject } from "@/server/sources/article";

const headline = "Meta Andromeda reshapes AI ad retrieval";

const reports = [
  `Meta has rebuilt a major part of its ad selection system. The updated Meta Andromeda engine
  can assess more ads in the time it once needed for a smaller set, Meta said on Tuesday.`,
  `In a post on its engineering blog, Meta described how Meta Andromeda now evaluates over one
  billion ads a second. Meta's Andromeda was first deployed in 2024.`,
  `Advertisers do not need to switch anything on. Meta says Andromeda lifted Facebook conversions
  by 2.4% since 2025, and Meta Andromeda will keep changing how ads are matched.`,
];

describe("the story's subject", () => {
  it("is the name its reports write most, mid-sentence", () => {
    expect(storySubject(headline, reports)).toBe("Meta Andromeda");
  });

  it("is nothing for a headline about a trend, whose reports capitalise no headline word", () => {
    expect(
      storySubject("Why trust is becoming essential for agentic commerce", [
        "Shoppers say trust matters more than price. Retailers are rethinking agentic commerce, and trust is the new currency.",
      ]),
    ).toBeNull();
  });

  it("takes one word only when it is rare in the inbox", () => {
    const texts = ["Analysts said Meta grew. Investors liked Meta again, and Meta rose."];
    expect(storySubject("Meta grows ad revenue", texts, [])).toBe("Meta");
    expect(
      storySubject("Meta grows ad revenue", texts, ["Meta ads", "Meta AI", "Meta search"]),
    ).toBeNull();
  });
});

describe("a near match", () => {
  it("is read when its opening writes the rare word as a name and covers the headline", () => {
    const ppcLand =
      "Meta says Andromeda lifted Facebook conversions 2.4% since 2025. The company said its updated Andromeda retrieval system now evaluates more ads.";
    expect(
      nearMatchCovers(ppcLand, headline, { words: ["andromeda", "meta"], rare: ["andromeda"] }),
    ).toBe(true);
  });

  it("is refused when the shared words are ordinary ones, as Coursera's certification page was", () => {
    const coursera =
      "A data structures certification can help you show employers your skills. Google offers several certification options for beginners.";
    expect(
      nearMatchCovers(coursera, "Google Ads Adds New Telemedicine Certification Option", {
        words: ["certification", "option"],
        rare: ["certification"],
      }),
    ).toBe(false);
  });
});

const research: StoryResearch = {
  sources: [
    { publisher: "ContentGrip", url: "https://a", words: 700 },
    {
      publisher: "Nest Commerce",
      url: "https://b",
      words: 900,
      background: true,
      publishedAt: "2026-02-09T14:17:52Z",
    },
  ],
  facts: [
    {
      text: "Meta's Andromeda system evaluates over 1 billion ads per second.",
      category: "figure",
      sources: [1],
      conflict: "",
    },
    {
      text: "Andromeda cut the cost of retrieval by 40% in its first year.",
      category: "context",
      sources: [2],
      conflict: "",
      background: true,
    },
  ],
  missing: [],
  sufficient: true,
  stages: 1,
  unreadable: 0,
  subject: "Meta Andromeda",
};

describe("background in the fact sheet", () => {
  it("labels the article and its facts, with the rule for using them", () => {
    expect(sourceLabel(research.sources[1], 2)).toBe("Nest Commerce (background, Feb 2026)");
    const text = factSheetText(research);
    expect(text).toMatch(/2\. Nest Commerce \(background, Feb 2026\)/);
    expect(text).toMatch(/- BACKGROUND \(Context\) Andromeda cut/);
    expect(text).toMatch(/never as this story's news/);
  });

  it("asks for a figure only background gives to be checked", () => {
    const data = {
      ideas: [
        {
          format: "text_post",
          source: { sourceId: "s1" },
          post: {
            body: "It now checks over 1 billion ads a second.\n\nRetrieval costs fell 40%.",
            sections: [],
          },
        },
      ],
    };
    const sources = [
      { id: "s1", title: headline, publishedAt: "2026-10-30T10:33:00Z", research },
    ] as never;
    const notes = (
      withFactNotes(data, sources) as typeof data & {
        ideas: Array<{ post: { notes: string[] } }>;
      }
    ).ideas[0]!.post.notes;
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/comes from background \(Nest Commerce, Feb 2026\)/);
  });
});
