// What a script IS, reduced to features the learning loop can group by.
//
// The loop used to see one thing about a filmed idea: its hook line and the
// single trait label the model gave it. That answers "did this idea work" but
// never "which KIND of script works here" — every script is one of a handful of
// shapes, and without naming the shape there is nothing to compare across
// ideas.
//
// Every feature here is computed by rule, in TypeScript, from the script text.
// No model classifies anything. That matters more than precision: a rule that
// labels a hook "contrarian" slightly too eagerly does it identically on every
// idea, so a comparison between groups is fair. A model's labels would drift
// run to run, and the loop would end up learning its classifier's moods.
//
// Client-safe: the scorecard shows these labels, and must show them with the
// same wording the server grouped by.

export type HookType =
  "question" | "number" | "direct_address" | "contrarian" | "named_subject" | "story" | "statement";

export type CtaType = "save" | "share" | "comment" | "follow" | "dm" | "link" | "none";

export type LengthBucket = "short" | "medium" | "long";

export interface ScriptFeatures {
  hookType: HookType;
  hookWords: number;
  /** Seconds for a reel; null for written formats. */
  durationSeconds: number | null;
  /** Words for a written format; spoken words for a reel. */
  words: number;
  lengthBucket: LengthBucket;
  /** Reel shots, carousel slides, article sections or document pages. */
  units: number;
  /** Seconds per shot — pacing. Null for written formats. */
  secondsPerShot: number | null;
  ctaType: CtaType;
  /** Reel/carousel: the first shot puts the hook on screen as text. */
  textOnOpening: boolean | null;
  format: string;
}

export const HOOK_LABEL: Record<HookType, string> = {
  question: "Opens with a question",
  number: "Opens with a number or stat",
  direct_address: "Talks to the viewer (“you”)",
  contrarian: "Contrarian / negation",
  named_subject: "Names the brand or person first",
  story: "Opens with a story",
  statement: "Plain statement",
};

export const CTA_LABEL: Record<CtaType, string> = {
  save: "Asks to save",
  share: "Asks to share",
  comment: "Asks to comment",
  follow: "Asks to follow",
  dm: "Asks for a DM",
  link: "Points to a link",
  none: "No call to action",
};

export const LENGTH_LABEL: Record<LengthBucket, string> = {
  short: "Short",
  medium: "Medium",
  long: "Long",
};

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

const OPENERS_THAT_ARE_NOT_NAMES = new Set(
  (
    "the a an this that these those it its i im i'm we our my me you your here there " +
    "most many every everyone nobody no one some what why how when where who stop never " +
    "dont don't if so and but"
  ).split(" "),
);

/**
 * The opening move, by priority. First match wins, and the order is the
 * definition: a hook that is both a question and names a brand is a question,
 * because that is what the viewer experiences first.
 *
 * `subjectHint` is the idea's title or source subject. "Names the brand first"
 * cannot be read off capitalisation alone — every sentence starts with a
 * capital, so "Chips are the new oil" would count — so the opener only counts
 * as a name when the idea itself names it, or when its shape can only be a
 * name: a possessive ("Tide's"), or internal capitals ("OpenAI", "iPhone").
 */
