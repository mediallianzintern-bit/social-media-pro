// The checks added after the first live test of the team's reel brief
// (11 Nov 2026), each built from a line one of those four scripts said, and
// the sheet's own Frontier AI scripts, which must still pass.
import { describe, expect, it } from "vitest";

import type { ContentIdea } from "@/lib/ai-types";
import { withFixedIntro } from "@/lib/reel-intro";
import {
  attributionIssue,
  extraNumbers,
  leftInDespitePlan,
  newsSummaryHook,
  notJustFormula,
  SET_APART,
} from "@/lib/reel-rules";
import { DAILY_CTA } from "@/lib/script-families";
import { voiceFlags } from "@/lib/voice-check";

const shot = (voiceover: string, onScreenText = "") => ({
  mark: "",
  shotType: "Talking head",
  visual: "",
  voiceover,
  onScreenText,
  transition: "",
});

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
    shots: withFixedIntro(
      [...paragraphs, DAILY_CTA].map((line) => shot(line)),
      (line) => shot(line),
    ),
  }) as unknown as ContentIdea;

describe("the “isn't just X. It's Y.” formula, whatever the subject", () => {
  it("catches the NVIDIA ending", () => {
    expect(
      notJustFormula(
        "AI isn't just about automation. It's about transforming creativity and how you approach design.",
      ),
    ).toMatch(/AI isn't just about automation/);
  });
  it("leaves a plain contrast alone", () => {
    expect(
      notJustFormula("Most AI tools are built to talk. This one is built to decide."),
    ).toBeNull();
  });
});

describe("numbers besides a year", () => {
  it("counts the Firefox prices, not the year", () => {
    expect(
      extraNumbers(
        "Hero Cycles bought them in 2015. Bikes priced between INR 6,000 to INR 20,000.",
      ),
    ).toEqual(["6,000", "20,000"]);
  });
  it("does not count a product's version as a number", () => {
    expect(
      extraNumbers(
        "OpenAI launched GPT-6 Cyber. Anthropic unveiled Claude Fable 5.2 and found 81 issues.",
      ),
    ).toEqual(["81"]);
    expect(extraNumbers("Bikes priced at INR 6,000.")).toEqual(["6,000"]);
  });
  it("lets the sheet's one figure through", () => {
    expect(extraNumbers("Over 120,000 people commented. That's what Jaguar did in 2024.")).toEqual([
      "120,000",
    ]);
  });
});

describe("attribution in AI news reels", () => {
  it("does not take a car being tested in simulation as attribution", () => {
    expect(
      attributionIssue(
        "Jens Jebens modeled a car suspension and tested it in simulation.",
        "Frontier AI developments",
      ),
    ).toMatch(/no claim is attributed/);
  });
  it("flags claims stated as fact", () => {
    expect(
      attributionIssue(
        "OpenAI just launched GPT-6 Cyber to find and confirm security flaws.",
        "Frontier AI developments",
      ),
    ).toMatch(/no claim is attributed/);
  });
  it("passes the sheet's way of saying it, and other lanes", () => {
    expect(
      attributionIssue(
        "The company says it trained Hy4 on defensive security data.",
        "Frontier AI developments",
      ),
    ).toBeNull();
    expect(attributionIssue("Levi's made a clay film.", "Marketing stunts")).toBeNull();
  });
});

describe("the plan's leave-out list", () => {
  const plan = {
    surprisingPart: "",
    oneLesson: "",
    keyFacts: [],
    leaveOut: [
      "the character's name (Gus, the Fuzzyeti)",
      "channel rollout across retail and social",
      "market statistics",
    ],
  };
  it("catches what the Levi's script still said", () => {
    expect(
      leftInDespitePlan(
        plan,
        "They created a film starring a yeti named Gus.\nMeet Gus, the Yeti.",
      ),
    ).toEqual(["the character's name (Gus, the Fuzzyeti)"]);
  });
  it("never matches a general entry against ordinary words", () => {
    expect(
      leftInDespitePlan(plan, "Levi's wants to be known for more than jeans in every market."),
    ).toEqual([]);
  });
});

describe("hooks and endings from the second live test", () => {
  it("catches a hook that summarises the news", () => {
    expect(newsSummaryHook("OpenAI just launched a model to fight hackers.")).toMatch(/summarises/);
    expect(newsSummaryHook("Can you build an AI that won't help hackers?")).toBeNull();
    expect(
      newsSummaryHook("This Indian AI makes a decision faster than you can blink."),
    ).toBeNull();
  });
  it("catches the generic set-apart ending in any wording", () => {
    expect(SET_APART.test("embracing human craftsmanship can set your brand apart")).toBe(true);
    expect(SET_APART.test("investing in genuine creativity can set you apart")).toBe(true);
    expect(SET_APART.test("It's about reminding people why they loved you.")).toBe(false);
  });
});

describe("the sheet's Frontier AI scripts still pass every check", () => {
  it("Tencent's Hy4", () => {
    expect(
      voiceFlags(
        reel("Tencent's Hy4 model built not to help hackers", "Frontier AI developments", [
          "Can you build an AI that won't help hackers?",
          "Tencent, the company behind WeChat, is trying with its new AI model, Hy4.",
          "The company says it trained Hy4 on defensive security data.\nFinding software flaws and fixing them.\nAnd it left out material on hacking tools and breaking into systems.",
          "Its own security teams tested it and say they found no major concerns.",
          "Here's why that matters.\nThe skill that finds a weakness can also help someone attack it.",
          "And there's a lesson here for businesses.",
          "When you pick an AI tool, don't just ask what it can do.\nAsk what it was built not to do.",
        ]),
      ),
    ).toEqual([]);
  });
  it("Sarvam's Prism", () => {
    expect(
      voiceFlags(
        reel("Sarvam AI's Prism decides in 44 milliseconds", "Frontier AI developments", [
          "This Indian AI makes a decision faster than you can blink.",
          "It's called Prism, from Sarvam AI.",
          "Most AI tools are built to talk.\nThis one is built to decide.",
          "You give it a few options.\nIt picks one and tells you how confident it is.\nSarvam says it takes about 44 milliseconds in its own tests.",
          "Imagine a customer message comes in.\nShould it go to billing, tech support or refunds?\nPrism makes the call.\nAnd if it's not confident, a human can step in.",
          "And there's a lesson here for businesses.",
          "Not every AI job needs a chatbot.\nSometimes, you just need a quick, reliable decision.",
        ]),
      ),
    ).toEqual([]);
  });
});
