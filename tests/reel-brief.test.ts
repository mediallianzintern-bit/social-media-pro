// The team's reel brief (Script Comparison sheet, 11 Nov 2026), held in code:
// the fixed intro right after the hook, the length counted without it and the
// closing line, and the sheet's own right and wrong scripts checked as such.
import { describe, expect, it } from "vitest";

import type { ContentIdea } from "@/lib/ai-types";
import { FIXED_INTRO, introIssue, scriptWords, withFixedIntro } from "@/lib/reel-intro";
import { REEL_WORDS_LIMIT } from "@/lib/reel-length";
import { DAILY_CTA } from "@/lib/script-families";
import { voiceFlags } from "@/lib/voice-check";

const shot = (voiceover: string) => ({
  mark: "",
  shotType: "Talking head",
  visual: "",
  voiceover,
  onScreenText: "",
  transition: "",
});
const introShot = (line: string) => shot(line);

/** A reel from paragraphs, with the intro after the hook and the lane's closing line. */
const reel = (title: string, lane: string, paragraphs: string[]): ContentIdea =>
  ({
    title,
    angle: "",
    format: "reel",
    contentLane: lane,
    hook: paragraphs[0]!.split("\n")[0],
    altHooks: [],
    caption: "",
    hashtags: [],
    shots: withFixedIntro([...paragraphs, DAILY_CTA].map(shot), introShot),
  }) as unknown as ContentIdea;

const JAGUAR = [
  "What happens when a car brand launches an ad with no cars in it?",
  "That's what Jaguar did in 2024.",
  "Before going fully electric, it dropped its famous leaping cat logo.\nIt moved to a bold pink look.\nAnd the launch video showed people in bright clothes.\nBut not a single car.",
  'Over 120,000 people commented.\nElon Musk simply asked, "Do you sell cars?"',
  "And there's a lesson here for businesses.",
  "Change wasn't the problem.\nJaguar was going electric, so a new look made sense.\nBut the launch left out the one thing people come for.",
  "The car.",
  "Sometimes, a rebrand isn't about showing how different you are.\nIt's about reminding people why they loved you.",
];

const BIKAJI = [
  "Amitabh Bachchan became the face of Bikaji in 2019.\nBut the story behind the brand is even more interesting.",
  "Bikaji's founder was the grandson of Haldiram's founder.\nSo both brands came from the same family, the same city and the same famous snack.",
  "Think about that.",
  "How do you stand out when your biggest competitor shares your story?",
  "Bikaji didn't rely on heritage alone.\nIt made bhujia easy to pick up in pouch packs.\nAnd with Amitabh, it made a traditional snack feel fresh for younger people.",
  "And there's a lesson here for businesses.",
  "Sometimes, your roots earn people's trust.\nBut growth is about giving them a new reason to choose you.",
];

describe("the fixed intro", () => {
  it("goes in as its own shot right after the hook", () => {
    const shots = withFixedIntro(["Hook line?", "Context.", "Story."].map(shot), introShot);
    expect(shots.map((s) => s.voiceover)).toEqual([
      "Hook line?",
      FIXED_INTRO,
      "Context.",
      "Story.",
    ]);
    expect(introIssue(shots.map((s) => s.voiceover))).toBeNull();
  });

  it("is said once: a copy elsewhere or a near-miss is replaced by the exact line", () => {
    const shots = withFixedIntro(
      [
        "Hi, I'm Pritesh Patel and I make AI simple for business.",
        "Hook?",
        "Context.",
        FIXED_INTRO,
      ].map(shot),
      introShot,
    );
    expect(shots.map((s) => s.voiceover)).toEqual(["Hook?", FIXED_INTRO, "Context."]);
  });

  it("is taken out of a line it was folded into", () => {
    const shots = withFixedIntro(
      [`Can you build an AI that won't help hackers? ${FIXED_INTRO}`, "Tencent is trying."].map(
        shot,
      ),
      introShot,
    );
    expect(shots.map((s) => s.voiceover)).toEqual([
      "Can you build an AI that won't help hackers?",
      FIXED_INTRO,
      "Tencent is trying.",
    ]);
  });

  it("is flagged when missing or first", () => {
    expect(introIssue(["Hook?", "Context."])).toMatch(/missing/);
    expect(introIssue([FIXED_INTRO, "Hook?"])).toMatch(/opens on the fixed intro/);
  });
});

describe("the script's length", () => {
  it("is counted without the fixed intro and the closing line", () => {
    const idea = reel("Jaguar's rebrand with no cars", "Brand strategy lessons", JAGUAR);
    const lines = (idea.shots ?? []).map((s) => s.voiceover);
    const all = lines.join(" ").split(/\s+/).length;
    const counted = scriptWords(lines, "Brand strategy lessons");
    expect(all - counted).toBe(FIXED_INTRO.split(" ").length + DAILY_CTA.split(" ").length);
    expect(counted).toBeGreaterThanOrEqual(80);
    expect(counted).toBeLessThanOrEqual(REEL_WORDS_LIMIT);
  });
});

describe("the sheet's scripts", () => {
  it("passes the scripts the team marked as right", () => {
    expect(
      voiceFlags(reel("Jaguar's rebrand with no cars", "Brand strategy lessons", JAGUAR)),
    ).toEqual([]);
    expect(
      voiceFlags(reel("Bikaji and Amitabh Bachchan", "Brand strategy lessons", BIKAJI)),
    ).toEqual([]);
  });

  it("flags the lines the sheet marks as wrong", () => {
    const wrong = reel("Bikaji and Amitabh Bachchan", "Brand strategy lessons", [
      "Why does Bikaji use Amitabh Bachchan in its marketing strategy?",
      "Bikaji's branded savoury snacks market is valued at ₹423 billion in FY2022.",
      "Here's the smart part. Bikaji uses Amitabh Bachchan to appeal to younger consumers.",
      "Why does this matter? Ethnic namkeen and snacks account for 26.9% of the market.",
      "The lesson? Combining heritage with modern marketing can grow your brand beyond its roots.",
    ]);
    const flags = voiceFlags(wrong).join(" | ");
    expect(flags).toMatch(/valued at/);
    expect(flags).toMatch(/here's the smart part/);
    expect(flags).toMatch(/why does this matter\?/);
    expect(flags).toMatch(/the lesson\?/);
    expect(flags).toMatch(/words of script/);
  });
});
