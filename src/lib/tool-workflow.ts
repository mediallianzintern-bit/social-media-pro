/** Shared by the topic actions and writer; other AI/news lanes are not workflows. */
export function isAiToolWorkflowLane(lane: string | null | undefined): boolean {
  return /^ai tools? workflows?$/.test(
    (lane ?? "").trim().toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " "),
  );
}

/**
 * A sign-off that would fit any reel. The daily line belongs to the other
 * lanes; "Follow for more AI and marketing tips. See you next time." is the
 * model drifting back to it, which is what an AI tool workflow reel ended on
 * when its CTA was meant to be written for the tool it shows.
 */
const GENERIC_SIGN_OFF =
  /\b(see you (next time|tomorrow|soon)|(ai|marketing) (tips|updates)|daily ai|follow for more\b(?! \w+ (with|using|like|for) ))/i;

/** Words that say nothing about this reel's tool or task. */
const NOT_SUBJECT = new Set(
  (
    "a an and are as at be but by can do for from get how i if in into is it its just let me more " +
    "my new next now of on or our so than that the their them then there this to too try up us " +
    "use using was we what when will with you your ai tool tools app feature workflow workflows " +
    "follow save time see like want ways way marketing tip tips update updates launch launches " +
    "launched build builds help helps make makes work works"
  ).split(" "),
);

const subjectWords = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/'s\b/g, "")
      .split(/[^a-z0-9]+/)
      .map((word) => (word.length >= 3 ? word.replace(/s$/, "") : word))
      .filter((word) => word.length >= 2 && !NOT_SUBJECT.has(word)),
  );

/**
 * Why an AI tool workflow reel's closing line is not written for its tool,
 * or null when it is.
 *
 * The lane's CTA is the one the writer composes, so it must name the tool or
 * the task the reel showed. A line that shares no word with the reel's
 * subject, or is a stock sign-off, is the generic CTA the team asked to stop.
 */
export function workflowCtaIssue(closingLine: string, subject: string): string | null {
  const line = closingLine.trim();
  if (!line) return "the reel has no closing line";
  if (GENERIC_SIGN_OFF.test(line)) {
    return `the closing line "${line}" is a generic sign-off; end on one action tied to this reel's tool or task`;
  }
  const about = subjectWords(subject);
  const said = subjectWords(line);
  if (about.size && ![...said].some((word) => about.has(word))) {
    return `the closing line "${line}" never names the tool or the task; end on one action tied to them`;
  }
  return null;
}
