// Checking a script against the hard rules of Pritesh Sir's voice.
//
// The voice document has two kinds of rule. Most are judgement — "explain,
// don't perform", "have a point of view" — and only a person can hold a script
// to those. But some are lists: phrases that must never appear. A list can be
// checked by code, and should be, because a list is exactly what a model
// drifts back to. "Leverage" and "it's not just X, it's Y" are the defaults it
// returns to under pressure, whatever the prompt said.
//
// So the prompt asks, and this checks. A flag is shown on the idea for the
// team to fix before filming; the idea is never dropped, because one stray
// word is a thirty-second edit and regenerating would cost a model call.
//
// Only the words someone will SAY or READ are checked — the hook, the
// voiceover, on-screen text, caption and post copy. Production notes are not:
// "landscape" there is an aspect ratio, not a buzzword.
//
// Client-safe. No model call. See docs/pritesh-voice.md.
import type { ContentIdea } from "@/lib/ai-types";
import { hookIssue } from "@/lib/hook-check";
import { isAiToolWorkflowLane, isWorkflowCta, workflowCtaIssue } from "@/lib/tool-workflow";
import { REEL_MAX_SECONDS, REEL_MIN_SECONDS, REEL_WORDS } from "@/lib/reel-length";

/** Phrases banned outright by the voice document. Matched case-insensitively. */
const BANNED_PHRASES = [
  "in today's fast-paced world",
  "in a world where",
  "in an era of",
  "let's dive in",
  "let's unpack",
  // "Imagine…" is NOT here: Pritesh's October 2026 brief asks for it, to mark a
  // hypothetical example as one.
  "picture this",
  "here's the thing",
  "the bottom line is",
  "at the end of the day",
  "secret sauce",
  "massive opportunity",
  "the future is here",
  "you can't afford to ignore this",
  "let that sink in",
  "read that again",
  "think about that",
  "who's with me",
  "drop your thoughts below",
  "i'm all ears",
  "here's your sign",
  // The SOP's own list of AI-sounding formulas (§13) and generic hooks (§10).
  "this changed everything",
  "and that's where things got interesting",
  "what happened next shocked everyone",
  "the internet went crazy",
  "have you ever wondered",
  "today i am going to show you",
  "today i'm going to show you",
  "ai is changing the world",
  // Pritesh's October 2026 reel brief.
  "you won't believe this",
  "today i am going to talk about",
  "today i'm going to talk about",
  // His LinkedIn voice prompt's "Avoid AI hype" list (Oct 2026), and the weak
  // question it names.
  "ai is changing everything",
  "this will completely transform your business",
  "you cannot afford to ignore ai",
  "you can't afford to ignore ai",
  "the possibilities are endless",
  "the future of everything",
  "what do you think about ai?",
  // The team's Tone brief (30 Oct 2026): stock phrases that make a reel
  // sound like a template or a news read.
  "here's what i find smart",
  "in today's digital world",
];

/**
 * Single words banned by the document, with the inflections it plainly means.
 *
 * Each is a whole-word pattern rather than a substring, so "transform" does not
 * flag "transformer" — the architecture every AI explainer has to name. A word
 * used literally ("unlock the door") will still be flagged; that is accepted,
 * because a flag asks someone to look, it does not change the script.
 */
const BANNED_WORDS: Array<{ word: string; pattern: RegExp }> = [
  { word: "game-changer", pattern: /\bgame[- ]?changers?\b|\bgame[- ]?changing\b/i },
  { word: "revolutionary", pattern: /\brevolutionar(y|ise|ize|ised|ized)\b/i },
  { word: "groundbreaking", pattern: /\bground[- ]?breaking\b/i },
  { word: "reshaping", pattern: /\breshap(e|es|ed|ing)\b/i },
  { word: "redefining", pattern: /\bredefin(e|es|ed|ing)\b/i },
  { word: "seamless", pattern: /\bseamless(ly)?\b/i },
  { word: "leverage", pattern: /\bleverag(e|es|ed|ing)\b/i },
  { word: "harness", pattern: /\bharness(es|ed|ing)?\b/i },
  { word: "unlock", pattern: /\bunlock(s|ed|ing)?\b/i },
  { word: "elevate", pattern: /\belevat(e|es|ed|ing)\b/i },
  { word: "empower", pattern: /\bempower(s|ed|ing|ment)?\b/i },
  { word: "transform", pattern: /\btransform(s|ed|ing|ative|ation|ations)?\b/i },
  { word: "landscape", pattern: /\blandscapes?\b/i },
  { word: "realm", pattern: /\brealms?\b/i },
  { word: "delve", pattern: /\bdelv(e|es|ed|ing)\b/i },
];

