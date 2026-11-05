// Picking a hook changes the script itself, not only the label above it.
import { describe, expect, it } from "vitest";

import type { ContentIdea } from "@/lib/ai-types";
import { openWithHook, withChosenHook } from "@/lib/hook-variants";

const shot = (voiceover: string) => ({
  mark: "",
  shotType: "",
  visual: "",
  voiceover,
  onScreenText: "",
  transition: "",
});

const idea = (patch: Partial<ContentIdea>) =>
  ({ title: "t", hook: "", altHooks: [], shots: [], hashtags: [], ...patch }) as ContentIdea;

describe("the chosen hook in the script", () => {
  it("opens a LinkedIn post with the chosen question, keeping the statement it leads into", () => {
    const post = withChosenHook(
      idea({
        format: "text_post",
        hook: "Elon Musk has raised a red flag about superintelligent AI agents potentially exploiting cryptocurrency systems for self-funding.",
        chosenHook: "Could AI agents hack crypto to fund themselves?",
        post: {
          body: "Elon Musk has raised a red flag about superintelligent AI agents potentially exploiting cryptocurrency systems for self-funding.\n\nThis warning comes on the heels of the largest crypto hack ever recorded.",
          sections: [],
        },
      }),
    );
    expect(post.post!.body).toBe(
      "Could AI agents hack crypto to fund themselves?\n\nElon Musk has raised a red flag about superintelligent AI agents potentially exploiting cryptocurrency systems for self-funding.\n\nThis warning comes on the heels of the largest crypto hack ever recorded.",
    );
  });

  it("swaps a LinkedIn headline and subheadline as a pair", () => {
    const twist =
      "Can a brand's mascot have a funeral and go viral?\nDuolingo's marketing team did just that.";
    const lesson =
      "What if reaching Gen Z is more than just a trend?\nDuolingo's approach offers a lesson.";
    const post = withChosenHook(
      idea({
        format: "text_post",
        hook: twist,
        altHooks: [lesson],
        chosenHook: lesson,
        post: {
          body: "Can a brand's mascot have a funeral and go viral?\n\nDuolingo's marketing team did just that.\n\nThey staged a funeral for Duo the Owl.",
          sections: [],
        },
      }),
    );
    expect(post.post!.body).toBe(
      "What if reaching Gen Z is more than just a trend?\n\nDuolingo's approach offers a lesson.\n\nThey staged a funeral for Duo the Owl.",
    );
  });

  it("swaps only the first line of an older post whose hook is one line", () => {
    const post = withChosenHook(
      idea({
        format: "text_post",
        hook: "One brand held a funeral for its mascot.",
        chosenHook: "Can a brand's mascot have a funeral?\nDuolingo did.",
        post: {
          body: "One brand held a funeral for its mascot.\n\n66 million watched.",
          sections: [],
        },
      }),
    );
    expect(post.post!.body).toBe(
      "Can a brand's mascot have a funeral?\nDuolingo did.\n\n66 million watched.",
    );
  });

  it("replaces a statement with a statement, and the whole first sentence where it ran on", () => {
    const reel = withChosenHook(
      idea({
        format: "reel",
        hook: "Grok just released the first AI-generated episode of The Odyssey.",
        chosenHook: "Grok's new AI project revisits The Odyssey.",
        shots: [
          shot(
            "Grok just released the first AI-generated episode of The Odyssey, focusing on the Greeks' arrival at Troy. It took a year.",
          ),
          shot("This project is in collaboration with Wonder Studios."),
        ],
      }),
    );
    expect(reel.shots[0]!.voiceover).toBe(
      "Grok's new AI project revisits The Odyssey. It took a year.",
    );
    expect(reel.shots[1]!.voiceover).toBe("This project is in collaboration with Wonder Studios.");
  });

  it("finds the end of the hook's sentence past full stops inside quotes", () => {
    expect(
      openWithHook(
        "Google India just launched the 'Samjhe. Samjhaaye. Raah dikhaye.' campaign in Mumbai. It is about AI Mode.",
        "Google India just launched the 'Samjhe. Samjhaaye. Raah dikhaye.' campaign.",
        "Google India is using AI to help you navigate life's big decisions.",
        " ",
      ),
    ).toBe(
      "Google India is using AI to help you navigate life's big decisions. It is about AI Mode.",
    );
  });

  it("swaps the first spoken line of a reaction, not the creator's silent clip", () => {
    const reel = withChosenHook(
      idea({
        format: "reel",
        hook: "That’s an interesting claim, but it oversimplifies the real magic behind successful advertising.",
        chosenHook: "Not all great ads stick to patterns, some break them to stand out.",
        shots: [
          shot(""),
          shot(
            "That’s an interesting claim, but it oversimplifies the real magic behind successful advertising.",
          ),
        ],
      }),
    );
    expect(reel.shots[0]!.voiceover).toBe("");
    expect(reel.shots[1]!.voiceover).toBe(
      "Not all great ads stick to patterns, some break them to stand out.",
    );
  });

  it("leaves the script alone when A is chosen, nothing is chosen, or it already opens with the choice", () => {
    const base = idea({ format: "reel", hook: "A line.", shots: [shot("A line. Then more.")] });
    expect(withChosenHook(base)).toBe(base);
    const choseA = { ...base, chosenHook: "A line." };
    expect(withChosenHook(choseA)).toBe(choseA);
    expect(
      withChosenHook({ ...base, chosenHook: "B line.", shots: [shot("B line. Then more.")] })
        .shots[0]!.voiceover,
    ).toBe("B line. Then more.");
  });
});
