// Researching one news story across several outlets before a script is
// written from it (Oct 2026).
//
// Rashmi's feedback: scripts on a specific story stayed surface-level. The
// details of a story are scattered: on the PHP flaws, one report named the
// countries that took sites offline, another who found the flaws, a third
// neither. A script read from one article misses whatever that article left
// out. So "Write script" now reads up to five outlets covering the same story,
// in stages, and stops once the facts are sufficient (server/ai/research.ts).
// The facts from every outlet are combined into one fact sheet, each fact
// carrying the outlets that state it, and the script is written from that.
//
// "Sufficient" is a checklist the CODE applies to the fact sheet, never the
// model's own opinion of its work: who, what happened, when, where, at least
// one concrete figure or specific detail, how it was done or how it works, the
// result, and the main fact stated by two outlets when two were read. Rashmi's
// own criteria and her preferred sites replace these defaults when she sends
// them.
//
// Client-safe and pure: the drawer shows the fact sheet, and "I filmed this"
// checks which facts reached the reel.

export const FACT_CATEGORIES = [
  "who",
  "what",
  "when",
  "where",
  "figure",
  "how",
  "result",
  "why",
  "context",
] as const;
export type FactCategory = (typeof FACT_CATEGORIES)[number];

export const FACT_CATEGORY_LABEL: Record<FactCategory, string> = {
  who: "Who",
  what: "What happened",
  when: "When",
  where: "Where",
  figure: "Figure or detail",
  how: "How",
  result: "Result",
  why: "Why it matters",
  context: "Context",
};

/** What the fact sheet must cover before research stops early. */
export const REQUIRED_FACTS: FactCategory[] = [
  "who",
  "what",
  "when",
  "where",
  "figure",
  "how",
  "result",
];

/** One outlet that was read, in the order read: 1 is the story's own outlet when it could be read. */
export interface ResearchSource {
  publisher: string | null;
  url: string;
  words: number;
  /**
   * An older explainer of the story's subject, not a report of the story
   * (5 Nov 2026): Nest Commerce's "What Is Meta Andromeda?" beside the news
   * of Andromeda's update. Its facts explain; they are never the news.
   */
  background?: boolean;
  /** When a background article was published, so its figures read as past ones. */
  publishedAt?: string | null;
}

/** One fact, in plain words, with the outlets (1-based, into `sources`) that state it. */
export interface ResearchFact {
  text: string;
  category: FactCategory;
  sources: number[];
  /** How the outlets disagree, when they do. Empty when they agree. */
  conflict: string;
  /** True when only background articles state it: context about the subject, not the story's news. */
  background?: boolean;
}

export interface StoryResearch {
  sources: ResearchSource[];
  facts: ResearchFact[];
  /** Required categories no outlet covered. */
  missing: FactCategory[];
  /** True when the checklist was met; false when research ran out of outlets first. */
  sufficient: boolean;
  /** How many reading stages ran (1 or 2). */
  stages: number;
  /** Outlets found for the story but not readable (blocked, paywalled, a stub). */
  unreadable: number;
  /** The subject the background articles were searched for ("Meta Andromeda"), when any were. */
  subject?: string;
}

/** "Feb 2026", for a background article's date. */
export function monthOf(publishedAt: string | null | undefined): string | null {
  if (!publishedAt) return null;
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** "Nest Commerce", or "Nest Commerce (background, Feb 2026)" for a background article. */
export function sourceLabel(source: ResearchSource | undefined, index: number): string {
  const name = source?.publisher ?? `outlet ${index}`;
  if (!source?.background) return name;
  const month = monthOf(source.publishedAt);
  return `${name} (background${month ? `, ${month}` : ""})`;
}

/** The required categories the facts do not cover yet. */
export function missingFacts(facts: ResearchFact[]): FactCategory[] {
  const covered = new Set(facts.map((fact) => fact.category));
  return REQUIRED_FACTS.filter((category) => !covered.has(category));
}

/** The checklist: every required category, and the main fact from two outlets when two were read. */
export function isSufficient(facts: ResearchFact[], outlets: number): boolean {
  if (missingFacts(facts).length) return false;
  if (outlets < 2) return false;
  return facts.some((fact) => fact.category === "what" && new Set(fact.sources).size >= 2);
}

const STOPWORDS = new Set(
  "the a an and or of to in on for with by from at as is are was were be been this that these those it its into than then their they them has have had will would can could not no but about over after before more most also just only which who what when where how why".split(
    " ",
  ),
);

/** The words in a fact that identify it: names, figures, and longer words. */
function keyWords(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[’']/g, "")
        .split(/[^a-z0-9%$.]+/)
        .map((word) => word.replace(/^\.+|\.+$/g, ""))
        .filter((word) => word && !STOPWORDS.has(word) && (/\d/.test(word) || word.length >= 5)),
    ),
  ];
}

/**
 * Whether a fact made it into what was said or written. Matched on its key
 * words (half or more of them), so "Wiz found the flaws with Gemini" counts
 * when the reel says "Wiz used Google's Gemini to find them".
 */
export function factUsed(fact: ResearchFact, said: string): boolean {
  const words = keyWords(fact.text);
  if (!words.length) return false;
  const text = ` ${said
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9%$.]+/g, " ")} `;
  const found = words.filter((word) => text.includes(` ${word} `)).length;
  return found / words.length >= 0.5;
}

/** How much of the research reached a script or a reel. */
export function researchUsage(
  research: StoryResearch,
  said: string,
): { sources: number; facts: number; factsUsed: number; fromOtherOutlets: number } {
  const used = research.facts.filter((fact) => factUsed(fact, said));
  return {
    sources: research.sources.length,
    facts: research.facts.length,
    factsUsed: used.length,
    // Facts only outlets other than the first one stated: what one article alone would have missed.
    fromOtherOutlets: used.filter((fact) => !fact.sources.includes(1)).length,
  };
}

/** The fact sheet as the writer and the reviewer read it. */
export function factSheetText(research: StoryResearch): string {
  const outlet = (index: number) => sourceLabel(research.sources[index - 1], index);
  const facts = research.facts
    .map((fact) => {
      const from = [...new Set(fact.sources)].map(outlet).join(", ");
      const conflict = fact.conflict ? ` [CONFLICTING: ${fact.conflict}]` : "";
      const background = fact.background ? "BACKGROUND " : "";
      return `- ${background}(${FACT_CATEGORY_LABEL[fact.category]}) ${fact.text} [${from}]${conflict}`;
    })
    .join("\n");
  const missing = research.missing.length
    ? `\nNot found in any outlet: ${research.missing.map((category) => FACT_CATEGORY_LABEL[category]).join(", ")}.`
    : "";
  const background = research.facts.some((fact) => fact.background)
    ? `\nA fact marked BACKGROUND comes only from an older article explaining ${research.subject ?? "the subject"}, published before this story: use it to explain the subject, never as this story's news, and say any figure in it as a past one, with its date ("In early 2026, …").`
    : "";
  return `${research.sources.length} outlets read: ${research.sources.map((source, index) => `${index + 1}. ${sourceLabel(source, index + 1)}`).join("; ")}.
${facts}${missing}${background}`;
}

/** The research's news reports, without the background articles. */
export function newsSources(research: StoryResearch): ResearchSource[] {
  return research.sources.filter((source) => !source.background);
}
