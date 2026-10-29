// "Get more hooks" — three more opening lines for a script that already
// exists, in a style the team picks: authority, curiosity or question.
//
// LinkedIn posts and articles too (Oct 2026). There the hook is the post's
// first line, all LinkedIn shows above "see more", so the writer gets his
// LinkedIn voice prompt instead of the reel brief, and his own best and
// weakest first lines with the impressions LinkedIn measured for each.
//
// A script comes with three openings. When none of them is right, the fix is
// not a new script: the body is fine, only the first line is wrong. So this is
// a small request (the finished script plus Pritesh's own prompt) on the
// stronger review model, and the hooks it returns are saved onto the idea so
// the existing picker can offer them and record which one was filmed.
import { z } from "zod";

import type { ContentIdea, HookStyle } from "@/lib/ai-types";
import { hookIssue } from "@/lib/hook-check";
import { voiceFlags } from "@/lib/voice-check";
import { hookTypeOf } from "@/lib/reel-parts";
import { NO_RULES } from "@/lib/reel-learning-types";

import { completeJson, hasOpenAi } from "./client";
import { reviewModel } from "./review";
import { INSTAGRAM_MASTER_PROMPT, LINKEDIN_VOICE } from "./voice";
import { addIdeaHooks, readPosts } from "../store";
import { OWNER_ACCOUNTS } from "../apify/accounts";
import { learnedRules } from "../reel-learning/lessons";

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
 * The same three styles for a LinkedIn post's first line, each with the shape
 * taken from his own LinkedIn openings.
 */
const LINKEDIN_STYLE_BRIEF: Record<HookStyle, string> = {
  authority:
    'AUTHORITY: open with a clear POSITION on the subject, stated plainly, that a marketer or business owner could disagree with. Shape, from his own posts: "Meta is moving beyond AI that creates ads." / "AI has made content creation cheaper. It hasn\'t made good content easier." A line that only reports what happened is a description and fails. Sure, never superior. Use "I" only where the post itself does, and never invent an experience, a client or a result to sound credible.',
  curiosity:
    'CURIOSITY: open on the most surprising TRUE fact in the post, with its brand, tool or figure named, and hold back the why so the reader clicks "see more". Shape, from his best posts: "McDonald\'s wants to make $1 billion from advertising." / "AI just uncovered a security flaw that could put 70% of the world\'s websites at risk." Never exaggerate, never promise more than the post delivers.',
  question:
    'QUESTION: open with ONE specific question a business owner or marketer would genuinely ask about the subject, which the post then answers. Shape, from his posts: "What happens when AI starts finding security weaknesses faster than businesses can fix them?" / "Are Businesses Missing Out by Ignoring Google\'s Gemini 4 Argon?" It names the subject. Never "did you know", never "have you ever wondered", never "What do you think about AI?".',
};

/** How many of his best and weakest first lines the LinkedIn writer is shown. */
const OPENINGS_SHOWN = 5;
/**
 * A post younger than this is still gathering impressions, and would read as
 * weak only because it is new.
 */
const SETTLED_DAYS = 7;

/** The first sentence of a stored caption: his post's opening line. */
function firstLine(caption: string): string {
  const text = caption.trim();
  return (text.match(/^.{12,200}?[.?!](?=\s|$)/)?.[0] ?? text.slice(0, 160)).trim();
}

/**
 * His LinkedIn opening lines that LinkedIn showed most and least, with the
 * impressions it measured. Free: stored rows. Empty without LinkedIn connected.
 */
async function linkedInOpenings(): Promise<string> {
  const { readLinkedInAnalytics } = await import("../linkedin-analytics");
  const [stored, posts] = await Promise.all([
    readLinkedInAnalytics(),
    readPosts("linkedin", OWNER_ACCOUNTS.linkedin.handle, 200),
  ]);
  const impressions = new Map(stored.posts.map((row) => [row.postId, row.impressions]));
  const settled = Date.now() - SETTLED_DAYS * 86_400_000;
  const measured = posts
    .filter(
      (post) => !post.pinned && post.caption.trim() && Date.parse(post.publishedAt) <= settled,
    )
    .map((post) => ({ line: firstLine(post.caption), seen: impressions.get(post.postId) }))
    .filter((row): row is { line: string; seen: number } => row.seen != null)
    .sort((a, b) => b.seen - a.seen);
  if (measured.length < OPENINGS_SHOWN * 2) return "";
  const list = (rows: typeof measured) =>
    rows.map((row) => `- "${row.line}" (${row.seen} impressions)`).join("\n");
  return `HIS OWN LINKEDIN FIRST LINES, as LinkedIn measured them. Aim at what the best share; avoid what the weakest share. Never copy one.
Best:
${list(measured.slice(0, OPENINGS_SHOWN))}
Weakest:
${list(measured.slice(-OPENINGS_SHOWN).reverse())}`;
}

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
      description: `Exactly ${PER_REQUEST} opening lines, each as short as the rules below say.`,
    },
  },
} as const;

