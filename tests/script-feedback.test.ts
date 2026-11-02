// The team's approvals and rejections of scripts, as the writer reads them.
import { describe, expect, it } from "vitest";

import type { ContentIdea } from "@/lib/ai-types";
import { scriptFeedbackBlock, scriptText, type ScriptVerdict } from "@/lib/script-feedback";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const verdict = (patch: Partial<ScriptVerdict>): ScriptVerdict => ({
  platform: "linkedin",
  ideaId: "i",
  verdict: "approve",
  reasons: [],
  note: null,
  script: "",
  hook: null,
  title: null,
  lane: null,
  actor: null,
  createdAt: "2026-11-01T12:00:00Z",
  ...patch,
});

describe("script feedback", () => {
  it("is empty until something has been judged", () => {
    expect(scriptFeedbackBlock([], NOW)).toBe("");
  });

  it("quotes the newest approved scripts as voice and shape only", () => {
    const block = scriptFeedbackBlock(
      [
        verdict({ script: "Oldest approved.", createdAt: "2026-10-01T00:00:00Z" }),
        verdict({ script: "Newest approved.", lane: "AI risks and security" }),
        verdict({ script: "Middle approved.", createdAt: "2026-10-20T00:00:00Z" }),
      ],
      NOW,
    );
    expect(block).toContain("HOW HE SOUNDS AND HOW THE SCRIPT IS BUILT ONLY");
    expect(block).toContain("never use a fact, name or figure from them");
    expect(block).toContain('APPROVED 1 (AI risks and security):\n"""\nNewest approved.');
    expect(block).toContain("Middle approved.");
    expect(block).not.toContain("Oldest approved.");
  });

  it("counts rejections by reason, most often first, with what to do instead", () => {
    const block = scriptFeedbackBlock(
      [
        verdict({
          verdict: "reject",
          reasons: ["news", "facts"],
          hook: "Xsolla has acquired Gamepix.",
        }),
        verdict({
          verdict: "reject",
          reasons: ["news"],
          note: "Say what it means for brands.",
          title: "Apple Creator Studio",
        }),
        verdict({ verdict: "reject", reasons: ["length"], createdAt: "2026-08-01T00:00:00Z" }),
      ],
      NOW,
    );
    expect(block).toContain("SCRIPTS THE TEAM REJECTED in the last 60 days: 2.");
    expect(block.indexOf("Reads like news, not his view (2 scripts)")).toBeLessThan(
      block.indexOf("Too many facts or figures (1 script)"),
    );
    // Older than 60 days: no longer steering the writer.
    expect(block).not.toContain("Wrong length");
    expect(block).toContain('On "Apple Creator Studio": Say what it means for brands.');
    expect(block).toContain('- "Xsolla has acquired Gamepix."');
  });

  it("keeps the script as judged, opening with the chosen hook", () => {
    const idea = {
      title: "t",
      hook: "Elon Musk has raised a concern.",
      chosenHook: "Could AI agents hack crypto?",
      altHooks: [],
      shots: [],
      hashtags: [],
      post: { body: "Elon Musk has raised a concern.\n\nWhy it matters.", sections: [] },
    } as unknown as ContentIdea;
    expect(scriptText(idea)).toBe(
      "Could AI agents hack crypto?\n\nElon Musk has raised a concern.\n\nWhy it matters.",
    );
  });
});
