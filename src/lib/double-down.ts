// T62 — double down on a winner: two variations while it is still fresh.
//
// When a post breaks out, the cheapest next hit is a variation of it, made
// soon. Two directions, because a breakout rarely says which half of it
// worked — the SUBJECT or the SHAPE — and making one of each is how you find
// out:
//
//   A. Same subject, a new opening. If the topic was the draw, a fresh angle
//      on it lands again with the people who just discovered it.
//   B. Same opening, the next subject. If the structure was the draw, it
//      carries over to a new topic in the same lane.
//
// Everything here is measured, not narrated. The play this replaces asserted
// that every best post won with "a flat claim that contradicts what the viewer
// expects" — a fixed sentence printed over posts that opened with a question,
// a number or a brand name just the same. The opening type is now classified
// from the post's own first line by the same rules the scorecard uses, and the
// alternative opening is the one this account's own posts measurably reward.
//
// Client-safe. No model call: these are plays, computed from stored posts.
import { classifyHook, type HookType } from "@/lib/script-features";
import {
  engagementsOf,
  organicPosts,
  viewsOf,
  type PlatformId,
  type PostRecord,
} from "@/lib/analytics-types";

/** A breakout older than this is a post to learn from, not a moment to ride. */
export const HIT_WINDOW_DAYS = 21;

/** At least this multiple of the account's median to count as a hit. Matches insights' outliers. */
export const HIT_MULTIPLE = 2;

/** Posts of an opening type needed before its median is trusted. */
const MIN_HOOK_SAMPLE = 3;

export interface Hit {
  post: PostRecord;
  multiple: number;
  ageDays: number;
  /** True when the hit is inside HIT_WINDOW_DAYS — worth riding, not just studying. */
  fresh: boolean;
  hook: HookType;
  opening: string;
}

export interface HookScore {
  hook: HookType;
  median: number;
  posts: number;
}

function primary(post: PostRecord, useViews: boolean): number {
  return useViews ? viewsOf(post) : engagementsOf(post);
}

