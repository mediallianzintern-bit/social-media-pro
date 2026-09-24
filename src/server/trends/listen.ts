// Addendum C.1 — the standing niche listener.
//
// This promotes the trend-scout and audience-question agents from "run once
// during a client analysis" to "run on a schedule and accumulate history". The
// core discipline is unchanged: search terms are derived from the account's own
// lanes, real data is pulled, and nothing is invented. Momentum is then computed
// from the accumulated readings in TypeScript — never asserted by a model.
//
// THIS IS THE ONE PLACE THE SYSTEM SCRAPES ON A SCHEDULE rather than on sync, so
// it is deliberately rate-limited and niche-scoped. Three separate gates stand
// between this module and an unexpected bill:
//
//   1. The feeds are opt-in by env var and unset means off.
//   2. MIN_HOURS_BETWEEN_RUNS refuses a run that is too soon after the last.
//   3. Nothing calls this automatically. There is no cron, no sync hook, and no
//      page load that reaches it — it runs when a person or a scheduler asks.
//
// No LLM call happens here at all: feedQueries() derives the search terms
// deterministically from the account's lanes, which is both cheaper and better
// anchored than asking a model to guess at the same thing.
import {
  fetchAudienceQuestions,
  fetchTrends,
  feedQueries,
  questionFeedActor,
  trendFeedActor,
} from "../ai/feeds";
import { currentNiche } from "../predict";
import {
  latestSnapshot,
  readPosts,
  readTrendObservations,
  saveTrendObservations,
  saveTrendSignals,
  type TrendObservationRow,
} from "../store";
import { OWNER_ACCOUNTS } from "../apify/accounts";
import { computeSignals } from "@/lib/trends";
import { lanePerformance, type PlatformId } from "@/lib/analytics-types";

/**
 * Weekly is the sensible default the addendum names. This is the floor, not the
 * schedule: it refuses runs that come too close together, so a misfiring
 * scheduler or an impatient second click cannot double the bill.
 */
export const MIN_HOURS_BETWEEN_RUNS = 20;

/** What the UI needs to explain the listener's state without running it. */
export interface ListenerStatus {
  trendFeed: string | null;
  questionFeed: string | null;
  configured: boolean;
  /** The env vars to set, named so the message is actionable. */
  missing: string[];
}

export function listenerStatus(): ListenerStatus {
  const trend = trendFeedActor() ?? null;
  const question = questionFeedActor() ?? null;
  return {
    trendFeed: trend,
    questionFeed: question,
    configured: Boolean(trend || question),
    missing: [...(trend ? [] : ["TREND_FEED_ACTOR"]), ...(question ? [] : ["QUESTION_FEED_ACTOR"])],
  };
}

export interface ListenResult {
  niche: string;
  ran: boolean;
  reason?: string;
  observations: number;
  signals: number;
  rising: number;
}

/**
 * Strength for a feed item.
 *
 * The feeds return ordered lists without scores, so rank is the only signal
 * available: earlier means stronger. Crude, and honest about being crude — what
 * matters for momentum is that the SAME measure is applied on every run, so the
 * comparison across runs is like-for-like even if the absolute number means
 * little on its own.
 */
function strengthFromRank(index: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round(((total - index) / total) * 100);
}

/**
 * One listening pass for one niche.
 *
 * Returns without spending anything when a feed is unconfigured or the last run
 * was too recent — both are normal states, reported rather than thrown.
 */
export async function listenForTrends(
  platform: PlatformId,
  options: { force?: boolean } = {},
): Promise<ListenResult> {
  const niche = await currentNiche(platform).catch(() => platform);
  const empty: ListenResult = { niche, ran: false, observations: 0, signals: 0, rising: 0 };

  if (!trendFeedActor() && !questionFeedActor()) {
    return {
      ...empty,
      reason:
        "No feed configured. Set TREND_FEED_ACTOR and/or QUESTION_FEED_ACTOR to switch the listener on.",
    };
  }

  // Gate 2: refuse a run that is too soon after the last one.
  const history = await readTrendObservations(niche).catch(() => []);
  if (!options.force && history.length) {
    const last = history[history.length - 1]?.observedAt;
    const hours = last ? (Date.now() - new Date(last).getTime()) / 3_600_000 : Infinity;
    if (hours < MIN_HOURS_BETWEEN_RUNS) {
      return {
        ...empty,
        reason: `Last run was ${hours.toFixed(1)}h ago; the floor is ${MIN_HOURS_BETWEEN_RUNS}h. Pass force to override.`,
      };
    }
  }

  // Seed from the account's own lanes — the same deterministic derivation the
  // per-analysis agents use, so the listener and the analysis look for the same
  // kind of thing.
  const [snapshot, posts] = await Promise.all([
    latestSnapshot(platform, OWNER_ACCOUNTS[platform].handle).catch(() => null),
    readPosts(platform, OWNER_ACCOUNTS[platform].handle).catch(() => []),
  ]);
  const lanes = lanePerformance(posts).map((lane) => lane.lane);
  const queries = feedQueries(snapshot?.headline ?? niche, lanes);

  if (!queries.length) {
    return { ...empty, reason: "No lanes or niche to seed the search with yet." };
  }

  const [trends, questions] = await Promise.all([
    fetchTrends(queries).catch((error: unknown) => {
      console.error(`[trends:${niche}] trend feed failed:`, error);
      return [];
    }),
    fetchAudienceQuestions(queries).catch((error: unknown) => {
      console.error(`[trends:${niche}] question feed failed:`, error);
      return [];
    }),
  ]);

  const rows: TrendObservationRow[] = [
    ...trends.map((item, index) => ({
      niche,
      platform,
      kind: "topic" as const,
      label: item.term,
      strength: strengthFromRank(index, trends.length),
      fromQuery: item.fromQuery,
      evidence: item.evidence,
    })),
    ...questions.map((item, index) => ({
      niche,
      platform,
      kind: "hook" as const,
      label: item.term,
      strength: strengthFromRank(index, questions.length),
      fromQuery: item.fromQuery,
      evidence: item.evidence,
    })),
  ];

  if (!rows.length) {
    return { ...empty, reason: "Feeds returned nothing usable this run." };
  }

  await saveTrendObservations(rows);

  // Recompute every signal from the full history, including this run. Momentum
  // is a property of the series, so it is derived fresh rather than patched.
  const all = await readTrendObservations(niche).catch(() => []);
  const signals = computeSignals(all);
  await saveTrendSignals(niche, signals).catch((error: unknown) => {
    console.error(`[trends:${niche}] signal write failed:`, error);
  });

  return {
    niche,
    ran: true,
    observations: rows.length,
    signals: signals.length,
    rising: signals.filter((s) => s.momentum === "rising" && !s.directional).length,
  };
}
