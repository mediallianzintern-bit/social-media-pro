// Addendum E.5 v2 — is this clip worth reacting to?
//
// The spec's four tests for a candidate clip:
//   1. on a topic adjacent to the client's field (not necessarily the same);
//   2. makes a claim, tip, list or myth the expert can correct or deepen;
//   3. performing well against its own creator's median (public signal);
//   4. can be redirected naturally into the client's owned lane.
//
// (3) and (1)/(4) reuse the trend catcher's machinery. This file is (2): a
// rule-based read of the caption for the SHAPE of something an expert can
// answer. It is deliberately a ranking signal with its reasons printed, not
// a verdict — the team chooses, and the system never auto-publishes a
// reaction.
//
// Client-safe. No model call.

export type ClaimKind = "myth" | "list" | "bold" | "stat" | "question" | "news";

export const CLAIM_LABEL: Record<ClaimKind, string> = {
  myth: "challenges a belief",
  list: "a list or how-to",
  bold: "a bold claim",
  stat: "cites a figure",
  question: "asks a question",
  news: "announces something new",
};

/**
 * Patterns for each shape. A family counts once however many of its words
 * appear, so a caption full of "never… don't… stop…" is one strong signal,
 * not three.
 */
const FAMILIES: Array<{ kind: ClaimKind; pattern: RegExp; weight: number }> = [
  {
    kind: "myth",
    pattern:
      /\b(stop|never|don'?t|nobody|no one|myth|is dead|are dead|wrong|mistake|lie|lies|overrated|scam|truth about|not what you think|actually)\b/i,
    weight: 1.5,
  },
  {
    kind: "list",
    pattern:
      /\b(\d+\s+(ways|tips|tools|things|mistakes|reasons|steps|prompts|apps|hacks|secrets|rules|signs|ideas|lessons|habits)|top\s+\d+|how to|here'?s how)\b/i,
    weight: 1.25,
  },
  {
    kind: "bold",
    pattern:
      /\b(the only|secret|hack|trick|best|worst|will replace|replaced|changed everything|game ?changer|nobody talks about|you need|you should|must|guaranteed|always)\b/i,
    weight: 1,
  },
  {
    kind: "stat",
    pattern: /\d+(\.\d+)?\s?(%|x\b|×|k\b|m\b|million|billion|crore|lakh)/i,
    weight: 0.75,
  },
  { kind: "question", pattern: /\?/, weight: 0.5 },
  {
    kind: "news",
    pattern:
      /\b(just (dropped|launched|announced|released|unveiled)|announced|launches|unveiled|new feature|rolled out)\b/i,
    weight: 0.75,
  },
];

export interface ClaimRead {
  /** 0 means nothing an expert could answer was found in the caption. */
  score: number;
  kinds: ClaimKind[];
}

export function readClaim(caption: string): ClaimRead {
  const kinds: ClaimKind[] = [];
  let score = 0;
  for (const family of FAMILIES) {
    if (family.pattern.test(caption)) {
      kinds.push(family.kind);
      score += family.weight;
    }
  }
  return { score: Number(score.toFixed(2)), kinds };
}
