// The team's LinkedIn writing brief (2 Nov 2026): a business conversation that
// starts from the news, never a news summary, for every LinkedIn post.
import { describe, expect, it } from "vitest";

import type { ContentIdea } from "@/lib/ai-types";
import { hookIssue, newsOpenerIssue } from "@/lib/hook-check";
import { voiceFlags } from "@/lib/voice-check";
import { problemsOf } from "@/server/ai/linkedin-review";
import { LINKEDIN_EDITORIAL, LINKEDIN_VOICE } from "@/server/ai/voice";

const reference = LINKEDIN_EDITORIAL.split('"""')[1]!.trim();
const raw = {
  format: "text_post",
  title: "Elon Musk's Warning on AI Agents Hacking Crypto",
  angle: "",
};
const research = { sources: [], facts: [] } as never;

describe("the LinkedIn writing brief", () => {
  it("is part of every LinkedIn prompt", () => {
    expect(LINKEDIN_VOICE).toContain("A POST IS NOT A NEWS SUMMARY");
    expect(LINKEDIN_VOICE).toContain("Could AI agents hack crypto to fund themselves?");
  });

  it("passes its own approved post", () => {
    expect(problemsOf(raw, reference, [], research)).toEqual([]);
  });

  it("flags a first line written like a news report, never a question", () => {
    expect(
      newsOpenerIssue(
        "Elon Musk has raised a red flag about superintelligent AI agents potentially exploiting cryptocurrency systems for self-funding.",
      ),
    ).toMatch(/news report/);
    expect(newsOpenerIssue("Xsolla has acquired Gamepix to create a new platform.")).toMatch(
      /news report/,
    );
    expect(newsOpenerIssue("In a recent development, Apple expanded Creator Studio.")).toMatch(
      /news report/,
    );
    expect(newsOpenerIssue("Could AI agents hack crypto to fund themselves?")).toBeNull();
    expect(newsOpenerIssue("McDonald's wants to make $1 billion from advertising.")).toBeNull();
    expect(newsOpenerIssue("Meta is moving beyond AI that creates ads.")).toBeNull();
  });

  it("lets a curiosity opening through on LinkedIn while it names the subject", () => {
    const subject = "Cheaper AI models and what they change for businesses";
    expect(
      hookIssue("What if cheaper AI models create a different problem?", subject, {
        allowHypothetical: true,
      }),
    ).toBeNull();
    expect(
      hookIssue("What will make a marketer stand out?", subject, { allowHypothetical: true }),
    ).toMatch(/never names/);
  });

  it("asks for the facts that serve one idea, not the whole fact sheet", () => {
    const padded = reference.replace(
      "It's a thought worth paying attention to.",
      "According to BBC, $6.3 billion was taken on October 29, 2023, across 12 exchanges, 400 wallets, 37% of them new, by 9 groups.",
    );
    expect(problemsOf(raw, padded, [], research).some((problem) => /figures/.test(problem))).toBe(
      true,
    );
  });

  it("ends on Repost to help, with the word help in it", () => {
    const followOnly = reference.replace(
      "Repost to help more businesses think about the next generation of cybersecurity risks.",
      "Follow for more digital marketing and AI insights.",
    );
    expect(problemsOf(raw, followOnly, [], research).some((problem) => /help/.test(problem))).toBe(
      true,
    );
  });

  it("flags a dash in a post in the drawer", () => {
    const idea = {
      title: raw.title,
      angle: "",
      hook: "Could AI agents hack crypto to fund themselves?",
      altHooks: [],
      shots: [],
      hashtags: [],
      caption: "",
      format: "text_post",
      post: { body: `${reference}\n\nAI is useful — but control matters.`, sections: [] },
    } as unknown as ContentIdea;
    expect(voiceFlags(idea)).toContain("uses a dash in the post — write the sentence out instead");
  });
});
