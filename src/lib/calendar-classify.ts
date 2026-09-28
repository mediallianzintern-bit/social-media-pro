// Labelling a calendar entry — by rule, never by a model.
//
// Two reasons it is rules rather than an AI call. First, this runs over every
// row of every import and would be a recurring bill for work that keyword
// matching does well. Second, and more important: these labels become the
// TRAINING SIGNAL the topic engine learns from. A model's labels drift between
// runs, so a lane's measured performance would partly reflect how the
// classifier felt that day. A rule is wrong in the same way every time, which
// is the property that makes a comparison between groups honest.
//
// Where a rule cannot decide, it says so (null) instead of guessing.
import type { TopicType } from "@/lib/calendar-types";

/** Any http(s) link in the text — a tool URL is the strongest "this is a tool post" signal. */
const URL_RE = /https?:\/\/[^\s)]+/g;

/**
 * AI products, labs and models the team writes about.
 *
 * Deliberately a list of PROPER NOUNS rather than the word "AI": half the
 * calendar mentions AI in passing while being about a 1960s car ad.
 */
const AI_NAMES = [
  "openai",
  "chatgpt",
  "gpt-",
  "gpt astra",
  "anthropic",
  "claude",
  "gemini",
  "google flow",
  "nano banana",
  "sora",
  "midjourney",
  "stable diffusion",
  "perplexity",
  "copilot",
  "llama",
  "sam 3",
  "segment anything",
  "agentkit",
  "agent builder",
  "veo",
  "runway",
  "elevenlabs",
  "synthid",
  "deepseek",
  "mistral",
  "grok",
];

/** Words that mark a hands-on tool walkthrough rather than news about a lab. */
const TOOL_WORDS = [
  "prompt",
  "workflow",
  "free ai tool",
  "this tool",
  "step-by-step",
  "step by step",
  "drag and drop",
  "template",
  "generate",
  "upload",
  "download",
  "plugin",
  "no code",
  "without writing a single line",
  "tutorial",
  "how to use",
];

/**
 * A numbered or sequenced procedure — "first… then… now… finally".
 *
 * What actually separates a tutorial from news about the same product: both
 * name the tool, but only the tutorial tells you the order to do things in.
 * Without this, a model launch written as a walkthrough (Meta's SAM 3, OpenAI's
 * Agent Builder) lands in the tool feed and gets looked for in the wrong place.
 */
const STEP_WORDS = [
  "first,",
  "first ",
  "then ",
  "next,",
  "now just",
  "finally",
  "step 1",
  "step one",
  "here's how",
  "heres how",
  "here is how",
  "paste this",
  "hit generate",
  "and that's it",
];

/** Words that mark a launch or announcement. */
const NEWS_WORDS = [
  "just announced",
  "just launched",
  "just dropped",
  "just released",
  "rolling out",
  "is here",
  "unveiled",
  "introducing",
  "new update",
  "launches",
  "announcement",
];

/** Physical, attention-grabbing activations — the "Marketing stunts" lane. */
const STUNT_WORDS = [
  "billboard",
  "stunt",
  "prank",
  "guerrilla",
  "pop-up",
  "popup",
  "installation",
  "activation",
  "super bowl",
  "vending machine",
  "bus stop",
  "subway",
  "outdoor",
  "ooh",
  "3d billboard",
  "took over",
  "turned a",
  "built a",
  "hijack",
  "flash mob",
  "experiential",
];

/** Positioning, naming and brand-building — the "Brand strategy lessons" lane. */
const STRATEGY_WORDS = [
  "positioning",
  "repositioning",
  "rebrand",
  "brand strategy",
  "brand name",
  "tagline",
  "slogan",
  "brand recall",
  "market share",
  "loyalty",
  "community",
  "word of mouth",
  "referral",
  "user generated",
  "user-generated",
  "ugc",
  "pricing",
  "packaging",
  "distribution",
  "business model",
  "cloud kitchen",
  "went bankrupt",
  "turnaround",
];

/** Awards and recency markers that make a campaign "fresh" rather than a classic. */
const FRESH_WORDS = [
  "cannes lions",
  "grand prix",
  "d&ad",
  "effie",
  "spikes asia",
  "clio",
  "abby award",
  "goafest",
  "2026",
  "this year",
  "last week",
  "last month",
];

const normalise = (text: string) => text.toLowerCase().replace(/\s+/g, " ");

/** Whether a sheet name is the team's AI-tool tab. */
const filedUnderTools = (sheetHint?: string) =>
  /\bai\b.*tool|tool.*\bai\b|^tools?$/i.test(sheetHint ?? "");
const hits = (text: string, words: string[]) => words.filter((w) => text.includes(w)).length;

/**
 * A year mentioned in the text, if it reads like "in 2013" or "(2018)".
 *
 * The strongest evergreen signal there is: a campaign the team dates to a past
 * year cannot be found in this week's news, however it is otherwise worded.
 */
