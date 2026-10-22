// Date-range filtering, applied client-side over the stored payload.
//
// The sync stores a rolling window of posts and one snapshot per sync, so every
// range below is a filter over data already in hand — switching range is instant
// and never triggers a scrape.
export type RangeKey = "era" | "today" | "yesterday" | "7d" | "30d" | "90d" | "all" | "custom";

export interface ResolvedRange {
  key: RangeKey;
  /** Inclusive lower bound; null means "no lower bound". */
  from: Date | null;
  /** Exclusive upper bound; null means "up to now". */
  to: Date | null;
  label: string;
}

export const RANGE_ORDER: RangeKey[] = [
  "era",
  "today",
  "yesterday",
  "7d",
  "30d",
  "90d",
  "all",
  "custom",
];

export const RANGE_LABELS: Record<RangeKey, string> = {
  // Plain words for the button. "Era" is the internal term; what a person is
  // choosing is everything since the account last changed strategy.
  era: "Since strategy change",
  today: "Today",
  yesterday: "Yesterday",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  all: "All time",
  custom: "Custom",
};

/** Short labels for the header control; "Custom" is rendered separately. */
export const QUICK_RANGES: RangeKey[] = ["era", "today", "yesterday", "7d", "30d", "90d", "all"];

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatDay(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * "Last 30 days (Sep 23 – Oct 22)": a preset with the exact days it covers,
 * today included. Shown because "30 days" alone left people comparing it with
 * LinkedIn's own 30-day picker, which ends on a different day (22 Oct 2026).
 */
function lastDays(days: number, today: Date): string {
  return `Last ${days} days (${formatDay(addDays(today, -(days - 1)))} – ${formatDay(today)})`;
}

/** A range label inside a sentence: first letter lower-cased, dates left as they are. */
export function labelInSentence(range: { label: string }): string {
  return range.label.charAt(0).toLowerCase() + range.label.slice(1);
}

/**
 * Ranges are resolved in the viewer's local timezone — "today" should mean the
 * day they are actually having, not a UTC day that may have already rolled over.
 */
export function resolveRange(key: RangeKey, from?: string, to?: string): ResolvedRange {
  const today = startOfDay(new Date());

  switch (key) {
    // A placeholder bound: eras are per account, so the real start is filled
    // in per platform by eraWindow(). Resolving it here would force one date
    // onto both platforms.
    case "era":
      return { key, from: null, to: null, label: "Since strategy change" };
    case "today":
      return { key, from: today, to: addDays(today, 1), label: `Today (${formatDay(today)})` };
    case "yesterday": {
      const start = addDays(today, -1);
      return { key, from: start, to: today, label: `Yesterday (${formatDay(start)})` };
    }
    case "7d":
      return { key, from: addDays(today, -6), to: null, label: lastDays(7, today) };
    case "30d":
      return { key, from: addDays(today, -29), to: null, label: lastDays(30, today) };
    case "90d":
      return { key, from: addDays(today, -89), to: null, label: lastDays(90, today) };
    case "all":
      return { key, from: null, to: null, label: "All time" };
    case "custom": {
      const start = from ? startOfDay(new Date(from)) : null;
      // The picker's end date is inclusive, so the bound is the day after.
      const end = to ? addDays(startOfDay(new Date(to)), 1) : null;
      const valid = start && !Number.isNaN(start.getTime());
      const label =
        valid && end && !Number.isNaN(end.getTime())
          ? `${formatDay(start)} – ${formatDay(addDays(end, -1))}`
          : valid
            ? `${formatDay(start)} – now`
            : "Custom";
      return {
        key,
        from: valid ? start : null,
        to: end && !Number.isNaN(end.getTime()) ? end : null,
        label,
      };
    }
    default:
      return { key: "30d", from: addDays(today, -29), to: null, label: lastDays(30, today) };
  }
}

export function withinRange(iso: string, range: ResolvedRange): boolean {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return false;
  if (range.from && time < range.from.getTime()) return false;
  if (range.to && time >= range.to.getTime()) return false;
  return true;
}

/** yyyy-mm-dd for a date input, in local time. */
export function toInputValue(date: Date | null): string {
  if (!date) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

/** The window "Current era" falls back to when an account has no confirmed era. */
const ERA_FALLBACK_DAYS = 30;

/**
 * T56 — the "Current era" range, resolved for one account.
 *
 * Any other range passes through untouched. With a confirmed era the window
 * starts on the era's first day; without one it is the last 30 days, which is
 * exactly what the dashboard showed by default before eras existed. That
 * fallback is what makes "Current era" safe as the default: an account nobody
 * has marked an era on looks identical to how it always did.
 */
export function eraWindow(
  range: ResolvedRange,
  era: { startsAt: string; label: string } | null | undefined,
): ResolvedRange {
  if (range.key !== "era") return range;
  if (!era) {
    const today = startOfDay(new Date());
    const from = addDays(today, -(ERA_FALLBACK_DAYS - 1));
    return { key: "era", from, to: null, label: lastDays(ERA_FALLBACK_DAYS, today) };
  }
  const from = startOfDay(new Date(`${era.startsAt}T00:00:00`));
  return { key: "era", from, to: null, label: `${era.label} · since ${formatDay(from)}` };
}
