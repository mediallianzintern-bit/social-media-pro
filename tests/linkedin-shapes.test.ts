// LinkedIn post shapes come from his LinkedIn posts, lane by lane.
import { describe, expect, it } from "vitest";

import { linkedInShapeFor, linkedInShapesBlock } from "@/lib/linkedin-shapes";

describe("LinkedIn lane shapes", () => {
  it("has a shape for each of his LinkedIn lanes", () => {
    for (const name of [
      "Advertising and AI",
      "AI Tools and Developments",
      "AI Security Concerns",
      "Digital Marketing Insights",
      "AI in Business",
    ]) {
      expect(linkedInShapeFor({ name, definition: "" }), name).not.toBeNull();
    }
    expect(linkedInShapeFor({ name: "other", definition: "" })).toBeNull();
  });

  it("places a renamed lane by its subject", () => {
    const shape = linkedInShapeFor({ name: "Cybersecurity and AI risk", definition: "" });
    expect(shape).toBe(linkedInShapeFor({ name: "AI Security Concerns", definition: "" }));
  });

  it("keeps the reel's shot list and sign-off out of a LinkedIn post", () => {
    const block = linkedInShapesBlock([{ name: "Advertising and AI", definition: "" }]);
    expect(block).toContain("150 to 300 words");
    expect(block).toContain("♻️ Repost to help");
    expect(block).not.toMatch(/shot list|See you tomorrow|voiceover/i);
  });
});
