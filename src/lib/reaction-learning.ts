// Addendum E.9 — does the reaction-hook format actually work for this client?
//
// Deterministic comparisons over measured outcomes, computed here and handed
// to people (and the reflection agent) as finished facts. The spec's rule
// holds: TypeScript computes, the model interprets. Nothing in this file calls
// a model.
//
// Every figure is a multiple of the account's own median — the outcome rows
// already store it that way — so 1.0 means "as good as a typical post", and a
// reaction reel is judged against what this account normally does, not
// against the creator whose clip it borrowed.
//
// Client-safe.
import {
  PIVOT_LABEL,
  SOURCE_TYPE_LABEL,
  type PivotType,
  type ReactionFields,
  type SourceType,
} from "@/lib/reaction";

/** Below this many measured reels a comparison is directional, and says so. */
export const REACTION_MIN_SAMPLE = 5;

export interface ReactionGroup {
  key: string;
  label: string;
  reels: number;
  /** Median of each reel's views as a multiple of the account median. */
  medianVsMedian: number;
  medianSaveRatePct: number | null;
  medianShareRatePct: number | null;
  directional: boolean;
}

export interface ReactionLearning {
  /** Reaction reels with a measured outcome. */
  measured: number;
  /** Reaction ideas suggested in total, measured or not. */
  suggested: number;
  overall: ReactionGroup | null;
  byPivot: ReactionGroup[];
  bySourceType: ReactionGroup[];
  byBorrowedLength: ReactionGroup[];
  /**
   * The expert-segment length this account's reaction reels have succeeded
   * at — median seconds among reels at or above the account median. Null
   * until there is a winner to measure; the script then aims for the
   * reference 28–32 seconds instead.
   */
  winningExpertSeconds: number | null;
}

export interface ReactionOutcome {
  reaction: ReactionFields;
  vsMedian: number | null;
  saveRatePct: number | null;
  shareRatePct: number | null;
}

function median(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** "0:37" or "37" or "1:05" -> seconds. Null when it cannot be read. */
export function toSeconds(mark: string): number | null {
  const parts = mark
    .trim()
    .split(":")
    .map((part) => Number(part));
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/** How long the borrowed segment runs, from the script's in and out points. */
export function borrowedSeconds(
  reaction: Pick<ReactionFields, "sourceIn" | "sourceOut">,
): number | null {
  const start = toSeconds(reaction.sourceIn);
  const end = toSeconds(reaction.sourceOut);
  if (start == null || end == null || end <= start) return null;
  return end - start;
}

/** Buckets matching the reference reels: ~6–8s, and one long ~37s clip. */
function lengthBucket(seconds: number | null): { key: string; label: string } | null {
  if (seconds == null) return null;
  if (seconds <= 10) return { key: "short", label: "Short clip (10s or less)" };
  if (seconds <= 25) return { key: "medium", label: "Medium clip (11–25s)" };
  return { key: "long", label: "Long clip (over 25s)" };
}

function group(key: string, label: string, rows: ReactionOutcome[]): ReactionGroup {
  const vs = rows.map((row) => row.vsMedian).filter((value): value is number => value != null);
  const saves = rows
    .map((row) => row.saveRatePct)
    .filter((value): value is number => value != null);
  const shares = rows
    .map((row) => row.shareRatePct)
    .filter((value): value is number => value != null);
  const round = (value: number | null) => (value == null ? null : Number(value.toFixed(2)));
  return {
    key,
    label,
    reels: rows.length,
    medianVsMedian: round(median(vs)) ?? 0,
    medianSaveRatePct: round(median(saves)),
    medianShareRatePct: round(median(shares)),
    directional: rows.length < REACTION_MIN_SAMPLE,
  };
}

function groupBy(
  rows: ReactionOutcome[],
  keyOf: (row: ReactionOutcome) => { key: string; label: string } | null,
): ReactionGroup[] {
  const buckets = new Map<string, { label: string; rows: ReactionOutcome[] }>();
  for (const row of rows) {
    const bucket = keyOf(row);
    if (!bucket) continue;
    const entry = buckets.get(bucket.key) ?? { label: bucket.label, rows: [] };
    entry.rows.push(row);
    buckets.set(bucket.key, entry);
  }
  return [...buckets.entries()]
    .map(([key, entry]) => group(key, entry.label, entry.rows))
    .sort((a, b) => b.medianVsMedian - a.medianVsMedian);
}

export function reactionLearning(outcomes: ReactionOutcome[], suggested: number): ReactionLearning {
  const measured = outcomes.filter((row) => row.vsMedian != null);
  const winners = measured.filter((row) => (row.vsMedian ?? 0) >= 1);
  const winningSeconds = median(
    winners.map((row) => row.reaction.expertSeconds).filter((value) => value > 0),
  );

  return {
    measured: measured.length,
    suggested,
    overall: measured.length ? group("all", "All reaction reels", measured) : null,
    byPivot: groupBy(measured, (row) => ({
      key: row.reaction.pivotType,
      label: PIVOT_LABEL[row.reaction.pivotType as PivotType] ?? row.reaction.pivotType,
    })),
    bySourceType: groupBy(measured, (row) => ({
      key: row.reaction.sourceType,
      label: SOURCE_TYPE_LABEL[row.reaction.sourceType as SourceType] ?? row.reaction.sourceType,
    })),
    byBorrowedLength: groupBy(measured, (row) => lengthBucket(borrowedSeconds(row.reaction))),
    winningExpertSeconds: winningSeconds == null ? null : Math.round(winningSeconds),
  };
}
