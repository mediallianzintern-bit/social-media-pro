// What the team actually filmed, as script examples for the lane it went live
// in (10 Nov 2026).
//
// A script changes when it is filmed: the team rewrites the hook, cuts the
// body, says the CTA their way. Once a reel is live and analysed, its
// transcript is that filmed script, word for word and timed. It is given to
// the writer, automatically, as an example of how a script in that lane is
// built, the next time anyone ticks a topic in that lane and presses Write
// script. Nobody has to press Approve for it.
//
// Three rules:
//   - SAME LANE ONLY. The lane is the one the reel went live in, not the one
//     its script was written for (lib/reel-learning-types.ts laneChange), so a
//     Google Ads reel posted as Frontier AI teaches Frontier AI. The other
//     lanes' reels already teach every lane through the measured lessons.
//   - RESULTS DECIDE. A reel whose 14-day review found it did not work is
//     never shown: copying it would teach the structure that lost. One that
//     worked is shown first; one not reviewed yet is shown as pending, because
//     the team chose to film it that way.
//   - STRUCTURE ONLY. Its facts are an old story's: the prompt forbids reusing
//     any fact, name, figure or sentence.
//
// Client-safe and pure.

export interface FilmedScript {
  ideaId: string;
  title: string;
  /** The lane the reel went live in. */
  lane: string;
  /** What was said, as transcribed from the live reel. */
  transcript: string;
  filmedAt: string;
  /** True or false once the final review ran, null until then. */
  worked: boolean | null;
  /** Views (or impressions) against the typical one, once reviewed. */
  ratio: number | null;
  hookType: string | null;
  bodyShape: string | null;
  cta: string | null;
  seconds: number | null;
  words: number | null;
}

/** Filmed scripts given to the writer per script: enough to show a shape, few enough to stay cheap. */
export const FILMED_SCRIPTS_SHOWN = 2;
/** A transcript is cut here: a long one is a long reel, and the start shows the shape. */
const MAX_TRANSCRIPT_CHARS = 1500;

const sameLane = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The filmed scripts to show for one lane: worked first, then not yet reviewed, newest first. */
export function pickFilmedScripts(
  scripts: FilmedScript[],
  lane: string | null | undefined,
  count = FILMED_SCRIPTS_SHOWN,
): FilmedScript[] {
  if (!lane?.trim()) return [];
  const rank = (script: FilmedScript) => (script.worked ? 0 : 1);
  return scripts
    .filter((script) => sameLane(script.lane, lane) && script.worked !== false)
    .filter((script) => script.transcript.trim())
    .sort((a, b) => rank(a) - rank(b) || b.filmedAt.localeCompare(a.filmedAt))
    .slice(0, count);
}

/** The writer's block for one lane, or "" when that lane has nothing filmed to show. */
export function filmedScriptsBlock(
  scripts: FilmedScript[],
  lane: string | null | undefined,
  linkedin = false,
): string {
  const picked = pickFilmedScripts(scripts, lane);
  if (!picked.length) return "";
  const thing = linkedin ? "post" : "reel";
  const measure = linkedin ? "impressions" : "views";
  return [
    `HOW THE TEAM ACTUALLY ${linkedin ? "PUBLISHED" : "FILMED"} ${lane!.toUpperCase()} ${thing.toUpperCase()}S — the words as said in the live ${thing}, after the team's own changes to our script. Build this script the way these are built: how the hook opens, the order of the parts, how long each part runs, how it ends. STRUCTURE ONLY: their facts belong to their own stories, so never use a fact, name or figure from them, and never copy or lightly reword a sentence.`,
    ...picked.map((script, index) => {
      const result = script.worked
        ? `WORKED, ${script.ratio !== null ? `${script.ratio.toFixed(2)}x` : "above"} the typical ${measure}`
        : "results not in yet";
      const shape = [
        script.hookType ? `hook: ${script.hookType}` : "",
        script.bodyShape ? `body: ${script.bodyShape}` : "",
        script.cta ? `CTA: "${script.cta}"` : "",
        script.seconds ? `about ${script.seconds} s` : "",
        script.words ? `${script.words} words` : "",
      ]
        .filter(Boolean)
        .join("; ");
      const transcript =
        script.transcript.length > MAX_TRANSCRIPT_CHARS
          ? `${script.transcript.slice(0, MAX_TRANSCRIPT_CHARS).trimEnd()}…`
          : script.transcript.trim();
      return `${linkedin ? "PUBLISHED" : "FILMED"} ${index + 1} — "${script.title}" (${result})${shape ? `\n${shape}` : ""}\n"""\n${transcript}\n"""`;
    }),
  ].join("\n");
}
