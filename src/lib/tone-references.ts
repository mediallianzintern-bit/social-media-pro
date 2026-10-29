// Past Instagram scripts as tone references for new ones (Oct 2026).
//
// The team asked for scripts Pritesh actually posted to be given to the
// writer as examples of how he sounds: his phrasing, his point of view, how he
// talks to business owners. This is giving examples, not retraining a model.
// Three rules keep it honest:
//   - VOICE ONLY. A reference's facts are an old story's; a new script's facts
//     come from its own research. The prompt says so, and never puts a
//     reference beside the story's facts as if it were a source.
//   - NO COPYING. The writer learns the rhythm, never reuses a sentence.
//   - CONFLICTS ARE SHOWN, NOT SETTLED SILENTLY. Where a reference breaks a
//     rule of his Tone and Voice brief (too long, a hypothetical opening, an
//     exclamation mark, engagement bait, a different sign-off), the code finds
//     it, the brief is followed, and the drawer says which reference conflicted
//     and how, so Rashmi can judge.
//
// Client-safe and pure.
import { HYPOTHETICAL_OPENER } from "@/lib/hook-check";
import { ctaFor, scriptFamily } from "@/lib/script-families";

export interface ToneReference {
  id: string;
  title: string;
  script: string;
  postedAt: string | null;
  lane: string | null;
}

/** A reference as kept on the idea it informed: never the script itself. */
export interface ToneReferenceUsed {
  id: string;
  title: string;
  postedAt: string | null;
  lane: string | null;
  /** Where this reference breaks a rule of his brief; the brief was followed. */
  conflicts: string[];
}

/** References given to the writer per script: enough for a voice, few enough to stay cheap. */
export const REFERENCES_PER_SCRIPT = 3;

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** His brief's spoken length (LENGTH, voice.ts): 90 to 115 words. */
const BRIEF_WORDS = { min: 90, max: 115 };

/** Where a reference breaks a rule of his Instagram Tone and Voice brief, in words. */
export function conflictsWithBrief(reference: Pick<ToneReference, "script" | "lane">): string[] {
  const script = reference.script.trim();
  const conflicts: string[] = [];
  const count = words(script);
  if (count > BRIEF_WORDS.max || count < BRIEF_WORDS.min) {
    conflicts.push(`${count} words; the brief says ${BRIEF_WORDS.min} to ${BRIEF_WORDS.max}`);
  }
  const first =
    script
      .split("\n")
      .find((line) => line.trim())
      ?.trim() ?? "";
  if (HYPOTHETICAL_OPENER.test(first)) {
    conflicts.push(
      "opens on a hypothetical (“What if…”, “Imagine…”); the first line should name the subject",
    );
  }
  if (/!/.test(script)) {
    conflicts.push("uses an exclamation mark; the brief avoids forced excitement");
  }
  if (/\b(sounds interesting|agree|thoughts)\?/i.test(script)) {
    conflicts.push("asks an engagement-bait question; the brief rules these out");
  }
  const expected = ctaFor(reference.lane);
  const last =
    script
      .split("\n")
      .filter((line) => line.trim())
      .at(-1)
      ?.trim() ?? "";
  if (expected && /\bfollow\b/i.test(last) && !last.includes(expected.split(".")[0]!)) {
    conflicts.push(`ends “${last}”; the lane's agreed line is “${expected}”`);
  }
  return conflicts;
}

/**
 * The references for one script: two from the same kind of reel (AI or
 * marketing, by lane), the newest first, and one from the other kind, so the
 * voice carries across both without copying one script's shape.
 */
export function pickReferences(
  references: ToneReference[],
  lane: string | null | undefined,
  count = REFERENCES_PER_SCRIPT,
): ToneReference[] {
  const newest = [...references].sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));
  const family = lane ? scriptFamily({ name: lane }) : null;
  const familyOf = (reference: ToneReference) =>
    reference.lane ? scriptFamily({ name: reference.lane }) : null;
  if (!family) return newest.slice(0, count);
  const exactLane = newest.filter((reference) => reference.lane === lane);
  const sameFamily = newest.filter(
    (reference) => familyOf(reference) === family && reference.lane !== lane,
  );
  const other = newest.filter((reference) => familyOf(reference) !== family);
  const same = [...exactLane, ...sameFamily].slice(0, count - 1);
  const picked = [...same, ...other.slice(0, count - same.length)];
  return picked.length >= count ? picked : newest.slice(0, count);
}

/** What the idea keeps: which references informed it, and how each conflicted with the brief. */
export function referencesUsed(references: ToneReference[]): ToneReferenceUsed[] {
  return references.map((reference) => ({
    id: reference.id,
    title: reference.title,
    postedAt: reference.postedAt,
    lane: reference.lane,
    conflicts: conflictsWithBrief(reference),
  }));
}

/** The references as the writer reads them: voice only, never facts. */
export function toneReferencesBlock(references: ToneReference[]): string {
  if (!references.length) return "";
  const listed = references
    .map((reference, index) => {
      const conflicts = conflictsWithBrief(reference);
      return `REFERENCE ${index + 1}, posted ${reference.postedAt ?? "recently"} (${reference.lane ?? "no lane"}):
${reference.script.trim()}${
        conflicts.length
          ? `\n[Where this one breaks the brief, follow the brief instead: ${conflicts.join("; ")}.]`
          : ""
      }`;
    })
    .join("\n\n");
  return `TONE REFERENCES — reels Pritesh actually posted, for HOW HE SOUNDS ONLY:
- Learn from them his phrasing, his rhythm, his point of view, the everyday analogies he reaches
  for ("Think of it like a restaurant kitchen"), how he turns a story into a lesson for business
  owners and marketers, and how plainly he says what matters.
- NEVER use a fact, name, figure or story from them. They are old reels about other stories; this
  script's facts come only from its own source material. A reference is not a source.
- NEVER copy or lightly reword a sentence from them. Write new sentences that sound like the same
  person.
- Where a reference and the brief disagree, the brief wins; each reference's conflicts are noted
  under it.

${listed}`;
}
