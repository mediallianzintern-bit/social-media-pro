// Addendum D — content eras: when this account changed what it was doing.
//
// An era is a span during which the account was pursuing one strategy. It
// matters because every comparison in this system is against the account's own
// history, and history stops being a fair comparison the moment the account
// deliberately changed. An account that posted three carousels a week about
// SEO, then switched to daily marketing-stunt reels, has a median that
// describes neither period. Scoring today's reel against it flatters or
// punishes it for a decision someone made months ago on purpose.
//
// Boundaries are DETECTED HERE, IN CODE, not asked of a model. The whole
// scorecard rests on the claim that figures are computed rather than narrated,
// and "when did the strategy change" is a question a model would answer
// fluently and unfalsifiably. What follows is arithmetic on three observable
// things, and every boundary it proposes carries the numbers that produced it
// so a person can disagree with it.
//
// It PROPOSES. Nothing here writes an era: a strategy change is a fact about
// intent, and only the team knows whether a shift in the data was a decision
// or a quiet month.
//
// Client-safe.
import {
  organicPosts,
  type ContentFormat,
  type PlatformId,
  type PostRecord,
} from "@/lib/analytics-types";

/**
 * The classifier's "fits nothing" bucket. Not a subject, so not a signal.
 * Duplicated from server/ai/lanes.ts rather than imported: this file is
 * client-safe and that one reaches the OpenAI client.
 */
const OTHER = "other";

/** Posts required on each side of a split before it can be judged at all. */
export const MIN_POSTS_PER_SIDE = 12;

/**
 * Days a boundary must stand clear of its neighbours.
 *
 * Without it a single sharp change produces a cluster of boundaries a week
 * apart, all describing the same event, and the strongest one is buried among
 * its own echoes.
 */
export const MIN_ERA_DAYS = 45;

/**
 * How different the two sides must be before it is worth showing.
 *
 * Calibrated against this account's real history rather than chosen: see the
 * comment on detectEras. Below this, ordinary month-to-month drift starts
 * being reported as strategy.
 */
export const ERA_THRESHOLD = 0.35;

/** How many posts either side of a candidate date the comparison reads. */
const WINDOW = 20;

/**
 * What the detector saw, kept on a proposed era so the suggestion stays
 * auditable after it is accepted. A concrete shape rather than `unknown`:
 * this crosses the server boundary and has to be serializable.
 */
export interface EraDetection {
  score: number;
  reason: string;
  evidence: EraEvidence;
}

/** One stored era. The detector proposes these; a person confirms them. */
export interface ContentEra {
  id: string;
  platform: PlatformId;
  handle: string;
  /** ISO date. The era runs until the next one starts, or until now. */
  startsAt: string;
  label: string;
  note: string | null;
  /** Whether a person set this boundary or the detector proposed it. */
  origin: "manual" | "detected";
  /** The detector's score and evidence, when it proposed this. */
  detection: EraDetection | null;
  createdAt: string;
}

export interface EraEvidence {
  /** Posts per week before and after. */
  cadence: [number, number];
  /** 0-1, how much the format mix moved. */
  formatShift: number;
  /** 0-1, how much the lane mix moved. Zero when posts are unclassified. */
  laneShift: number;
  /** 0-1, relative change in posting rate. */
  cadenceShift: number;
  /** The dominant format and lane on each side, for the human sentence. */
  from: { format: string; lane: string | null };
  to: { format: string; lane: string | null };
}

export interface EraBoundary {
  /** ISO date of the first post of the new era. */
  startsAt: string;
  /** 0-1. How strongly the data says something changed here. */
  score: number;
  evidence: EraEvidence;
  /** Why this looks like a change, in words the team can argue with. */
  reason: string;
}

/** Share of each key in a list. */
function distribution<T extends string>(values: T[]): Map<T, number> {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const total = values.length || 1;
  for (const [key, count] of counts) counts.set(key, count / total);
  return counts;
}

/**
 * Total variation distance between two distributions: 0 identical, 1 disjoint.
 *
 * Chosen over anything fancier because it is the one divergence a person can
 * check by hand — half the summed difference in shares — and every number this
 * system shows has to survive someone recomputing it in a spreadsheet.
 */
function totalVariation<T extends string>(a: Map<T, number>, b: Map<T, number>): number {
  let sum = 0;
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    sum += Math.abs((a.get(key) ?? 0) - (b.get(key) ?? 0));
  }
  return sum / 2;
}

/** Posts per week across a run of posts. */
function cadenceOf(posts: PostRecord[]): number {
  if (posts.length < 2) return 0;
  const first = new Date(posts[0]!.publishedAt).getTime();
  const last = new Date(posts[posts.length - 1]!.publishedAt).getTime();
  const weeks = Math.max(1, (last - first) / (7 * 86_400_000));
  return posts.length / weeks;
}

