// Wording both layouts of the Performance report share (26 Nov 2026).
import type { ContentFormat } from "@/lib/analytics-types";

export const FORMAT_NAME: Record<ContentFormat, [string, string]> = {
  reel: ["reel", "reels"],
  carousel: ["carousel", "carousels"],
  image: ["image", "images"],
  video: ["video", "videos"],
  text: ["text post", "text posts"],
  article: ["article", "articles"],
};

export const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`;

/** The change against the period before, as a whole percentage; null when it cannot be said. */
export function change(now: number, before: number | null | undefined): number | null {
  if (before === undefined || before === null || before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}
