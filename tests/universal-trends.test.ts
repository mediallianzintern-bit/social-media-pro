// The Trends page's lane suggestion for each category (6 Nov 2026).
import { describe, expect, it } from "vitest";

import {
  ageLabel,
  byUrgency,
  suggestLane,
  TREND_CATEGORIES,
  urgencyOf,
} from "@/lib/universal-trends";

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


describe("how urgent a trend is", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  const at = (hours: number) => new Date(now - hours * 3_600_000).toISOString();

  it("puts a fresh single report above a three-day-old one", () => {
    expect(urgencyOf({ coverage: 1, publishedAt: at(1) }, now)).toBeGreaterThan(
      urgencyOf({ coverage: 1, publishedAt: at(72) }, now),
    );
  });

  it("lets a story ten outlets carried yesterday beat this morning's single report", () => {
    const ranked = byUrgency(
      [
        { id: "morning", coverage: 1, publishedAt: at(3) },
        { id: "big", coverage: 10, publishedAt: at(26) },
        { id: "old", coverage: 2, publishedAt: at(200) },
      ],
      now,
    );
    expect(ranked.map((item) => item.id)).toEqual(["big", "morning", "old"]);
  });

  it("says how long ago a story was published", () => {
    expect(ageLabel(at(0.5), now)).toBe("30 min ago");
    expect(ageLabel(at(5), now)).toBe("5 h ago");
    expect(ageLabel(at(72), now)).toBe("3 days ago");
    expect(ageLabel(null, now)).toBeNull();
  });
});
