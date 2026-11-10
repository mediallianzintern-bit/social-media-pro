// 10 Nov 2026: a Meta headline that names "Claude Haiku" joined the reports of
// Anthropic's Claude Fable 5.2 launch, and the group took the newest headline,
// Meta's. The Fable story vanished from Trends after it was written for
// LinkedIn. The group's headline is now the one most of its reports are about.
import { describe, expect, it } from "vitest";

import { clusterStories } from "@/lib/sources";

const report = (title: string, publisher: string, publishedAt: string) => ({
  title,
  publisher,
  publishedAt,
});

const reports = [
  report(
    "Anthropic unveils Claude Fable 5.2, Mythos 5.2 with coding gains and lower prices",
    "InfoWorld",
    "2026-11-10T08:00:00Z",
  ),
  report(
    "Anthropic unveils Claude Fable 5.2 and Mythos 5.2 with coding gains",
    "The Verge",
    "2026-11-10T08:20:00Z",
  ),
  report(
    "Claude Fable 5.2 and Mythos 5.2: Anthropic unveils coding gains, lower prices",
    "TechCrunch",
    "2026-11-10T08:40:00Z",
  ),
  // The bridge: shares Anthropic's story and names Meta's.
  report(
    "Anthropic unveils cheaper Claude Fable 5.2 as Meta readies Muse Ember",
    "ZDNet",
    "2026-11-10T09:00:00Z",
  ),
  report(
    "Meta unveils Muse Ember, a budget-friendly competitor to Claude Haiku",
    "Techzine Global",
    "2026-11-10T10:00:00Z",
  ),
];

describe("clusterStories lead", () => {
  it("by default takes the newest report, which is how the Meta headline won", () => {
    const groups = clusterStories(reports);
    const biggest = groups.reduce((a, b) => (b.coverage > a.coverage ? b : a));
    expect(biggest.coverage).toBe(5);
    expect(biggest.title).toContain("Muse Ember");
  });

  it("takes the headline most of the group is about when asked", () => {
    const groups = clusterStories(reports, 0.5, { lead: "central" });
    const biggest = groups.reduce((a, b) => (b.coverage > a.coverage ? b : a));
    expect(biggest.title).toContain("Fable 5.2");
  });
});
