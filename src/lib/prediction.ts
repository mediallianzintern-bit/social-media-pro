// Layer 3/4 — the prediction interface. Deterministic TypeScript, no AI.
//
// This module exists so that no agent ever has to answer "how well will this
// do?". A model asked that question produces a number that reads as authority
// and means nothing. Everything here is computed from measured posts, and the
// honest answer in the absence of data is a relative statement, not a figure.
//
// Client-safe: the report view renders these types directly, so this file must
// not import anything from src/server.
import type { LanePerformance, PostRecord } from "@/lib/analytics-types";
import type { GrowthGoal } from "@/lib/growth";
import { median, organicPosts, THIN_LANE, viewsOf } from "@/lib/analytics-types";

/**
 * Cold-start is the default and stays the default until a niche earns its way
 * out. Nothing in the UI may render an absolute predicted number while a
 * prediction is in this mode.
 */
export type PredictionMode = "cold_start" | "calibrated";

/** Bumped whenever the maths changes, so old predictions are scored fairly. */
export const PREDICTION_MODEL_VERSION = "quantile-1";

/**
 * Linked outcomes a niche needs before numeric predictions unlock.
 *
 * Deliberately high. The spec leaves the value to the developer and says to set
 * it conservatively; 30 is roughly where a per-lane quantile stops moving
 * wildly with each new post. Lowering it is a decision to show numbers sooner
 * and be wrong in front of a client, which is the one failure this layer exists
 * to prevent.
 */
export const GRADUATION_MIN_OUTCOMES = 30;

/** The interval a calibrated prediction targets. */
export const TARGET_INTERVAL_PCT = 0.7;

/**
 * How far measured coverage may sit from the target before the niche is not
 * considered calibrated. A 70% interval that actually contains 50% of outcomes
 * is a lie with a number attached.
 */
export const COVERAGE_TOLERANCE = 0.12;

/** A lane's measured performance, expressed only in multiples of this account's own median. */
export interface LaneExpectation {
  lane: string;
  postCount: number;
  /** Lane median performance ÷ account median. 1.0 is typical for them. */
  vsMedian: number;
  /** Lane median save rate ÷ account median save rate. Owner-measured only. */
  saveRateVsMedian?: number;
  /** Lane median watch time ÷ account median watch time. Owner-measured only. */
  watchVsMedian?: number;
  /** Lane median share rate ÷ account median share rate. Owner-measured only. */
  shareRateVsMedian?: number;
  /** Under THIN_LANE posts — a direction to test, not a result. */
  directional: boolean;
  /**
   * How many posts in this lane actually carried a save figure.
   *
   * Distinct from postCount on purpose. `directional` asks whether the LANE is
   * thin; this asks whether the SAMPLE BEHIND THE GOAL METRIC is thin, and the
   * two come apart whenever insight coverage is partial. A lane can hold
   * thirteen posts and have two of them measured, and a save-rate multiple
   * built on those two would otherwise print with the same authority as one
   * built on all thirteen. Ranking runs on this metric, so this is the count
   * that decides whether the ranking means anything.
   */
  saveSample?: number;
}

/**
 * Addendum A.3 — which measured figure a goal is actually judged on.
 *
 * The mapping is deliberately conservative: it names only figures this system
 * really measures per lane. "Profile visits" and "meaningful comments" appear in
 * the spec's goal table but are not available per lane from either platform, so
 * the closest measured proxy is used and `proxy` says so. Silently ranking on
 * views while claiming to optimise for leads would be the dishonest version.
 */
export interface GoalMetric {
  /** The field on LaneExpectation this goal ranks lanes by. */
  field: "vsMedian" | "saveRateVsMedian" | "shareRateVsMedian" | "watchVsMedian";
  /** How to say it to a person. */
  label: string;
  /** True when this is a stand-in for something the platform does not expose. */
  proxy: boolean;
}

export const GOAL_METRIC: Record<GrowthGoal, GoalMetric> = {
  // Saves and shares are what actually push a post beyond the existing
  // audience, which is what converts into follows.
  grow_following: { field: "saveRateVsMedian", label: "save rate", proxy: true },
  // Profile visits are not exposed per lane; saves are the nearest measured
  // signal of "I want to come back to this person".
  drive_leads: { field: "saveRateVsMedian", label: "save rate", proxy: true },
  maximize_reach: { field: "vsMedian", label: "reach", proxy: false },
  // A share is someone attaching their own name to it — the closest measured
  // thing to authority. Comment quality is not measurable here at all.
  build_authority: { field: "shareRateVsMedian", label: "share rate", proxy: true },
};

