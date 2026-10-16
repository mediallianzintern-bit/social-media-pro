// Holding a hook to the reel it opens.
//
// A hook is the first thing said, so it has to be about what the reel is
// about: the tool, the brand, the campaign, the development. Writers kept
// opening on the everyday example instead — "Imagine creating ads without
// the usual hassle." on a reel about X's new ad builder — which is a line
// that could open any reel and says nothing about this one. Pritesh's brief
// asks for "Imagine…" and "Let's say…" to mark a hypothetical, which is the
// Example's job, after the subject is on the table, not the hook's.
//
// Client-safe. No model call.

/** Words that say nothing about what a particular reel is about. */
const NOT_SUBJECT = new Set(
  (
    "a an and are as at be but by can do for from get how i if in into is it its just let me more " +
    "my new next now of on or our so than that the their them then there this to too try up us " +
    "use using was we what when will with you your ai tool tools app feature workflow workflows " +
    "follow save time see like want ways way marketing tip tips update updates launch launches " +
    "launched build builds help helps make makes work works s t d m ll ve re"
  ).split(" "),
);

/**
 * The words in a text that could identify its subject, lightly normalised:
 * lower case, possessives and plurals folded, so "X's" is "x" and "ads" is
 * "ad". Single letters are kept, because a brand can be one ("X").
 */
export const subjectWords = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/'s\b/g, "")
      .split(/[^a-z0-9]+/)
      // "launches" is checked as written, then folded, so neither form slips through.
      .filter((word) => word.length >= 1 && !NOT_SUBJECT.has(word))
      .map((word) => (word.length >= 3 ? word.replace(/s$/, "") : word))
      .filter((word) => !NOT_SUBJECT.has(word)),
  );

/**
 * An opening that starts on a hypothetical or the viewer's everyday life
 * rather than the subject: "Imagine…", "Picture…", "Let's say you run…",
 * "What if…", "Suppose…", "Ever…".
 */
const HYPOTHETICAL_OPENER =
  /^\s*["“']?(imagine|picture|let'?s say|say you|what if|suppose|pretend|ever (wish|wonder|feel|notice|struggle|spend)|you know (when|that feeling))\b/i;

/**
 * Why a hook is not about its reel, or null when it is.
 *
 * `subject` is the reel's title and angle. The hook must open on the subject
 * itself, and share at least one word with it, so it names the thing the reel
 * is about rather than a situation the viewer might be in.
 */
export function hookIssue(hook: string, subject: string): string | null {
  const line = hook.replace(/[‘’]/g, "'").trim();
  if (!line) return null;
  if (HYPOTHETICAL_OPENER.test(line)) {
    return `the hook "${line}" opens on a hypothetical; open on what the reel is about, the example comes later`;
  }
  const about = subjectWords(subject);
  if (about.size && ![...subjectWords(line)].some((word) => about.has(word))) {
    return `the hook "${line}" never names what the reel is about`;
  }
  return null;
}
