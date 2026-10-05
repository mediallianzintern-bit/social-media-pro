// T25 — Phase 4 of the lanes plan: competitor discovery seeded from the lanes
// that actually win for this account.
//
// Discovery used to read the owner's bio and captions and ask a model for
// search terms. That finds accounts that look like the owner — including in
// lanes the owner should be doing LESS of. Seeding from winning lanes asks a
// sharper question: who else is good at the things that already work here?
// Those are the accounts worth studying, because their wins are the ones this
// account is best placed to learn from.
//
// Which lanes win is decided here, in code, from measured figures. The model
// is only asked to turn a winning lane into a search phrase.
//
// Client-safe.
import type { LanePerformance } from "@/lib/analytics-types";
import type { GrowthGoal } from "@/lib/growth";
import { GOAL_METRIC, type LaneExpectation } from "@/lib/prediction";

/** At most this many lanes seed a discovery run — Instagram runs three searches. */
export const MAX_SEED_LANES = 3;

export interface LaneSeed {
  lane: string;
  /** What the lane covers, from the taxonomy — what the search phrase is written from. */
  definition: string;
  /** The lane's multiple of the account median on `metric`. 1.0 is typical. */
  multiple: number;
  /** Which figure decided it: the goal metric where measured, otherwise reach. */
  metric: string;
  posts: number;
}

/**
 * The lanes this account wins in, strongest first.
 *
 * Judged on the GOAL metric where it has been measured — for an account
 * growing its following that is save rate, not views — because a lane that is
 * loud on reach and weak on the goal is not one to recruit benchmarks for.
 * Falls back to reach where the goal metric is absent, and says which.
 *
 * "Other" never seeds: it is the absence of a lane. Thin lanes never seed:
 * a lane winning on three posts is a hint, and one lucky post would send the
 * whole search after the wrong kind of account.
 *
 * "Winning" means ABOVE the account's own median, not at it. Measured on the
 * real account, two Instagram lanes sat at exactly 1.0x save rate — typical,
 * not strong — and one of them on three posts. A par lane is not a reason to
 * spend a search recruiting benchmarks for it.
 *
 * Returns nothing when no lane beats the median. The caller then falls back
 * to discovery from the bio rather than seeding from a lane that is not
 * actually working.
 */
export function winningLanes(
  lanes: LanePerformance[] | undefined,
  expectations: LaneExpectation[] | undefined,
  goal: GrowthGoal | null,
  definitions: Map<string, string>,
): LaneSeed[] {
  if (!lanes?.length) return [];
  const goalMetric = goal ? GOAL_METRIC[goal] : null;
  const expectationFor = new Map((expectations ?? []).map((entry) => [entry.lane, entry]));

  return lanes
    .filter((lane) => lane.lane !== "other" && !lane.directional)
    .map((lane) => {
      const expectation = expectationFor.get(lane.lane);
      const goalValue = goalMetric ? expectation?.[goalMetric.field] : undefined;
      const useGoal = typeof goalValue === "number" && Number.isFinite(goalValue);
      return {
        lane: lane.lane,
        definition: definitions.get(lane.lane) ?? lane.lane,
        multiple: Number((useGoal ? (goalValue as number) : lane.medianVsMedian).toFixed(2)),
        metric: useGoal ? goalMetric!.label : "reach",
        posts: lane.postCount,
      };
    })
    .filter((seed) => seed.multiple > 1)
    .sort((a, b) => b.multiple - a.multiple)
    .slice(0, MAX_SEED_LANES);
}
