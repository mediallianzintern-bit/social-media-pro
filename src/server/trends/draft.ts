// Addendum C.5 — drafting an idea from a trend that has earned it.
//
// The guardrails the addendum names, all enforced here rather than trusted to
// the prompt:
//
//   • A trend-sourced draft enters the normal flow as `suggested` with
//     source_signal = 'niche_trend'. Nothing is auto-published, and the growth
//     manager approves it like anything else.
//   • The strategist still starts from the client's own proven winners and
//     adapts the trend into their voice and lane. The trend is handed to it as
//     ONE input among the usual brief, never as the brief.
//   • Because the draft is labelled, the learning loop can later measure
//     whether trend-driven ideas actually perform for this client — so the
//     feature earns or loses trust on evidence rather than on enthusiasm.
//
// This is never called automatically. It costs a model call and a slot in the
// creator's queue, so it runs when something asks it to.
import { generateIdeas } from "../ai/analyst";
import { qualifiesForAutoDraft, trendsForClient, type SurfacedTrend } from "./relevant";
import { buildBrief } from "../ai/analyst";
import { currentNiche, recordPredictions } from "../predict";
import {
  latestSnapshot,
  readAnalysis,
  readClient,
  readInsights,
  readPosts,
  readPublishedSubjects,
  readRecentSuggestions,
  setIdeaSourceSignal,
} from "../store";
import { OWNER_ACCOUNTS } from "../apify/accounts";
import { DEFAULT_PRIMARY_METRIC, DEFAULT_SECONDARY_METRICS, growthTrajectory } from "@/lib/growth";
import { PLATFORM_IDS, type PlatformId } from "@/lib/analytics-types";
import type { ContentIdea } from "@/lib/ai-types";

export interface DraftResult {
  drafted: ContentIdea[];
  /** Trends that cleared the bar but produced nothing, and why. */
  skipped: Array<{ label: string; reason: string }>;
  /** Trends considered, whether or not they qualified. */
  considered: number;
  reason?: string;
}

/**
 * Drafts one idea per qualifying trend.
 *
 * `limit` is deliberately small and defaults to one: the creator's queue is a
 * finite amount of someone's attention, and three speculative trend ideas
 * crowding out the measured ones would be a net loss even if each were sound.
 */
export async function draftFromTrends(
  platform: PlatformId,
  options: { limit?: number; dryRun?: boolean } = {},
): Promise<DraftResult> {
  const limit = options.limit ?? 1;
  const empty: DraftResult = { drafted: [], skipped: [], considered: 0 };

  const surfaced = await trendsForClient(platform, 10).catch(() => [] as SurfacedTrend[]);
  if (!surfaced.length) {
    return { ...empty, reason: "No trends stored yet — run the listener first." };
  }

  const qualifying = surfaced.filter(qualifiesForAutoDraft).slice(0, limit);
  const skipped = surfaced
    .filter((entry) => !qualifiesForAutoDraft(entry))
    .map((entry) => ({
      label: entry.signal.label,
      reason:
        entry.signal.momentum !== "rising"
          ? `not rising (${entry.signal.momentum})`
          : entry.signal.directional
            ? `only ${entry.signal.observations} readings — still directional`
            : `relevance ${entry.relevance.score} is below the drafting bar`,
    }));

  if (!qualifying.length) {
    return { ...empty, considered: surfaced.length, skipped, reason: "No trend cleared the bar." };
  }

  // A dry run answers "what WOULD this draft?" without spending a model call —
  // the honest way to inspect the feature before paying for it.
  if (options.dryRun) {
    return {
      ...empty,
      considered: surfaced.length,
      skipped,
      reason: `Would draft from: ${qualifying.map((entry) => entry.signal.label).join(", ")}`,
    };
  }

  const owner = OWNER_ACCOUNTS[platform];
  const [snapshot, posts, insights, client, prior] = await Promise.all([
    latestSnapshot(platform, owner.handle),
    readPosts(platform, owner.handle),
    readInsights(platform, owner.handle).catch(() => null),
    readClient().catch(() => null),
    readRecentSuggestions(platform).catch(() => []),
  ]);
  if (!snapshot || !posts.length) {
    return {
      ...empty,
      considered: surfaced.length,
      skipped,
      reason: "No stored posts to build on.",
    };
  }

  const subjects = (
    await Promise.all(
      PLATFORM_IDS.map((other) =>
        readPublishedSubjects(other, OWNER_ACCOUNTS[other].handle)
          .then((list) => list.map((entry) => ({ ...entry, platform: other })))
          .catch(() => []),
      ),
    )
  ).flat();

  const growthPoints = await import("../store").then((m) =>
    m.growthSeries(platform, owner.handle).catch(() => []),
  );
  const goal = client
    ? {
        growthGoal: client.growthGoal,
        primaryMetric: client.primaryMetric || DEFAULT_PRIMARY_METRIC[client.growthGoal],
        secondaryMetrics: client.secondaryMetrics.length
          ? client.secondaryMetrics
          : DEFAULT_SECONDARY_METRICS[client.growthGoal],
        trajectory: growthTrajectory(
          growthPoints,
          client.primaryMetric || DEFAULT_PRIMARY_METRIC[client.growthGoal],
          client.engagementStart,
        ),
      }
    : null;

  const brief = buildBrief(
    snapshot.handle,
    snapshot.displayName,
    snapshot.headline ?? "",
    snapshot.followers,
    posts,
    400,
    insights ?? undefined,
    {
      priorSuggestions: prior.map((entry) => ({
        hook: entry.hook,
        lane: entry.contentLane,
        trait: entry.winningTrait,
      })),
      publishedSubjects: subjects.map((entry) => ({
        opening: entry.opening,
        publishedAt: entry.publishedAt,
        lane: entry.contentLane,
        platform: entry.platform,
      })),
      ...(goal ? { goal } : {}),
    },
  );

  // The trend enters as a TRENDS pick — the same shape the per-analysis trend
  // scout produces — so the strategist's existing ordering rule applies
  // unchanged: own winners first, the trend adapted into them.
  const analysis = await readAnalysis(platform).catch(() => null);
  const result = await generateIdeas(
    platform,
    brief,
    [],
    {
      analyst: analysis?.analyst ?? null,
      competitive: analysis?.competitors ?? null,
      trends: {
        headline: "Rising in this niche, detected by the standing listener across repeated checks.",
        picks: qualifying.map((entry) => ({
          term: entry.signal.label,
          whyRelevant: entry.relevance.reasons.join("; "),
          lane: entry.relevance.lane ?? "",
        })),
        note: "",
        candidatesFound: surfaced.length,
        queries: [],
      },
    },
    qualifying.length,
  );

  // Label them, so the loop can grade trend-driven ideas separately later.
  // generateIdeas has already persisted the rows, so the label has to be
  // written back rather than set on the object alone.
  const drafted = result.ideas.map((idea) => ({
    ...idea,
    sourceSignal: "niche_trend" as const,
  }));
  await setIdeaSourceSignal(drafted.map((idea) => idea.id).filter(Boolean), "niche_trend").catch(
    (error: unknown) => {
      console.error(`[trends:${platform}] could not label drafts as niche_trend:`, error);
      return 0;
    },
  );

  const niche = await currentNiche(platform).catch(() => platform);
  const withPredictions = await recordPredictions(
    platform,
    niche,
    drafted,
    brief.expectations ?? [],
    brief.baselineMedian ?? 0,
    goal?.growthGoal ?? null,
  ).catch(() => drafted);

  return { drafted: withPredictions, skipped, considered: surfaced.length };
}
