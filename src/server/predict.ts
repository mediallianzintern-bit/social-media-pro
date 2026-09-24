// Layer 4 — prediction, the graduation gate, and calibration scoring.
//
// The rule this module exists to enforce: a numeric prediction is only ever
// shown for a niche that has earned one, and "earned" means a back-test on that
// niche's own measured outcomes held up. Until then every prediction is
// cold-start — relative, measured, and explicit that it is not a forecast.
//
// Nothing here calls a model. The strategist is HANDED this output and is
// forbidden from computing it; that is the whole separation.
import {
  GRADUATION_MIN_OUTCOMES,
  PREDICTION_MODEL_VERSION,
  TARGET_INTERVAL_PCT,
  backTestCoverage,
  GOAL_METRIC,
  coldStartStatement,
  fitQuantiles,
  goalReadFor,
  graduates,
  type CalibrationReport,
  type LaneExpectation,
  type NicheCoefficients,
  type Prediction,
  type PredictedRange,
  type ScoredPrediction,
} from "@/lib/prediction";
import { OWNER_ACCOUNTS } from "./apify/accounts";
import {
  latestSnapshot,
  readAnalysis,
  readNicheModel,
  readOutcomes,
  readPredictions,
  saveNicheModel,
  savePrediction,
  type NicheModelRow,
} from "./store";
import type { ContentIdea } from "@/lib/ai-types";
import type { PlatformId } from "@/lib/analytics-types";
import type { GrowthGoal } from "@/lib/growth";

/**
 * Niches are free text from discovery, so "AI marketing" and "ai  marketing"
 * would otherwise fit two separate models on half the data each.
 */
export function nicheSlug(niche: string): string {
  return niche.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120) || "unclassified";
}

/** Structural traits a prediction rests on. All measured or structural, never invented. */
export interface ScriptFeatures {
  contentLane: string;
  format: string;
  durationSeconds?: number;
  shotCount?: number;
  winningTrait?: string;
}

function coefficientsOf(model: NicheModelRow | null): NicheCoefficients | null {
  if (!model?.calibrated) return null;
  const raw = model.coefficients as Partial<NicheCoefficients>;
  if (!raw?.overall || !Array.isArray(raw.overall)) return null;
  return { byLane: raw.byLane ?? {}, overall: raw.overall as [number, number] };
}

/**
 * predict(script_features, client, niche) — the Layer 3 interface.
 *
 * Returns cold-start unless the niche has graduated, and cold-start carries NO
 * absolute number. The `range` field is the only place an absolute figure can
 * appear, and it is populated in exactly one branch below.
 */
export async function predict(
  platform: PlatformId,
  niche: string,
  features: ScriptFeatures,
  expectations: LaneExpectation[],
  baselineMedian: number,
  /** A.3 — the goal this account is managed toward. Null falls back to generic performance. */
  goal: GrowthGoal | null = null,
): Promise<Prediction> {
  const expectation = expectations.find((entry) => entry.lane === features.contentLane) ?? null;
  const goalRead = goalReadFor(expectation, goal);

  const model = await readNicheModel(platform, nicheSlug(niche)).catch(() => null);
  const coefficients = coefficientsOf(model);

  if (!coefficients || !baselineMedian) {
    return {
      mode: "cold_start",
      modelVersion: PREDICTION_MODEL_VERSION,
      lane: features.contentLane,
      expectation,
      goal: goalRead,
      baselineMedian,
      statement: coldStartStatement(expectation, goalRead),
    };
  }

  // Calibrated: the band is in vsMedian terms, so it becomes absolute only by
  // multiplying through this account's own current median.
  const band = coefficients.byLane[features.contentLane] ?? coefficients.overall;
  const low = Math.round(band[0] * baselineMedian);
  const high = Math.round(band[1] * baselineMedian);
  const interval = model?.targetIntervalPct ?? TARGET_INTERVAL_PCT;

  // A.3: the forecast is FOR the goal's metric, so it must be labelled as that
  // metric rather than always as views.
  const metric: PredictedRange["metric"] =
    goal && GOAL_METRIC[goal].field === "saveRateVsMedian"
      ? "saves"
      : goal && GOAL_METRIC[goal].field === "shareRateVsMedian"
        ? "shares"
        : "views";

  return {
    mode: "calibrated",
    modelVersion: model?.modelVersion ?? PREDICTION_MODEL_VERSION,
    lane: features.contentLane,
    expectation,
    goal: goalRead,
    range: { metric, low, high, intervalPct: interval },
    baselineMedian,
    statement:
      `${low.toLocaleString()}–${high.toLocaleString()} ${metric}, ` +
      `${Math.round(interval * 100)}% interval, from ${model?.outcomeCount ?? 0} measured outcomes in this niche.`,
  };
}

/**
 * Writes one prediction row per generated idea.
 *
 * Called after the ideas are persisted, because a prediction is keyed to the
 * suggestion it is about and that key only exists once the suggestion is saved.
 * Never throws: losing a prediction row costs future calibration, but failing
 * the generation the user is waiting on costs them the work itself.
 *
 * Returns the ideas with their prediction attached, so the screen renders the
 * same object that was persisted rather than a second one computed separately.
 */
