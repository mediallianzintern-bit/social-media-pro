// What a report covers, and the period it is compared with (26 Nov 2026).
// Client-safe and pure, so the period dropdown and the server agree.
//
// Days are India days (IST, UTC+5:30, no daylight saving): the team and the
// client both read "1-31 Oct" as Indian calendar days, and every date on the
// page is already shown in IST (lib/format.ts).
//
// A calendar month is compared with the calendar month before it, whatever
// its length: 1-31 Oct against 1-30 Sep, 1-31 Mar against 1-29 Feb in a leap
// year. A month still in progress is compared with the same days of the month
// before (1-26 Nov against 1-26 Oct), so a part month never meets a whole one.
// Every other period is compared with the same length of time just before it.
import type { ReportRange } from "@/lib/report-types";

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 330 * 60 * 1000;

const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTH_SHORT = MONTH_LONG.map((name) => name.slice(0, 3));

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;

/** The IST calendar day an instant falls on. */
export function istDay(ms: number): { year: number; month: number; day: number; weekday: number } {
  const shifted = new Date(ms + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

/** The instant an IST calendar day starts. `month` is 0-11 and may overflow. */
function istStart(year: number, month: number, day = 1): number {
  return Date.UTC(year, month, day) - IST_OFFSET_MS;
}

/** Days in a month (0-11), leap years included. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

const monthKeyOf = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, "0")}`;

function parseMonth(key: string): { year: number; month: number } | null {
  if (!ISO_MONTH.test(key)) return null;
  const [year, month] = key.split("-").map(Number) as [number, number];
  return month >= 1 && month <= 12 ? { year, month: month - 1 } : null;
}

/** "1 Oct 2026", from an instant, in IST. */
function dayLabel(ms: number, withYear = true): string {
  const { year, month, day } = istDay(ms);
  return `${day} ${MONTH_SHORT[month]}${withYear ? ` ${year}` : ""}`;
}

/** "1–31 Oct" for a span inside one month; "28 Sep – 3 Oct" across two. */
function spanLabel(startMs: number, lastMs: number): string {
  const a = istDay(startMs);
  const b = istDay(lastMs);
  if (a.year === b.year && a.month === b.month)
    return a.day === b.day
      ? `${a.day} ${MONTH_SHORT[a.month]}`
      : `${a.day}–${b.day} ${MONTH_SHORT[a.month]}`;
  return `${dayLabel(startMs, a.year !== b.year)} – ${dayLabel(lastMs, a.year !== b.year)}`;
}

export interface Window {
  since: string | null;
  /** Exclusive. Null means "up to now". */
  until: string | null;
  /** In full: "October 2026 (1–31 Oct)", "Last 30 days". */
  label: string;
  /** For a table column: "Oct 2026", "Last 30 days". */
  short: string;
  /** Inside a sentence: "October", "the last 30 days". */
  name: string;
}

export interface PeriodWindow extends Window {
  /**
   * About a month (a calendar month, the last 30 days, or a custom period of
   * 25 to 35 days): the report is laid out as the monthly report.
   */
  monthly: boolean;
  /** Days the period covers so far, for "posts a week". 0 for all time. */
  days: number;
}

/** A custom period that is exactly one calendar month is read as that month. */
export function asMonth(range: ReportRange): string | null {
  if (range.period === "month") {
    return range.month && parseMonth(range.month) ? range.month : null;
  }
  if (range.period !== "custom" || !range.from || !range.to) return null;
  if (!ISO_DAY.test(range.from) || !ISO_DAY.test(range.to)) return null;
  const [year, month, day] = range.from.split("-").map(Number) as [number, number, number];
  const last = daysInMonth(year, month - 1);
  return day === 1 && range.to === `${range.from.slice(0, 8)}${String(last).padStart(2, "0")}`
    ? range.from.slice(0, 7)
    : null;
}

/** The last complete month before `now`, the default month to report on. */
export function lastFullMonth(now = Date.now()): string {
  const today = istDay(now);
  return monthKeyOf(
    today.month === 0 ? today.year - 1 : today.year,
    today.month === 0 ? 11 : today.month - 1,
  );
}

function monthWindow(key: string, now: number): PeriodWindow {
  const { year, month } = parseMonth(key) ?? parseMonth(lastFullMonth(now))!;
  const start = istStart(year, month);
  const end = istStart(year, month + 1);
  // A month not yet begun (only a hand-typed link) reads as the whole month.
  const inProgress = now >= start && now < end;
  const lastMs = (inProgress ? now : end) - 1;
  const days = Math.max(1, Math.round(((inProgress ? now : end) - start) / DAY_MS));
  const span = spanLabel(start, lastMs);
  return {
    since: new Date(start).toISOString(),
    until: inProgress ? null : new Date(end).toISOString(),
    label: inProgress
      ? `${MONTH_LONG[month]} ${year} so far (${span})`
      : `${MONTH_LONG[month]} ${year} (${span})`,
    short: `${MONTH_SHORT[month]} ${year}${inProgress ? " so far" : ""}`,
    name: inProgress ? `${MONTH_LONG[month]} so far` : MONTH_LONG[month]!,
    monthly: true,
    days,
  };
}

/** Where a reporting period starts and ends, and how it reads. */
export function periodWindow(range: ReportRange, now = Date.now()): PeriodWindow {
  const daysAgo = (days: number) => new Date(now - days * DAY_MS).toISOString();
  if (range.period === "30d")
    return {
      since: daysAgo(30),
      until: null,
      label: "Last 30 days",
      short: "Last 30 days",
      name: "the last 30 days",
      monthly: true,
      days: 30,
    };
  if (range.period === "90d")
    return {
      since: daysAgo(90),
      until: null,
      label: "Last 90 days",
      short: "Last 90 days",
      name: "the last 90 days",
      monthly: false,
      days: 90,
    };
  const month = asMonth(range);
  if (month || range.period === "month") return monthWindow(month ?? lastFullMonth(now), now);
  if (range.period === "custom" && range.from && ISO_DAY.test(range.from)) {
    const to = range.to && ISO_DAY.test(range.to) && range.to >= range.from ? range.to : null;
    const [fy, fm, fd] = range.from.split("-").map(Number) as [number, number, number];
    const start = istStart(fy, fm - 1, fd);
    let end: number | null = null;
    if (to) {
      const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
      end = istStart(ty, tm - 1, td + 1);
    }
    const days = Math.max(1, Math.round(((end ?? now) - start) / DAY_MS));
    return {
      since: new Date(start).toISOString(),
      until: end === null ? null : new Date(end).toISOString(),
      label:
        end === null ? `Since ${dayLabel(start)}` : `${dayLabel(start)} – ${dayLabel(end - 1)}`,
      short: "This period",
      name: "this period",
      monthly: end !== null && days >= 25 && days <= 35,
      days,
    };
  }
  return {
    since: null,
    until: null,
    label: "All time",
    short: "All time",
    name: "all time",
    monthly: false,
    days: 0,
  };
}

/**
 * The period a report is compared with. Null for "All time" and an
 * open-ended custom period, which have nothing before them of the same kind.
 */
export function previousWindow(range: ReportRange, now = Date.now()): Window | null {
  const current = periodWindow(range, now);
  if (!current.since) return null;
  const start = Date.parse(current.since);

  const month = asMonth(range) ?? (range.period === "month" ? lastFullMonth(now) : null);
  if (month) {
    const { year, month: index } = parseMonth(month)!;
    const prevStart = istStart(year, index - 1);
    const prevFull = istStart(year, index);
    const { year: py, month: pm } = istDay(prevStart);
    if (current.until) {
      return {
        since: new Date(prevStart).toISOString(),
        until: new Date(prevFull).toISOString(),
        label: `${MONTH_LONG[pm]} ${py} (${spanLabel(prevStart, prevFull - 1)})`,
        short: `${MONTH_SHORT[pm]} ${py}`,
        name: MONTH_LONG[pm]!,
      };
    }
    // In progress: the same days of the month before, never past its end.
    const prevEnd = Math.min(prevStart + (now - start), prevFull);
    const span = spanLabel(prevStart, prevEnd - 1);
    return {
      since: new Date(prevStart).toISOString(),
      until: new Date(prevEnd).toISOString(),
      label: `${span} ${py}`,
      short: span,
      name: `the same days of ${MONTH_LONG[pm]}`,
    };
  }

  if (range.period === "custom" && !current.until) return null;
  const length = (current.until ? Date.parse(current.until) : now) - start;
  if (!(length > 0)) return null;
  const days = Math.round(length / DAY_MS);
  const name =
    range.period === "30d"
      ? "the 30 days before"
      : range.period === "90d"
        ? "the 90 days before"
        : `the ${days} days before`;
  return {
    since: new Date(start - length).toISOString(),
    until: current.since,
    label: name,
    short: name.replace(/^the /, "").replace(/^./, (c) => c.toUpperCase()),
    name,
  };
}

/** The months the period dropdown offers, newest first: this one (so far) and the 11 before. */
export function monthOptions(
  now = Date.now(),
  count = 12,
): Array<{ month: string; label: string }> {
  const today = istDay(now);
  return Array.from({ length: count }, (_, back) => {
    const stamp = istStart(today.year, today.month - back);
    const { year, month } = istDay(stamp);
    return {
      month: monthKeyOf(year, month),
      label: `${MONTH_LONG[month]} ${year}${back === 0 ? " (so far)" : ""}`,
    };
  });
}
