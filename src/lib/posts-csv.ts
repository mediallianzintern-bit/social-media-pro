// The Posts tab's CSV download (27 Nov 2026): every post the tab is showing,
// with its exact link, when it went up, how long a Reel runs and its topic,
// beside each figure on screen. Pure, so it is tested without a browser.
import type { PlatformId, PostRecord } from "@/lib/analytics-types";
import { TIME_ZONE } from "@/lib/format";

/**
 * The post's own link. Instagram serves a Reel at /reel/<code>/; the scraper
 * hands every post back as /p/<code>/, which only redirects there.
 */
export function postUrl(post: PostRecord): string {
  const url = post.url ?? "";
  if (post.platform === "instagram" && post.format === "reel")
    return url.replace(/instagram\.com\/p\//, "instagram.com/reel/");
  return url;
}

/** "2026-11-25" and "17:30", the day and time it went up, in India. */
export function publishedParts(iso: string): { date: string; time: string } {
  const at = new Date(iso);
  const date = at.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
  const time = at.toLocaleTimeString("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return { date, time };
}

export type Cell = string | number | null | undefined;

/**
 * One cell, quoted when it has to be. A text cell that starts like a formula
 * (=, +, -, @) is prefixed with an apostrophe so a spreadsheet shows it
 * instead of running it; numbers are left as numbers.
 */
function cell(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** A whole CSV, with a byte-order mark so Excel reads it as UTF-8. */
export function toCsv(header: string[], rows: Cell[][]): string {
  return `\uFEFF${[header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
}

/** "instagram-posts-2026-11-27.csv". */
export function csvFileName(platform: PlatformId, now = new Date()): string {
  return `${platform}-posts-${now.toLocaleDateString("en-CA", { timeZone: TIME_ZONE })}.csv`;
}

/** Hands the CSV to the browser as a download. */
export function downloadCsv(name: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