export interface PredictedRange {
  metric: "views" | "saves" | "shares";
  low: number;
  high: number;
  intervalPct: number;
}

export interface Prediction {
  mode: PredictionMode;
  modelVersion: string;
  lane: string;
  /**
   * A.3 — how this lane does on the metric the CLIENT'S GOAL is judged on,
   * which is not always the metric it looks strongest on.
   *
   * Null when the goal's metric was never measured for this lane. That is a
   * real state and is reported as one: a lane with no save data cannot be
   * ranked on save rate, and saying so beats substituting views and calling it
   * the same thing.
   */
  goal: {
    metric: string;
    /** The lane's multiple on the goal metric. Null when unmeasured. */
    multiple: number | null;
    /** True when the lane clears its own median ON THE GOAL METRIC. */
    servesGoal: boolean;
    /** True when `metric` stands in for something the platform does not expose. */
    proxy: boolean;
  } | null;
  /** The measured, relative expectation. Present in both modes. */
  expectation: LaneExpectation | null;
  /** Absolute range. Present ONLY in calibrated mode. */
  range?: PredictedRange;
  /** The account median the multiples are taken against. */
  baselineMedian: number;
  /** Plain-language statement of what is and is not being claimed. */
  statement: string;
}

/** Rounds to one decimal so "1.6×" never renders as "1.5999999999×". */
function ratio(value: number, against: number): number {
  if (!against) return 0;
  return Math.round((value / against) * 10) / 10;
}

export function shareRateOf(post: PostRecord): number | null {
  const shares = post.insight?.shares;
  if (shares == null) return null;
  const base = post.insight?.reach || post.insight?.views || post.views;
  if (!base) return null;
  return (shares / base) * 100;
}

export function saveRateOf(post: PostRecord): number | null {
  const saved = post.insight?.saved;
  if (saved == null) return null;
  // Reach is the honest denominator; Graph's own view count is the fallback.
  const base = post.insight?.reach || post.insight?.views || post.views;
  if (!base) return null;
  return (saved / base) * 100;
}

/**
 * One post's value on a goal metric — the SAME definition lane ranking uses.
 *
 * Shared on purpose. The loop grades a filmed idea with this, and the
 * strategist chose that idea's lane with laneExpectations(), which reads the
 * same helpers. If grading and ranking ever computed "save rate" differently,
 * the loop would be marking the strategist against a test it was never set.
 */
export function goalValueOf(post: PostRecord, field: GoalMetric["field"]): number | null {
  switch (field) {
    case "saveRateVsMedian":
      return saveRateOf(post);
    case "shareRateVsMedian":
      return shareRateOf(post);
    case "watchVsMedian":
      return post.insight?.avgWatchMs ? post.insight.avgWatchMs : null;
    case "vsMedian":
      return viewsOf(post) || null;
  }
}

/**
 * Per-lane expectations for one account.
 *
 * Every figure is a multiple of that same account's own median, because that is
 * the only comparison that survives a change in audience size — and the only
 * one available at all before a niche has calibrated.
 */
export function laneExpectations(
  allPosts: PostRecord[],
  lanes: LanePerformance[],
): LaneExpectation[] {
  if (!lanes.length) return [];

  const posts = organicPosts(allPosts).filter((post) => post.contentLane);
  if (!posts.length) return [];

  const measured = posts.filter((post) => saveRateOf(post) != null);
  const accountSaveRate = median(measured.map((post) => saveRateOf(post) ?? 0));

  const shared = posts.filter((post) => shareRateOf(post) != null);
  const accountShareRate = median(shared.map((post) => shareRateOf(post) ?? 0));

  const watched = posts.filter((post) => (post.insight?.avgWatchMs ?? 0) > 0);
  const accountWatch = median(watched.map((post) => post.insight?.avgWatchMs ?? 0));

  return lanes.map((lane) => {
    const inLane = posts.filter((post) => post.contentLane === lane.lane);

    const laneMeasured = inLane.map(saveRateOf).filter((rate): rate is number => rate != null);
    const laneShared = inLane.map(shareRateOf).filter((rate): rate is number => rate != null);
    const laneWatched = inLane.map((post) => post.insight?.avgWatchMs ?? 0).filter((ms) => ms > 0);

    return {
      lane: lane.lane,
      postCount: lane.postCount,
      vsMedian: Math.round(lane.medianVsMedian * 10) / 10,
      // Only when BOTH sides were actually measured. A ratio against a missing
      // denominator is an invented number wearing a division sign.
      ...(laneMeasured.length && accountSaveRate
        ? {
            saveRateVsMedian: ratio(median(laneMeasured), accountSaveRate),
            saveSample: laneMeasured.length,
          }
        : {}),
      ...(laneWatched.length && accountWatch
        ? { watchVsMedian: ratio(median(laneWatched), accountWatch) }
        : {}),
      ...(laneShared.length && accountShareRate
        ? { shareRateVsMedian: ratio(median(laneShared), accountShareRate) }
        : {}),
      directional: lane.directional,
    };
  });
}

