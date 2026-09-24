// The learning loop's rules, as pure functions.
//
// Kept out of the server so the scorecard can state the same thresholds the
// server enforces: "blocked after 3 measured tries with at most 1 hit" should
// read identically on screen and in the code that does the blocking.
import { CTA_LABEL, HOOK_LABEL, LENGTH_LABEL, type ScriptFeatures } from "@/lib/script-features";
import type {
  BlockedPattern,
  OutcomeGroup,
  ScriptPatternScore,
  SuggestionOutcome,
} from "@/lib/analytics-types";

/** Fewer measured tries than this is an anecdote, never grounds for a block. */
export const BLOCK_MIN_MEASURED = 3;

/**
 * A pattern is blocked when at most this share of its measured tries were hits.
 * With three tries that is "one hit or none" — two misses in three is already
 * a weak record, three in three is a verdict.
 */
export const BLOCK_MAX_HIT_RATE = 1 / 3;

/**
 * How long a block holds.
 *
 * Blocks expire rather than lasting forever because nothing else can lift one:
 * a blocked lane is never suggested, so it can never produce the new evidence
 * that would clear it. Sixty days is long enough that the pattern is genuinely
 * rested, short enough that an audience which has changed gets another test.
 */
export const BLOCK_DAYS = 60;

const median = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

export function scoreGroup(outcomes: SuggestionOutcome[]): OutcomeGroup {
  return {
    count: outcomes.length,
    medianScore: Number(median(outcomes.map((o) => o.score)).toFixed(2)),
    hitRate: outcomes.length
      ? Number((outcomes.filter((o) => o.hit).length / outcomes.length).toFixed(2))
      : 0,
  };
}

function groupBy<T, K extends string>(
  outcomes: T[],
  key: (outcome: T) => K | null | undefined,
): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const outcome of outcomes) {
    const value = key(outcome);
    if (!value) continue;
    groups.set(value, [...(groups.get(value) ?? []), outcome]);
  }
  return groups;
}

const FEATURE_LABELS: Record<ScriptPatternScore["feature"], (value: string) => string> = {
  hookType: (value) => HOOK_LABEL[value as keyof typeof HOOK_LABEL] ?? value,
  lengthBucket: (value) => `${LENGTH_LABEL[value as keyof typeof LENGTH_LABEL] ?? value} script`,
  ctaType: (value) => CTA_LABEL[value as keyof typeof CTA_LABEL] ?? value,
  format: (value) => value.replace(/_/g, " "),
};

/**
 * How each script shape performed.
 *
 * Only outcomes with stored features take part, and a value needs two filmed
 * scripts before it is listed: one script is a story about that script, not
 * about the shape.
 */
export function scriptPatterns(outcomes: SuggestionOutcome[]): ScriptPatternScore[] {
  const withFeatures = outcomes.filter((o): o is SuggestionOutcome & { features: ScriptFeatures } =>
    Boolean(o.features),
  );
  const features: ScriptPatternScore["feature"][] = [
    "hookType",
    "lengthBucket",
    "ctaType",
    "format",
  ];

  return features.flatMap((feature) =>
    [...groupBy(withFeatures, (o) => String(o.features[feature])).entries()]
      .filter(([, group]) => group.length >= 2)
      .map(([value, group]) => ({
        feature,
        value,
        label: FEATURE_LABELS[feature](value),
        ...scoreGroup(group),
      }))
      .sort((a, b) => b.medianScore - a.medianScore),
  );
}

/**
 * What the loop refuses to suggest again, for now.
 *
 * Lanes, traits and hook types are each judged on their own tries. Case and
 * spacing are normalised for traits because the model restates the same trait
 * with small wording changes; without that, "names the stakes first" and
 * "Names the stakes first" would each need three failures of their own.
 */
export function blockedPatterns(outcomes: SuggestionOutcome[], now = Date.now()): BlockedPattern[] {
  const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  const candidates: Array<{
    kind: BlockedPattern["kind"];
    groups: Map<string, SuggestionOutcome[]>;
  }> = [
    { kind: "lane", groups: groupBy(outcomes, (o) => (o.lane ? norm(o.lane) : null)) },
    {
      kind: "trait",
      groups: groupBy(outcomes, (o) => (o.winningTrait ? norm(o.winningTrait) : null)),
    },
    { kind: "hookType", groups: groupBy(outcomes, (o) => o.features?.hookType ?? null) },
  ];

  const blocked: BlockedPattern[] = [];
  for (const { kind, groups } of candidates) {
    for (const [value, group] of groups) {
      if (group.length < BLOCK_MIN_MEASURED) continue;
      const hits = group.filter((o) => o.hit).length;
      if (hits / group.length > BLOCK_MAX_HIT_RATE) continue;

      const last = group
        .map((o) => new Date(o.publishedAt).getTime())
        .filter((t) => Number.isFinite(t))
        .reduce((a, b) => Math.max(a, b), 0);
      const expires = last + BLOCK_DAYS * 86_400_000;
      if (expires <= now) continue;

      blocked.push({
        kind,
        value,
        measured: group.length,
        hits,
        lastMeasuredAt: new Date(last).toISOString(),
        expiresAt: new Date(expires).toISOString(),
      });
    }
  }
  return blocked;
}

/** Whether an idea carries anything the loop has blocked. Returns the reason, or null. */
export function blockReason(
  idea: { contentLane: string; winningTrait: string; hookType: string },
  blocked: BlockedPattern[],
): string | null {
  const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  for (const pattern of blocked) {
    const value =
      pattern.kind === "lane"
        ? norm(idea.contentLane)
        : pattern.kind === "trait"
          ? norm(idea.winningTrait)
          : idea.hookType;
    if (value && value === pattern.value) {
      return `${pattern.kind === "hookType" ? "hook type" : pattern.kind} "${pattern.value}" is blocked (${pattern.hits}/${pattern.measured} hits)`;
    }
  }
  return null;
}
