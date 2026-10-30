// LinkedIn post shapes come from his LinkedIn posts, lane by lane.
import { describe, expect, it } from "vitest";

import type { ContentIdea } from "@/lib/ai-types";
import { linkedInShapeFor, linkedInShapesBlock } from "@/lib/linkedin-shapes";
import { linkedInLength, voiceFlags } from "@/lib/voice-check";

describe("LinkedIn lane shapes", () => {
  it("has a shape for each of his LinkedIn lanes", () => {
    for (const name of [
      "AI launches explained",
      "AI changing ads and search",
      "AI risks and security",
      "Marketing fundamentals",
      "Content and creator craft",
      "Reflections",
    ]) {
      expect(linkedInShapeFor({ name, definition: "" }), name).not.toBeNull();
    }
    expect(linkedInShapeFor({ name: "other", definition: "" })).toBeNull();
  });

  it("places a renamed lane by its subject", () => {
    const shape = linkedInShapeFor({ name: "Cybersecurity and AI risk", definition: "" });
    expect(shape).toBe(linkedInShapeFor({ name: "AI risks and security", definition: "" }));
  });

  it("keeps the reel's shot list and sign-off out of a LinkedIn post", () => {
    const block = linkedInShapesBlock([{ name: "AI changing ads and search", definition: "" }]);
    expect(block).toContain("150 to 300 words");
    expect(block).toContain("♻️ Repost to help");
    expect(block).not.toMatch(/shot list|See you tomorrow|voiceover/i);
  });
});

describe("LinkedIn voice check", () => {
  const post = (body: string, hook = "McDonald's wants to make $1 billion from advertising.") =>
    ({
      title: "McDonald's advertising business",
      angle: "McDonald's",
      hook,
      format: "text_post",
      shots: [],
      caption: "",
      hashtags: [],
      post: { body, sections: [] },
    }) as unknown as ContentIdea;
  const words = (count: number) => Array.from({ length: count }, () => "word").join(" ");

  it("keeps his own repost line and flags hype from his LinkedIn prompt", () => {
    const flags = voiceFlags(
      post(`${words(200)} The possibilities are endless.\n\n♻️ Repost to help a marketer.`),
    );
    expect(flags).toContain("uses “the possibilities are endless”");
    expect(flags).not.toContain("uses an emoji");
  });

  it("holds a post to his length, and an article teaser to its own", () => {
    expect(voiceFlags(post(words(90))).some((flag) => flag.startsWith("90 words"))).toBe(true);
    expect(voiceFlags(post(`${words(90)} I've written an article on it.`))).toEqual([]);
  });
});

describe("LinkedIn length", () => {
  const words = (count: number) => Array.from({ length: count }, () => "word").join(" ");
  it("measures a post against 150-300 and a teaser against 75-125", () => {
    expect(linkedInLength(words(97))).toMatchObject({ count: 97, min: 150, ok: false });
    expect(linkedInLength(`${words(95)} Read the article.`)).toMatchObject({ min: 75, ok: true });
    expect(linkedInLength("")).toBeNull();
  });
});
