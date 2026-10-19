// Learning from filmed reels — the shapes shared by the server and the drawer.
//
// One filmed idea moves through four stages, each visible on its own:
//   filmed    the team pressed "I filmed this"; the reel is not live yet
//   found     the live reel was matched to the idea by its topic (free)
//   analysed  transcript + comparison: what was kept, changed or replaced (paid)
//   reviewed  once it has run a week: did it work, and why (paid)

/** A reel this many times the typical reel's views or more is called viral. */
export const VIRAL_RATIO = 3;

export type ReelUsage = "as_written" | "partly" | "topic_only";

export const REEL_USAGE_LABEL: Record<ReelUsage, string> = {
  as_written: "Used as written",
  partly: "Partly used",
  topic_only: "Topic only — the team wrote their own",
};

/** How one element of the reel relates to what the dashboard wrote. */
export type ElementVerdict = "as_written" | "adapted" | "own";

export const ELEMENT_VERDICT_LABEL: Record<ElementVerdict, string> = {
  as_written: "As written",
  adapted: "Adapted",
  own: "Team's own",
};

export interface ReelMatch {
  /**
   * How the reel was found, strongest first:
   *   topic    its caption names the story (brand, product, campaign)
   *   article  its caption shares names and facts with the source article
   *   timing   the only new reel around the time it was filmed; a guess
   *            until Analyse confirms the topic
   *   manual   a person linked it
   *   none     not linked (a wrong reel was unlinked; the search goes on)
   */
  by: "topic" | "article" | "timing" | "manual" | "none";
  /** False only for a timing guess not yet confirmed by Analyse. */
  confirmed: boolean;
  /** The distinctive words the reel's caption shared with the story. */
  words: string[];
  score: number;
  /** Reels found to cover a different story: never matched to this idea again. */
  rejected?: string[];
}

/** One measured pattern across every reviewed reel, counted in code. */
export interface ReelPattern {
  /** What is being grouped: "Hook style", "Script", "Lane"… */
  dimension: string;
  /** The group: "question", "team's own", "Marketing stunts"… */
  value: string;
  reels: number;
  worked: number;
  /** Median of views ÷ typical views across the group's reels. */
  medianRatio: number;
  /** Enough reels for the pattern to mean something (3 or more). */
  strong: boolean;
}

export interface ReelComparison {
  topic: { same: boolean; note: string };
  hook: {
    /** The first line the reel actually says (or shows, when nothing is said). */
    spoken: string;
    /** Which offered hook it was ("A", "B"…), or null when it was none of them. */
    variant: string | null;
    /** Word overlap with the closest offered hook, 0-1. Computed, not judged. */
    overlap: number;
    verdict: ElementVerdict;
    /** authority, curiosity, question, statement, hypothetical, story… */
    style: string;
    note: string;
  };
  script: {
    /** Share of the dashboard's spoken words the reel kept, in order, 0-1. Computed. */
    overlap: number;
    verdict: ElementVerdict;
    kept: string[];
    dropped: string[];
    added: string[];
    structure: string;
  };
  caption: {
    /** Word overlap between the two captions, hashtags removed, 0-1. Computed. */
    overlap: number;
    verdict: ElementVerdict;
    note: string;
  };
  hashtags: {
    /** All computed from the two lists; no judgement. */
    used: string[];
    dropped: string[];
    added: string[];
  };
  /** What the team does when they change a script, for the writer to learn. */
  teamStyle: string;
  /** False when the reel has no speech to transcribe; the caption stands in. */
  hadTranscript: boolean;
}

export type ElementEffect = "helped" | "hurt" | "unclear";

export interface ReelLesson {
  element: "topic" | "hook" | "script" | "caption" | "hashtags";
  kind: "repeat" | "avoid";
  lesson: string;
  /** The measured figure the lesson rests on. */
  evidence: string;
}

export interface ReelReview {
  /** Measured against this account's typical reel. Computed, never judged. */
  metrics: Array<{ label: string; value: number; typical: number | null; ratio: number | null }>;
  /** views ÷ typical views. The account's primary yardstick. */
  primaryRatio: number;
  summary: string;
  elements: Array<{
    element: ReelLesson["element"];
    effect: ElementEffect;
    why: string;
  }>;
  lessons: ReelLesson[];
  suggestions: string[];
}

export interface ReelLearning {
  ideaId: string;
  platform: "instagram" | "linkedin";
  filmedAt: string;
  filmedBy: string | null;
  shortcode: string | null;
  reelUrl: string | null;
  matchedAt: string | null;
  match: ReelMatch | null;
  /** When the matched reel was published, from the synced posts. */
  publishedAt: string | null;
  transcript: string | null;
  comparison: ReelComparison | null;
  usage: ReelUsage | null;
  analysedAt: string | null;
  review: ReelReview | null;
  worked: boolean | null;
  reviewedAt: string | null;
  /** When the review can run: the reel's publish time + the maturity window. */
  reviewableAt: string | null;
}