export function classifyHook(hook: string, subjectHint = ""): HookType {
  const text = hook.trim();
  const first = text.split(/(?<=[.!?])\s/)[0] ?? text;
  const lower = first.toLowerCase();

  if (/\?/.test(first)) return "question";
  if (
    /^\W*(\d|₹|\$|£|€)/.test(text) ||
    /\b\d+(\.\d+)?\s?(%|x|×|k|m|million|crore|lakh)\b/i.test(first)
  )
    return "number";
  if (/^\W*(you|your|you're|youre)\b/i.test(text)) return "direct_address";
  if (
    /\b(not|never|no one|nobody|stop|don't|dont|didn't|didnt|isn't|isnt|wasn't|wasnt|won't|wont|can't|cant|doesn't|doesnt|wrong|myth|lie|mistake)\b/.test(
      lower,
    )
  )
    return "contrarian";
  if (/^\W*(i|i'm|im|when i|last (week|month|year)|yesterday|in \d{4})\b/i.test(text))
    return "story";

  const opener = (text.match(/^\W*([A-Za-z][\w'’&.-]*)/)?.[1] ?? "").replace(/[’]/g, "'");
  const bare = opener.replace(/'s$/i, "").toLowerCase();
  if (opener && !OPENERS_THAT_ARE_NOT_NAMES.has(bare)) {
    // Only the words that NAME the subject: the first word of the title or
    // subject ("Lifebuoy's roti campaign"), or any possessive ("Gmail's AI
    // inbox" names Gmail, not AI). Matching every word would let a generic
    // noun that happens to appear in the title pass as a brand.
    const names = new Set(
      subjectHint
        .split(/\s*\|\s*/)
        .flatMap((part) => {
          const words = part.trim().split(/\s+/).filter(Boolean);
          const possessives = words.filter((word) => /['’]s$/i.test(word));
          return [words[0] ?? "", ...possessives];
        })
        .map((word) =>
          word
            .replace(/['’]s$/i, "")
            .replace(/[^\w&.-]/g, "")
            .toLowerCase(),
        )
        .filter(Boolean),
    );
    const hinted = names.has(bare);
    const possessive = /'s$/i.test(opener);
    const internalCaps = /[a-z][A-Z]/.test(opener) || /^[a-z]+[A-Z]/.test(opener);
    if (hinted || possessive || internalCaps) return "named_subject";
  }
  return "statement";
}

/**
 * The single ask at the end. Read from the closing text only — a "save this"
 * buried mid-script is not the call to action the viewer leaves with.
 */
export function classifyCta(closing: string): CtaType {
  const text = closing.toLowerCase();
  if (/\b(save|bookmark)\b/.test(text)) return "save";
  if (/\b(share|send (this|it) to|tag (a|someone|your))\b/.test(text)) return "share";
  if (/\b(dm|message me|inbox)\b/.test(text)) return "dm";
  if (/\b(comment|tell me|let me know|drop a|reply)\b/.test(text)) return "comment";
  if (/\b(follow|subscribe)\b/.test(text)) return "follow";
  if (/\b(link in|link below|click|sign up|register|download)\b/.test(text)) return "link";
  return "none";
}

function lengthBucket(format: string, durationSeconds: number | null, words: number): LengthBucket {
  if (durationSeconds != null) {
    if (durationSeconds <= 30) return "short";
    if (durationSeconds <= 60) return "medium";
    return "long";
  }
  // Written formats. The cut points differ by format because "long" for a
  // LinkedIn post is short for an article.
  if (format === "article") {
    if (words <= 600) return "short";
    if (words <= 1200) return "medium";
    return "long";
  }
  if (words <= 120) return "short";
  if (words <= 250) return "medium";
  return "long";
}

/** The minimal shape features are computed from, so old stored rows qualify too. */
export interface ScriptLike {
  format: string;
  hook: string;
  shots?:
    Array<{ voiceover?: string | undefined; onScreenText?: string | undefined }> | null | undefined;
  production?: { durationSeconds?: number | undefined } | null | undefined;
  post?:
    | {
        body?: string | undefined;
        sections?: Array<{ heading?: string | undefined; text?: string | undefined }> | undefined;
      }
    | null
    | undefined;
  caption?: string | null | undefined;
  /** The idea's title — names the subject, so a hook opening on it is "named". */
  title?: string | undefined;
  source?: { subject?: string | undefined } | null | undefined;
}

export function scriptFeatures(script: ScriptLike): ScriptFeatures {
  const shots = script.shots ?? [];
  const sections = script.post?.sections ?? [];
  const written = !shots.length && Boolean(script.post);

  const spoken = shots.map((shot) => shot.voiceover ?? "").join(" ");
  const writtenText = [script.post?.body ?? "", ...sections.map((s) => s.text ?? "")].join(" ");
  const words = wordCount(written ? writtenText : spoken);

  const durationSeconds = written ? null : (script.production?.durationSeconds ?? null);
  const units = written ? sections.length || 1 : shots.length;

  const lastShot = shots[shots.length - 1];
  const closing = written
    ? [sections[sections.length - 1]?.text ?? "", script.post?.body?.slice(-280) ?? ""].join(" ")
    : [
        lastShot?.voiceover ?? "",
        lastShot?.onScreenText ?? "",
        script.caption?.slice(-280) ?? "",
      ].join(" ");

  return {
    hookType: classifyHook(
      script.hook,
      [script.title ?? "", script.source?.subject ?? ""].join(" | "),
    ),
    hookWords: wordCount(script.hook),
    durationSeconds,
    words,
    lengthBucket: lengthBucket(script.format, durationSeconds, words),
    units,
    secondsPerShot:
      durationSeconds != null && shots.length
        ? Number((durationSeconds / shots.length).toFixed(1))
        : null,
    ctaType: classifyCta(closing),
    textOnOpening: written ? null : Boolean(shots[0]?.onScreenText?.trim()),
    format: script.format,
  };
}
