// The fixed intro every Instagram reel says, and how a reel's length is counted
// around it (the team's Script Comparison sheet, 11 Nov 2026).
//
// "Every script must include exactly this line, on its own line", placed right
// after the hook (the opening line plus its follow-up line, if it has one) and
// never first. The prompt asks for it; this guarantees it, word for word, as
// its own shot, so the editor never retypes a line that is nearly right.
//
// The 80-115 words in the team's brief are the script itself. The fixed intro
// and the lane's closing line are said on top of them, so they are not counted.
//
// Client-safe. No model call.
import { closingLineFor, ctaFor } from "@/lib/script-families";
import { isWorkflowCta } from "@/lib/tool-workflow";

export const FIXED_INTRO =
  "Hi, I'm Dr. Pritesh Patel and I make AI simple for marketing and business.";

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The fixed intro, or a near-miss of it ("Hi, I'm Pritesh Patel, and I make
 * AI simple for business."), as a sentence inside a line.
 */
const INTRO_SENTENCE =
  /(^|(?<=[.?!]\s))\s*["“]?\s*(hi|hello|hey)[, ]+i'?m\s+(dr\.?\s+)?pritesh(\s+patel)?\b[^.?!]*\bai simple\b[^.?!]*[.?!]?["”]?/gi;

/** True when a line is the fixed intro, exactly or nearly. */
export function isFixedIntro(line: string): boolean {
  const text = normalise(line);
  return text === normalise(FIXED_INTRO) || /^(hi|hello|hey) i'?m (dr )?pritesh/.test(text);
}

/**
 * A reel's shots with the fixed intro as its own shot right after the hook
 * (the first shot), and nowhere else. A copy the writer put elsewhere, or
 * folded into another line, is taken out first, so it is said once.
 */
export function withFixedIntro<T extends { voiceover: string }>(
  shots: T[],
  introShot: (line: string) => T,
): T[] {
  if (!shots.length) return shots;
  const cleaned = shots
    .map((shot) =>
      isFixedIntro(shot.voiceover ?? "")
        ? null
        : {
            ...shot,
            voiceover: (shot.voiceover ?? "")
              .replace(INTRO_SENTENCE, " ")
              .replace(/[ \t]{2,}/g, " ")
              .trim(),
          },
    )
    .filter((shot): shot is T => shot !== null && Boolean(shot.voiceover.trim()));
  if (!cleaned.length) return shots;
  return [cleaned[0]!, introShot(FIXED_INTRO), ...cleaned.slice(1)];
}

/** Whether a reel's voiceover says the fixed intro right after the hook. */
export function introIssue(voiceovers: string[]): string | null {
  const lines = voiceovers.map((line) => line.trim()).filter(Boolean);
  const at = lines.findIndex((line) => isFixedIntro(line));
  if (at === -1) return `the fixed intro is missing: "${FIXED_INTRO}" goes right after the hook`;
  if (at === 0) return "the reel opens on the fixed intro; it goes right after the hook";
  if (at > 1) return "the fixed intro comes too late; it goes right after the hook";
  return null;
}

/** Words actually spoken: a bracketed note for the team is never said. */
export const spokenWordCount = (text: string) =>
  text
    .replace(/\[[^\]]*\]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

/**
 * The script's own words, as the team's brief counts them (80-115): every
 * spoken line except the fixed intro and the lane's closing line.
 */
export function scriptWords(
  voiceovers: string[],
  lane: string | null | undefined,
  title = "",
): number {
  const closing = new Set(
    [ctaFor(lane), closingLineFor(lane, title)].filter(Boolean).map((line) => normalise(line!)),
  );
  const body = voiceovers
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isFixedIntro(line))
    .map((line) => {
      // The closing line is usually its own shot, but may end the last one.
      let text = line;
      for (const cta of closing) {
        if (normalise(text).endsWith(cta)) {
          const words = cta.split(" ").length;
          text = text.split(/\s+/).slice(0, -words).join(" ");
        }
      }
      if (isWorkflowCta(text)) return "";
      return text;
    });
  return spokenWordCount(body.join(" "));
}
