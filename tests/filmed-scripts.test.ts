// The filmed scripts given to the writer for one lane (lib/filmed-scripts.ts).
import { describe, expect, it } from "vitest";

import { filmedScriptsBlock, pickFilmedScripts, type FilmedScript } from "@/lib/filmed-scripts";

const script = (over: Partial<FilmedScript>): FilmedScript => ({
  ideaId: "i",
  title: "A reel",
  lane: "Marketing stunts",
  transcript: "0:00 This brand did something odd.\n0:04 Here is why it worked.",
  filmedAt: "2026-10-20T05:00:00Z",
  worked: null,
  ratio: null,
  hookType: "Statement",
  bodyShape: "story or case, then the lesson",
  cta: "Follow for more.",
  seconds: 38,
  words: 95,
  ...over,
});

describe("pickFilmedScripts", () => {
  it("shows only the lane asked for, whatever the case", () => {
    const picked = pickFilmedScripts(
      [script({ ideaId: "a" }), script({ ideaId: "b", lane: "AI tool workflows" })],
      "marketing stunts",
    );
    expect(picked.map((s) => s.ideaId)).toEqual(["a"]);
  });

  it("never shows a reel whose review found it did not work", () => {
    expect(pickFilmedScripts([script({ worked: false, ratio: 0.6 })], "Marketing stunts")).toEqual(
      [],
    );
  });

  it("puts reels that worked first, then the newest not yet reviewed", () => {
    const picked = pickFilmedScripts(
      [
        script({ ideaId: "pending-new", filmedAt: "2026-11-06T00:00:00Z" }),
        script({
          ideaId: "worked-old",
          worked: true,
          ratio: 2.1,
          filmedAt: "2026-10-01T00:00:00Z",
        }),
        script({ ideaId: "pending-old", filmedAt: "2026-10-10T00:00:00Z" }),
      ],
      "Marketing stunts",
    );
    expect(picked.map((s) => s.ideaId)).toEqual(["worked-old", "pending-new"]);
  });

  it("shows nothing without a lane or a transcript", () => {
    expect(pickFilmedScripts([script({})], null)).toEqual([]);
    expect(pickFilmedScripts([script({ transcript: "  " })], "Marketing stunts")).toEqual([]);
  });
});

describe("filmedScriptsBlock", () => {
  it("quotes the transcript with its result and shape, for structure only", () => {
    const block = filmedScriptsBlock(
      [script({ title: "Sour Patch Kids", worked: true, ratio: 2.13 })],
      "Marketing stunts",
    );
    expect(block).toContain("HOW THE TEAM ACTUALLY FILMED MARKETING STUNTS REELS");
    expect(block).toContain('FILMED 1 — "Sour Patch Kids" (WORKED, 2.13x the typical views)');
    expect(block).toContain("hook: Statement; body: story or case, then the lesson");
    expect(block).toContain("0:04 Here is why it worked.");
    expect(block).toContain("STRUCTURE ONLY");
  });

  it("is empty when the lane has nothing filmed", () => {
    expect(filmedScriptsBlock([script({})], "Frontier AI developments")).toBe("");
  });
});
