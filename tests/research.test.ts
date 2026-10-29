// Multi-outlet research: when the facts are enough, and which facts reached a reel.
import { describe, expect, it } from "vitest";

import {
  factSheetText,
  factUsed,
  isSufficient,
  missingFacts,
  researchUsage,
  type ResearchFact,
  type StoryResearch,
} from "@/lib/research";

const fact = (category: ResearchFact["category"], text: string, sources = [1]): ResearchFact => ({
  text,
  category,
  sources,
  conflict: "",
});

const full: ResearchFact[] = [
  fact("who", "Security firm Calif found the flaws", [2]),
  fact("what", "Two critical PHP flaws let attackers take over web servers", [1, 2]),
  fact("when", "Disclosed in October 2026"),
  fact("where", "Sites in France, the Netherlands, Belgium and Australia went offline", [3]),
  fact("figure", "PHP runs about 70% of websites"),
  fact("how", "Calif used OpenAI's GPT-5.6 Sol to find them", [2]),
  fact("result", "PHP released a fix and urged users to update"),
];

describe("research sufficiency", () => {
  it("needs every required kind of fact and the main fact from two outlets", () => {
    expect(isSufficient(full, 3)).toBe(true);
    expect(
      isSufficient(
        full.filter((item) => item.category !== "where"),
        3,
      ),
    ).toBe(false);
    expect(missingFacts(full.slice(0, 2))).toEqual(["when", "where", "figure", "how", "result"]);
    // One outlet cannot confirm the main fact.
    expect(isSufficient(full, 1)).toBe(false);
  });
});

describe("research usage", () => {
  const research: StoryResearch = {
    sources: [
      { publisher: "The Register", url: "https://a", words: 600 },
      { publisher: "Wired", url: "https://b", words: 700 },
      { publisher: "BBC", url: "https://c", words: 500 },
    ],
    facts: full,
    missing: [],
    sufficient: true,
    stages: 1,
    unreadable: 0,
  };

  it("counts the facts a reel said, and those only other outlets had", () => {
    const said =
      "Calif found two critical PHP flaws. Sites in France, the Netherlands and Belgium went offline.";
    expect(factUsed(full[0]!, said)).toBe(true);
    expect(factUsed(full[4]!, said)).toBe(false);
    const usage = researchUsage(research, said);
    expect(usage).toMatchObject({ sources: 3, facts: 7 });
    expect(usage.fromOtherOutlets).toBeGreaterThanOrEqual(2);
  });

  it("names the outlets behind every fact for the writer", () => {
    const sheet = factSheetText(research);
    expect(sheet).toContain("3 outlets read");
    expect(sheet).toContain("[The Register, Wired]");
  });
});
