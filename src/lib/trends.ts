// Addendum C.2 / C.3 — momentum and relevance, computed in TypeScript.
//
// The whole point of storing observations over time is that "rising" is a
// comparison, not a property of a single reading. A topic seen once is not a
// trend; it is a topic. Momentum is derived here by comparing readings across
// runs, and an agent is never asked whether something is rising — which is the
// same discipline the prediction layer uses for confidence.
//
// C.3 is the half that stops this becoming a noise feed: a trend only reaches a
// client's team if it fits the lanes they already publish into and the goal they
// are managed toward. Two clients in one niche should see different trends.
//
// Client-safe: the surfacing views render these directly.
import type { GrowthGoal } from "@/lib/growth";
import type { LanePerformance } from "@/lib/analytics-types";

export type Momentum = "rising" | "steady" | "fading";
export type TrendKind = "topic" | "format" | "hook" | "sound";

/** One reading of one trend, at one moment. */
export interface TrendObservation {
  label: string;
  kind: TrendKind;
  /** Public-signal strength. Scale is arbitrary but must be consistent per feed. */
  strength: number;
  observedAt: string;
  /** C.4 — real items establishing this term, where the actor returned any. */
  evidence?: string[];
}

/** The current computed state of one trend. */
export interface TrendSignal {
  label: string;
  kind: TrendKind;
  momentum: Momentum;
  observations: number;
  firstSeen: string;
  lastSeen: string;
  latestStrength: number;
  previousStrength: number | null;
  /** Change between the last two readings, as a proportion. Null on the first. */
  changePct: number | null;
  /**
   * True while too few readings exist to call this a trend rather than a
   * sighting — the same thin-sample treatment lanes and predictions get.
   */
  directional: boolean;
  /**
   * C.4 — evidence from the MOST RECENT reading, so a link always points at
   * something current rather than at whatever established the trend weeks ago.
   */
  evidence: string[];
}

/**
 * Readings needed before momentum is a finding rather than a guess.
 *
 * Three: the first reading establishes existence, the second a direction, and
 * the third whether that direction held. Two readings can only ever say "it
 * went up once", which is noise at weekly cadence.
 */
export const MIN_OBSERVATIONS = 3;

/** Change smaller than this is not movement, it is measurement wobble. */
export const MOMENTUM_THRESHOLD = 0.15;

/**
 * Computes the current signal for one trend from its observation history.
 *
 * Compares the most recent reading against the mean of the earlier ones rather
 * than against only the previous reading: a single spiky run would otherwise
 * flip a steady trend to "rising" and back again on the next pass.
 */
export function computeMomentum(observations: TrendObservation[]): TrendSignal | null {
  if (!observations.length) return null;

  const ordered = [...observations].sort(
    (a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime(),
  );
  const latest = ordered[ordered.length - 1]!;
  const earlier = ordered.slice(0, -1);

  const previousStrength = earlier.length
    ? earlier.reduce((sum, o) => sum + o.strength, 0) / earlier.length
    : null;

  let momentum: Momentum = "steady";
  let changePct: number | null = null;

  if (previousStrength != null && previousStrength > 0) {
    changePct = (latest.strength - previousStrength) / previousStrength;
    if (changePct > MOMENTUM_THRESHOLD) momentum = "rising";
    else if (changePct < -MOMENTUM_THRESHOLD) momentum = "fading";
  }

  return {
    label: latest.label,
    kind: latest.kind,
    momentum,
    observations: ordered.length,
    firstSeen: ordered[0]!.observedAt,
    lastSeen: latest.observedAt,
    latestStrength: latest.strength,
    previousStrength: previousStrength == null ? null : Math.round(previousStrength * 100) / 100,
    changePct: changePct == null ? null : Math.round(changePct * 100) / 100,
    directional: ordered.length < MIN_OBSERVATIONS,
    evidence: latest.evidence ?? [],
  };
}

/** Groups raw observations by label and computes each one's signal. */
export function computeSignals(observations: TrendObservation[]): TrendSignal[] {
  const byLabel = new Map<string, TrendObservation[]>();
  for (const o of observations) {
    const key = o.label.trim().toLowerCase();
    byLabel.set(key, [...(byLabel.get(key) ?? []), o]);
  }

  return [...byLabel.values()]
    .map(computeMomentum)
    .filter((s): s is TrendSignal => s !== null)
    .sort((a, b) => (b.changePct ?? -1) - (a.changePct ?? -1));
}

// ---------------------------------------------------------------------------
// C.3 — the relevance filter
// ---------------------------------------------------------------------------

export interface Relevance {
  /** 0-100. Above RELEVANCE_THRESHOLD it reaches the team. */
  score: number;
  /** The client's own lane this trend fits, or null. */
  lane: string | null;
  /** Why it scored what it did, for the person deciding whether to trust it. */
  reasons: string[];
}

/** Below this a trend is noise for this client and is not surfaced. */
export const RELEVANCE_THRESHOLD = 40;

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "your",
  "what",
  "how",
  "why",
  "when",
  "best",
  "top",
  "new",
  "2025",
  "2026",
  "a",
  "an",
  "of",
  "to",
  "in",
  "is",
  "are",
  "it",
]);

