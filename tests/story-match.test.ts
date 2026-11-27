// A script's title must be about the story it was written on (27 Nov 2026).
import { describe, expect, it } from "vitest";

import { titleOffStory } from "@/lib/story-match";

const story = "Left alone with nothing to do, AI agents started playing";
const script = [
  "What happens when AI agents are left alone with nothing to do?",
  "MIT researchers tried this with 13 AI agents on a simulated desert island.",
];

describe("Script title against its story", () => {
  it("catches a title borrowed from another story", () => {
    expect(
      titleOffStory({ title: "Disney's Logo Mashup to Promote Hulu", subject: "Disney" }, [
        story,
        ...script,
      ]),
    ).toBe(true);
  });

  it("passes a title that shares a word with the story or the script", () => {
    expect(
      titleOffStory({ title: "AI Agents Left Alone With Nothing to Do", subject: "MIT" }, [
        story,
        ...script,
      ]),
    ).toBe(false);
    // The script names MIT though the headline does not.
    expect(titleOffStory({ title: "MIT's Desert Island Experiment" }, [story, ...script])).toBe(
      false,
    );
    // Accents and plurals do not count against it.
    expect(
      titleOffStory({ title: "Ōura's Unique Advertising Approach" }, [
        "Ad of the Week: Oura 'Wear Your Best Life'",
      ]),
    ).toBe(false);
  });

  it("says nothing without a story or a title to compare", () => {
    expect(titleOffStory({ title: "Anything" }, [])).toBe(false);
    expect(titleOffStory({ title: "" }, [story])).toBe(false);
  });
});
