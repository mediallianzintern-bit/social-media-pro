import { subjectWords } from "./hook-check.ts";

/** Shared by the topic actions and writer; other AI/news lanes are not workflows. */
export function isAiToolWorkflowLane(lane: string | null | undefined): boolean {
  return /^ai tools? workflows?$/.test(
    (lane ?? "").trim().toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " "),
  );
}

/**
 * The AI tool workflows CTA, as the team set it: the viewer comments one
 * keyword and is sent the full step-by-step guide. The keyword is the
 * reel's own, in capitals, so the comments for each reel can be told apart:
 * "Comment ADS and I'll send you the full step-by-step guide."
 *
 * Pritesh's brief allows a promised guide only once it is confirmed to exist.
 * The team has asked for this CTA on every workflow reel, which is them
 * confirming it: whoever posts the reel sends the guide to each commenter.
 */
export function workflowCta(keyword: string): string {
  return `Comment ${keyword} and I'll send you the full step-by-step guide.`;
}

/** "Comment ADS …": the word after "comment", which must be in capitals. */
const COMMENT_KEYWORD = /\b[Cc]omment\s+["\u201c']?([A-Z0-9][A-Z0-9-]{0,19})["\u201d']?(?![a-z])/;

/** …and what they get for it: the guide, the process, the steps. */
const SENDS_GUIDE =
  /\b(send|get|dm|message)\b[^.?!]*\b(guide|process|step[- ]by[- ]step|steps|workflow|walkthrough)\b/i;

/** True when the line is the comment-a-keyword CTA in its agreed shape. */
export function isWorkflowCta(line: string): boolean {
  const text = line.replace(/[\u2018\u2019]/g, "'");
  return COMMENT_KEYWORD.test(text) && SENDS_GUIDE.test(text);
}

/**
 * A keyword for the comment CTA when the writer did not give one, in
 * capitals: the product named after a brand's possessive ("Google's Gemini 4
 * launch" gives GEMINI, "Meta's Muse Spark" gives MUSE), otherwise the
 * longest word of the title that says what it is about ("X's new AI tool
 * that builds ads" gives ADS).
 */
export function workflowKeyword(title: string): string {
  const product = /\b[A-Za-z0-9]+['\u2019]s\s+([A-Za-z0-9]{2,20})\b/.exec(title)?.[1];
  if (product && subjectWords(product).size > 0) return product.toUpperCase();
  const candidates = title
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/'s\b/gi, "")
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length >= 2 && subjectWords(word).size > 0);
  const best = candidates.reduce<string>(
    (longest, word) => (word.length > longest.length ? word : longest),
    "",
  );
  return (best || "GUIDE").toUpperCase().slice(0, 20);
}

/**
 * Why an AI tool workflow reel's closing line is not the comment CTA, or
 * null when it is.
 */
export function workflowCtaIssue(closingLine: string, subject: string): string | null {
  const line = closingLine.trim();
  if (isWorkflowCta(line)) return null;
  const example = workflowCta(workflowKeyword(subject));
  return line
    ? `the closing line "${line}" is not this lane's CTA; end on the comment CTA, e.g. "${example}", with one keyword from this topic in capitals`
    : `the reel has no closing line; end on the comment CTA, e.g. "${example}"`;
}