function median(values: number[]): number {
  const sorted = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The first sentence of a caption: where these accounts put the hook. */
export function openingOf(caption: string): string {
  const first =
    caption
      .replace(/\s+/g, " ")
      .trim()
      .split(/(?<=[.!?])\s/)[0] ?? "";
  return first.slice(0, 120).trim();
}

/**
 * The strongest post at HIT_MULTIPLE or better, preferring a fresh one.
 *
 * A fresh hit wins over a bigger old one: the point of doubling down is to
 * act while the audience that found the post is still around, and a
 * five-week-old breakout is a lesson rather than a moment.
 */
export function findHit(
  allPosts: PostRecord[],
  useViews: boolean,
  overallMedian: number,
  now = Date.now(),
): Hit | null {
  if (overallMedian <= 0) return null;
  const candidates = organicPosts(allPosts)
    .map((post) => {
      const multiple = primary(post, useViews) / overallMedian;
      const ageDays = Math.max(
        0,
        Math.floor((now - new Date(post.publishedAt).getTime()) / 86_400_000),
      );
      return { post, multiple, ageDays, fresh: ageDays <= HIT_WINDOW_DAYS };
    })
    .filter((entry) => entry.multiple >= HIT_MULTIPLE);
  if (!candidates.length) return null;

  candidates.sort((a, b) => Number(b.fresh) - Number(a.fresh) || b.multiple - a.multiple);
  const best = candidates[0]!;
  const opening = openingOf(best.post.caption);
  return {
    ...best,
    multiple: Number(best.multiple.toFixed(1)),
    hook: classifyHook(opening),
    opening,
  };
}

/** How each opening type does on THIS account, as a multiple of its median. */
export function hookScores(
  allPosts: PostRecord[],
  useViews: boolean,
  overallMedian: number,
): HookScore[] {
  if (overallMedian <= 0) return [];
  const byHook = new Map<HookType, number[]>();
  for (const post of organicPosts(allPosts)) {
    const opening = openingOf(post.caption);
    if (!opening) continue;
    const hook = classifyHook(opening);
    byHook.set(hook, [...(byHook.get(hook) ?? []), primary(post, useViews) / overallMedian]);
  }
  return [...byHook.entries()]
    .filter(([, multiples]) => multiples.length >= MIN_HOOK_SAMPLE)
    .map(([hook, multiples]) => ({
      hook,
      median: Number(median(multiples).toFixed(2)),
      posts: multiples.length,
    }))
    .sort((a, b) => b.median - a.median);
}

/**
 * When the account has too few posts of other openings to measure, a
 * contrasting one — so variation A still changes the angle rather than
 * repeating the hit with new words.
 */
const CONTRAST: Record<HookType, HookType> = {
  question: "number",
  number: "question",
  direct_address: "story",
  contrarian: "number",
  named_subject: "question",
  story: "contrarian",
  statement: "question",
};

/** The opening to try for variation A, and the evidence for choosing it. */
export function alternativeHook(
  hit: Hit,
  scores: HookScore[],
): { hook: HookType; evidence: string | null } {
  const measured = scores.find((score) => score.hook !== hit.hook && score.median >= 1);
  if (measured) {
    return {
      hook: measured.hook,
      evidence: `On this account, posts that ${HOOK_PRESENT[measured.hook]} run ${measured.median}× the median across ${measured.posts} posts.`,
    };
  }
  return { hook: CONTRAST[hit.hook], evidence: null };
}

/**
 * The angle each opening type implies — what to actually CHANGE about the
 * subject, not just how to start the sentence.
 *
 * Variation A used to say "a new angle, not a rerun" and leave the angle to
 * the person reading it, which is the one part of the play that needed saying.
 * The angle is not invented here either: it follows from the opening this
 * account's own posts reward, so "put the number on it" is only ever suggested
 * because posts that open with a number measurably do better here.
 */
export const ANGLE: Record<HookType, { title: string; direction: string }> = {
  question: {
    title: "answer what the hit left open",
    direction:
      "Open on the question your hit raised and never answered — the one the comments kept asking — then answer it with one mechanism.",
  },
  number: {
    title: "put the number on it",
    direction:
      "Same subject, led by the figure: what it cost, what it earned, or how long it took. On screen in the first second, and sourced.",
  },
  contrarian: {
    title: "argue the other side",
    direction:
      "Same subject, opposite stance: who this fails for, and why. Name the case where the advice in the hit breaks.",
  },
  direct_address: {
    title: "make it the viewer's problem",
    direction:
      "Same subject, aimed at one person: what they should do differently this week because of it.",
  },
  named_subject: {
    title: "open on the brand behind it",
    direction:
      "Same mechanism, but name the company or person at the centre of it first — no setup, no preamble.",
  },
  story: {
    title: "tell the moment behind it",
    direction:
      "Same subject as a scene: where you were, what happened, what it changed. Start in the middle of it.",
  },
  statement: {
    title: "lead with the conclusion",
    direction:
      "Same subject, but state the conclusion in the first line and spend the rest of it proving the claim.",
  },
};

export interface NewAngle {
  hook: HookType;
  /** The angle as a short phrase, for a label: "put the number on it". */
  title: string;
  /** How to execute it — one line, concrete enough to film from. */
  direction: string;
  /** The account's own figures behind the choice, where they exist. */
  evidence: string | null;
}

/**
 * The angle to take on the hit's subject, and why that one.
 *
 * A breakout is a subject the audience has just shown it wants more of, and
 * the cheapest second hit is the same subject turned a different way. Which
 * way is decided by alternativeHook — the opening this account rewards that
 * the hit did not already use — so the angle inherits that evidence rather
 * than being a stock suggestion.
 */
export function newAngle(hit: Hit, scores: HookScore[]): NewAngle {
  const alternative = alternativeHook(hit, scores);
  const angle = ANGLE[alternative.hook];
  return { hook: alternative.hook, ...angle, evidence: alternative.evidence };
}

/**
 * Each opening as a verb phrase, present and past, for use inside a sentence.
 *
 * HOOK_LABEL is a list of chip labels and mixes noun phrases ("Plain
 * statement") with verb phrases ("Opens with a question"), so lower-casing it
 * into a sentence produced "posts that plain statement run 1.23×". These read
 * correctly after "posts that …" and "your hit …".
 */
export const HOOK_PRESENT: Record<HookType, string> = {
  question: "open with a question",
  number: "open with a number",
  direct_address: "talk straight to the viewer",
  contrarian: "contradict an assumption",
  named_subject: "name the brand or person first",
  story: "open with a story",
  statement: "open with a plain statement",
};

export const HOOK_PAST: Record<HookType, string> = {
  question: "opened with a question",
  number: "opened with a number",
  direct_address: "talked straight to the viewer",
  contrarian: "contradicted an assumption",
  named_subject: "named the brand or person first",
  story: "opened with a story",
  statement: "opened with a plain statement",
};

/** How to open, for each type — the one line of direction a variation needs. */
export const HOOK_DIRECTION: Record<HookType, string> = {
  question: "Open on the question the viewer is already asking themselves.",
  number: "Open with the specific number — on screen in the first second, sourced.",
  direct_address: "Open by talking straight to the viewer: “You …”.",
  contrarian: "Open by contradicting what the viewer assumes is true.",
  named_subject: "Open by naming the brand or person before anything else.",
  story: "Open in the middle of the moment — “Last week …”, not the backstory.",
  statement: "Open with the plain claim. No framing, no greeting.",
};

/** Where the beat marks are timecodes (filmed) versus sections (written). */
export function isWritten(platform: PlatformId): boolean {
  return platform === "linkedin";
}