export async function recordPredictions(
  platform: PlatformId,
  niche: string,
  ideas: ContentIdea[],
  expectations: LaneExpectation[],
  baselineMedian: number,
  goal: GrowthGoal | null = null,
): Promise<ContentIdea[]> {
  const slug = nicheSlug(niche);
  const out: ContentIdea[] = [];
  let written = 0;

  for (const idea of ideas) {
    // An idea with no persisted id was never stored, so there is nothing for a
    // prediction to point at.
    if (!idea.id || !idea.contentLane) {
      out.push(idea);
      continue;
    }

    try {
      const prediction = await predict(
        platform,
        slug,
        {
          contentLane: idea.contentLane,
          format: idea.format,
          ...(idea.production?.durationSeconds
            ? { durationSeconds: idea.production.durationSeconds }
            : {}),
          shotCount: idea.shots?.length ?? 0,
          ...(idea.winningTrait ? { winningTrait: idea.winningTrait } : {}),
        },
        expectations,
        baselineMedian,
        goal,
      );

      const ok = await savePrediction({
        suggestionId: idea.id,
        platform,
        niche: slug,
        modelVersion: prediction.modelVersion,
        mode: prediction.mode,
        contentLane: idea.contentLane,
        format: idea.format,
        durationSeconds: idea.production?.durationSeconds ?? null,
        features: {
          winningTrait: idea.winningTrait ?? "",
          shotCount: idea.shots?.length ?? 0,
          sourceSignal: idea.sourceSignal ?? "",
          // A.3 — which metric this was judged against, and how the lane did on
          // it. Stored so a later calibration pass can tell a prediction made
          // under a reach goal from one made under a follower goal.
          goalMetric: prediction.goal?.metric ?? "",
          goalMultiple: prediction.goal?.multiple ?? null,
          servesGoal: prediction.goal?.servesGoal ?? null,
        },
        laneVsMedian: prediction.expectation?.vsMedian ?? null,
        laneSaveRateVsMedian: prediction.expectation?.saveRateVsMedian ?? null,
        laneWatchVsMedian: prediction.expectation?.watchVsMedian ?? null,
        laneDirectional: prediction.expectation?.directional ?? null,
        baselineMedian: baselineMedian || null,
        predictedMetric: prediction.range?.metric ?? null,
        predictedLow: prediction.range?.low ?? null,
        predictedHigh: prediction.range?.high ?? null,
        intervalPct: prediction.range?.intervalPct ?? null,
      });
      if (ok) written += 1;
      out.push({ ...idea, prediction });
    } catch (error) {
      console.error(`[predict:${platform}] could not record prediction for ${idea.id}:`, error);
      out.push(idea);
    }
  }

  if (written) console.log(`[predict:${platform}] recorded ${written} prediction(s).`);
  return out;
}

/**
 * Refits the niche model from measured outcomes and applies the graduation gate.
 *
 * Called after every outcome capture. The gate is re-evaluated from scratch each
 * time, which is what gives the spec's auto-revert for free: a niche that drifts
 * out of its coverage band simply fails the check on the next refit and its
 * `calibrated` flag goes back to false.
 *
 * Deterministic and never throws.
 */
export async function refitNiche(
  platform: PlatformId,
  niche: string,
): Promise<NicheModelRow | null> {
  const slug = nicheSlug(niche);

  try {
    const outcomes = await readOutcomes(platform);

    // Only scored outcomes. A pinned post carries excluded_reason and no score;
    // fitting on it would teach the model that pinned-post view counts are
    // normal, which is exactly why they are excluded everywhere else.
    const samples = outcomes
      .filter((outcome) => outcome.excludedReason == null && outcome.vsMedian != null)
      .map((outcome) => ({
        lane: outcome.contentLane ?? null,
        vsMedian: Number(outcome.vsMedian),
      }))
      .filter((sample) => Number.isFinite(sample.vsMedian) && sample.vsMedian > 0);

    if (samples.length < 3) {
      const row: NicheModelRow = {
        platform,
        niche: slug,
        modelVersion: PREDICTION_MODEL_VERSION,
        calibrated: false,
        outcomeCount: samples.length,
        coverage: null,
        targetIntervalPct: TARGET_INTERVAL_PCT,
        coefficients: {},
        note: `${samples.length} measured outcome${samples.length === 1 ? "" : "s"} — too few to fit anything. Needs ${GRADUATION_MIN_OUTCOMES}.`,
      };
      await saveNicheModel(row);
      return row;
    }

    const coefficients = fitQuantiles(samples);
    const coverage = backTestCoverage(samples);
    const calibrated = graduates(samples.length, coverage);

    const row: NicheModelRow = {
      platform,
      niche: slug,
      modelVersion: PREDICTION_MODEL_VERSION,
      calibrated,
      outcomeCount: samples.length,
      coverage: Math.round(coverage * 1000) / 1000,
      targetIntervalPct: TARGET_INTERVAL_PCT,
      coefficients: coefficients as unknown as Record<string, unknown>,
      note: calibrated
        ? `Calibrated on ${samples.length} outcomes; held-out coverage ${Math.round(coverage * 100)}% against a ${Math.round(TARGET_INTERVAL_PCT * 100)}% target.`
        : samples.length < GRADUATION_MIN_OUTCOMES
          ? `${samples.length} of ${GRADUATION_MIN_OUTCOMES} outcomes needed. Cold-start until then.`
          : `Held-out coverage ${Math.round(coverage * 100)}% missed the ${Math.round(TARGET_INTERVAL_PCT * 100)}% target by more than the tolerance — the interval does not yet mean what it says, so numeric predictions stay off.`,
    };

    await saveNicheModel(row);
    return row;
  } catch (error) {
    console.error(`[predict:${platform}] refit failed for ${slug}:`, error);
    return null;
  }
}