function topKey<T extends string>(dist: Map<T, number>): T | null {
  let best: T | null = null;
  let bestShare = 0;
  for (const [key, share] of dist) {
    if (share > bestShare) {
      best = key;
      bestShare = share;
    }
  }
  return best;
}

function compare(before: PostRecord[], after: PostRecord[]): EraEvidence {
  const beforeFormats = distribution(before.map((p) => p.format as ContentFormat));
  const afterFormats = distribution(after.map((p) => p.format as ContentFormat));

  // Unclassified posts AND the "other" bucket are both excluded, for the same
  // reason: neither names a subject. A run of posts with no lane would look
  // like its own coherent strategy and mark where classification stopped
  // rather than where the account changed — and "other" is the classifier
  // saying a post fits nothing, which is the absence of a subject, not a new
  // one. Measured on the real account, leaving it in produced both of the
  // boundaries the first run found: "the dominant lane moved from other to
  // Marketing stunts" is a statement about coverage, not strategy.
  const named = (posts: PostRecord[]) =>
    posts
      .map((post) => post.contentLane)
      .filter((lane): lane is string => !!lane && lane !== OTHER);
  const beforeLanes = distribution(named(before));
  const afterLanes = distribution(named(after));

  const beforeCadence = cadenceOf(before);
  const afterCadence = cadenceOf(after);
  const cadenceShift = beforeCadence
    ? Math.min(1, Math.abs(afterCadence - beforeCadence) / beforeCadence)
    : 0;

  return {
    cadence: [Number(beforeCadence.toFixed(1)), Number(afterCadence.toFixed(1))],
    formatShift: Number(totalVariation(beforeFormats, afterFormats).toFixed(3)),
    laneShift:
      beforeLanes.size && afterLanes.size
        ? Number(totalVariation(beforeLanes, afterLanes).toFixed(3))
        : 0,
    cadenceShift: Number(cadenceShift.toFixed(3)),
    from: { format: topKey(beforeFormats) ?? "—", lane: topKey(beforeLanes) },
    to: { format: topKey(afterFormats) ?? "—", lane: topKey(afterLanes) },
  };
}

/**
 * The three signals, combined.
 *
 * Lane carries the most weight because it is the one that states subject
 * matter, which is what a strategy mostly IS. Cadence carries the least: an
 * account posts less in December without having changed its mind about
 * anything, and on its own that should never raise a boundary.
 */
function scoreOf(evidence: EraEvidence): number {
  return Number(
    (0.5 * evidence.laneShift + 0.3 * evidence.formatShift + 0.2 * evidence.cadenceShift).toFixed(
      3,
    ),
  );
}

function describe(evidence: EraEvidence): string {
  const parts: string[] = [];
  if (evidence.laneShift >= 0.2 && evidence.from.lane && evidence.to.lane) {
    parts.push(
      evidence.from.lane === evidence.to.lane
        ? `the mix within ${evidence.to.lane} changed`
        : `the dominant lane moved from ${evidence.from.lane} to ${evidence.to.lane}`,
    );
  }
  if (evidence.formatShift >= 0.2) {
    parts.push(
      evidence.from.format === evidence.to.format
        ? "the format mix changed"
        : `${evidence.from.format} gave way to ${evidence.to.format}`,
    );
  }
  if (evidence.cadenceShift >= 0.3) {
    const [before, after] = evidence.cadence;
    parts.push(`posting went from ${before} to ${after} a week`);
  }
  return parts.length ? parts.join("; ") : "several signals moved together";
}

/**
 * Candidate era boundaries in this account's history, strongest first.
 *
 * Reads a window of posts either side of every post's date and asks how much
 * the account's own output changed across it. Peaks above ERA_THRESHOLD are
 * proposed, keeping the strongest when several cluster inside MIN_ERA_DAYS.
 *
 * ERA_THRESHOLD was swept against the real account rather than picked. Over
 * 254 posts and twelve months: 0.15 proposes five boundaries, roughly one per
 * ten weeks, which is drift rather than strategy; 0.5 proposes none on an
 * account that demonstrably changed; 0.35 keeps the single well-separated one
 * (0.474, with the next candidate at 0.327). The score means nothing in the
 * abstract — it exists to rank candidates and to be argued with next to the
 * evidence printed beside it.
 */
