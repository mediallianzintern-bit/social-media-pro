// Date-range filtering, applied client-side over the stored payload.
//
// The sync stores a rolling window of posts and one snapshot per sync, so every
// range below is a filter over data already in hand — switching range is instant
// and never triggers a scrape.
export type RangeKey = "today" | "yesterday" | "7d" | "30d" | "90d" | "all" | "custom";

export interface ResolvedRange {
  key: RangeKey;
  /** Inclusive lower bound; null means "no lower bound". */
  from: Date | null;
  /** Exclusive upper bound; null means "up to now". */
  to: Date | null;
  label: string;
}

export const RANGE_ORDER: RangeKey[] = ["today", "yesterday", "7d", "30d", "90d", "all", "custom"];

export const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  all: "All time",
  custom: "Custom",
};

/** Short labels for the header control; "Custom" is rendered separately. */
export const QUICK_RANGES: RangeKey[] = ["today", "yesterday", "7d", "30d", "90d", "all"];

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
 * Ranges are resolved in the viewer's local timezone — "today" should mean the
 * day they are actually having, not a UTC day that may have already rolled over.
 */
export function resolveRange(key: RangeKey, from?: string, to?: string): ResolvedRange {
  const today = startOfDay(new Date());

  switch (key) {
    case "today":
      return { key, from: today, to: addDays(today, 1), label: "Today" };
    case "yesterday": {
      const start = addDays(today, -1);
      return { key, from: start, to: today, label: "Yesterday" };
    }
    case "7d":
      return { key, from: addDays(today, -6), to: null, label: "Last 7 days" };
    case "30d":
      return { key, from: addDays(today, -29), to: null, label: "Last 30 days" };
    case "90d":
      return { key, from: addDays(today, -89), to: null, label: "Last 90 days" };
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
      return { key: "30d", from: addDays(today, -29), to: null, label: "Last 30 days" };
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
