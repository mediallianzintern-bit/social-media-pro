// Admitting and retiring creators (AI tool workflows, phase 3).
import { describe, expect, it } from "vitest";

import { judgeCreator, searchCostUsd } from "@/lib/creator-finder";
import { buildPattern } from "@/lib/creator-pattern";
import type { CreatorPost } from "@/lib/creator-reels";

const now = Date.parse("2026-10-26T12:00:00Z");
const tools = ["Claude Code", "Google Flow", "Runway", "Gemini", "ChatGPT", "Canva"];
const workflow = (n: number) =>
  `${tools[n % tools.length]} motion graphics workflow: upload your reference, write the prompt, export the animation #aitools`;
const pattern = buildPattern(
  "AI tool workflows",
  ["ana", "ben", "cai", "dev", "eli", "fay"].flatMap((creator, c) =>
    Array.from({ length: 8 }, (_, n) => ({ creator, text: workflow(c + n) })),
  ),
  Array.from({ length: 60 }, (_, n) => `Brand launches new campaign across ${n} cities`),
);

const posts = (captions: string[], ageDays = 1, isReel = true): CreatorPost[] =>
  captions.map((caption, n) => ({
    id: `p${n}`,
    permalink: `https://www.instagram.com/reel/p${n}/`,
    caption,
    likes: 100,
    comments: 5,
    postedAt: new Date(now - (ageDays + n) * 86_400_000).toISOString(),
    isReel,
  }));

describe("judging a creator", () => {
  it("adds an active reel creator whose posts fit the lane", () => {
    const verdict = judgeCreator(
      posts(Array.from({ length: 12 }, (_, n) => workflow(n))),
      pattern,
      now,
    );
    expect(verdict.add).toBe(true);
    expect(verdict.retire).toBe(false);
  });

  it("does not add a marketing account whose posts do not fit", () => {
    const verdict = judgeCreator(
      posts(Array.from({ length: 12 }, (_, n) => `Brand launches new campaign across ${n} cities`)),
      pattern,
      now,
    );
    expect(verdict.add).toBe(false);
    expect(verdict.retire).toBe(true);
  });

  it("does not add an account that posts photos, not reels", () => {
    const verdict = judgeCreator(
      posts(
        Array.from({ length: 12 }, (_, n) => workflow(n)),
        1,
        false,
      ),
      pattern,
      now,
    );
    expect(verdict.add).toBe(false);
  });

  it("retires a creator who has gone quiet", () => {
    const verdict = judgeCreator(
      posts(
        Array.from({ length: 12 }, (_, n) => workflow(n)),
        60,
      ),
      pattern,
      now,
    );
    expect(verdict.retire).toBe(true);
    expect(verdict.reason).toMatch(/no posts for/);
  });

  it("waits until there are enough posts to judge", () => {
    const verdict = judgeCreator(posts([workflow(1), workflow(2)]), pattern, now);
    expect(verdict.add).toBe(false);
    expect(verdict.retire).toBe(false);
  });

  it("prices a run of four searches at twenty cents", () => {
    expect(searchCostUsd(4)).toBe(0.2);
  });
});
