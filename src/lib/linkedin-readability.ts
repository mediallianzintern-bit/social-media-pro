// Whether a LinkedIn post reads the way his do: skimmed on a phone, in plain
// words (4 Nov 2026).
//
// Measured on the 43 posts in his LinkedIn top-posts export (7 Aug to 4 Nov)
// against the 19 the dashboard had written. His lines run about 9 words (95%
// of them 19 or fewer), his sentences about 8, and his reading ease about 62
// (plain English); his top 8 by impressions use jargon in 1 post of 8. The
// dashboard's ran 22 words a line, 14 a sentence, reading ease 45: the same
// ideas, written as paragraphs. The meeting with Pritesh Sir on 4 Nov asked
// for exactly this: a post to scan and skim, simple and conversational, with
// concrete words in place of marketing terms.
//
// Every threshold here was checked against his own posts first, so a rule
// that would have sent back his own writing is not a rule.
//
// Client-safe and pure.

/**
 * Lines over this many words: 95% of his lines are 19 or fewer. One such line
 * is allowed (his posts often carry one longer line with a statistic); two, or
 * one past HARD_LINE_WORDS, is a paragraph. Flagged 4 of his 43 posts and 17
 * of the dashboard's 19.
 */
export const MAX_LINE_WORDS = 22;
export const HARD_LINE_WORDS = 35;
/** A post whose typical line runs longer than this reads as paragraphs. His run 9. */
export const MAX_MEDIAN_LINE_WORDS = 13;
/** Below this reading ease a post reads harder than his. His run about 60. */
export const MIN_READING_EASE = 42;
/** The opening a reader sees before deciding: the subject must appear in it. */
export const OPENING_LINES = 4;

/**
 * Marketing and tech terms that need saying in plain words, with what to say
 * instead. Abstract terms only: a word his readers use themselves ("SEO",
 * "ads", "AI") is not jargon.
 */
export const JARGON: Record<string, string> = {
  favorability: "how much people like the brand",
  favourability: "how much people like the brand",
  "purchase consideration": "whether people would think of buying it",
  ugc: "posts and videos made by customers",
  "user-generated content": "posts and videos made by customers",
  touchpoint: "a moment a customer meets the brand",
  touchpoints: "moments a customer meets the brand",
  omnichannel: "everywhere the customer shops",
  "social-first": "built for social media",
  "user acquisition": "getting new users",
  "customer acquisition": "getting new customers",
  monetization: "earning money from it",
  monetisation: "earning money from it",
  leverage: "use",
  leveraging: "using",
  synergy: "working together",
  synergies: "ways of working together",
  ecosystem: "the tools and people around it",
  paradigm: "way of thinking",
  "paradigm shift": "big change",
  holistic: "complete",
  landscape: "market",
  utilize: "use",
  utilise: "use",
  actionable: "practical",
  stakeholders: "the people involved",
  seamless: "smooth",
  seamlessly: "smoothly",
  granular: "detailed",
  scalable: "able to grow",
  "value proposition": "why customers should choose it",
  "go-to-market": "launch plan",
  "thought leadership": "sharing expertise",
  "brand equity": "what the brand is worth to people",
  "share of voice": "how often the brand is talked about",
  mindshare: "how often people think of the brand",
};

/** Acronyms that need spelling out the first time, unless the post already does. */
const ACRONYMS: Record<string, RegExp> = {
  AEO: /answer engine/i,
  GEO: /generative engine/i,
  CAC: /acquisition cost/i,
  LTV: /lifetime value/i,
  CLV: /lifetime value/i,
  CTR: /click[- ]through/i,
  CPM: /per (thousand|1,?000)/i,
  RAG: /retrieval/i,
  LLM: /language model/i,
  LLMs: /language model/i,
};

const lineList = (body: string) =>
  body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
const wordsIn = (text: string) => text.split(/\s+/).filter(Boolean).length;

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  let count = (w.match(/[aeiouy]+/g) ?? []).length;
  if (w.endsWith("e") && count > 1) count -= 1;
  return Math.max(1, count);
}

/** Flesch reading ease: about 60 is plain English, under 50 is hard going. */
export function readingEase(text: string): number {
  const words = text.split(/\s+/).filter((word) => /[a-z]/i.test(word));
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).filter((part) => part.trim()).length;
  if (!words.length || !sentences) return 100;
  const perSentence = words.length / sentences;
  const perWord = words.reduce((sum, word) => sum + syllables(word), 0) / words.length;
  return Math.round(206.835 - 1.015 * perSentence - 84.6 * perWord);
}

/** The jargon in a post, each with its plain replacement. */
export function jargonIn(body: string): Array<{ term: string; plain: string }> {
  const found: Array<{ term: string; plain: string }> = [];
  for (const [term, plain] of Object.entries(JARGON)) {
    const pattern = new RegExp(`\\b${term.replace(/[-]/g, "[- ]")}\\b`, "i");
    if (pattern.test(body) && !found.some((entry) => entry.term.includes(term))) {
      found.push({ term, plain });
    }
  }
  for (const [acronym, spelled] of Object.entries(ACRONYMS)) {
    if (new RegExp(`\\b${acronym}\\b`).test(body) && !spelled.test(body)) {
      found.push({ term: acronym, plain: `spell it out the first time` });
    }
  }
  return found;
}

