// Frontier AI developments scripts always name a brand and give the marketing angle.
import { describe, expect, it } from "vitest";

import { brandRule, laneShapesBlock } from "@/lib/script-families";

describe("brand rule", () => {
  it("applies to Frontier AI developments, whatever the casing", () => {
    expect(brandRule("Frontier AI developments")).toContain("BRAND AND MARKETING ANGLE");
    expect(brandRule(" frontier ai developments ")).toContain("hypothetical");
  });

  it("asks for a hypothetical brand only by type, never a real company's name", () => {
    expect(brandRule("Frontier AI developments")).toMatch(/never by a real company's name/);
    expect(brandRule("Frontier AI developments")).toMatch(/Never say a real brand did something/);
  });

  it("does not apply to the other lanes", () => {
    expect(brandRule("Marketing stunts")).toBe("");
    expect(brandRule("AI tool workflows")).toBe("");
    expect(brandRule(null)).toBe("");
  });

  it("reaches the writer's prompt for that lane only", () => {
    const block = laneShapesBlock([
      { name: "Frontier AI developments", definition: "" },
      { name: "Marketing stunts", definition: "" },
    ] as never);
    expect(block.match(/BRAND AND MARKETING ANGLE/g)).toHaveLength(1);
    const frontier = block.slice(
      block.indexOf('"Frontier AI developments"'),
      block.indexOf('"Marketing stunts"'),
    );
    expect(frontier).toContain("BRAND AND MARKETING ANGLE");
  });
});
