/** Display formatters. Locale is pinned so SSR and client render identically. */
const LOCALE = "en-US";

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
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString(LOCALE, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}