/**
 * The niche this platform's account is currently tracked under.
 *
 * Read from the last analysis rather than recomputed: the model must be fitted
 * and later read under the SAME label, and discovery's answer is the one both
 * sides already use.
 */
export async function currentNiche(platform: PlatformId): Promise<string> {
  const [analysis, snapshot] = await Promise.all([
    readAnalysis(platform).catch(() => null),
    latestSnapshot(platform, OWNER_ACCOUNTS[platform].handle).catch(() => null),
  ]);

  // This fallback chain is the SAME one the orchestrator uses when it labels a
  // prediction, and it has to stay that way. Predictions are written under this
  // label and the fitted model is stored under it; if the two ever disagree,
  // predict() reads a model refitNiche() never writes to, and the niche can
  // never graduate — silently, with nothing in the logs to show for it.
  return nicheSlug(
    analysis?.discovery?.niche ?? snapshot?.headline ?? OWNER_ACCOUNTS[platform].handle,
  );
}

/** Refits whichever niche this platform is tracked under. Called after each sync. */
export async function refitCurrentNiche(platform: PlatformId): Promise<NicheModelRow | null> {
  return refitNiche(platform, await currentNiche(platform));
}

/**
 * Predicted vs actual — the artifact that makes the value story checkable.
 *
 * In cold-start there is no range to score, so the only honest question is
 * directional: the expectation said this lane runs above the account's median;
 * did this post? That is a real, falsifiable claim, which is precisely why
 * cold-start is allowed to make it and not allowed to make a numeric one.
 */
export async function calibrationReport(
  platform: PlatformId,
  niche: string,
): Promise<CalibrationReport> {
  const slug = nicheSlug(niche);
  const empty: CalibrationReport = {
    made: 0,
    scored: 0,
    directionalHits: 0,
    insideRange: 0,
    calibrated: false,
    note: "No predictions recorded yet.",
    samples: [],
  };

  try {
    const [predictions, outcomes, model] = await Promise.all([
      readPredictions(platform).catch(() => []),
      readOutcomes(platform).catch(() => []),
      readNicheModel(platform, slug).catch(() => null),
    ]);

    if (!predictions.length) return { ...empty, calibrated: Boolean(model?.calibrated) };

    const byId = new Map(
      outcomes
        .filter((outcome) => outcome.excludedReason == null && outcome.vsMedian != null)
        .map((outcome) => [outcome.suggestionId, outcome]),
    );

    const samples: ScoredPrediction[] = [];
    for (const prediction of predictions) {
      const outcome = byId.get(prediction.suggestionId);
      if (!outcome || outcome.vsMedian == null) continue;

      const actual = Number(outcome.vsMedian);
      const expectedAbove = prediction.laneVsMedian == null ? null : prediction.laneVsMedian > 1;
      const inside =
        prediction.predictedLow != null &&
        prediction.predictedHigh != null &&
        prediction.baselineMedian
          ? actual * prediction.baselineMedian >= prediction.predictedLow &&
            actual * prediction.baselineMedian <= prediction.predictedHigh
          : null;

      samples.push({
        suggestionId: prediction.suggestionId,
        lane: prediction.contentLane,
        mode: prediction.mode,
        expectedAboveMedian: expectedAbove,
        actualVsMedian: Math.round(actual * 100) / 100,
        actualBeatMedian: actual > 1,
        insideRange: inside,
        predictedLow: prediction.predictedLow,
        predictedHigh: prediction.predictedHigh,
      });
    }

    const directionalHits = samples.filter(
      (sample) =>
        sample.expectedAboveMedian != null &&
        sample.expectedAboveMedian === sample.actualBeatMedian,
    ).length;
    const insideRange = samples.filter((sample) => sample.insideRange === true).length;

    return {
      made: predictions.length,
      scored: samples.length,
      directionalHits,
      insideRange,
      calibrated: Boolean(model?.calibrated),
      note:
        model?.note ||
        (samples.length
          ? `${samples.length} of ${predictions.length} suggestions have been published and measured.`
          : "Suggestions have been made but none has been published and measured yet."),
      samples,
    };
  } catch (error) {
    console.error(`[predict:${platform}] calibration report failed:`, error);
    return empty;
  }
}
