// Patterns across every reviewed reel, counted in code.
//
// One reel's lessons are a story; a pattern across many is evidence. So the
// system also counts: for each hook style, each way the script was used, each
// lane and so on, how many reviewed reels fall in it, how many worked, and
// their median result against the typical reel. A pattern is "strong" only
// with three or more reels behind it. These numbers, not the model's
// impressions, are what make the writer more robust over time.
//
// Pure and client-safe.
import { median } from "@/lib/analytics-types";
import {
  ELEMENT_VERDICT_LABEL,
  REEL_USAGE_LABEL,
  type ElementVerdict,
  type ReelPattern,
  type ReelUsage,
} from "@/lib/reel-learning-types";

/** Reels a pattern needs behind it before it counts as evidence. */
export const STRONG_PATTERN_REELS = 3;

export interface ReviewedReel {
  lane: string | null;
  hookStyle: string | null;
  hookVerdict: ElementVerdict | null;
  scriptVerdict: ElementVerdict | null;
  captionVerdict: ElementVerdict | null;
  usage: ReelUsage | null;
  /** Views ÷ typical views. */
  ratio: number;
  worked: boolean;
}

const DIMENSIONS: Array<{ name: string; of: (reel: ReviewedReel) => string | null }> = [
  { name: "Hook style", of: (reel) => reel.hookStyle?.trim().toLowerCase() || null },
  {
    name: "Hook",
    of: (reel) => (reel.hookVerdict ? ELEMENT_VERDICT_LABEL[reel.hookVerdict] : null),
  },
  {
    name: "Script",
    of: (reel) => (reel.scriptVerdict ? ELEMENT_VERDICT_LABEL[reel.scriptVerdict] : null),
  },
  {
    name: "Caption",
    of: (reel) => (reel.captionVerdict ? ELEMENT_VERDICT_LABEL[reel.captionVerdict] : null),
  },
  { name: "What was used", of: (reel) => (reel.usage ? REEL_USAGE_LABEL[reel.usage] : null) },
  { name: "Lane", of: (reel) => reel.lane },
];

/** Every group with at least one reel, strongest evidence first, then best result. */
export function reelPatterns(reels: ReviewedReel[]): ReelPattern[] {
  const patterns: ReelPattern[] = [];
  for (const dimension of DIMENSIONS) {
    const groups = new Map<string, ReviewedReel[]>();
    for (const reel of reels) {
      const value = dimension.of(reel);
      if (!value) continue;
      groups.set(value, [...(groups.get(value) ?? []), reel]);
    }
    for (const [value, group] of groups) {
      patterns.push({
        dimension: dimension.name,
        value,
        reels: group.length,
        worked: group.filter((reel) => reel.worked).length,
        medianRatio: median(group.map((reel) => reel.ratio)),
        strong: group.length >= STRONG_PATTERN_REELS,
      });
    }
  }
  return patterns.sort(
    (a, b) =>
      Number(b.strong) - Number(a.strong) || b.reels - a.reels || b.medianRatio - a.medianRatio,
  );
}
