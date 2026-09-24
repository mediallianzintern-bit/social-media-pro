// The learning loop's two computed inputs — §5.1 and §5.2 of the spec.
//
// Both are computed HERE, in TypeScript, and handed to the model as finished
// facts. The model never derives a success rate; that division of labour is the
// reason the rest of the system's numbers can be trusted.
//
// They are kept as two separate blocks on purpose and must never be fused into
// a single "success score":
//
//   §5.1 OWNER feedback — built from measured signals (reach, saves, shares,
//        watch time). These say what an audience actually wanted.
//   §5.2 NICHE learning — built from public/lane signals only. These say what
//        is structurally working, never why anyone valued it.
//
// Merging them would put a competitor's scraped like count in the same number
// as the owner's measured save rate, which is precisely the comparison the
// ground rules forbid.
import { readOutcomes, readPosts, readUsedSuggestions } from "../store";
import {
  engagementsOf,
  lanePerformance,
  median,
  organicPosts,
  type AccountSnapshot,
  type LanePerformance,
  type NicheLane,
  type PlatformId,
  type PostRecord,
  type ScriptExample,
  type SuggestionFeedback,
  type SuggestionOutcome,
} from "@/lib/analytics-types";
import { blockedPatterns, scoreGroup, scriptPatterns } from "@/lib/loop";

/**
 * §5.1. Reads the FROZEN outcomes captured at sync time.
 *
 * Deliberately not recomputed here. post_metrics upserts and the account's
 * median moves, so a live calculation gives a different answer every time it
 * runs — useless for calibration, and quietly wrong on screen. captureOutcomes()
 * takes one reading at a stated maturity and stores the baseline alongside it;
 * this function only reports what was measured.
 */
