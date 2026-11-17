import { describe, expect, it } from "vitest";

import {
  ARTICLE_WORDS,
  LINKEDIN_ARTICLE_SHAPE,
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