export function mentionedYear(text: string): number | null {
  const years = [...text.matchAll(/\b(19[5-9]\d|20[0-2]\d)\b/g)]
    .map((m) => Number(m[1]))
    .filter((y) => y >= 1955 && y <= new Date().getFullYear());
  return years.length ? Math.min(...years) : null;
}

/**
 * Capitalised names in the opening lines — the brands, tools and people a
 * topic is about.
 *
 * Only the first few sentences are scanned, because that is where this team
 * always names the subject; scanning the whole script drags in every
 * capitalised word from the lesson section at the end.
 */
export function extractSubjects(text: string, brandColumn?: string | null): string[] {
  const found = new Set<string>();
  const clean = (name: string) =>
    name
      .replace(/\s+/g, " ")
      .replace(/[“”"'’]/g, "")
      .replace(/^[\s.,:;!?]+|[\s.,:;!?]+$/g, "")
      // "Volkswagen – Think Small Campaign" -> "Volkswagen": the brand column
      // often carries a descriptive tail that is not part of the name.
      .replace(/\s*[–—]\s.*$/, "")
      .replace(/\s+(campaign|ad|advert|advertising)$/i, "")
      .trim();

  const declared = clean(brandColumn ?? "");
  if (declared && !/^https?:/i.test(declared)) found.add(declared);

  // Words that commonly OPEN a sentence without naming anything. A capitalised
  // word here is only kept when it is not one of these — which is what lets
  // "Netflix locked a man…" yield Netflix while "Imagine walking…" yields
  // nothing.
  const SKIP = new Set([
    "the",
    "this",
    "that",
    "and",
    "but",
    "here",
    "there",
    "day",
    "most",
    "what",
    "why",
    "how",
    "when",
    "who",
    "it",
    "they",
    "we",
    "you",
    "in",
    "on",
    "for",
    "a",
    "an",
    "so",
    "if",
    "then",
    "instead",
    "because",
    "their",
    "his",
    "her",
    "one",
    "two",
    "every",
    "yes",
    "no",
    "now",
    "imagine",
    "picture",
    "meet",
    "think",
    "once",
    "while",
    "within",
    "between",
    "after",
    "before",
    "during",
    "eating",
    "would",
    "could",
    "should",
    "someone",
    "everyone",
    "nobody",
    "people",
    "brands",
    "brand",
    "most",
    "many",
    "some",
    "few",
    "let",
    "lets",
    "just",
    "even",
    "still",
    "yet",
    "also",
    "from",
    "with",
    "without",
    "over",
    "under",
    "about",
    "story",
    "lesson",
    "lessons",
    "result",
    "results",
    "impact",
    "takeaway",
    "boom",
    "result",
    // Ordinary words that open a sentence and are NOT names. Without these,
    // "Early", "Have", "Look", "Turn" and "Customers" become subjects — and
    // since a subject blocks any trend whose caption contains it, a handful
    // of them silently empty the trend inbox.
    "early",
    "have",
    "has",
    "had",
    "look",
    "looks",
    "like",
    "turn",
    "turns",
    "turned",
    "customers",
    "customer",
    "want",
    "wants",
    "need",
    "needs",
    "know",
    "knew",
    "make",
    "makes",
    "made",
    "take",
    "takes",
    "give",
    "gives",
    "get",
    "gets",
    "put",
    "puts",
    "say",
    "says",
    "said",
    "see",
    "sees",
    "use",
    "uses",
    "used",
    "work",
    "works",
    "worked",
    "best",
    "better",
    "good",
    "great",
    "bad",
    "worst",
    "first",
    "last",
    "next",
    "old",
    "big",
    "small",
    "real",
    "true",
    "false",
    "right",
    "wrong",
    "stop",
    "start",
    "remember",
    "forget",
    "welcome",
    "introducing",
    "meanwhile",
    "suddenly",
    "finally",
    "today",
    "tomorrow",
    "yesterday",
    "week",
    "month",
    "year",
    "years",
    "time",
    "times",
    "idea",
    "ideas",
    "company",
    "companies",
    "business",
    "businesses",
    "marketing",
    "ads",
    "campaign",
    "campaigns",
    "social",
    "media",
    "content",
    "video",
    "videos",
  ]);

  // Match names INSIDE each sentence, never across a boundary: a pattern that
  // allows "." inside a name happily swallows the next sentence's first word
  // ("GPT Astra. There").
  const opening = text.replace(/\s+/g, " ").slice(0, 600);
  for (const sentence of opening.split(/(?<=[.!?…])\s+/).slice(0, 3)) {
    for (const match of sentence.matchAll(
      /\b([A-Z][A-Za-z0-9&'’-]*(?:\.[A-Za-z]{2,4})?(?:\s+[A-Z][A-Za-z0-9&'’-]*){0,2})\b/g,
    )) {
      const name = clean(match[1] ?? "");
      const head = (name.split(" ")[0] ?? "").toLowerCase();
      if (name.length < 3 || SKIP.has(head)) continue;
      found.add(name);
    }
  }
  return [...found].filter(Boolean).slice(0, 6);
}

/**
 * Which of the account's lanes this entry belongs to.
 *
 * Returns the lane NAME from the supplied list so it matches the account's own
 * taxonomy exactly — the same names the lane rankings and the strategist use.
 * Null when nothing scores, which is honest and lets the caller leave it
 * unclassified rather than forcing a wrong lane.
 */
export function classifyLane(text: string, lanes: string[], sheetHint?: string): string | null {
  const t = normalise(text);

  const urls = t.match(URL_RE)?.length ?? 0;
  const ai = hits(t, AI_NAMES);
  const tool = hits(t, TOOL_WORDS);

  const scores: Record<string, number> = {
    "ai tool workflows": urls * 3 + tool * 2 + (ai ? 1 : 0),
    "frontier ai developments": ai * 2 + hits(t, NEWS_WORDS) - urls,
    "marketing stunts": hits(t, STUNT_WORDS) * 2,
    "brand strategy lessons": hits(t, STRATEGY_WORDS) * 2,
  };

  // Match back to the account's real lane names, so casing and wording follow
  // the taxonomy rather than this file.
  let best: { lane: string; score: number } | null = null;
  for (const lane of lanes) {
    const score = scores[lane.trim().toLowerCase()] ?? 0;
    if (score > 0 && (!best || score > best.score)) best = { lane, score };
  }
  if (best) return best.lane;

  // Nothing scored. Where the team filed it is the last hint available — and
  // only a hint, for the reason given in classifyTopicType.
  if (filedUnderTools(sheetHint) && hits(t, AI_NAMES) > 0) {
    return lanes.find((l) => /ai tool/i.test(l)) ?? null;
  }
  return null;
}

/**
 * Which feed could have FOUND this topic. See TopicType.
 *
 * `sheetHint` is the name of the sheet the row came from. The team files rows
 * deliberately — an "AI Tool" tab means they considered that row a tool post —
 * and their own filing is stronger evidence than any keyword rule here. It is
 * only overridden when the text clearly announces a launch, because a few
 * model-launch posts are filed alongside the tool walkthroughs.
 */
export function classifyTopicType(text: string, sheetHint?: string): TopicType {
  const t = normalise(text);
  const urls = t.match(URL_RE)?.length ?? 0;
  const ai = hits(t, AI_NAMES);
  const year = mentionedYear(t);

  // A tool link plus workflow language is a tutorial, whatever else it says.
  if (urls > 0 && hits(t, TOOL_WORDS) >= 1) return "ai_tool";
  // No link: a walkthrough must actually walk through something. Two or more
  // sequence markers alongside the tool language, or it is news about a
  // product rather than instructions for using one.
  if (ai > 0 && hits(t, TOOL_WORDS) >= 2 && hits(t, STEP_WORDS) >= 2 && !hits(t, NEWS_WORDS))
    return "ai_tool";
  if (ai > 0) return "ai_news";

  // A campaign the team dates to a past year is a classic, even when the
  // script also mentions an award — awards are given to old work too.
  if (year !== null && year < new Date().getFullYear() - 1) return "evergreen";
  if (hits(t, FRESH_WORDS) > 0) return "fresh";

  // Nothing in the text decided it. Fall back to where the team filed it —
  // but only here, as a tie-breaker. Their "AI Tool" tab turned out to be a
  // scheduling tab holding ordinary brand stories too ("Spotify doesn't run
  // ads for Wrapped"), so treating the tab as a category mislabels those.
  if (filedUnderTools(sheetHint) && ai > 0) return "ai_tool";
  return "evergreen";
}

/**
 * The subjects worth treating as "we have covered this".
 *
 * A subject only identifies something when it is a name from the brand column,
 * a multi-word name, or a word with an internal capital (OpenAI, KitKat,
 * McDonald's). A bare capitalised English word is almost always a sentence
 * opener that slipped through — and because one such subject blocks every
 * caption containing it, a few are enough to empty the trend inbox. Measured,
 * "Early", "Have", "Look" and "Turn" between them suppressed six of nine real
 * breakouts.
 */
export function distinctiveSubjects(subjects: string[]): string[] {
  return subjects.filter((subject) => {
    const name = subject.trim();
    if (name.length < 4) return false;
    if (name.includes(" ")) return true;
    if (/[a-z][A-Z]/.test(name)) return true;
    if (/[&.'\u2019-]/.test(name)) return true;
    // A single ordinary-looking word: keep it only if it is not a plain
    // Capitalised English word, which a brand name rarely is.
    return !/^[A-Z][a-z]+$/.test(name);
  });
}
