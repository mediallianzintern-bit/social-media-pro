// The Trends page's lane suggestion for each category (6 Nov 2026).
import { describe, expect, it } from "vitest";

import { suggestLane, TREND_CATEGORIES } from "@/lib/universal-trends";

const instagram = ["Marketing stunts", "Brand strategy lessons", "Frontier AI developments"];
const linkedin = [
  "AI launches explained",
  "AI X Marketing Bridge",
  "AI risks and security",
  "Marketing fundamentals",
  "Content and creator craft",
];

describe("the lane a trend is suggested for", () => {
  it("fits each category on LinkedIn", () => {
    expect(suggestLane("brands", linkedin)).toBe("Marketing fundamentals");
    expect(suggestLane("ad-platforms", linkedin)).toBe("Marketing fundamentals");
    expect(suggestLane("ai", linkedin)).toBe("AI launches explained");
    expect(suggestLane("ai-marketing", linkedin)).toBe("AI X Marketing Bridge");
  });

  it("fits each category on Instagram", () => {
    expect(suggestLane("stunts", instagram)).toBe("Marketing stunts");
    expect(suggestLane("brands", instagram)).toBe("Brand strategy lessons");
    expect(suggestLane("ai-marketing", instagram)).toBe("Frontier AI developments");
  });

  it("suggests a lane for every category on both platforms", () => {
    for (const category of TREND_CATEGORIES) {
      expect(suggestLane(category.id, instagram)).not.toBeNull();
      expect(suggestLane(category.id, linkedin)).not.toBeNull();
    }
  });
});
