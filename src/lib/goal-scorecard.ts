// Addendum A.5 — did our recommendations move the primary metric?
//
// The existing scorecard answers "did this post beat the account's median",
// which is a per-post question. This one answers the question the engagement is
// actually judged on: is the primary metric's trajectory better in the weeks we
// influenced than in the weeks we did not?
//
// Deterministic TypeScript. The reflection agent reasons OVER this; it never
// computes it, and it is explicitly forbidden from turning it into a confidence
// number.
//
// Client-safe: the report and console render it directly.
import type { GrowthPoint } from "@/lib/analytics-types";
import { growthTrajectory, type GrowthTrajectory } from "@/lib/growth";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A week is "influenced" if a suggested-and-published post landed in it. */
const INFLUENCE_WINDOW_DAYS = 7;

/**
 * Weeks of data needed on BOTH sides before the comparison is worth stating.
 *
 * Three is already generous for a correlation over a noisy weekly series. Below
 * it the two averages are being computed from one or two readings each and the
 * difference between them is noise with a decimal point.
 */
export const MIN_WEEKS_PER_SIDE = 3;

export interface GoalScorecard {
  primaryMetric: string;
  /** The whole engagement, as one trajectory. */
  overall: GrowthTrajectory | null;
  /** Weekly rate of change in weeks that contained a published suggestion. */
  ratePerWeekInfluenced: number | null;
  /** Weekly rate in weeks that did not. */
  ratePerWeekOther: number | null;
  influencedWeeks: number;
  otherWeeks: number;
  /**
   * True only when both sides clear MIN_WEEKS_PER_SIDE. While false, the two
   * rates above are shown as counts, never compared.
   */
  comparable: boolean;
  /** Plain statement, always carrying the correlational caveat. */
  statement: string;
}

/** Bucket boundaries: one entry per whole week of the stored history. */
function weeklyDeltas(points: GrowthPoint[]): Array<{ start: number; end: number; delta: number }> {
  if (points.length < 2) return [];
  const ordered = [...points].sort(
    (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
  );

  const weeks: Array<{ start: number; end: number; delta: number }> = [];
  const first = new Date(ordered[0]!.capturedAt).getTime();
  const last = new Date(ordered[ordered.length - 1]!.capturedAt).getTime();

  for (let start = first; start < last; start += INFLUENCE_WINDOW_DAYS * DAY_MS) {
    const end = start + INFLUENCE_WINDOW_DAYS * DAY_MS;
    const inWeek = ordered.filter((p) => {
      const t = new Date(p.capturedAt).getTime();
      return t >= start && t < end;
    });
    // A week with fewer than two snapshots has no measurable change in it.
    if (inWeek.length < 2) continue;
    weeks.push({
      start,
      end,
      delta: inWeek[inWeek.length - 1]!.followers - inWeek[0]!.followers,
    });
  }
  return weeks;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Compares the primary metric's weekly movement in influenced weeks against the
 * rest.
 *
 * `publishedAt` is the list of dates on which a suggested idea was actually
 * published. A week counts as influenced if one of those dates falls inside it.
 *
 * The comparison is CORRELATIONAL and the statement always says so. Posting
 * cadence, algorithm changes and seasonality all move this line, and a system
 * that quietly claimed the credit would be making exactly the unfalsifiable
 * claim this layer exists to avoid.
 */
export function goalScorecard(
  points: GrowthPoint[],
  publishedAt: string[],
  primaryMetric: string,
  engagementStart?: string | null,
): GoalScorecard {
  const overall = growthTrajectory(points, primaryMetric, engagementStart);
  const weeks = weeklyDeltas(points);
  const stamps = publishedAt
    .map((iso) => new Date(iso).getTime())
    .filter((t) => Number.isFinite(t));

  const influenced = weeks.filter((w) => stamps.some((t) => t >= w.start && t < w.end));
  const other = weeks.filter((w) => !stamps.some((t) => t >= w.start && t < w.end));

  const comparable = influenced.length >= MIN_WEEKS_PER_SIDE && other.length >= MIN_WEEKS_PER_SIDE;
  const influencedRate = influenced.length
    ? Math.round(mean(influenced.map((w) => w.delta)))
    : null;
  const otherRate = other.length ? Math.round(mean(other.map((w) => w.delta))) : null;

  const metric = primaryMetric.replace(/_/g, " ");
  let statement: string;

  if (!weeks.length) {
    statement = `Not enough stored history yet to measure ${metric} week by week.`;
  } else if (!comparable) {
    statement =
      `${influenced.length} week${influenced.length === 1 ? "" : "s"} contained a published suggestion and ` +
      `${other.length} did not — too few on one side to compare honestly. ` +
      `This needs ${MIN_WEEKS_PER_SIDE} of each before the difference means anything.`;
  } else {
    const diff = (influencedRate ?? 0) - (otherRate ?? 0);
    const direction = diff > 0 ? "better" : diff < 0 ? "worse" : "the same";
    statement =
      `In the ${influenced.length} weeks containing a published suggestion, ${metric} moved by ` +
      `${influencedRate! >= 0 ? "+" : ""}${influencedRate} a week, against ` +
      `${otherRate! >= 0 ? "+" : ""}${otherRate} across the other ${other.length} weeks — ${direction}. ` +
      `This is a correlation, not proof: posting cadence, the algorithm and the season move this line too.`;
  }

  return {
    primaryMetric,
    overall,
    ratePerWeekInfluenced: influencedRate,
    ratePerWeekOther: otherRate,
    influencedWeeks: influenced.length,
    otherWeeks: other.length,
    comparable,
    statement,
  };
}
