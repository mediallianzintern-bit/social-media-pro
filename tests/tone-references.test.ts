// Tone references: conflicts with his brief are found, and the picks mix both kinds of reel.
import { describe, expect, it } from "vitest";

import { conflictsWithBrief, pickReferences, toneReferencesBlock } from "@/lib/tone-references";

const words = (count: number) => Array.from({ length: count }, () => "word").join(" ");
const ref = (
  id: string,
  lane: string,
  postedAt: string,
  script = `Brand did this. ${words(118)}`,
) => ({
  id,
  title: `Reel ${id}`,
  script,
  postedAt,
  lane,
});

describe("tone references", () => {
  it("flags where a reference breaks his brief", () => {
    const conflicts = conflictsWithBrief({
      lane: "Marketing stunts",
      script: `What if a brand made an ad using just hands! ${words(140)}\nFollow me for more tips.`,
    });
    expect(conflicts.join(" ")).toMatch(/words/);
    expect(conflicts.join(" ")).toMatch(/hypothetical/);
    expect(conflicts.join(" ")).toMatch(/exclamation/);
    expect(conflicts.join(" ")).toMatch(/agreed line/);
    expect(
      conflictsWithBrief({ lane: "Marketing stunts", script: `Brand did this. ${words(118)}` }),
    ).toEqual([]);
  });

  it("picks two of the same kind and one of the other", () => {
    const refs = [
      ref("a", "Frontier AI developments", "2026-10-23"),
      ref("b", "Frontier AI developments", "2026-10-19"),
      ref("c", "Marketing stunts", "2026-10-21"),
      ref("d", "Marketing stunts", "2026-10-20"),
    ];
    expect(pickReferences(refs, "Marketing stunts").map((r) => r.id)).toEqual(["c", "d", "a"]);
  });

  it("tells the writer the references are voice only, never facts", () => {
    const block = toneReferencesBlock([ref("a", "Marketing stunts", "2026-10-21")]);
    expect(block).toMatch(/NEVER use a fact/);
    expect(block).toMatch(/NEVER copy/);
  });
});
