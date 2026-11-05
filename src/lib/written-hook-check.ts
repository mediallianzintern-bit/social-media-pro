// Whether a LinkedIn opening can be offered at all (5 Nov 2026).
//
// "Get more hooks" always held its new openings to these checks. The two
// alternatives a new post arrives with were not checked, and came back with
// "What if AI shopping agents redefine the retail experience?" and "Could the
// secret to reaching Gen Z be authenticity?": a banned word, a stock phrase
// and the answer given away. One check now serves both.
//
// Client-safe and pure.
import type { ContentIdea } from "@/lib/ai-types";
import { newsOpenerIssue } from "@/lib/hook-check";
import { familiarOpening, jargonIn, stockPhrasesIn } from "@/lib/linkedin-readability";
import { voiceFlags } from "@/lib/voice-check";

/**
 * Stock phrases that make a hook sound like every other reel. A hook that
 * uses one is dropped rather than shown: they carry no point of view, which
 * is the one thing a hook has to have.
 */
export const CLICHES =
  /\b(next level|raised? the bar|masterclass|genius|game on|broke the internet|nailed it|level up|crushed it|took (it|things) up a notch|blew (everyone|us) away|mind[- ]?blowing|insane|wild)\b/i;

/**
 * Filler a LinkedIn subheadline falls back on when it has nothing to say:
 * "is making waves", "a closer look at", "offers valuable insights", all from
 * the alternatives of 5 Nov 2026. None is in his 43 posts.
 */
const OPENING_FILLER =
  /\b(making waves|next big (leap|thing)|wake-up call|a closer look|the future of \w+ is|game[- ]?changer|offers? (valuable |fresh )?insights?|fresh (lesson|direction))\b/i;

/**
 * Why a LinkedIn opening should not be offered, or null when it can be.
 * `pairs` when the post's hooks are a headline and a subheadline.
 */
export function writtenHookIssue(
  hook: string,
  idea: Pick<ContentIdea, "title" | "angle" | "format">,
  pairs: boolean,
): string | null {
  const lines = hook.split("\n").filter((line) => line.trim());
  // A pair is two lines, or it would be swapped in over only the headline.
  if (pairs && lines.length !== 2) return "not a headline and a subheadline";
  if (hook.split(/\s+/).length > (pairs ? 36 : 26)) return "too long for above see more";
  if (CLICHES.test(hook) || OPENING_FILLER.test(hook)) return "a cliché";
  if (newsOpenerIssue(hook)) return "opens like a news report";
  if (jargonIn(hook).length) return "uses jargon";
  if (familiarOpening(lines[0] ?? "")) return "tells the reader what they already know";
  if (stockPhrasesIn(hook).length) return "uses a stock marketing phrase";
  // The same checks the post itself is held to, applied to the opening alone.
  const probe = {
    ...idea,
    contentLane: "",
    hook,
    altHooks: [],
    caption: "",
    hashtags: [],
    post: undefined,
    shots: [
      { mark: "", shotType: "", visual: "", voiceover: hook, onScreenText: "", transition: "" },
    ],
  } as unknown as ContentIdea;
  // A LinkedIn opening may hold the subject back: the post names it within
  // its first few lines, which voiceFlags checks on the post itself.
  const flag = voiceFlags(probe, { allowHypotheticalHooks: true }).find(
    (entry) => !/words of voice over|hook opens on a hypothetical/.test(entry),
  );
  return flag ?? null;
}
