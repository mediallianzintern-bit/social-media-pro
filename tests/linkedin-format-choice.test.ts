// Write post / Write article (16 Nov 2026): the format the team chose is the
// only one the writer may return.
import { describe, expect, it } from "vitest";

import { ideasSchemaFor } from "@/server/ai/schemas";

const formatEnum = (schema: Record<string, unknown>): string[] => {
  const ideas = (
    schema as { properties: { ideas: { items: { properties: { format: { enum: string[] } } } } } }
  ).properties.ideas.items.properties.format.enum;
  return ideas;
};

describe("the LinkedIn format choice", () => {
  const base = {
    platform: "linkedin" as const,
    sourceIds: ["s1"],
    lanes: ["AI launches explained"],
  };

  it("allows only an article when the team chose Write article", () => {
    expect(formatEnum(ideasSchemaFor({ ...base, writtenFormat: "article" }))).toEqual(["article"]);
  });
  it("allows only a text post when the team chose Write post", () => {
    expect(formatEnum(ideasSchemaFor({ ...base, writtenFormat: "text_post" }))).toEqual([
      "text_post",
    ]);
  });
  it("leaves the choice to the writer otherwise", () => {
    expect(formatEnum(ideasSchemaFor(base))).toEqual(["text_post", "article", "document"]);
  });
});