/** The two sentence formulas the document names, plus its fabrication example. */
const BANNED_SHAPES: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "the “it's not just X, it's Y” formula",
    // Both halves of the subject, same as the opener below: "this isn't just
    // marketing, it's positioning" is the identical formula and was slipping
    // past a pattern that only knew "is not".
    pattern:
      /\b(?:(?:it'?s|it is|this is|that'?s|that is)\s+not|(?:it|this|that)\s+isn'?t)\s+just\b[^.!?]{1,80}?\b(?:it'?s|it is)\b/i,
  },
  {
    // The same formula with its second half left off — "It's not just about
    // one tool being the best", which a reaction script's alternative hook
    // came back with. The ban is on the shape, and the shape is the opening:
    // waiting for the "it's Y" to arrive lets the tell through whenever the
    // sentence simply stops. Reported separately from the full formula, and
    // only when the completion is absent, so one sentence never flags twice.
    label: "the “not just …” opener — the formula's first half",
    pattern:
      /\b(?:(?:it'?s|it is|this is|that'?s|that is)\s+not|(?:it|this|that)\s+isn'?t)\s+just\b(?![^.!?]{0,80}?\b(?:it'?s|it is)\b)/i,
  },
  {
    label: "the “this isn't about X, it's about Y” formula",
    pattern: /\b(this|it) (isn'?t|is not) about\b[^.!?]{1,80}?\b(it'?s|it is) about\b/i,
  },
  {
    // The document's own example of a fabricated story. Flagged rather than
    // banned: it may be true, and only the team knows whether it happened.
    label: "a client conversation — check it really happened",
    pattern:
      /\b(i (recently )?(spoke|talked|was talking) (to|with) a client|a client (of mine|told me|asked me)|one of my clients)\b/i,
  },
];

/**
 * The spoken length, in words, from Pritesh's October 2026 reel brief: aim for
 * 90-110, never more than 115, under a minute. It replaced the SOP's 110-135.
 * The flag fires only outside the range and says what it means in seconds.
 */
// The team's length, not his brief's 90-115 (lib/reel-length.ts).
const MIN_WORDS = REEL_WORDS.min;
const MAX_WORDS = REEL_WORDS.max;

/** "Agree?" and "Thoughts?" only count as engagement bait standing alone as a question. */
const AGREE = /(^|[\s.!])agree\?/i;
const THOUGHTS = /(^|[\s.!])thoughts\?/i;

/** Emoji, which the brief bans from everything spoken or shown. */
const EMOJI = /\p{Extended_Pictographic}/u;

/** His LinkedIn posts end "♻️ Repost to help …": that one emoji is his, not a slip. */
const REPOST_EMOJI = /♻️?\s*(?=repost\b)/giu;

/**
 * A LinkedIn post's length, read from his own posts (linkedin-shapes.ts): a
 * full post runs 150-300 words, a teaser for his article 75-125.
 */
const POST_WORDS = { min: 150, max: 300 };
const TEASER_WORDS = { min: 75, max: 125 };
const POINTS_TO_ARTICLE = /\b(article|read the full|full breakdown)\b/i;

/**
 * A promised guide, resource or link. The brief allows one only once it is
 * confirmed to exist, which the system cannot know, so it is flagged for the
 * team to confirm or cut rather than banned.
 */
const PROMISED_RESOURCE =
  /\b(comment|dm|message)\b[^.!?]{0,60}\b(i'?ll|i will|we'?ll|we will)\s+send\b|\blink in (my |the )?bio\b|\b(free|full) (guide|template|checklist|playbook)\b/i;

/**
 * A LinkedIn text post's length against his own: 150-300 words for a post,
 * 75-125 for a teaser pointing to his article. Null for an empty body.
 */
export function linkedInLength(body: string): {
  count: number;
  min: number;
  max: number;
  kind: "a post" | "an article teaser";
  ok: boolean;
} | null {
  if (!body.trim()) return null;
  const range = POINTS_TO_ARTICLE.test(body) ? TEASER_WORDS : POST_WORDS;
  const count = words(body);
  return {
    count,
    ...range,
    kind: range === TEASER_WORDS ? "an article teaser" : "a post",
    ok: count >= range.min && count <= range.max,
  };
}

/** Only the words actually SPOKEN — what §6's word count and §12's dash rule govern. */
function voiceoverText(idea: ContentIdea): string {
  const spoken = (idea.shots ?? []).map((shot) => shot.voiceover ?? "").filter(Boolean);
  // Before a shot list exists there is only the hook, which is the first line
  // of the voiceover. Counting that alone against 110-135 words would flag
  // every idea as far too short, so the count is skipped instead.
  return spoken.join(" ");
}

/** Spoken words only: bracketed notes for the team ("[verify: …]") are never said aloud. */
const words = (text: string) =>
  text
    .replace(/\[[^\]]*\]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

/** Dashes used as punctuation. A hyphen inside a word ("short-form") is not one. */
const PUNCTUATION_DASH = /[—–]|\s-{1,2}\s/;

/**
 * Everything in an idea that will be spoken aloud or read on screen.
 *
 * The credit overlay is deliberately excluded. On a reaction reel the system
 * writes it itself, as "🎥 @handle on Instagram" — a crediting convention the
 * format requires, not the model reaching for an emoji. Counting it flagged
 * every reaction script for an emoji nobody had a choice about, which teaches
 * the team to ignore the flags.
 */