export async function suggestionFeedback(platform: PlatformId): Promise<SuggestionFeedback | null> {
  const [used, stored] = await Promise.all([
    readUsedSuggestions(platform).catch(() => []),
    readOutcomes(platform).catch(() => []),
  ]);
  if (!used.length) return null;

  const byId = new Map(used.map((suggestion) => [suggestion.id, suggestion]));
  const captured = new Set(stored.map((row) => row.suggestionId));

  const outcomes: SuggestionOutcome[] = [];
  const examples: ScriptExample[] = [];
  let excludedPinned = 0;

  for (const row of stored) {
    const suggestion = byId.get(row.suggestionId);
    if (!suggestion) continue;

    if (row.excludedReason === "pinned") {
      excludedPinned += 1;
      continue;
    }
    if (row.vsMedian === null) continue;

    // The verdict rests on the goal metric wherever the post was measured for
    // it. Rows frozen before goal grading existed carry no goal figure and fall
    // back to reach — labelled as such, never silently mixed in as goal results.
    const score = row.goalVsMedian ?? row.vsMedian;
    const gradedOn =
      row.goalVsMedian != null
        ? (row.gradedOn ?? row.goalMetric ?? "goal")
        : (row.gradedOn ?? "reach");

    const outcome: SuggestionOutcome = {
      hook: suggestion.hook,
      winningTrait: suggestion.winningTrait,
      lane: row.contentLane,
      publishedAt: (row.publishedAt ?? row.measuredAt).slice(0, 10),
      vsMedian: row.vsMedian,
      goalVsMedian: row.goalVsMedian,
      gradedOn,
      score,
      hit: score >= 1,
      features: suggestion.features,
    };
    if (row.saveRatePct !== null) outcome.saveRatePct = row.saveRatePct;
    if (row.shareRatePct !== null) outcome.shareRatePct = row.shareRatePct;
    if (row.avgWatchMs) outcome.watchSeconds = Number((row.avgWatchMs / 1000).toFixed(1));
    outcomes.push(outcome);

    examples.push({
      hook: suggestion.hook,
      format: suggestion.format,
      lane: row.contentLane,
      score,
      gradedOn,
      features: suggestion.features,
      outline: suggestion.outline,
    });
  }

  // Linked by a person, but no reading frozen yet — either the post has not
  // reached maturity or it has not been scraped. Counted, never guessed at.
  const awaitingData = used.filter((suggestion) => !captured.has(suggestion.id)).length;

  const group = <K extends string>(key: (outcome: SuggestionOutcome) => K | null) => {
    const groups = new Map<string, SuggestionOutcome[]>();
    for (const outcome of outcomes) {
      const value = key(outcome);
      if (!value) continue;
      groups.set(value, [...(groups.get(value) ?? []), outcome]);
    }
    return groups;
  };

  const byLane = [...group((outcome) => outcome.lane).entries()]
    .map(([lane, members]) => ({ lane, ...scoreGroup(members) }))
    .sort((a, b) => b.medianScore - a.medianScore);

  const byTrait = [...group((outcome) => outcome.winningTrait).entries()]
    .map(([trait, members]) => ({ trait, ...scoreGroup(members) }))
    .sort((a, b) => b.medianScore - a.medianScore);

  // The metric most verdicts were decided on, for the scorecard's headline.
  const gradedCounts = new Map<string, number>();
  for (const outcome of outcomes) {
    gradedCounts.set(outcome.gradedOn, (gradedCounts.get(outcome.gradedOn) ?? 0) + 1);
  }
  const gradedOn = [...gradedCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "reach";

  // Two of each, and only where there is a real difference to learn from: a
  // "winner" that missed is not a model, and a "loser" that hit is not a warning.
  const ranked = [...examples].sort((a, b) => b.score - a.score);
  const scriptExamples = {
    winners: ranked.filter((example) => example.score >= 1).slice(0, 2),
    losers: ranked
      .filter((example) => example.score < 1)
      .slice(-2)
      .reverse(),
  };

  return {
    measured: outcomes.length,
    awaitingData,
    excludedPinned,
    gradedOn,
    // §7 overall: computed here, in code, like every other figure the
    // scorecard shows — the model never derives a success rate.
    overall: {
      medianScore: scoreGroup(outcomes).medianScore,
      medianReach: Number(median(outcomes.map((outcome) => outcome.vsMedian)).toFixed(2)),
      beatsMedian: outcomes.length > 0 && scoreGroup(outcomes).medianScore >= 1,
    },
    outcomes,
    byLane,
    byTrait,
    byScript: scriptPatterns(outcomes),
    scriptExamples,
    blocked: blockedPatterns(outcomes),
  };
}

/**
 * §5.2. How each lane performs across every tracked account.
 *
 * Deliberately public/lane signal only — this function reads posts, never
 * insights, so it is structurally incapable of putting a competitor's
 * (nonexistent) reach or saves into the brief. The owner's own measured figures
 * live in §5.1 and stay there.
 *
 * Everything is in vsMedian terms because a 500-view post on a small account
 * and a 50,000-view post on a large one are both wins if each beat its own
 * baseline. Comparing raw counts across account sizes is the trap the whole
 * system exists to avoid.
 */
export async function nicheLanes(
  platform: PlatformId,
  ownerHandle: string,
  ownerPosts: PostRecord[],
  rivals: AccountSnapshot[],
): Promise<NicheLane[]> {
  const perAccount: Array<{ handle: string; lanes: LanePerformance[] }> = [
    { handle: ownerHandle, lanes: lanePerformance(ownerPosts) },
  ];

  for (const rival of rivals) {
    const posts = await readPosts(platform, rival.handle).catch(() => []);
    const lanes = lanePerformance(posts);
    if (lanes.length) perAccount.push({ handle: rival.handle, lanes });
  }

  const ownerLanes = new Map(
    (perAccount[0]?.lanes ?? []).map((lane) => [lane.lane, lane] as const),
  );

  const names = new Set<string>();
  for (const account of perAccount) {
    for (const lane of account.lanes) names.add(lane.lane);
  }

  return [...names]
    .map((name): NicheLane => {
      const entries = perAccount
        .map((account) => account.lanes.find((lane) => lane.lane === name))
        .filter((lane): lane is LanePerformance => Boolean(lane));
      const owner = ownerLanes.get(name);

      return {
        lane: name,
        accountsPublishing: entries.length,
        accountsAboveMedian: entries.filter((lane) => lane.medianVsMedian >= 1).length,
        medianVsMedian: Number(median(entries.map((lane) => lane.medianVsMedian)).toFixed(2)),
        ownerVsMedian: owner ? owner.medianVsMedian : null,
        ownerShareOfOutputPct: owner ? owner.shareOfOutputPct : null,
        ownerShareOfPerformancePct: owner ? owner.shareOfPerformancePct : null,
      };
    })
    .sort(
      (a, b) =>
        b.accountsAboveMedian - a.accountsAboveMedian || b.medianVsMedian - a.medianVsMedian,
    );
}
