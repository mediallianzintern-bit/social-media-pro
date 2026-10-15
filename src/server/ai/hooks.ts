// "Get more hooks" — three more opening lines for a script that already
// exists, in a style the team picks: authority, curiosity or question.
//
// A script comes with three openings. When none of them is right, the fix is
// not a new script: the body is fine, only the first line is wrong. So this is
// a small request (the finished script plus Pritesh's own prompt) on the
// stronger review model, and the hooks it returns are saved onto the idea so
// the existing picker can offer them and record which one was filmed.
import { z } from "zod";

import type { ContentIdea, HookStyle } from "@/lib/ai-types";
import { voiceFlags } from "@/lib/voice-check";

import { completeJson, hasOpenAi } from "./client";
import { reviewModel } from "./review";
import { INSTAGRAM_MASTER_PROMPT } from "./voice";
import { addIdeaHooks } from "../store";

/** How many hooks one press asks for. */
const PER_REQUEST = 3;

/** The picker labels hooks A to L; past that there is nothing to pick them by. */
const MAX_HOOKS = 12;

/**
 * What each style means, in terms of Pritesh's own brief — which allows an
 * opening built on "a recognisable problem, a useful insight, a specific
 * example or an honest question", and forbids exaggeration and engagement bait.
 * Each definition says what it is AND the cheap version of it that is ruled out.
 */
const STYLE_BRIEF: Record<HookStyle, string> = {
  authority:
    'AUTHORITY: open with a VERDICT, not a description. State a position a marketer could disagree with: what most brands get wrong here, why this worked when most attempts fail, or the one decision that made the difference. Shape, not content: "Most brands would have spent this budget on ads. This was smarter." A line that only says what happened ("X launched a campaign that went viral") is a description and fails. Sound sure, not superior. Use "I" only if the script itself does, and never invent an experience, a client or a result to sound credible.',
  curiosity:
    'CURIOSITY: open on the most surprising TRUE detail in this script, stated as a plain fact, and hold back the how or the why so the viewer stays for the answer the script gives. Shape: "This brand gave its product away to the people least likely to buy it." Name the subject; no vague "this one thing". Never exaggerate, never promise more than the script delivers.',
  question:
    'QUESTION: open with ONE specific question a marketer would genuinely ask about this, which the script then answers. Shape: "Why would a film studio pay for ads that never show the film?" It names the subject and cannot be answered with yes or no. Never "did you know", never "have you ever wondered", never engagement bait like "agree?".',
};

/**
 * Stock phrases that make a hook sound like every other reel. A hook that
 * uses one is dropped rather than shown: they carry no point of view, which
 * is the one thing a hook has to have.
 */
const CLICHES =
  /\b(next level|raised? the bar|masterclass|genius|game on|broke the internet|nailed it|level up|crushed it|took (it|things) up a notch|blew (everyone|us) away|mind[- ]?blowing|insane|wild)\b/i;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["hooks"],
  properties: {
    hooks: {
      type: "array",
      items: { type: "string" },
      description: `Exactly ${PER_REQUEST} opening lines, each a single spoken sentence of at most 14 words.`,
    },
  },
} as const;

const parsed = z.object({ hooks: z.array(z.string()) });

/** The script as the writer of a new first line needs to see it. */
function scriptText(idea: ContentIdea): string {
  const spoken = (idea.shots ?? [])
    .map((shot) => shot.voiceover?.trim())
    .filter(Boolean)
    .join("\n");
  const beats = idea.reaction?.beats?.map((beat) => beat.line).join("\n");
  return spoken || beats || idea.post?.body || idea.angle;
}

/**
 * Writes three more hooks in one style and saves them onto the idea.
 *
 * One model call. Hooks that break a hard voice rule (a banned phrase, an
 * emoji, a dash), repeat one already offered, or run long are dropped rather
 * than shown, and the result says how many survived, so the team is never
 * handed a hook it would have to fix before filming.
 */
export async function moreHooks(
  idea: ContentIdea,
  style: HookStyle,
): Promise<{ idea: ContentIdea | null; added: number; reason?: string }> {
  if (!hasOpenAi()) return { idea: null, added: 0, reason: "OPENAI_API_KEY is not set." };

  const existing = [idea.hook, ...(idea.altHooks ?? [])].filter(Boolean);
  if (existing.length >= MAX_HOOKS) {
    return {
      idea: null,
      added: 0,
      reason: `This script already has ${MAX_HOOKS} hooks to choose from.`,
    };
  }

  const reaction = idea.reaction
    ? `\nThis is a REACTION reel. It opens on a borrowed clip that claims: "${idea.reaction.claim}". The expert's first line pivots off that claim — it answers it, it does not repeat it.`
    : "";

  const system = `${INSTAGRAM_MASTER_PROMPT}

YOUR TASK NOW is narrower than the brief above. The script below is finished and
approved. Write only new OPENING LINES for it: each must be a line Pritesh says
first, on camera, that leads naturally into the rest of the script as written.`;

  const user = `${STYLE_BRIEF[style]}

Rules for every line:
- One spoken sentence, at most 14 words. Short enough to say in the first three seconds.
- It must fit THIS script: the line after it, as written, still follows naturally.
- Different from every opening already offered below, and from each other.
- No emoji, no dashes, no exclamation marks, no hype words, no promise of a guide or link.
- No stock phrases: "next level", "raised the bar", "masterclass", "genius", "wild", "insane".${reaction}

Title: ${idea.title}
Openings already offered (do not repeat or reword these):
${existing.map((hook) => `- ${hook}`).join("\n")}

The script:
${scriptText(idea)}`;

  const result = await completeJson<unknown>({
    system,
    user,
    schemaName: "more_hooks",
    schema: schema as unknown as Record<string, unknown>,
    model: reviewModel(),
    temperature: 0.8,
    effort: "medium",
    timeoutMs: 120_000,
  });
  const reply = parsed.safeParse(result.data);
  if (!reply.success) return { idea: null, added: 0, reason: "The reply could not be read." };

  const seen = new Set(existing.map((hook) => hook.trim().toLowerCase()));
  const clean = reply.data.hooks
    .map((hook) =>
      hook
        .trim()
        .replace(/^["“”']+|["“”']+$/g, "")
        .trim(),
    )
    .filter((hook) => {
      if (!hook || seen.has(hook.toLowerCase())) return false;
      if (hook.split(/\s+/).length > 18) return false;
      if (CLICHES.test(hook)) return false;
      // The same checks the script itself is held to, applied to the line alone.
      const probe = {
        ...idea,
        hook,
        altHooks: [],
        caption: "",
        post: undefined,
        shots: [
          { mark: "", shotType: "", visual: "", voiceover: hook, onScreenText: "", transition: "" },
        ],
      } as unknown as ContentIdea;
      if (voiceFlags(probe).some((flag) => !/words of voice over/.test(flag))) return false;
      seen.add(hook.toLowerCase());
      return true;
    })
    .slice(0, Math.min(PER_REQUEST, MAX_HOOKS - existing.length));

  if (!clean.length) {
    return {
      idea: null,
      added: 0,
      reason: "None of the new hooks passed the voice checks. Try again or pick another style.",
    };
  }

  const updated = await addIdeaHooks(idea.id, clean, style);
  if (!updated) {
    return {
      idea: null,
      added: 0,
      reason: "This idea is not stored yet, so new hooks cannot be saved to it.",
    };
  }
  return { idea: updated, added: clean.length };
}
