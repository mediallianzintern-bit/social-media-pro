// What a LinkedIn post is about, read from its full text (Oct 2026). Pritesh
// Sir's posts and each competitor's are analysed the same way, so lanes come
// from what he writes and competitors are judged on what they write, never on
// a bio or a job title. Client-safe types.

export const POST_FORMATS = [
  "news_breakdown",
  "how_to",
  "opinion",
  "story",
  "list",
  "article_teaser",
  "other",
] as const;
export type PostFormat = (typeof POST_FORMATS)[number];

export const HOOK_KINDS = [
  "named_subject",
  "question",
  "bold_claim",
  "statistic",
  "story",
  "contrast",
  "other",
] as const;
export type HookKind = (typeof HOOK_KINDS)[number];

export interface PostAnalysis {
  /** The brand, tool, company or event the post is about, or "none". */
  subject: string;
  /** What the post is about, in a short phrase ("AI changing how ads are bought"). */
  topic: string;
  format: PostFormat;
  hook: HookKind;
  /** The point the reader is left with, in one sentence. */
  takeaway: string;
  /** Who it is written for ("marketers", "business owners", "students"). */
  audience: string;
  words: number;
}

export interface ProposedLane {
  name: string;
  definition: string;
  /** Subjects and topics that belong here, from his posts. */
  covers: string[];
  /** How many of his analysed posts fall in it. */
  posts: number;
  /** A few of his post openings that belong here, for the team to recognise. */
  examples: string[];
}