const parsed = z.object({ hooks: z.array(z.string()) });

/** The script as the writer of a new first line needs to see it. */
function scriptText(idea: ContentIdea): string {
  if (idea.post) {
    const sections = (idea.post.sections ?? []).map((section) => section.heading).filter(Boolean);
    return [idea.post.body, ...(sections.length ? ["Sections:", ...sections] : [])].join("\n");
  }
  const spoken = (idea.shots ?? [])
    .map((shot) => shot.voiceover?.trim())
    .filter(Boolean)
    .join("\n");
  const beats = idea.reaction?.beats?.map((beat) => beat.line).join("\n");
  return spoken || beats || idea.angle;
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
  // A LinkedIn post or article: its first line, not a spoken hook.
  const written = Boolean(idea.post);
  // What filmed reels have proved: losing hook types are dropped below, and
  // hypothetical openers are allowed again once they have proved they work.
  // Filmed reels are Instagram's; they say nothing about a LinkedIn post.
  const rules = written ? NO_RULES : await learnedRules("instagram").catch(() => NO_RULES);
  const allowHypothetical = Boolean(rules.allowHypotheticalHooks);
  if (existing.length >= MAX_HOOKS) {
    return {
      idea: null,
      added: 0,
      reason: `This ${written ? "post" : "script"} already has ${MAX_HOOKS} hooks to choose from.`,
    };
  }

  const reaction = idea.reaction
    ? `\nThis is a REACTION reel. It opens on a borrowed clip that claims: "${idea.reaction.claim}". The expert's first line pivots off that claim — it answers it, it does not repeat it.`
    : "";

  const openings = written ? await linkedInOpenings().catch(() => "") : "";
  const system = written
    ? `${LINKEDIN_VOICE}

YOUR TASK NOW is narrower than the voice above. The LinkedIn ${idea.format === "article" ? "article" : "post"} below is
finished and approved. Write only new FIRST LINES for it: the line LinkedIn shows above "see
more", which decides whether anyone reads on. Each must lead naturally into the rest of the
${idea.format === "article" ? "article" : "post"} as written.`
    : `${INSTAGRAM_MASTER_PROMPT}

YOUR TASK NOW is narrower than the brief above. The script below is finished and
approved. Write only new OPENING LINES for it: each must be a line Pritesh says
first, on camera, that leads naturally into the rest of the script as written.`;

  const rulesFor = written
    ? `Rules for every line:
- One or two short sentences, at most 22 words in all: what fits above "see more".
- It must fit THIS post: the line after it, as written, still follows naturally.
- It NAMES the brand, tool, platform or figure the post is about. That is what separates his best
  first lines from his weakest. Never open on a general principle or on a hypothetical ("Imagine…",
  "Let's say…", "What if…", "Picture…"): those come later in the post.
- Different from every opening already offered below, and from each other.
- No emoji, no dashes, no exclamation marks, no hype words ("game-changer", "revolutionary",
  "the possibilities are endless"), no "Agree?" or "Thoughts?".${openings ? `\n\n${openings}` : ""}`
    : `Rules for every line:
- One spoken sentence, at most 14 words. Short enough to say in the first three seconds.
- It must fit THIS script: the line after it, as written, still follows naturally.
- It is ABOUT the script's subject and names it: the tool, brand, campaign or development. Never open on the everyday example or a hypothetical ("Imagine…", "Let's say…", "What if…", "Picture…").
- Different from every opening already offered below, and from each other.
- No emoji, no dashes, no exclamation marks, no hype words, no promise of a guide or link.
- No stock phrases: "next level", "raised the bar", "masterclass", "genius", "wild", "insane".`;

  const user = `${(written ? LINKEDIN_STYLE_BRIEF : STYLE_BRIEF)[style]}

${rulesFor}${reaction}

Title: ${idea.title}
Openings already offered (do not repeat or reword these):
${existing.map((hook) => `- ${hook}`).join("\n")}

The ${written ? (idea.format === "article" ? "article" : "post") : "script"}:
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
      if (hook.split(/\s+/).length > (written ? 26 : 18)) return false;
      if (CLICHES.test(hook)) return false;
      if (hookIssue(hook, `${idea.title} ${idea.angle}`, { allowHypothetical })) return false;
      // A kind of hook filmed reels proved losing is not offered again.
      if (rules.blockedHookTypes.some((rule) => rule.type === hookTypeOf(hook))) return false;
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
      if (
        voiceFlags(probe, { allowHypotheticalHooks: allowHypothetical }).some(
          (flag) => !/words of voice over/.test(flag),
        )
      )
        return false;
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
