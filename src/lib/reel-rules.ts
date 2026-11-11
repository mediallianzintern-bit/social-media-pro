// Rules of the team's reel brief (Script Comparison sheet, 11 Nov 2026) that
// code can check, shared by the review pass (server/ai/review.ts), which sends
// a script back to be fixed, and the voice check (lib/voice-check.ts), which
// flags what is left on the idea for the team.
//
// Each was missed by the first live test of the brief (11 Nov 2026, four
// scripts written from researched stories): an ending on "AI isn't just about
// automation. It's about transforming creativity", two prices in one reel,
// and two AI news reels that stated a company's claims as fact.
//
// Client-safe. No model call.

/**
 * "X isn't just about A. It's about B.", whatever X is. The voice check's own
 * formula pattern only knew "it", "this" and "that" as the subject, so "AI
 * isn't just about automation. It's about…" went through.
 */
const NOT_JUST =
  /\b(isn'?t|is not|aren'?t|are not|wasn'?t|was not)\s+(just|only|simply)\b[^.?!]{0,90}[.?!,]?\s*(it'?s|it is|they'?re|they are|that'?s)\s+(about|really|also|actually)?\b/i;

/** The sentence that uses the "isn't just X, it's Y" formula, or null. */
export function notJustFormula(text: string): string | null {
  const flat = text.replace(/[‘’]/g, "'").replace(/\s+/g, " ");
  const match = NOT_JUST.exec(flat);
  if (!match) return null;
  const start = flat.lastIndexOf(".", match.index) + 1;
  return flat.slice(start, match.index + match[0].length + 40).trim();
}

const NUMBER = /\b\d[\d,.]*\b/g;
const isYear = (token: string) => /^(19|20)\d\d$/.test(token);

/**
 * The numbers in a script that are not a year. The brief allows one ("a year,
 * or one striking reaction figure"). Bracketed notes for the team are not
 * spoken, so they are not counted. Nor is a product's version, which is part
 * of its name: "GPT-6", "Claude Fable 5.2", "Windows 11" (the live test sent
 * the GPT-6 Cyber reel back three times for its own name).
 */
export function extraNumbers(text: string): string[] {
  const spoken = text.replace(/\[[^\]]*\]/g, " ");
  const found: string[] = [];
  for (const match of spoken.matchAll(NUMBER)) {
    const token = match[0].replace(/[,.]$/, "");
    if (isYear(token)) continue;
    const before = spoken.slice(Math.max(0, match.index - 24), match.index);
    if (/-$/.test(before)) continue;
    if (/\b[A-Z][A-Za-z]+ $/.test(before) && /^\d{1,2}(\.\d{1,2})?$/.test(token)) continue;
    found.push(token);
  }
  return found;
}

/** Lanes whose reels are AI news, where every company claim is attributed. */
const AI_NEWS_LANES = new Set(["frontier ai developments"]);

export const needsAttribution = (lane: string | null | undefined) =>
  AI_NEWS_LANES.has((lane ?? "").trim().toLowerCase());

/**
 * Words that attribute a claim: "The company says…", "It claims…", "Its own
 * teams tested it and say…", "according to…". "Launched" and "rated" report
 * that something happened; they do not say whose claim it is.
 */
const ATTRIBUTION =
  /\b(says|said|say|claims?|claimed|according to|its own tests|their own tests|it reports|reported|told)\b/i;

/** Why an AI news reel's claims are not attributed, or null. */
export function attributionIssue(
  voiceover: string,
  lane: string | null | undefined,
): string | null {
  if (!needsAttribution(lane) || !voiceover.trim()) return null;
  if (ATTRIBUTION.test(voiceover)) return null;
  return 'no claim is attributed; an AI news reel says whose claim it is ("The company says…", "It claims…", "Its own teams tested it and say…")';
}

/**
 * The plan the review writes before the script, as the sheet's per-story
 * prompts were written: the one lesson, the facts that serve it, and what to
 * leave out however true.
 */
export interface ReelPlan {
  surprisingPart: string;
  oneLesson: string;
  keyFacts: string[];
  leaveOut: string[];
}

/**
 * The leave-out items the script still says. Each item names the specific
 * thing in brackets ("the character's name (Gus)", "benchmark score (71.8)"),
 * and only what is in brackets, in quotes, or a figure is looked for, so a
 * general entry ("market statistics") or a name the story needs elsewhere
 * ("Haldiram's market share", when the founder story names Haldiram) never
 * sends a good script back.
 */
export function leftInDespitePlan(plan: ReelPlan, spoken: string): string[] {
  const text = spoken.replace(/[‘’]/g, "'").toLowerCase();
  return plan.leaveOut.filter((item) => {
    const bracketed = [...item.matchAll(/\(([^)]{2,80})\)/g)].flatMap((match) =>
      match[1]!.split(/[,;/]| and | or /),
    );
    const quoted = [...item.matchAll(/["“]([^"”]{3,60})["”]/g)].map((match) => match[1]!);
    const figures = item.match(/\d[\d,.]*\d|\d/g) ?? [];
    const probes = [...bracketed, ...quoted, ...figures]
      .map((probe) => probe.trim().toLowerCase())
      .filter((probe) => probe.length >= 2);
    return probes.some((probe) =>
      new RegExp(`(^|[^a-z0-9])${escape(probe)}($|[^a-z0-9])`).test(text),
    );
  });
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A hook that summarises the news instead of opening a story: "OpenAI just
 * launched a model to fight hackers." The brief rules it out ("Sarvam AI just
 * launched...", "Disney's campaign showcases...").
 */
const NEWS_SUMMARY_HOOK =
  /^\s*["“]?[^.?!]{1,60}?\b(just|has|have)\s+(launched|unveiled|released|announced|introduced|dropped|rolled out)\b|\b(showcases|highlights)\b/i;

export function newsSummaryHook(hook: string): string | null {
  return NEWS_SUMMARY_HOOK.test(hook.replace(/[‘’]/g, "'"))
    ? `the hook "${hook.trim()}" summarises the news; open on a curiosity question, a familiar fact, the problem the tech solves or a bold concrete line`
    : null;
}

/**
 * A generic "stands out" ending the sheet rules out in any wording: "can set
 * you apart", "can set your brand apart" (the live test's Levi's ending).
 */
export const SET_APART = /\bset (you|your(self| \w+)?|them|it|a brand) apart\b/i;

/** The turn line: "And there's a lesson here for businesses." */
export const TURN_LINE = /\bthere['’]?s (a|one) (\w+ )?lesson (here|in this)\b/i;