export function detectEras(allPosts: PostRecord[], threshold = ERA_THRESHOLD): EraBoundary[] {
  const posts = organicPosts(allPosts)
    .filter((post) => post.publishedAt)
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));

  if (posts.length < MIN_POSTS_PER_SIDE * 2) return [];

  const candidates: EraBoundary[] = [];
  for (let i = MIN_POSTS_PER_SIDE; i <= posts.length - MIN_POSTS_PER_SIDE; i += 1) {
    const before = posts.slice(Math.max(0, i - WINDOW), i);
    const after = posts.slice(i, i + WINDOW);
    if (before.length < MIN_POSTS_PER_SIDE || after.length < MIN_POSTS_PER_SIDE) continue;

    const evidence = compare(before, after);
    const score = scoreOf(evidence);
    if (score < threshold) continue;

    candidates.push({
      startsAt: posts[i]!.publishedAt.slice(0, 10),
      score,
      evidence,
      reason: describe(evidence),
    });
  }

  // Strongest first, then drop anything sitting inside a stronger one's
  // exclusion zone — one change, one boundary.
  candidates.sort((a, b) => b.score - a.score);
  const kept: EraBoundary[] = [];
  for (const candidate of candidates) {
    const clash = kept.some(
      (chosen) =>
        Math.abs(new Date(chosen.startsAt).getTime() - new Date(candidate.startsAt).getTime()) <
        MIN_ERA_DAYS * 86_400_000,
    );
    if (!clash) kept.push(candidate);
  }
  return kept;
}

// ---------------------------------------------------------------------------
// T56 — scoping comparisons to the current era
// ---------------------------------------------------------------------------

/**
 * Fewest posts a current era needs before it becomes the comparison basis.
 *
 * Same floor the detector uses for each side of a split. Below it a median is
 * one or two posts and moves with every new one, so the era would make the
 * analysis worse rather than fairer — the full history is used instead, and
 * the brief says so.
 */
export const MIN_ERA_POSTS = MIN_POSTS_PER_SIDE;

/** The era in force today: the latest confirmed one that has already started. */
export function currentEra<T extends { startsAt: string }>(eras: T[], now = new Date()): T | null {
  const today = now.toISOString().slice(0, 10);
  let latest: T | null = null;
  for (const era of eras) {
    if (era.startsAt > today) continue;
    if (!latest || era.startsAt > latest.startsAt) latest = era;
  }
  return latest;
}

/**
 * Which posts a comparison should be made over, and why.
 *
 * Returns the current era's posts when there is a confirmed era with enough
 * posts in it, otherwise all of them. The reason is part of the result
 * because the fallback is a decision the reader needs to know about: a lane
 * table that quietly switched back to all-time would look identical and mean
 * something different.
 */
export function scopeToEra<P extends { publishedAt: string }>(
  posts: P[],
  era: { startsAt: string; label: string } | null,
): { posts: P[]; era: { startsAt: string; label: string } | null; note: string | null } {
  if (!era) return { posts, era: null, note: null };
  const inEra = posts.filter((post) => post.publishedAt.slice(0, 10) >= era.startsAt);
  if (inEra.length < MIN_ERA_POSTS) {
    return {
      posts,
      era: null,
      note: `The current era (${era.label}, since ${era.startsAt}) has only ${inEra.length} post${inEra.length === 1 ? "" : "s"} — too few for a median — so all history is used until it has ${MIN_ERA_POSTS}.`,
    };
  }
  return { posts: inEra, era, note: null };
}

// ---------------------------------------------------------------------------
// T58 — era markers on charts
// ---------------------------------------------------------------------------

export interface EraMarker {
  /** The chart's own x value to draw the line at — an existing category key. */
  x: string;
  label: string;
  startsAt: string;
}

/**
 * Where each era boundary falls on a chart whose x axis is a list of dates.
 *
 * The dashboard's charts plot one category per sync or per post rather than a
 * continuous timeline, so a line can only sit on a key that exists. Each era
 * is snapped to the first point on or after its start. An era that began
 * before the first point is reported separately, not drawn: the whole chart
 * is inside it, and a line pinned to the left edge would claim a change
 * happened on a day the chart cannot show.
 */
export function eraMarkers(
  keys: string[],
  eras: Array<{ startsAt: string; label: string }>,
): { markers: EraMarker[]; spansWhole: { startsAt: string; label: string } | null } {
  const sorted = [...keys].sort();
  const first = sorted[0]?.slice(0, 10);
  const last = sorted[sorted.length - 1]?.slice(0, 10);
  const markers: EraMarker[] = [];
  let spansWhole: { startsAt: string; label: string } | null = null;

  for (const era of [...eras].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    if (!first || !last) break;
    if (era.startsAt <= first) {
      // Later eras overwrite earlier ones: the most recent era that began
      // before the chart is the one the whole chart sits inside.
      spansWhole = era;
      continue;
    }
    if (era.startsAt > last) continue;
    const key = sorted.find((value) => value.slice(0, 10) >= era.startsAt);
    if (key) markers.push({ x: key, label: era.label, startsAt: era.startsAt });
  }
  return { markers, spansWhole };
}
