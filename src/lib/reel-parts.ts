// A reel broken into its parts, and the measures the learning loop groups by.
//
// The loop has to learn more than "the script was used or not": which kind of
// hook holds people, what shape of main body keeps them, which ending gets a
// response, how long the reel should run, and what caption and hashtags go
// with reels that work. So both our script and the posted reel are split into
// the same three parts (hook, main body, CTA), and each is described with
// measures computed here, in code, from the text: never estimated by a model.
//
// Pure and client-safe.
import type { ContentIdea } from "@/lib/ai-types";
import { HYPOTHETICAL_OPENER } from "@/lib/hook-check";
import { closingLineFor, DAILY_CTA } from "@/lib/script-families";
import { isAiToolWorkflowLane, isWorkflowCta } from "@/lib/tool-workflow";
import { hashtagsIn, orderedOverlap, words } from "@/lib/reel-match";

/** The kinds of opening the code can tell apart, so a rule about them can be enforced. */
export type HookType = "question" | "hypothetical" | "statistic" | "statement";

export const HOOK_TYPE_LABEL: Record<HookType, string> = {
  question: "Question",
  hypothetical: "Hypothetical (Imagine… / What if…)",
  statistic: "Number or statistic",
  statement: "Statement",
};

/** The kind of opening a line is, from its wording alone. */
export function hookTypeOf(line: string): HookType {
  const text = line.replace(/[‘’]/g, "'").trim();
  if (HYPOTHETICAL_OPENER.test(text)) return "hypothetical";
  if (/\?\s*$/.test(text)) return "question";
  if (/\d/.test(text.split(/\s+/).slice(0, 8).join(" "))) return "statistic";
  return "statement";
}

/** How a reel ends. */
export type CtaType = "lane" | "comment" | "follow" | "save_share" | "question" | "none";

export const CTA_TYPE_LABEL: Record<CtaType, string> = {
  lane: "The lane's CTA",
  comment: "Asks for a comment",
  follow: "Asks to follow",
  save_share: "Asks to save or share",
  question: "Ends on a question",
  none: "No CTA",
};

/** What a reel's closing ask is, given the lane it belongs to. */
export function ctaTypeOf(closing: string, lane: string | null | undefined): CtaType {
  const text = closing.replace(/[‘’]/g, "'").trim();
  if (!text) return "none";
  if (isAiToolWorkflowLane(lane) ? isWorkflowCta(text) : orderedOverlap(DAILY_CTA, text) >= 0.7) {
    return "lane";
  }
  if (/\bcomment\b/i.test(text)) return "comment";
  if (/\bfollow\b/i.test(text)) return "follow";
  if (/\b(save|share|send)\b/i.test(text)) return "save_share";
  if (/\?\s*$/.test(text)) return "question";
  return "none";
}

/** The kinds of main body the reel analyst sorts a reel into. */
export const BODY_SHAPES = [
  "problem, explanation, example, takeaway",
  "news, explanation, what it means for you",
  "story or case, then the lesson",
  "demo in steps",
  "list of points",
  "other",
] as const;
export type BodyShape = (typeof BODY_SHAPES)[number];

export const EXAMPLE_TYPES = ["real case", "hypothetical", "demo", "none"] as const;
export type ExampleType = (typeof EXAMPLE_TYPES)[number];

/** Our script's three parts: the hook, the main body, and the closing CTA. */
export function ourParts(idea: ContentIdea): { hook: string; body: string; cta: string } {
  const lines = (idea.shots ?? []).map((shot) => shot.voiceover?.trim() ?? "").filter(Boolean);
  const hook = idea.chosenHook || idea.hook || lines[0] || "";
  if (!lines.length) return { hook, body: idea.post?.body ?? "", cta: "" };
  const expected = closingLineFor(idea.contentLane, idea.title);
  const last = lines[lines.length - 1]!;
  const endsOnCta =
    lines.length > 1 &&
    (expected
      ? orderedOverlap(expected, last) >= 0.6
      : ctaTypeOf(last, idea.contentLane) !== "none");
  // The first shot is the hook as filmed; everything between it and the CTA is the body.
  const bodyLines = lines.slice(1, endsOnCta ? -1 : undefined);
  return { hook, body: bodyLines.join(" "), cta: endsOnCta ? last : "" };
}

/** Spoken words, team notes in [brackets] left out. */
export const wordCount = (text: string) => words(text).length;

/**
 * A reel's length in seconds: from the transcript's last timestamp when it has
 * them ("0:52 …"), otherwise from its spoken words at a natural 2.5 a second.
 */
export function reelSeconds(
  transcript: string | null,
): { seconds: number; measured: boolean } | null {
  if (!transcript?.trim()) return null;
  const lines = transcript.trim().split("\n");
  const stamps = lines
    .map((line) => /^(\d+):(\d{2})\s+(.*)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => Boolean(match));
  if (stamps.length >= 2) {
    const last = stamps[stamps.length - 1]!;
    const start = Number(last[1]) * 60 + Number(last[2]);
    return { seconds: Math.round(start + wordCount(last[3]!) / 2.5), measured: true };
  }
  return { seconds: Math.round(wordCount(transcript) / 2.5), measured: false };
}

/** The transcript without its timestamps, as one line of spoken text. */
export function spokenOnly(transcript: string): string {
  return transcript
    .split("\n")
    .map((line) => line.replace(/^\d+:\d{2}\s+/, ""))
    .join(" ");
}

export function lengthBand(seconds: number | null): string | null {
  if (seconds == null) return null;
  if (seconds < 30) return "under 30 s";
  if (seconds < 45) return "30-44 s";
  if (seconds < 60) return "45-59 s";
  if (seconds < 90) return "60-89 s";
  return "90 s or more";
}

export interface CaptionStats {
  words: number;
  hashtags: number;
  asksQuestion: boolean;
  hasCta: boolean;
}

/** A caption's shape: length without hashtags, hashtag count, a question, an ask. */
export function captionStats(caption: string): CaptionStats {
  const body = caption.replace(/#[\p{L}\p{N}_]+/gu, " ");
  return {
    words: wordCount(body),
    hashtags: hashtagsIn(caption).length,
    asksQuestion: /\?/.test(body),
    hasCta: /\b(comment|follow|save|share|dm|link in bio)\b/i.test(body),
  };
}

export function captionBand(stats: CaptionStats | null | undefined): string | null {
  if (!stats) return null;
  if (stats.words < 25) return "short (under 25 words)";
  if (stats.words <= 80) return "medium (25-80 words)";
  return "long (over 80 words)";
}

export function hashtagBand(count: number | null | undefined): string | null {
  if (count == null) return null;
  if (count === 0) return "none";
  if (count <= 4) return "1-4";
  if (count === 5) return "exactly 5";
  return "6 or more";
}