function spokenText(idea: ContentIdea): string {
  const credit = idea.reaction?.creditOverlayText?.trim();
  const withoutCredit = (text: string) =>
    credit && text.includes(credit) ? text.split(credit).join(" ") : text;
  return (
    [
      idea.chosenHook ?? "",
      idea.hook,
      ...(idea.altHooks ?? []),
      ...(idea.shots ?? []).flatMap((shot) => [
        shot.voiceover ?? "",
        withoutCredit(shot.onScreenText ?? ""),
      ]),
      idea.caption ?? "",
      idea.post?.body ?? "",
      ...(idea.post?.sections ?? []).flatMap((section) => [section.heading, section.text]),
    ]
      .join("\n")
      // Curly apostrophes are what the model usually writes, and "Let’s dive in"
      // must match the same as "Let's dive in".
      .replace(/[‘’]/g, "'")
  );
}

/**
 * The hard voice rules this idea breaks, as short readable labels.
 *
 * Empty when it breaks none. Each phrase is reported once however many times
 * it appears — the point is what to fix, not a count.
 */
export function voiceFlags(
  idea: ContentIdea,
  /** Lifted when filmed reels prove hypothetical openers work. */
  options: { allowHypotheticalHooks?: boolean } = {},
): string[] {
  const text = spokenText(idea);
  const lower = text.toLowerCase();
  const flags: string[] = [];

  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) flags.push(`uses “${phrase}”`);
  }
  if (AGREE.test(text)) flags.push("uses “Agree?”");
  if (THOUGHTS.test(text)) flags.push("uses “Thoughts?”");
  if (EMOJI.test(idea.post ? text.replace(REPOST_EMOJI, "") : text)) flags.push("uses an emoji");
  for (const { word, pattern } of BANNED_WORDS) {
    if (pattern.test(text)) flags.push(`uses “${word}”`);
  }
  for (const { label, pattern } of BANNED_SHAPES) {
    if (pattern.test(text)) flags.push(label);
  }

  // §12 — no dashes in the voice over. Checked on the spoken words only: a
  // dash in a caption is fine, and "0:00–0:04" in a shot's mark is a range.
  const voiceover = voiceoverText(idea).replace(/[‘’]/g, "'");
  if (voiceover && PUNCTUATION_DASH.test(voiceover)) {
    flags.push("uses a dash in the voice over — write the sentence out instead");
  }

  // An exclamation mark is hype in punctuation: "It's wild!" was offered as a
  // hook. Checked on what is said and shown in the reel, not the caption.
  const performed = [
    idea.chosenHook ?? "",
    idea.hook,
    ...(idea.altHooks ?? []),
    ...(idea.shots ?? []).flatMap((shot) => [shot.voiceover ?? "", shot.onScreenText ?? ""]),
  ].join("\n");
  if (performed.includes("!")) {
    flags.push("uses an exclamation mark — say it calmly instead");
  }

  // Every hook opens on what the reel is about, in every lane.
  const subject = `${idea.title ?? ""} ${idea.angle ?? ""}`;
  const hooks = [...new Set([idea.hook, ...(idea.altHooks ?? [])].filter(Boolean))];
  if (
    hooks.some((hook) =>
      hookIssue(hook, subject, { allowHypothetical: Boolean(options.allowHypotheticalHooks) }),
    )
  ) {
    flags.push(
      "a hook opens on a hypothetical or never names the subject; open on what the reel is about",
    );
  }

  // An AI tool workflow reel ends on the comment CTA the team asked for.
  if (voiceover && !idea.post && isAiToolWorkflowLane(idea.contentLane)) {
    const issue = workflowCtaIssue(
      idea.shots?.at(-1)?.voiceover ?? "",
      `${idea.title ?? ""} ${idea.angle ?? ""}`,
    );
    if (issue) flags.push(issue.replace(/^the closing line/, "the CTA"));
  }

  // The workflow lane's comment CTA promises a guide on purpose: the team
  // sends it. Anything else that promises a resource is still flagged.
  const promises = isAiToolWorkflowLane(idea.contentLane)
    ? (idea.shots ?? [])
        .map((shot) => shot.voiceover ?? "")
        .filter((line) => !isWorkflowCta(line))
        .join(" ")
    : voiceover;
  if (promises && PROMISED_RESOURCE.test(promises)) {
    flags.push("promises a guide, link or resource — keep it only if it exists");
  }

  // 90-115 words is a relaxed 45-55 seconds spoken. Only once a shot list
  // exists, and only for a filmed format: a LinkedIn post has no spoken length.
  if (voiceover && !idea.post) {
    const count = words(voiceover);
    if (count < MIN_WORDS)
      flags.push(
        `only ${count} words of voice over — under ${MIN_WORDS}, about ${REEL_MIN_SECONDS} seconds`,
      );
    else if (count > MAX_WORDS)
      flags.push(
        `${count} words of voice over — over ${MAX_WORDS}, likely to run past ${REEL_MAX_SECONDS} seconds`,
      );
  }

  // A LinkedIn text post: the length his own posts run to.
  if (idea.post && idea.format === "text_post") {
    const length = linkedInLength(idea.post.body);
    if (length && !length.ok) {
      flags.push(
        `${length.count} words: ${length.kind} of his runs ${length.min} to ${length.max}`,
      );
    }
  }

  return flags;
}
