import { describe, expect, it } from "vitest";

import {
  ARTICLE_WORDS,
  LINKEDIN_ARTICLE_SHAPE,
  articleShapeProblems,
  linkedInArticleLength,
} from "../src/lib/linkedin-article-shape";

const words = (count: number) => Array.from({ length: count }, () => "word").join(" ");

describe("linkedInArticleLength", () => {
  it("counts the introduction and every section together", () => {
    const length = linkedInArticleLength(words(100), [
      { heading: "Explained", text: words(300) },
      { heading: "Takeaway", text: words(298) },
    ]);
    expect(length).toMatchObject({ count: 700, ok: true });
  });

  it("flags an article shorter than his shortest", () => {
    expect(linkedInArticleLength(words(80), [{ heading: "One", text: words(200) }])?.ok).toBe(
      false,
    );
  });

  it("flags one longer than his longest", () => {
    expect(linkedInArticleLength(words(100), [{ heading: "One", text: words(1200) }])?.ok).toBe(
      false,
    );
  });

  it("leaves the team's bracketed notes out of the count", () => {
    const length = linkedInArticleLength(
      `${words(500)} [verify: the launch date in the article]`,
      [],
    );
    expect(length?.count).toBe(500);
  });

  it("is null for an empty article", () => {
    expect(linkedInArticleLength("  ", [])).toBeNull();
  });
});

describe("LINKEDIN_ARTICLE_SHAPE", () => {
  it("states his length and carries his best article as the model", () => {
    expect(LINKEDIN_ARTICLE_SHAPE).toContain(
      `${ARTICLE_WORDS.aimMin} to ${ARTICLE_WORDS.aimMax} words`,
    );
    expect(LINKEDIN_ARTICLE_SHAPE).toContain("Not in English.");
    expect(LINKEDIN_ARTICLE_SHAPE).toContain("Repost to help more people understand");
    expect(LINKEDIN_ARTICLE_SHAPE).not.toContain("__MODEL__");
  });
});

const lines = (count: number) =>
  Array.from({ length: count }, (_, index) => `This is short line number ${index + 1}.`).join(
    "\n\n",
  );
const his = Array.from({ length: 6 }, (_, index) => ({
  heading: `${index + 1}. A plain heading`,
  text: lines(10),
}));

describe("articleShapeProblems", () => {
  it("passes an article built like his", () => {
    expect(
      articleShapeProblems(
        "OpenAI Just Cut AI Costs by 50%. But That's Not the Biggest Surprise.",
        `${lines(8)}\n\nLet's understand.`,
        his,
      ),
    ).toEqual([]);
  });

  it("catches what the first ChatGPT Wallet article got wrong (17 Nov 2026)", () => {
    const paragraph =
      "ChatGPT Wallet is a new payment feature from OpenAI that allows AI agents to make purchases on behalf of users. It's designed to streamline the shopping process by minimizing the number of times users need to enter their payment details.";
    const problems = articleShapeProblems(
      "OpenAI Launches ChatGPT Wallet For AI Agent Purchases",
      `${lines(30)}\n\nIs your business ready?\n\n♻️ Repost to help more businesses prepare.`,
      Array.from({ length: 5 }, () => ({ heading: "What is it?", text: paragraph })),
    );
    expect(problems.some((problem) => problem.includes("news headline"))).toBe(true);
    expect(problems.some((problem) => problem.startsWith("The introduction is"))).toBe(true);
    expect(problems.some((problem) => problem.includes("Repost line"))).toBe(true);
    expect(problems.filter((problem) => problem.includes("written as a paragraph"))).toHaveLength(
      5,
    );
  });

  it("holds the number of sections to his 5 to 8", () => {
    expect(articleShapeProblems("Title?", lines(5), his.slice(0, 3))).toContain(
      "It has 3 sections; his articles have 5 to 8.",
    );
  });
});