/**
 * A.3 — how this lane does on the goal's own metric.
 *
 * Separated from the statement builder so the caller can rank candidates on it
 * before any sentence is written.
 */
export function goalReadFor(
  expectation: LaneExpectation | null,
  goal: GrowthGoal | null,
): Prediction["goal"] {
  if (!expectation || !goal) return null;
  const metric = GOAL_METRIC[goal];
  const raw = expectation[metric.field];
  const multiple = typeof raw === "number" ? raw : null;

  return {
    metric: metric.label,
    multiple,
    // Unmeasured is NOT "serves the goal". An unknown must never read as a pass.
    servesGoal: multiple != null && multiple >= 1,
    proxy: metric.proxy,
  };
}

/** The cold-start sentence. Relative, measured, and explicit about its limits. */
export function coldStartStatement(
  expectation: LaneExpectation | null,
  goalRead?: Prediction["goal"],
): string {
  if (!expectation) {
    return "No lane data yet, so there is nothing measured to base an expectation on.";
  }

  // The goal's metric leads, because that is what this account is judged on.
  // A lane that is big on views and weak on the goal metric must not read as a
  // win just because views came first in the sentence.
  const parts: string[] = [];
  if (goalRead) {
    if (goalRead.multiple == null) {
      parts.push(
        `targets the ${expectation.lane} lane, but ${goalRead.metric} — the metric this account is judged on — has not been measured for that lane`,
      );
    } else {
      parts.push(
        `targets the ${expectation.lane} lane, whose ${goalRead.metric} — the metric this account is judged on — runs ${goalRead.multiple.toFixed(1)}× this account's median`,
      );
    }
    parts.push(`reach on that lane is ${expectation.vsMedian.toFixed(1)}×`);
  } else {
    parts.push(
      `targets the ${expectation.lane} lane, which runs ${expectation.vsMedian.toFixed(1)}× this account's median`,
    );
  }
  if (!goalRead && expectation.saveRateVsMedian != null) {
    parts.push(`save rate on that lane is ${expectation.saveRateVsMedian.toFixed(1)}×`);
  }
  if (expectation.watchVsMedian != null) {
    parts.push(`watch time ${expectation.watchVsMedian.toFixed(1)}×`);
  }

  // Say plainly when the lane looks good but does not serve the goal. This is
  // the case A.3 exists for: strong on a metric nobody is being judged on.
  if (goalRead && goalRead.multiple != null && !goalRead.servesGoal && expectation.vsMedian >= 1) {
    parts.push(
      `so it performs, but not on the metric that counts here — treat it as a weaker choice for this goal`,
    );
  }

  const body = parts.join("; ");
  if (expectation.directional) {
    const posts = expectation.postCount === 1 ? "one post" : `${expectation.postCount} posts`;
    return `${body}. Under ${posts} in this lane — a direction to test, not a result.`;
  }

  // A lane can be wide enough to trust while the figure the RANKING runs on is
  // not. That happens whenever insight coverage is partial: thirteen posts in
  // the lane, two of them with save data, and a save-rate multiple built on
  // those two reads exactly like one built on all thirteen. The hedge belongs
  // to the number being quoted, not to the lane it came from.
  if (
    goalRead?.multiple != null &&
    expectation.saveSample != null &&
    expectation.saveSample < THIN_LANE
  ) {
    const n = expectation.saveSample === 1 ? "one post" : `${expectation.saveSample} posts`;
    return `${body}. That ${goalRead.metric} figure rests on ${n} with save data — a direction to test, not a result.`;
  }

  return `${body}.`;
}

