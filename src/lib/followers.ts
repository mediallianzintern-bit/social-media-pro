// Followers for a selected period: the total AS OF the period's end, and how
// it changed across the period, from the dated follower snapshots every sync
// stores (account_snapshots, the growth chart's points).
//
// The Followers tile used to show today's total whatever period was selected,
// so September read 8,626 when his total on 28 Sep was 8,515 (audit, 29 Oct
// 2026). Today's total is only right for a period that ends now. And growth is
// the end total minus the start total from snapshots, never two copies of
// today's total.
//
// History starts at the first snapshot (8 Sep 2026). A period ending before it
// has no recorded total and says so, rather than showing today's.
//
// Client-safe and pure.
import type { GrowthPoint, PlatformData } from "@/lib/analytics-types";

export interface PeriodFollowers {
  /** The last snapshot before the period ends; null when none is that early. */
  end: GrowthPoint | null;
  /**
   * The last snapshot on or before the period starts. When history begins
   * inside the period, its first snapshot instead, and `partial` is true.
   */
  start: GrowthPoint | null;
  partial: boolean;
  /** end minus start, from snapshots. Null without both. */
  change: number | null;
  /** When follower history begins. */
  firstRecorded: string | null;
  /** True when the period runs to now, so the end is today's total. */
  current: boolean;
}

export function periodFollowers(
  growth: GrowthPoint[],
  window: { from: Date | null; to: Date | null },
  now = Date.now(),
): PeriodFollowers {
  const points = [...growth].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const time = (point: GrowthPoint) => Date.parse(point.capturedAt);
  const endBound = window.to ? window.to.getTime() : Infinity;
  const end = points.filter((point) => time(point) < endBound).at(-1) ?? null;

  let start: GrowthPoint | null = null;
  let partial = false;
  if (!window.from) {
    start = points[0] ?? null;
  } else {
    const from = window.from.getTime();
    start = points.filter((point) => time(point) <= from).at(-1) ?? null;
    if (!start) {
      start = points.find((point) => time(point) > from && time(point) < endBound) ?? null;
      partial = Boolean(start);
    }
  }

  return {
    end,
    start,
    partial,
    change:
      end && start && end !== start ? end.followers - start.followers : end && start ? 0 : null,
    firstRecorded: points[0]?.capturedAt ?? null,
    current: !window.to || window.to.getTime() >= now,
  };
}

/** The follower total a period is judged on: as of its end, or today's when it runs to now. */
export function followersForPeriod(data: PlatformData): number | null {
  const period = data.followersInPeriod;
  if (!period || period.current) return data.latest?.followers ?? null;
  return period.end?.followers ?? null;
}
