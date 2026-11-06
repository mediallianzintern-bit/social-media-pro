// Why LinkedIn posts came out under 150 words on 5-6 Nov 2026, and the fixes.
import { describe, expect, it } from "vitest";

import { lessSerious } from "@/server/ai/linkedin-length";
import { withFactNotes } from "@/server/ai/linkedin-review";

const short = "It is 129 words; a post of his runs 150 to 300. Add about 41 words of substance.";
const grade = "It reads at about Grade 6.8; the team wants Grade 5 to 6 (never above 8).";
const invented = "It states figures the story never gives (40%); use only the story's figures.";

describe("which rewrite the length fit keeps", () => {
  it("keeps a rewrite that fixes the length even when it gains a smaller flag", () => {
    // Before: 1 problem against 1, so the 129-word draft was kept.
    expect(lessSerious([grade], [short])).toBe(true);
  });

  it("never keeps a rewrite that invents a figure, however long it is", () => {
    expect(lessSerious([invented], [short])).toBe(false);
    expect(lessSerious([short], [invented])).toBe(true);
  });

  it("otherwise keeps the one with fewer problems", () => {
    expect(lessSerious([grade], [grade, "It uses “landscape”."])).toBe(true);
    expect(lessSerious([grade], [grade])).toBe(false);
  });
});

describe("a post written from the headline only", () => {
  const data = {
    ideas: [
      {
        format: "text_post",
        source: { sourceId: "s1" },
        post: { body: "ChatGPT ads are struggling in India.", sections: [] },
      },
    ],
  };
  const notesOf = (sources: unknown) =>
    (
      withFactNotes(data, sources as never) as typeof data & {
        ideas: Array<{ post: { notes?: string[] } }>;
      }
    ).ideas[0]!.post.notes ?? [];

  it("gets a fact to tick before posting", () => {
    const notes = notesOf([
      { id: "s1", title: "ChatGPT ads struggle in India", publisher: "NewsBytes" },
    ]);
    expect(notes[0]).toMatch(/^Verify before posting: this post was written from the headline only/);
    expect(notes[0]).toMatch(/NewsBytes/);
  });

  it("gets none when an article was read", () => {
    const notes = notesOf([
      {
        id: "s1",
        title: "ChatGPT ads struggle in India",
        publisher: "NewsBytes",
        article: { publisher: "Storyboard18", url: "https://x", text: "ChatGPT ads are live." },
      },
    ]);
    expect(notes.some((note) => /headline only/.test(note))).toBe(false);
  });
});
