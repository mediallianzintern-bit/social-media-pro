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
 * The highest reading grade a post may score. Pritesh Sir's review of 5 Nov
 * 2026 set Grade 8 in Hemingway as the limit, and the team then set Grade 5
 * to 6 as the target: posts the dashboard wrote that day read "around 8" in
 * Hemingway (7.6, 8.7 and 8.4 by readingGrade). The team's model post scores
 * 2.8; his own 43 posts have a median of 7.6, so this asks for plainer than
 * his average, as the team wants.
 */
export const MAX_GRADE = 6;
/** Pritesh Sir's own limit, over which a post is never shown as fine. */
export const GRADE_LIMIT = 8;

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
  // From the dashboard's posts of 5 Nov 2026; none is in his 43.
  "root access": "full control of the system",
  unprivileged: "ordinary",
  "patch management": "fixing software flaws",
  "digital shelf": "where products show up online",
  "digital shelf space": "where products show up online",
  integration: "using it together",
  "integrate ai": "start using AI",
  streamline: "simplify",
  "enhance productivity": "help people get more done",
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

/**
 * The sentences of a post as a grader reads them: only a full stop, question
 * mark or exclamation mark ends one, so a heading with none runs on into the
 * line under it. Counting every line break as a sentence end read the team's
 * posts of 5 Nov about a grade easier than Hemingway did (6.4 to 7.5 where
 * Hemingway showed about 8); counted this way they read 7.6 to 8.7. A list
 * number ("1.") is not a sentence.
 */
