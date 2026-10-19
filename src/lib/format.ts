/** Display formatters. Locale is pinned so SSR and client render identically. */
const LOCALE = "en-US";

/**
 * The team works in India, so times are shown in IST and say so. Pinned, not
 * the browser's zone, for the same reason as the locale: a server render and a
 * client render must agree.
 */
export const TIME_ZONE = "Asia/Kolkata";

export function compactNumber(value: number): string {
  return new Intl.NumberFormat(LOCALE, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function fullNumber(value: number): string {
  return new Intl.NumberFormat(LOCALE).format(value);
}

export function percent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/** Signed change between two periods, as a fraction. Returns null when there's no baseline. */
export function delta(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / previous;
}

export function signedPercent(value: number, digits = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(digits)}%`;
}

export function shortDate(iso: string): string {
  // A bare "YYYY-MM-DD" is already a calendar day; a timestamp is shown as
  // the day it was in India, so a reel posted at 1 AM IST is not a day early.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString(LOCALE, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }
  return new Date(iso).toLocaleDateString(LOCALE, {
    month: "short",
    day: "numeric",
    timeZone: TIME_ZONE,
  });
}

export function dateTime(iso: string): string {
  return `${new Date(iso).toLocaleString(LOCALE, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  })} IST`;
}
