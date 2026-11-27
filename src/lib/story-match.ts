// Is a script's title about the story it was written on? (27 Nov 2026)
//
// One model call writes a script's title, angle, "why now" and subject along
// with its hook and shots. Four times since 16 Nov it wrote the script from
// the story it was given but titled it after a brand from the voice brief's
// example reels ("Disney's Logo Mashup to Promote Hulu" on TechCrunch's "Left
// alone with nothing to do, AI agents started playing"). The Saved tab then
// opened a script whose heading named a different story.
//
// The test is deliberately loose: a title passes when ANY of its words (or
// the subject's) appears in the story's headline, its research, or the
// script itself. Only a title sharing nothing at all with either fails.

const STOP = new Set(
  (
    "the a an and or of to in on for with by is are was its it this that how why what " +
    "from at as new your you be into after can could these their they them will about " +
    "more most just when where who than then have has had not but our out one all"
  ).split(" "),
);

/** Lower case, accents off ("Ōura" is "oura"), words of four letters or more. */
export function keywords(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length >= 4 && !STOP.has(word));
}

const flat = (text: string) => text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** A word counts as present by its stem: "campaigns" matches "campaign". */
const present = (word: string, haystack: string) =>
  haystack.includes(word.slice(0, Math.max(4, word.length - 2)));

/**
 * True when neither the title nor the subject shares a single word with the
 * story or the script: the model titled the script after something else.
 */
export function titleOffStory(
  idea: { title: string; subject?: string | undefined },
  evidence: Array<string | undefined | null>,
): boolean {
  const haystack = flat(evidence.filter(Boolean).join(" \n "));
  if (!haystack.trim()) return false;
  const words = [...keywords(idea.title), ...keywords(idea.subject ?? "")];
  if (!words.length) return false;
  return !words.some((word) => present(word, haystack));
}