function sentencesOf(body: string): string[] {
  return lineList(body)
    .join(" ")
    .split(/(?<=[.!?…]["'’”)]*)\s+/)
    .filter((part) => /[a-z]/i.test(part) && !/^\d+[.)]$/.test(part));
}

const tokensOf = (text: string) => text.match(/[a-z0-9][a-z0-9'’-]*/gi) ?? [];

/** The Automated Readability Index of some words over some sentences. */
function readabilityIndex(words: string[], sentences: number): number {
  if (!words.length || !sentences) return 0;
  const characters = words.reduce((sum, word) => sum + word.replace(/[^a-z0-9]/gi, "").length, 0);
  return 4.71 * (characters / words.length) + 0.5 * (words.length / sentences) - 21.43;
}

/**
 * The US school grade a post reads at, by the Automated Readability Index,
 * the formula Hemingway's grade is reported to use. An estimate to aim with:
 * Hemingway's own number is the one the team checks, and may differ by a
 * grade or so. The team aims for MAX_GRADE or lower.
 */
export function readingGrade(body: string): number {
  const sentences = sentencesOf(body);
  const words = sentences.flatMap(tokensOf);
  return Math.max(0, Math.round(readabilityIndex(words, sentences.length) * 10) / 10);
}

/**
 * The sentences Hemingway would mark hard to read (14 words or more, at grade
 * 10 or above) or very hard (grade 14 or above), hardest first.
 */
export function hardSentences(body: string): Array<{ sentence: string; grade: number }> {
  return sentencesOf(body)
    .map((sentence) => {
      const words = tokensOf(sentence);
      return { sentence, words: words.length, grade: readabilityIndex(words, 1) };
    })
    .filter((entry) => entry.words >= 14 && entry.grade >= 10)
    .sort((a, b) => b.grade - a.grade)
    .map(({ sentence, grade }) => ({ sentence, grade: Math.round(grade) }));
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
  // The team's Grade 5 to 6 (5 Nov 2026), with the sentence doing most harm.
  const grade = readingGrade(body);
  if (grade > MAX_GRADE) {
    const hardest = hardSentences(body)[0];
    problems.push(
      `reads at about Grade ${grade}; the team wants Grade 5 to 6 (never above ${GRADE_LIMIT}): shorter sentences and shorter, everyday words${hardest ? `, starting with "${hardest.sentence.slice(0, 70)}"` : ""}`,
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
 * The headline and subheadline: a post's first two lines, about all LinkedIn
 * shows on a phone before "see more". Each of his 43 posts opens on such a
 * pair, the second line pulling the reader into the post ("McDonald's wants
 * to make $1 billion from advertising." / "Yes, the company known for selling
 * burgers is now building an advertising business.").
 */
export function foldOf(body: string): { headline: string; subheadline: string } {
  const [headline = "", subheadline = ""] = lineList(body);
  return { headline, subheadline };
}

/**
 * A headline that tells the reader what they already know about a famous
 * brand: "How did Duolingo's owl become a Gen Z icon?". Pritesh Sir, 5 Nov
 * 2026: a reader who already knows Duolingo and Gen Z scrolls past it. None
 * of his 43 posts opens this way.
 */
const FAMILIAR_OPENING =
  /^(how|why) (did|does|do|has|have|is|are) [^?\n]{1,60}\b(become|became|win|won|wins|take over|took over|dominate[sd]?|rule[sd]?|conquer(ed|s)?|go viral)\b[^?\n]*(icon|favou?rite|famous|legend(ary)?|household name|obsession|sensation|king|queen|phenomenon|viral|hearts|internet)\b|^(why is everyone talking about|the secret (behind|to) [^\n]*success|what makes [^\n?]{1,40} so (popular|successful|special))\b/i;

/** Whether a headline only restates what readers already know (FAMILIAR_OPENING). */
export function familiarOpening(headline: string): boolean {
  return FAMILIAR_OPENING.test(headline.replace(/[‘’]/g, "'").trim());
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
 * Numbered points written "Heading: general advice" on one line ("1.
 * Continuous monitoring: Keep an eye on vulnerabilities as they arise."). The
 * team's model post puts a short heading on its own line and one concrete
 * line from the story under it; his own posts use that, an arrow, or a
 * question after the colon ("Relevance: Does the message genuinely help the
 * customer?"). None of his 43 posts has two such points.
 */
function colonPoints(body: string): string[] {
  return lineList(body).filter(
    (line) => /^\d+[.)]\s+[^:?\n]{1,40}:\s+\S/.test(line) && !line.endsWith("?"),
  );
}

/**
 * Stock marketing phrases, each with what to do instead. Every one is used in
 * none of his 43 posts once quoted text is set aside (the one hit, "Take your
 * business to the next level…", is him quoting bad AI copy on purpose), and
 * the dashboard's Duolingo post of 4 Nov had eight of them: "authenticity",
 * "genuine connections", "shine through", "unconventional tactics"…
 * "journey", "connect with" and "strategies" are left out: he uses them.
 */
const STOCK_PHRASES: Array<[RegExp, string]> = [
  [/\bauthentic(ity)?\b/i, "say what they did that felt real"],
  [/\b(genuine|meaningful|deeper) connections?\b/i, "say what people actually did or felt"],
  [/\bshine through\b/i, "cut it, or say what people noticed"],
  [/\bunconventional (tactics|ideas|approach(es)?)\b/i, "name the tactic"],
  [/\bcapture (their )?attention\b/i, "get noticed"],
  [/\baligned with (current )?trends\b/i, "say which trend"],
  [/\bresonat\w+/i, "matter to people"],
  // "Fun and engaging" is not on the list: Pritesh Sir held up "create content
  // that's fun and engaging" as the plain version of "use unconventional
  // tactics to capture attention" (5 Nov 2026).
  [/\bengage creatively\b/i, "say what to make"],
  [/\bpreferences of\b/i, "what they want"],
  [/\b(stand out from the crowd|cut through the noise)\b/i, "say how"],
  [/\bin today'?s (fast-paced|digital)\b/i, "cut it"],
  [/\btake (it|your \w+) to the next level\b/i, "say what gets better"],
  [/\b(unlock|elevate|harness|empower|foster)(s|es|ed|ing)?\b/i, "use a plain verb"],
  [/\bdelve\b/i, "look"],
  [/\bnavigate the\b/i, "deal with"],
  [/\b(drive|boost) engagement\b/i, "say what people would do"],
  // From the dashboard's posts of 5 Nov 2026; none is in his 43.
  [/\blead the charge\b/i, "say who does what"],
  [/\bkeep pace\b/i, "keep up"],
  [/\brapid evolution\b/i, "fast change"],
  [/\b(\w+ )?revolution\b/i, "say what changes"],
];

/** The stock phrases in a post, outside quotation marks, with what to do instead. */
export function stockPhrasesIn(body: string): Array<{ phrase: string; instead: string }> {
  const unquoted = body.replace(/["“][^"”\n]*["”]/g, " ");
  return STOCK_PHRASES.flatMap(([pattern, instead]) => {
    const match = unquoted.match(pattern);
    return match ? [{ phrase: match[0], instead }] : [];
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
  const { headline } = foldOf(body);
  if (familiarOpening(headline)) {
    problems.push(
      `opens on what the reader already knows ("${headline}"), so a reader who knows the brand scrolls past; open on the strangest true moment in the story ("Can a brand's mascot have a funeral and go viral?") or on the lesson it holds for the reader ("What if reaching Gen Z is more than just a trend?")`,
    );
  }
  const opening = lineList(body.replace(/[‘’]/g, "'")).slice(0, OPENING_LINES).join("\n");
  if (ANSWER_UP_FRONT.test(opening)) {
    problems.push(
      "gives the answer away in the opening; open on the most surprising fact and let the answer come later",
    );
  }
  const phrases = stockPhrasesIn(body);
  if (phrases.length) {
    problems.push(
      `uses stock marketing phrases he never writes: ${phrases
        .slice(0, 4)
        .map((entry) => `"${entry.phrase}" (${entry.instead})`)
        .join(", ")}`,
    );
  }
  const colon = colonPoints(body);
  if (colon.length >= 2) {
    problems.push(
      `writes its points as "Heading: general advice" ("${colon[0]!.slice(0, 60)}"); put a short plain heading on its own line and one concrete line from this story under it, as the team's model post does ("1. Go where your audience already is" / "Duolingo didn't wait for Gen Z to see an ad. It went to TikTok.")`,
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
