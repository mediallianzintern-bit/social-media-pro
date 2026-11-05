// Whether a LinkedIn post's figures come from the story it was written from
// (5 Nov 2026).
//
// The team's rule: a post's facts are compulsory, correct and accurate. A
// model asked not to invent figures still does: the AI shopping post of 5 Nov
// said "In September 2023, Amazon banned Meta's shopping assistant", for a
// tool launched in 2026. A figure the story does not contain is either cut by
// the review or shown to the team as a fact to check before posting.
//
// Only figures are checked here (amounts, counts, percentages, years). Names
// and claims without a number are the review's to keep to the story, and the
// team's to tick off.
//
// Client-safe and pure.

const UNITS: Record<string, number> = {
  thousand: 1e3,
  k: 1e3,
  lakh: 1e5,
  million: 1e6,
  mn: 1e6,
  m: 1e6,
  crore: 1e7,
  billion: 1e9,
  bn: 1e9,
  b: 1e9,
  trillion: 1e12,
};

interface Figure {
  /** As the text writes it: "66 million", "2030", "1.2 million". */
  text: string;
  value: number;
  /** A bare four-digit year, which must match exactly. */
  year: boolean;
}

/**
 * The figures a text states: "66 million" is 66,000,000, "$1.2 million"
 * 1,200,000, "10% to 20%" gives 10 and 20, and "GPT-6.1" gives 6.1, which
 * the story names the product by. A numbered list's "1." is not a figure.
 */
function figureList(text: string): Figure[] {
  const cleaned = text.replace(/^\s*\d+[.)]\s/gm, " ");
  const pattern =
    /(\d[\d,]*(?:\.\d+)?)(?:\s?(thousand|million|billion|trillion|crore|lakh|bn|mn|k|m|b)\b)?/gi;
  const found: Figure[] = [];
  for (const match of cleaned.matchAll(pattern)) {
    const digits = match[1]!.replace(/,(?=\d{3}\b)/g, "").replace(/,$/, "");
    const unit = match[2]?.toLowerCase();
    const value = Number(digits) * (unit ? UNITS[unit]! : 1);
    if (!Number.isFinite(value)) continue;
    const shown = `${digits.replace(/\.0+$/, "")}${unit && unit.length > 2 ? ` ${unit}` : (unit ?? "")}`;
    if (found.some((figure) => figure.text === shown)) continue;
    found.push({ text: shown, value, year: !unit && /^(19|20)\d\d$/.test(digits) });
  }
  return found;
}

/** The figures a text states, as it writes them. */
export function figuresOf(text: string): string[] {
  return figureList(text).map((figure) => figure.text);
}

/**
 * Whether a post's figure is one the story gives: the same number, or for an
 * amount of a thousand or more, the story's rounded ("$1.2 million" for
 * "$1,213,430"). A year matches only itself.
 */
function matches(figure: Figure, known: Figure[]): boolean {
  return known.some((entry) => {
    if (figure.year || entry.year)
      return figure.year === entry.year && figure.value === entry.value;
    if (figure.value === entry.value) return true;
    return (
      figure.value >= 1000 &&
      entry.value >= 1000 &&
      Math.abs(figure.value - entry.value) / entry.value <= 0.05
    );
  });
}

/** The figures in `body` that `story` never states. Empty when there is no story to check against. */
export function unsupportedFigures(body: string, story: string): string[] {
  if (!story.trim()) return [];
  const known = figureList(story);
  return figureList(body)
    .filter((figure) => !matches(figure, known))
    .map((figure) => figure.text);
}

/**
 * Years in a post well before the story's own date. The fact sheet can carry
 * one wrongly: the AI shopping research of 5 Nov 2026 dated a 2026 event to
 * "September 2023", and the post repeated it. A year more than one before the
 * story's is not wrong in itself (a brand founded in 2011), so it is a fact
 * to check, never a rewrite.
 */
export function earlyYears(body: string, publishedAt: string | null | undefined): string[] {
  const storyYear = publishedAt ? new Date(publishedAt).getUTCFullYear() : NaN;
  if (!Number.isFinite(storyYear)) return [];
  return figureList(body)
    .filter((figure) => figure.year && figure.value < storyYear - 1)
    .map((figure) => figure.text);
}

/** The figures in `body` that also appear in `fact`: whether the post states that fact. */
export function sharesFigures(body: string, fact: string): boolean {
  const known = figureList(fact).filter((figure) => !figure.year);
  return known.length > 0 && figureList(body).some((figure) => matches(figure, known));
}
