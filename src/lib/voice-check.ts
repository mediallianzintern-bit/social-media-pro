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

/** Phrases banned outright by the voice document. Matched case-insensitively. */
const BANNED_PHRASES = [
  "in today's fast-paced world",
  "in a world where",
  "in an era of",
  "let's dive in",
  "let's unpack",
  "imagine if",
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
    pattern: /\b(it'?s|it is|this is|that'?s|that is) not just\b[^.!?]{1,80}?\b(it'?s|it is)\b/i,
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
 * The SOP's spoken length, in words (§6). A range, not a target: the document
 * says natural pacing matters more than the arithmetic, so the flag fires only
 * outside it and says what it means in seconds rather than quoting a number.
 */
const MIN_WORDS = 110;
const MAX_WORDS = 135;

/** "Agree?" only counts as the influencer tic when it stands alone as a question. */
const AGREE = /(^|[\s.!])agree\?/i;

/** Only the words actually SPOKEN — what §6's word count and §12's dash rule govern. */
function voiceoverText(idea: ContentIdea): string {
  const spoken = (idea.shots ?? []).map((shot) => shot.voiceover ?? "").filter(Boolean);
  // Before a shot list exists there is only the hook, which is the first line
  // of the voiceover. Counting that alone against 110-135 words would flag
  // every idea as far too short, so the count is skipped instead.
  return spoken.join(" ");
}

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Dashes used as punctuation. A hyphen inside a word ("short-form") is not one. */
const PUNCTUATION_DASH = /[—–]|\s-{1,2}\s/;

/** Everything in an idea that will be spoken aloud or read on screen. */
function spokenText(idea: ContentIdea): string {
  return (
    [
      idea.chosenHook ?? "",
      idea.hook,
      ...(idea.altHooks ?? []),
      ...(idea.shots ?? []).flatMap((shot) => [shot.voiceover ?? "", shot.onScreenText ?? ""]),
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
export function voiceFlags(idea: ContentIdea): string[] {
  const text = spokenText(idea);
  const lower = text.toLowerCase();
  const flags: string[] = [];

  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) flags.push(`uses “${phrase}”`);
  }
  if (AGREE.test(text)) flags.push("uses “Agree?”");
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

  // §6 — 110-135 words is 45-60 seconds spoken. Only once a shot list exists,
  // and only for a filmed format: a LinkedIn post has no spoken length.
  if (voiceover && !idea.post) {
    const count = words(voiceover);
    if (count < MIN_WORDS) flags.push(`only ${count} words of voice over — under about 45 seconds`);
    else if (count > MAX_WORDS)
      flags.push(`${count} words of voice over — likely to run past 60 seconds`);
  }

  return flags;
}