/**
 * The fitted per-niche model: quantiles of vsMedian, per lane.
 *
 * Deliberately not a regression. With tens of outcomes, a quantile of what
 * actually happened in a lane is both more honest and more debuggable than
 * coefficients nobody can interpret, and it cannot produce a negative view
 * count the way a fitted line can.
 */
export interface NicheCoefficients {
  /** lane → [low quantile, high quantile] of vsMedian. */
  byLane: Record<string, [number, number]>;
  /** Fallback for a lane with too few outcomes of its own. */
  overall: [number, number];
}

/** Quantile by linear interpolation. Sorted input. */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  const low = sorted[lower] ?? 0;
  const high = sorted[upper] ?? low;
  return low + (high - low) * (pos - lower);
}

/** Fits the quantile bands. Pure, so it can be leave-one-out back-tested. */
export function fitQuantiles(
  samples: Array<{ lane: string | null; vsMedian: number }>,
  intervalPct = TARGET_INTERVAL_PCT,
): NicheCoefficients {
  const tail = (1 - intervalPct) / 2;
  const all = samples.map((s) => s.vsMedian).sort((a, b) => a - b);

  const byLane: Record<string, [number, number]> = {};
  const lanes = new Set(samples.map((s) => s.lane).filter((lane): lane is string => Boolean(lane)));

  for (const lane of lanes) {
    const values = samples
      .filter((s) => s.lane === lane)
      .map((s) => s.vsMedian)
      .sort((a, b) => a - b);
    // A band fitted on two points is not a band. Those lanes fall back to the
    // overall distribution rather than getting a confident-looking range.
    if (values.length >= 5) {
      byLane[lane] = [quantile(values, tail), quantile(values, 1 - tail)];
    }
  }

  return { byLane, overall: [quantile(all, tail), quantile(all, 1 - tail)] };
}

/**
 * Leave-one-out coverage: refit without each sample, then check whether that
 * sample fell inside the band the model would have predicted for it.
 *
 * This is the graduation test. Coverage near the target means the interval
 * means what it says; coverage far from it means the model is confident and
 * wrong, which is the state this whole layer exists to detect.
 */
export function backTestCoverage(
  samples: Array<{ lane: string | null; vsMedian: number }>,
  intervalPct = TARGET_INTERVAL_PCT,
): number {
  if (samples.length < 3) return 0;

  let inside = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const heldOut = samples[index];
    if (!heldOut) continue;
    const rest = samples.filter((_, other) => other !== index);
    const fitted = fitQuantiles(rest, intervalPct);
    const band = (heldOut.lane ? fitted.byLane[heldOut.lane] : undefined) ?? fitted.overall;
    if (heldOut.vsMedian >= band[0] && heldOut.vsMedian <= band[1]) inside += 1;
  }

  return inside / samples.length;
}

/** Whether a niche has earned numeric predictions. */
export function graduates(outcomeCount: number, coverage: number): boolean {
  return (
    outcomeCount >= GRADUATION_MIN_OUTCOMES &&
    Math.abs(coverage - TARGET_INTERVAL_PCT) <= COVERAGE_TOLERANCE
  );
}

/** One prediction checked against what actually happened. */
export interface ScoredPrediction {
  suggestionId: string;
  lane: string | null;
  mode: "cold_start" | "calibrated";
  /** What the lane expectation implied: above the account's median, or not. */
  expectedAboveMedian: boolean | null;
  actualVsMedian: number;
  actualBeatMedian: boolean;
  /** Calibrated only: did the actual land inside the predicted range? */
  insideRange: boolean | null;
  predictedLow: number | null;
  predictedHigh: number | null;
}

export interface CalibrationReport {
  /** Predictions made, whether or not they have been measured yet. */
  made: number;
  /** Of those, how many have a measured outcome to score against. */
  scored: number;
  /** Cold-start: how often "this lane over-indexes" was borne out. */
  directionalHits: number;
  /** Calibrated: how often the actual fell inside the stated range. */
  insideRange: number;
  calibrated: boolean;
  note: string;
  samples: ScoredPrediction[];
}
