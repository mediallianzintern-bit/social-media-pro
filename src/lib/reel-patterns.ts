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
  captionBand,
  CTA_TYPE_LABEL,
  hashtagBand,
  HOOK_TYPE_LABEL,
  lengthBand,
  type CtaType,
  type HookType,
} from "@/lib/reel-parts";
import {
  ELEMENT_VERDICT_LABEL,
  REEL_USAGE_LABEL,
  type ElementVerdict,
  type LearnedRules,
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
  /** Code-sorted kind of hook, the one rules are enforced on. */
  hookType?: HookType | null;
  ctaType?: CtaType | null;
  bodyShape?: string | null;
  exampleType?: string | null;
  seconds?: number | null;
  captionWords?: number | null;
  hashtags?: string[] | null;
  /** Outlets the script's research read, and the share of its facts the reel used. */
  researchSources?: number | null;
  researchUsed?: number | null;
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
  {
    name: "Sources researched",
    of: (reel) =>
      reel.researchSources == null
        ? null
        : reel.researchSources <= 1
          ? "One outlet"
          : reel.researchSources <= 3
            ? "2 to 3 outlets"
            : "4 or more outlets",
  },
  {
    name: "Research used",
    of: (reel) =>
      reel.researchUsed == null
        ? null
        : reel.researchUsed >= 0.5
          ? "Half or more of the facts"
          : "Under half of the facts",
  },
  { name: "Hook type", of: (reel) => (reel.hookType ? HOOK_TYPE_LABEL[reel.hookType] : null) },
  { name: "Body shape", of: (reel) => reel.bodyShape ?? null },
  { name: "Example", of: (reel) => reel.exampleType ?? null },
  { name: "CTA", of: (reel) => (reel.ctaType ? CTA_TYPE_LABEL[reel.ctaType] : null) },
  { name: "Reel length", of: (reel) => lengthBand(reel.seconds ?? null) },
  {
    name: "Caption length",
    of: (reel) =>
      captionBand(
        reel.captionWords == null
          ? null
          : { words: reel.captionWords, hashtags: 0, asksQuestion: false, hasCta: false },
      ),
  },
  { name: "Hashtag count", of: (reel) => hashtagBand(reel.hashtags?.length ?? null) },
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
    pushGroups(dimension.name, groups);
  }
  // Each hashtag on its own: which tags turn up on reels that work, and on ones that do not.
  const tags = new Map<string, ReviewedReel[]>();
  for (const reel of reels) {
    for (const tag of reel.hashtags ?? []) tags.set(tag, [...(tags.get(tag) ?? []), reel]);
  }
  pushGroups("Hashtag", tags);

  function pushGroups(dimension: string, groups: Map<string, ReviewedReel[]>) {
    for (const [value, group] of groups) {
      patterns.push({
        dimension,
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

/** A strong pattern this far under the typical reel, mostly losing, becomes a rule. */
export const LOSING_RATIO = 0.8;
/** A strong pattern this far over the typical reel, mostly winning, is proven. */
export const PROVEN_RATIO = 1.2;

const losing = (pattern: ReelPattern) =>
  pattern.strong && pattern.medianRatio < LOSING_RATIO && pattern.worked <= pattern.reels / 3;
const proven = (pattern: ReelPattern) =>
  pattern.strong && pattern.medianRatio >= PROVEN_RATIO && pattern.worked >= pattern.reels / 2;

/**
 * The rules the patterns justify. Only strong patterns (3+ reviewed reels)
 * count: one reel, however good or bad, never makes a rule.
 */
export function deriveRules(patterns: ReelPattern[]): LearnedRules {
  const typeByLabel = new Map(
    (Object.entries(HOOK_TYPE_LABEL) as Array<[HookType, string]>).map(([type, label]) => [
      label,
      type,
    ]),
  );
  const hookTypes = patterns.filter((pattern) => pattern.dimension === "Hook type");
  const hypothetical = hookTypes.find(
    (pattern) => typeByLabel.get(pattern.value) === "hypothetical" && proven(pattern),
  );
  return {
    blockedHookTypes: hookTypes
      .filter(losing)
      .map((pattern) => ({
        type: typeByLabel.get(pattern.value)!,
        reels: pattern.reels,
        medianRatio: pattern.medianRatio,
      }))
      .filter((rule) => rule.type),
    allowHypotheticalHooks: hypothetical
      ? { reels: hypothetical.reels, medianRatio: hypothetical.medianRatio }
      : null,
    blockedHashtags: patterns
      .filter((pattern) => pattern.dimension === "Hashtag" && losing(pattern))
      .map((pattern) => ({
        tag: pattern.value,
        reels: pattern.reels,
        medianRatio: pattern.medianRatio,
      })),
  };
}
