// Repeated news and trusted outlets: real cases from the inbox on 22 Oct 2026.
import { describe, expect, it } from "vitest";

import { buildOutletModel, type OutletSignal } from "@/lib/source-trust";
import { groupStories, sameStory } from "@/lib/sources";

const story = (
  title: string,
  publisher: string,
  publishedAt: string | null = "2026-10-13T08:00:00Z",
) => ({
  title,
  publisher,
  publishedAt,
});

describe("repeated news", () => {
  it("treats an identical headline as one story, even with no name in it", () => {
    expect(
      sameStory(
        "Meghan’s latest marketing stunt is ‘nauseating’",
        "meghan's latest marketing stunt is 'nauseating'",
      ),
    ).toBe(true);
  });

  it("joins the same story reworded within a few days", () => {
    const dates = { a: "2026-10-16T05:00:00Z", b: "2026-10-16T09:00:00Z" };
    expect(
      sameStory(
        "Meta’s ad revenue hits over US$63 billion in Q3; Ad pricing gains 1%",
        "Meta’s ad prices rise 14% as advertising revenue hits $63 billion, despite slower growth",
        0.5,
        dates,
      ),
    ).toBe(true);
  });

  it("keeps reworded reports apart when they are weeks apart", () => {
    const dates = { a: "2026-10-01T05:00:00Z", b: "2026-10-16T09:00:00Z" };
    expect(
      sameStory(
        "Meta’s ad revenue hits over US$63 billion in Q3; Ad pricing gains 1%",
        "Meta’s ad prices rise 14% as advertising revenue hits $63 billion, despite slower growth",
        0.5,
        dates,
      ),
    ).toBe(false);
  });

  it("never joins two brands' campaigns on shared vocabulary alone", () => {
    expect(sameStory("PepsiCo launches brand campaign", "Ecover launches £4m brand campaign")).toBe(
      false,
    );
  });

  it("keeps two different stories about one company apart", () => {
    expect(
      sameStory(
        "Meta releases Muse Wonder AI models to challenge Anthropic and OpenAI",
        "Meta’s ad revenue hits over US$63 billion in Q3",
        0.5,
        { a: "2026-10-13T05:00:00Z", b: "2026-10-13T09:00:00Z" },
      ),
    ).toBe(false);
  });

  it("gathers a big story told many ways into one group", () => {
    const groups = groupStories([
      story("Meta releases its first frontier model, Muse Wonder", "TechCrunch"),
      story("Meta Launches Muse Wonder AI Model to Challenge ChatGPT and Claude", "CEOWORLD"),
      story(
        "Meta releases Muse Wonder AI models to challenge Anthropic and OpenAI",
        "ET Enterprise AI",
      ),
      story(
        "Muse Wonder: Meta Says Its New Frontier AI Models Are On Par With OpenAI, Anthropic Models",
        "ETV Bharat",
      ),
      story("Reflection AI Launches Beam, Its First Open-Weight AI Model", "Times Of AI"),
    ]);
    expect(groups.map((group) => group.length).sort()).toEqual([1, 4]);
  });
});

describe("trusted outlets", () => {
  const at = new Date().toISOString();
  const signals = (publisher: string, kinds: OutletSignal["kind"][]): OutletSignal[] =>
    kinds.map((kind) => ({ publisher, kind, at }));

  it("trusts an outlet the team keeps backing", () => {
    const model = buildOutletModel(
      signals("Storyboard18", ["tick", "tick", "tick", "tick", "tick", "tick", "tick", "cross"]),
    );
    expect(model.get("storyboard18")?.standing).toBe("trusted");
  });

  it("counts scripts, saves and filmed reels as backing, not only ticks", () => {
    const model = buildOutletModel(signals("qz.com", ["tick", "script", "saved", "filmed"]));
    expect(model.get("qz.com")?.standing).toBe("trusted");
  });

  it("avoids an outlet only after several crosses that clearly outweigh the rest", () => {
    const model = buildOutletModel([
      ...signals("MediaPost", [
        "tick",
        "cross",
        "cross",
        "cross",
        "cross",
        "cross",
        "cross",
        "cross",
        "cross",
      ]),
      ...signals("How-To Geek", ["tick", "cross", "cross", "cross", "cross"]),
    ]);
    expect(model.get("mediapost")?.standing).toBe("avoided");
    expect(model.get("how-to geek")?.standing).toBe("untested");
  });

  it("does not trust an outlet on one tick", () => {
    const model = buildOutletModel(signals("New Outlet", ["tick"]));
    expect(model.get("new outlet")?.standing).toBe("untested");
  });

  it("lets old behaviour fade", () => {
    const old = new Date(Date.now() - 200 * 86_400_000).toISOString();
    const model = buildOutletModel([
      ...["cross", "cross", "cross", "cross", "cross"].map((kind) => ({
        publisher: "Exchange4Media",
        kind: kind as OutletSignal["kind"],
        at: old,
      })),
      ...signals("Exchange4Media", ["tick", "tick"]),
    ]);
    expect(model.get("exchange4media")?.standing).not.toBe("avoided");
  });
});
