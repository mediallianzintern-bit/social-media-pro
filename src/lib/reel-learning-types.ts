// Learning from filmed reels — the shapes shared by the server and the drawer.
import type { BodyShape, CaptionStats, CtaType, ExampleType, HookType } from "@/lib/reel-parts";
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
  /**
   * The reel split into the same three parts as our script: ours against the
   * team's, with word counts and the share of ours that was said. Absent on
   * reels analysed before 21 October.
   */
  parts?: { hook: PartComparison; body: PartComparison; cta: PartComparison };
  /** The reel's opening, sorted by code into a kind a rule can be enforced on. */
  hookType?: HookType;
  /** How the reel ended, against the lane's agreed CTA. Checked in code. */
  cta?: { expected: string | null; spoken: string; type: CtaType; usedLaneCta: boolean };
  /** The main body's shape and the kind of example it used. */
  body?: { shape: BodyShape; exampleType: ExampleType };
  /** How long the reel runs: from the transcript's timestamps when it has them. */
  reel?: { seconds: number | null; measured: boolean; words: number };
  /** The posted caption's shape. */
  captionStats?: CaptionStats;
  /** False when the reel has no speech to transcribe; the caption stands in. */
  hadTranscript: boolean;
}

/** One part of the reel, ours against the team's. */
export interface PartComparison {
  ours: string;
  theirs: string;
  oursWords: number;
  theirsWords: number;
  /** Share of our words the team said, in order, 0-1. */
  overlap: number;
  verdict: ElementVerdict;
}

export type ElementEffect = "helped" | "hurt" | "unclear";

export interface ReelLesson {
  element: "topic" | "hook" | "script" | "cta" | "caption" | "hashtags";
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
  /**
   * Set when the review was asked for before the reel had run a full week
   * ("Get results now"): how many days it had run. Its figures were still
   * growing, so it is shown but never counted in patterns, rules or lessons,
   * and the 7-day review replaces it.
   */
  early?: { days: number };
}

/** A review that counts: run once the reel had its full week. */
export const isFinalReview = (learning: { review: ReelReview | null }): boolean =>
  Boolean(learning.review && !learning.review.early);

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

/**
 * Rules the loop has learned from results, and enforces in code where it can.
 * A rule needs a strong pattern behind it (3+ reviewed reels), never one reel.
 */
export interface LearnedRules {
  /** Kinds of hook that keep losing: rewritten by the Reviewer, dropped from Get more hooks. */
  blockedHookTypes: Array<{ type: HookType; reels: number; medianRatio: number }>;
  /** Hypothetical openers ("Imagine…") proved to work, so the rule against them is lifted. */
  allowHypotheticalHooks: { reels: number; medianRatio: number } | null;
  /** Hashtags that keep turning up on reels that lose: removed from new scripts. */
  blockedHashtags: Array<{ tag: string; reels: number; medianRatio: number }>;
}

export const NO_RULES: LearnedRules = {
  blockedHookTypes: [],
  allowHypotheticalHooks: null,
  blockedHashtags: [],
};
