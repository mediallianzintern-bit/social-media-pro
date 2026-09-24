// Addendum A.2 — growth as a measured objective.
//
// account_snapshots is already the growth curve; this turns it into a reading
// the platform can be judged against. Deterministic TypeScript, no AI — the
// trajectory is the number a client is shown and a recommendation is graded on,
// so it is exactly the kind of figure no model may produce.
//
// Client-safe: the report and console render these directly.
import type { GrowthPoint } from "@/lib/analytics-types";

/** The objective a client's account is being managed toward (A.1). */
export type GrowthGoal = "grow_following" | "drive_leads" | "maximize_reach" | "build_authority";

/** How the trend is moving. Named states rather than a raw slope, because a
 *  slope means nothing to a client without a threshold to read it against. */
export type GrowthTrend = "accelerating" | "steady" | "slowing" | "declining";

export interface GrowthTrajectory {
  primaryMetric: string;
  currentValue: number;
  /** Trailing 4-week rate of change, in units of the metric per week. */
  ratePerWeek: number;
  /** Trailing 12-week rate, in units per month (4.33 weeks). */
  ratePerMonth: number;
  trend: GrowthTrend;
  /** Change since the agency started managing the account. */
  sinceEngagementStart: number;
  /** Too few snapshots to treat as a reading rather than a hint. */
  directional: boolean;
  /** Snapshots the reading rests on, so thinness is visible not implied. */
  samples: number;
  /** Days the trailing window actually spans. */
  windowDays: number;
}

/** The metric each goal is judged on by default. Overridable per client (A.1). */
export const DEFAULT_PRIMARY_METRIC: Record<GrowthGoal, string> = {
  grow_following: "follower_growth_rate",
  drive_leads: "profile_visits_plus_saves",
  maximize_reach: "reach_trend",
  build_authority: "shares_plus_comments",
};

/** Supporting signals to watch — explicitly not to optimize against. */
export const DEFAULT_SECONDARY_METRICS: Record<GrowthGoal, string[]> = {
  grow_following: ["saves", "shares", "reach"],
  drive_leads: ["website_taps", "dms"],
  maximize_reach: ["shares", "watch_time"],
  build_authority: ["saves", "follower_quality"],
};

/** Human label for a goal, for the console and the client report. */
export const GOAL_LABEL: Record<GrowthGoal, string> = {
  grow_following: "Grow the following",
  drive_leads: "Drive leads",
  maximize_reach: "Maximise reach",
  build_authority: "Build authority",
};

/** Below this many snapshots a rate is one or two readings wearing a trend's clothes. */
export const THIN_TRAJECTORY = 4;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Rate of change per week across a window, by least-squares slope.
 *
 * A slope over all points in the window rather than (last - first) / days: the
 * endpoints-only version swings wildly when a single sync lands high or low,
 * which is the exact instability the spec asks to smooth away.
 */
function slopePerDay(points: GrowthPoint[]): number {
  if (points.length < 2) return 0;

  const t0 = new Date(points[0]!.capturedAt).getTime();
  const xs = points.map((p) => (new Date(p.capturedAt).getTime() - t0) / DAY_MS);
  const ys = points.map((p) => p.followers);

  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = (xs[i] ?? 0) - meanX;
    num += dx * ((ys[i] ?? 0) - meanY);
    den += dx * dx;
  }
  // Every snapshot at the same instant — no time has passed, so no rate exists.
  return den === 0 ? 0 : num / den;
}

function within(points: GrowthPoint[], days: number, now: number): GrowthPoint[] {
  const cutoff = now - days * DAY_MS;
  return points.filter((p) => new Date(p.capturedAt).getTime() >= cutoff);
}

/**
 * Classifies the trend by comparing the recent rate against the longer one.
 *
 * Declining is decided on the recent rate alone — an account losing followers
 * this week is declining regardless of how the quarter looked, and softening
 * that into "slowing" would be the kind of flattery this system exists to
 * avoid.
 */
function classify(recentPerWeek: number, longPerWeek: number, currentValue: number): GrowthTrend {
  // A rate is only meaningful against the size of the thing growing: ±0.1% of
  // the follower count per week is noise, not a trend.
  const noise = Math.max(1, currentValue * 0.001);

  if (recentPerWeek < -noise) return "declining";
  if (recentPerWeek > longPerWeek + noise) return "accelerating";
  if (recentPerWeek < longPerWeek - noise) return "slowing";
  return "steady";
}

/**
 * The trajectory of the primary metric.
 *
 * Follower count is the series available today for both platforms; when a
 * client's goal names a metric we cannot measure (profile visits on LinkedIn,
 * say), the caller passes the follower series and the honest fallback label,
 * per A.1's "degrade gracefully to public metrics" rule.
 */
export function growthTrajectory(
  points: GrowthPoint[],
  primaryMetric: string,
  engagementStart?: string | null,
): GrowthTrajectory | null {
  if (!points.length) return null;

  const ordered = [...points].sort(
    (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
  );
  const last = ordered[ordered.length - 1]!;
  const now = new Date(last.capturedAt).getTime();
  const currentValue = last.followers;

  const recent = within(ordered, 28, now);
  const long = within(ordered, 84, now);

  const ratePerWeek = slopePerDay(recent) * 7;
  const longPerWeek = slopePerDay(long) * 7;

  // The baseline for "since we started managing this". Falls back to the oldest
  // snapshot when no engagement start is recorded — and says so through
  // `directional` rather than presenting a short history as a long one.
  const startAt = engagementStart ? new Date(engagementStart).getTime() : null;
  const baseline =
    (startAt ? ordered.find((p) => new Date(p.capturedAt).getTime() >= startAt) : undefined) ??
    ordered[0]!;

  const windowDays = Math.max(
    0,
    Math.round((now - new Date(ordered[0]!.capturedAt).getTime()) / DAY_MS),
  );

  return {
    primaryMetric,
    currentValue,
    ratePerWeek: Math.round(ratePerWeek * 10) / 10,
    ratePerMonth: Math.round(longPerWeek * 4.33 * 10) / 10,
    trend: classify(ratePerWeek, longPerWeek, currentValue),
    sinceEngagementStart: currentValue - baseline.followers,
    directional: ordered.length < THIN_TRAJECTORY || windowDays < 14,
    samples: ordered.length,
    windowDays,
  };
}

/** One plain sentence describing the trajectory. Used in the prompt and on screen. */
export function trajectoryStatement(trajectory: GrowthTrajectory | null): string {
  if (!trajectory) return "No growth history stored yet.";

  const sign = trajectory.ratePerWeek >= 0 ? "+" : "";
  const body =
    `${trajectory.primaryMetric.replace(/_/g, " ")} is ${trajectory.trend}, ` +
    `at ${sign}${trajectory.ratePerWeek}/week over the last 4 weeks ` +
    `(${trajectory.sinceEngagementStart >= 0 ? "+" : ""}${trajectory.sinceEngagementStart} since we started)`;

  return trajectory.directional
    ? `${body}. Only ${trajectory.samples} snapshots across ${trajectory.windowDays} days — directional, not a result.`
    : `${body}.`;
}