/** How a post is laid out for a phone: line lengths, and lines packed with sentences. */
export function layoutOf(body: string): {
  lines: number;
  medianLineWords: number;
  overlong: string[];
  packed: string[];
} {
  const lines = lineList(body);
  const counts = lines.map(wordsIn).sort((a, b) => a - b);
  const mid = Math.floor(counts.length / 2);
  const medianLineWords = counts.length
    ? counts.length % 2
      ? counts[mid]!
      : (counts[mid - 1]! + counts[mid]!) / 2
    : 0;
  return {
    lines: lines.length,
    medianLineWords,
    overlong: lines.filter((line) => wordsIn(line) > MAX_LINE_WORDS),
    // Three or more sentences on one long line is a paragraph. Short
    // fragments ("Price. Quality. Convenience.") are his rhythm, not one.
    packed: lines.filter(
      (line) => (line.match(/[.!?](\s|$)/g) ?? []).length >= 3 && wordsIn(line) > 18,
    ),
  };
}

/**
 * What stops a post reading like his on a phone, as fixes. Empty when it
 * reads like one of his.
 */
export function readabilityProblems(body: string): string[] {
  const problems: string[] = [];
  const layout = layoutOf(body);
  if (layout.medianLineWords > MAX_MEDIAN_LINE_WORDS) {
    problems.push(
      `reads as paragraphs: its lines run about ${layout.medianLineWords} words where his run about 9; put each sentence on its own line, a blank line between`,
    );
  }
  if (
    layout.overlong.length >= 2 ||
    layout.overlong.some((line) => wordsIn(line) > HARD_LINE_WORDS)
  ) {
    problems.push(
      `has ${layout.overlong.length} line(s) over ${MAX_LINE_WORDS} words; split "${layout.overlong[0]!.slice(0, 60)}…" into short lines`,
    );
  }
  if (layout.packed.length) {
    problems.push(
      `packs three or more sentences into one line ("${layout.packed[0]!.slice(0, 50)}…"); one sentence a line, as his posts do`,
    );
  }
  const ease = readingEase(body);
  if (ease < MIN_READING_EASE) {
    problems.push(
      `reads harder than his posts (reading ease ${ease}; his run about 60): shorter sentences and everyday words`,
    );
  }
  // One term in the body did no harm (his 505-impression McDonald's post has
  // "touchpoint"); two, or one in the opening a reader decides on, is the Gen
  // Z post raised in the 4 Nov meeting ("favorability", "purchase
  // consideration", "UGC").
  const jargon = jargonIn(body);
  if (jargon.length >= 2 || jargonIn(openingOf(body)).length) {
    problems.push(
      `uses jargon a broad reader would stop at: ${jargon
        .slice(0, 4)
        .map((entry) => `"${entry.term}" (say: ${entry.plain})`)
        .join(", ")}`,
    );
  }
  return problems;
}

/** The opening a reader sees: the first OPENING_LINES lines of the post. */
export function openingOf(body: string): string {
  return lineList(body).slice(0, OPENING_LINES).join(" ");
}

/**
 * Stock example lines: the length fit was told to pad short posts with "a
 * marketer planning a campaign" and "the mistake people make", and posts came
 * back with exactly those lines. None of his 43 posts uses one; his examples
 * are scenes ("Imagine discussing a new laptop with a friend.").
 */
const STOCK_EXAMPLE =
  /\b(suppose|imagine|let'?s say|say) you(?:'re| are) (a|an) (marketer|salesperson|manager|business owner|small business|brand)\b|\bone (common )?mistake (brands|businesses|marketers|companies|people) make\b/i;

/**
 * An opening that hands over the answer before the reader has a reason to
 * want it: "Duolingo's strategy isn't about big ad budgets. / It's about being
 * where Gen Z spends time." None of his 43 posts opens this way.
 */
const ANSWER_UP_FRONT =
  /\b(isn'?t|is not) about\b[^\n]*\n+[^\n]*\b(it'?s|it is) about\b|\bthe (answer|secret|reason) is\b/i;

/**
 * Numbered points that are bare instructions ("1. Be present on platforms
 * like TikTok."). His each carry a short heading with its meaning on the
 * same line ("Relevance: Does the message genuinely help the customer?") or
 * on the next ("Consistency > viral moments / One viral campaign won't build
 * a relationship."). One of his 43 posts has two bare points.
 */
function barePoints(body: string): string[] {
  const lines = lineList(body);
  const numbered = /^\d+[.)]\s/;
  return lines.filter((line, index) => {
    if (!numbered.test(line)) return false;
    const rest = line.replace(numbered, "");
    if (/[:>→]\s|\?/.test(rest) || /\s[–-]\s/.test(rest)) return false;
    const next = lines[index + 1] ?? "";
    return !next || numbered.test(next) || wordsIn(next) < 4;
  });
}

/**
 * Where a post stops sounding like him, beyond layout and words: a stock
 * example, the answer given in the opening, bare numbered points. Each was
 * checked against his 43 posts (0, 0 and 1 of them trip it) and caught the
 * dashboard's Duolingo post of 4 Nov.
 */
export function writingProblems(body: string): string[] {
  const problems: string[] = [];
  // Curly apostrophes folded first: "suppose you’re a marketer" slipped past.
  const stock = body.replace(/[‘’]/g, "'").match(STOCK_EXAMPLE);
  if (stock) {
    problems.push(
      `uses a stock example line ("${stock[0]}…"); use a real scene the reader recognises, or cut it`,
    );
  }
  const opening = lineList(body.replace(/[‘’]/g, "'")).slice(0, OPENING_LINES).join("\n");
  if (ANSWER_UP_FRONT.test(opening)) {
    problems.push(
      "gives the answer away in the opening; open on the most surprising fact and let the answer come later",
    );
  }
  const bare = barePoints(body);
  if (bare.length >= 2) {
    problems.push(
      `has bare numbered points ("${bare[0]!.slice(0, 50)}"); give each a short heading and one concrete line, as his do ("Consistency > viral moments" / "One viral campaign won't build a relationship.")`,
    );
  }
  return problems;
}