const words = (text: string): string[] =>
  (text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((w) => !STOP.has(w));

/**
 * Scores one trend against one client.
 *
 * Three inputs, per C.3: does it match a lane they already publish into, does
 * it serve the metric their goal is judged on, and is it actually moving. A
 * client whose goal is leads and one whose goal is reach see different trends
 * out of the same niche, which is the whole reason this is per-client rather
 * than a shared feed.
 */
export function relevanceFor(
  signal: TrendSignal,
  lanes: LanePerformance[],
  goal: GrowthGoal | null,
): Relevance {
  const reasons: string[] = [];
  let score = 0;
  let matchedLane: string | null = null;

  // --- lane fit: the heaviest single factor -------------------------------
  const trendWords = new Set(words(signal.label));
  let bestOverlap = 0;
  for (const lane of lanes) {
    const laneWords = words(lane.lane);
    const overlap = laneWords.filter((w) => trendWords.has(w)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      matchedLane = lane.lane;
    }
  }

  if (bestOverlap > 0) {
    score += 45;
    reasons.push(`fits the ${matchedLane} lane`);

    // A trend landing in a lane that already performs is worth more than one
    // landing in a lane that does not.
    const lane = lanes.find((l) => l.lane === matchedLane);
    if (lane && lane.medianVsMedian >= 1) {
      score += 15;
      reasons.push(`that lane runs ${lane.medianVsMedian.toFixed(1)}x this account's median`);
    } else if (lane) {
      reasons.push(`but that lane only runs ${lane.medianVsMedian.toFixed(1)}x`);
    }
  } else {
    // A GATE, not a penalty. C.3's whole job is suppressing trends that do not
    // fit this client's field, and momentum must never buy a way past it: a
    // fast-rising topic the account has no standing to talk about is precisely
    // the noise this filter exists to keep out. Returning here also stops the
    // goal and momentum bonuses from summing their way over the threshold,
    // which is exactly how an off-domain trend slipped through before.
    return {
      score: 0,
      lane: null,
      reasons: ["does not match any lane this account publishes into"],
    };
  }

  // --- momentum weighting --------------------------------------------------
  if (signal.momentum === "rising") {
    score += signal.directional ? 10 : 25;
    reasons.push(signal.directional ? "rising, but on thin data" : "rising across several checks");
  } else if (signal.momentum === "fading") {
    score -= 15;
    reasons.push("fading");
  }

  // --- goal fit ------------------------------------------------------------
  // Formats and hooks travel; they tend to serve reach. Questions and topics
  // are answerable, which is what saves and authority reward.
  if (goal) {
    const servesReach = signal.kind === "format" || signal.kind === "sound";
    const wantsReach = goal === "maximize_reach";
    if (servesReach === wantsReach) {
      score += 15;
      reasons.push(`suits the ${goal.replace(/_/g, " ")} goal`);
    }
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    lane: matchedLane,
    reasons,
  };
}

/** The trends worth putting in front of this client's team, best first. */
export function relevantTrends(
  signals: TrendSignal[],
  lanes: LanePerformance[],
  goal: GrowthGoal | null,
  limit = 5,
): Array<{ signal: TrendSignal; relevance: Relevance }> {
  return signals
    .map((signal) => ({ signal, relevance: relevanceFor(signal, lanes, goal) }))
    .filter((entry) => entry.relevance.score >= RELEVANCE_THRESHOLD)
    .sort((a, b) => b.relevance.score - a.relevance.score)
    .slice(0, limit);
}
