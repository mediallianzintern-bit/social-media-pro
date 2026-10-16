import { subjectWords } from "./hook-check.ts";

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
