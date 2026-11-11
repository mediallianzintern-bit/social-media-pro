// Frontier AI developments reels follow the team's AI NEWS rules (11 Nov 2026):
// plain words, every claim attributed, and the story's own example, never a
// hypothetical business such as "a mid-size travel agency".
import { describe, expect, it } from "vitest";

import { brandRule, laneShapesBlock } from "@/lib/script-families";

describe("brand rule", () => {
  it("applies to Frontier AI developments, whatever the casing", () => {
    expect(brandRule("Frontier AI developments")).toContain("AI NEWS");
    expect(brandRule(" frontier ai developments ")).toContain("attribute every claim");
  });

  it("rules out a hypothetical business in place of the story's own example", () => {
    expect(brandRule("Frontier AI developments")).toMatch(/never a hypothetical business/);
  });

  it("does not apply to the other lanes", () => {
    expect(brandRule("Marketing stunts")).toBe("");
    expect(brandRule("AI tool workflows")).toBe("");
    expect(brandRule(null)).toBe("");
  });

  it("gives each lane the team's flow in the writer's prompt", () => {
    const block = laneShapesBlock([
      { name: "Frontier AI developments", definition: "" },
      { name: "Marketing stunts", definition: "" },
    ] as never);
    const frontier = block.slice(
      block.indexOf('"Frontier AI developments"'),
      block.indexOf('"Marketing stunts" is'),
    );
    expect(frontier).toContain("AI NEWS");
    expect(frontier).toContain("And there's a lesson here for businesses.");
    expect(block).toContain("BRAND STORY");
    expect(block).toContain("fixed intro");
  });
});
