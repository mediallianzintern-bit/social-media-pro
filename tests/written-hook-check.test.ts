// The alternatives a LinkedIn post arrives with pass the checks "Get more
// hooks" uses (5 Nov 2026).
import { describe, expect, it } from "vitest";

import { writtenHookIssue } from "@/lib/written-hook-check";

const idea = { title: "AI shopping agents", angle: "", format: "text_post" as const };

describe("a LinkedIn opening", () => {
  it("drops the alternatives that came back on 5 Nov", () => {
    for (const hook of [
      "What if AI shopping agents redefine the retail experience?\nThe latest developments from Amazon and Walmart offer insight.",
      "Could the secret to reaching Gen Z be authenticity?\nDuolingo's marketing strategy suggests it is.",
      "Why is retail media evolving with AI shopping?\nA closer look at Amazon and Walmart's strategies.",
      "Is your business ready for AI's next big leap?\nOpenAI's GPT-6.1 Terra is making waves in workplace efficiency.",
      "How did Duolingo's owl become a Gen Z icon?\nIt started on TikTok.",
    ]) {
      expect(writtenHookIssue(hook, idea, true)).not.toBeNull();
    }
  });

  it("keeps both openings Pritesh Sir asked to test", () => {
    expect(
      writtenHookIssue(
        "Can a brand's mascot have a funeral and go viral?\nDuolingo's marketing team did just that.",
        idea,
        true,
      ),
    ).toBeNull();
    expect(
      writtenHookIssue(
        "What if reaching Gen Z is more than just a trend?\nDuolingo's approach offers a lesson.",
        idea,
        true,
      ),
    ).toBeNull();
  });

  it("needs two lines when the post's hook is a pair", () => {
    expect(writtenHookIssue("Amazon just blocked an AI shopper.", idea, true)).toMatch(/headline/);
    expect(writtenHookIssue("Amazon just blocked an AI shopper.", idea, false)).toBeNull();
  });
});
