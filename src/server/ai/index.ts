// Orchestration: discover → read stored data → build briefs → analyse → cache.
//
// Generation is explicit and cached. It is never triggered by a page load,
// because every run costs money and the answer only changes when the underlying
// posts change.
import { buildBrief, generateIdeas, type AccountBrief } from "./analyst";
import {
  analystRead,
  audienceQuestions,
  competitorRead,
  reflectionRead,
  trendScout,
} from "./agents";
import { questionFeedActor, trendFeedActor, trendFeedInAnalysis } from "./feeds";
import { currentNiche, recordPredictions } from "../predict";
import { hasOpenAi, openAiKeyIsPlaceholder } from "./client";
import { discoverCompetitors, type DiscoveryResult } from "./discover";
import { classifyPosts, ensureLanes } from "./lanes";
import { nicheLanes, suggestionFeedback } from "./feedback";
import { OWNER_ACCOUNTS } from "../apify/accounts";
import {
  competitorSnapshots,
  growthSeries,
  latestSnapshot,
  readAnalysis,
  readInsights,
  readOutcomes,
  readPosts,
  readClient,
  readPublishedSubjects,
  readRecentSuggestions,
  readSourceItemsById,
  readTaxonomy,
  saveAnalysis,
} from "../store";
import { refreshSources, sourceCandidates } from "../sources";
import type { AiAnalysis } from "@/lib/ai-types";
import { PLATFORM_IDS, type PlatformId } from "@/lib/analytics-types";
import { DEFAULT_PRIMARY_METRIC, DEFAULT_SECONDARY_METRICS, growthTrajectory } from "@/lib/growth";
import { goalScorecard } from "@/lib/goal-scorecard";

export async function loadAnalysis(platform: PlatformId): Promise<AiAnalysis | null> {
  return readAnalysis(platform);
}

function unavailable(platform: PlatformId, error: string): AiAnalysis {
  return {
    platform,
    generatedAt: new Date().toISOString(),
    model: "",
    competitors: null,
    ideas: [],
    error,
  };
}

async function briefsFor(platform: PlatformId): Promise<AccountBrief[]> {
  const rivals = await competitorSnapshots(platform);
  return Promise.all(
    rivals.map(async (rival) => {
      // Competitor captions are trimmed harder — they are context for the
      // model's read of a lane, not material to imitate.
      const posts = await readPosts(platform, rival.handle).catch(() => []);
      return buildBrief(
        rival.handle,
        rival.displayName,
        rival.headline ?? "",
        rival.followers,
        posts,
        200,
      );
    }),
  );
}

/**
 * Everything the strategist is handed about the owner, assembled from storage.
 *
 * Shared by the full analysis and the single-idea paths ("write a script for
 * this topic", "suggest the next one"). `classify` controls the one step that
 * can call a model: labelling posts that have no lane yet. The full analysis
 * does it; the single-idea paths reuse the lanes already stored, so the only
 * model call they make is the one the person clicked for.
 */
async function prepareOwner(
  platform: PlatformId,
  options: { classify: boolean },
): Promise<{
  ownerBrief: AccountBrief;
  goal: AccountBrief["goal"] | null;
  rivals: Awaited<ReturnType<typeof competitorSnapshots>>;
} | null> {
  const owner = OWNER_ACCOUNTS[platform];
  const [snapshot, ownerPosts, graphInsights] = await Promise.all([
    latestSnapshot(platform, owner.handle),
    readPosts(platform, owner.handle),
    // Owner-only. Never fetched for competitors: a Meta token reads no account
    // but its own, so the asymmetry is real and the prompt is told about it.
    readInsights(platform, owner.handle).catch(() => null),
  ]);

  if (!snapshot || !ownerPosts.length) return null;

  // Lanes first: everything downstream reads post.contentLane, and classifying
  // mutates the posts in place. Never fatal — losing lanes costs the lane
  // sections, not the analysis.
  const lanes = options.classify
    ? await ensureLanes(platform, owner.handle, ownerPosts)
    : ((await readTaxonomy(platform, owner.handle).catch(() => null)) ?? []);

  // Competitors are classified against the OWNER'S vocabulary, not their own.
  //
  // Each account would otherwise get a taxonomy in its own words, and "Brand
  // teardowns" here versus "Brand breakdowns" there would never line up — which
  // makes the whole point of §5.2 ("this lane wins on 4 of 5 accounts")
  // impossible to compute. One shared vocabulary, owned by the account we are
  // advising, is what makes lanes comparable across accounts at all.
  const rivals = await competitorSnapshots(platform).catch(() => []);
  if (lanes.length && options.classify) {
    for (const rival of rivals) {
      const posts = await readPosts(platform, rival.handle).catch(() => []);
      await classifyPosts(platform, lanes, posts).catch((error) =>
        console.error(`[ai:${platform}] lane classification failed for ${rival.handle}:`, error),
      );
    }
  }

  const [pastSuggestions, priorSuggestions, publishedSubjects, niche] = await Promise.all([
    suggestionFeedback(platform).catch(() => null),
    // Everything already proposed, filmed or not — so the strategist does not
    // hand back subjects this account has seen before.
    readRecentSuggestions(platform).catch(() => []),
    // The whole published back catalogue, as subjects, for BOTH platforms.
    //
    // Cross-platform on purpose: it is one creator. A subject covered on
    // LinkedIn is not new just because this brief is about Instagram — that is
    // exactly how "AI search" reached the Instagram ideas after being published
    // twice on LinkedIn. The prompt treats same-platform as spent and
    // other-platform as a port that has to justify itself.
    Promise.all(
      PLATFORM_IDS.map((other) =>
        readPublishedSubjects(other, OWNER_ACCOUNTS[other].handle)
          .then((subjects) => subjects.map((entry) => ({ ...entry, platform: other })))
          .catch(
            () =>
              [] as Array<{
                opening: string;
                publishedAt: string;
                contentLane: string | null;
                platform: PlatformId;
              }>,
          ),
      ),
    ).then((lists) => lists.flat()),
    lanes.length
      ? nicheLanes(platform, owner.handle, ownerPosts, rivals).catch(() => [])
      : Promise.resolve([]),
  ]);

  // Addendum A: the goal the recommendations must serve, and the current
  // trajectory of the metric they are judged on. Both degrade to absent when
  // the clients table has not been migrated yet, in which case the strategist
  // simply gets no goal block and behaves as before.
  const client = await readClient().catch(() => null);
  const [growth, goalOutcomes] = await Promise.all([
    growthSeries(platform, owner.handle).catch(() => []),
    readOutcomes(platform).catch(() => []),
  ]);
  const goal = client
    ? {
        growthGoal: client.growthGoal,
        primaryMetric: client.primaryMetric || DEFAULT_PRIMARY_METRIC[client.growthGoal],
        secondaryMetrics: client.secondaryMetrics.length
          ? client.secondaryMetrics
          : DEFAULT_SECONDARY_METRICS[client.growthGoal],
        trajectory: growthTrajectory(
          growth,
          client.primaryMetric || DEFAULT_PRIMARY_METRIC[client.growthGoal],
          client.engagementStart,
        ),
        // A.5 — reflection reasons over this; it never computes it.
        scorecard: goalScorecard(
          growth,
          goalOutcomes
            .filter((row) => row.excludedReason == null)
            .map((row) => row.publishedAt ?? row.measuredAt)
            .filter((iso): iso is string => Boolean(iso)),
          client.primaryMetric || DEFAULT_PRIMARY_METRIC[client.growthGoal],
          client.engagementStart,
        ),
      }
    : null;

  const ownerBrief = buildBrief(
    snapshot.handle,
    snapshot.displayName,
    snapshot.headline ?? "",
    snapshot.followers,
    ownerPosts,
    400,
    graphInsights ?? undefined,
    {
      pastSuggestions,
      nicheLanes: niche,
      priorSuggestions: priorSuggestions.map((entry) => ({
        hook: entry.hook,
        lane: entry.contentLane,
        trait: entry.winningTrait,
      })),
      publishedSubjects: publishedSubjects.map((entry) => ({
        opening: entry.opening,
        publishedAt: entry.publishedAt,
        lane: entry.contentLane,
        platform: entry.platform,
      })),
      ...(goal ? { goal } : {}),
    },
  );

  return { ownerBrief, goal, rivals };
}

/**
 * Runs the full analysis.
 *
 * Discovery is automatic: with no competitors tracked, the pipeline finds them
 * before analysing, because a competitive read with nothing to compare against
 * is not worth generating. Set `rediscover` to refresh an existing list.
 */
export async function runAnalysis(
  platform: PlatformId,
  options: { rediscover?: boolean } = {},
): Promise<AiAnalysis> {
  if (!hasOpenAi()) {
    return unavailable(
      platform,
      openAiKeyIsPlaceholder()
        ? "OPENAI_API_KEY looks like a placeholder, not a real key. Replace it in .env with the key from platform.openai.com/api-keys, then restart the dev server."
        : "OPENAI_API_KEY is not set — add it to .env and restart the dev server.",
    );
  }

  const prepared = await prepareOwner(platform, { classify: true });
  if (!prepared) {
    return unavailable(platform, "No posts stored yet — run a sync before generating analysis.");
  }
  const { ownerBrief, goal } = prepared;

  let rivalBriefs = await briefsFor(platform);
  let discovery: DiscoveryResult | null = null;

  if (!rivalBriefs.length || options.rediscover) {
    try {
      discovery = await discoverCompetitors(platform, ownerBrief);
      if (discovery.selected.length) rivalBriefs = await briefsFor(platform);
    } catch (error) {
      // Discovery failing must not block the rest — the owner-only analysis is
      // still worth producing.
      console.error(`[ai:${platform}] discovery failed:`, error);
    }
  }

  const failures: string[] = [];
  let model = "";
  const note = (error: unknown) => {
    failures.push(error instanceof Error ? error.message : String(error));
    return null;
  };

  // The niche label: what the feeds are seeded with, AND the key predictions
  // and the fitted model are both stored under. Resolved by currentNiche() so
  // there is exactly one implementation of this fallback chain — two copies
  // drifted apart once already and broke calibration silently.
  const nicheLabel = discovery?.niche ?? (await currentNiche(platform));

  // All READ agents are independent of each other and run together. Each is
  // isolated: one failing costs its own section, not the run.
  //
  // The two feed-backed agents are only invoked when their feed is actually
  // configured. Without one there is nothing real to select from, and an agent
  // asked for trends with no trend data in front of it is precisely the setup
  // that produces a confident, invented answer.
  const [analystResult, competitorResult, reflectionResult, trendResult, questionResult] =
    await Promise.all([
      analystRead(platform, ownerBrief).catch(note),
      competitorRead(platform, ownerBrief, rivalBriefs).catch(note),
      reflectionRead(platform, ownerBrief).catch(note),
      // Both feed agents scrape, and this runs on every regeneration — so they
      // need their own switch rather than riding on the listener's actor being
      // configured. Off unless TREND_FEED_IN_ANALYSIS says otherwise.
      trendFeedActor() && trendFeedInAnalysis()
        ? trendScout(platform, ownerBrief, nicheLabel).catch(note)
        : null,
      questionFeedActor() && trendFeedInAnalysis()
        ? audienceQuestions(platform, ownerBrief, nicheLabel).catch(note)
        : null,
    ]);

  const analyst = analystResult?.read ?? null;
  const competitors = competitorResult?.analysis ?? null;
  const reflection = reflectionResult?.read ?? null;
  const trends = trendResult?.read ?? null;
  const questions = questionResult?.read ?? null;
  model = analystResult?.model ?? competitorResult?.model ?? reflectionResult?.model ?? "";

  // Real stories to build on. Free to fetch, so the pass refreshes them first
  // (its own floor stops it re-fetching within hours). A feed failure costs the
  // links, not the ideas: they are generated unverified and labelled so.
  await refreshSources(platform).catch((error: unknown) =>
    console.error(`[ai:${platform}] source refresh failed:`, error),
  );
  const sources = await sourceCandidates(platform).catch(() => []);

  // The strategist runs last because it writes AGAINST the reads above — it is
  // the only agent that consumes other agents' output.
  let ideas: AiAnalysis["ideas"] = [];
  let dropped: string[] = [];
  try {
    const result = await generateIdeas(
      platform,
      ownerBrief,
      rivalBriefs,
      { analyst, competitive: competitors, reflection, trends, questions },
      3,
      sources,
    );
    ideas = result.ideas;
    dropped = result.dropped;
    model = model || result.model;

    // Layer 4: one prediction per suggestion, written the moment the suggestion
    // exists and never rewritten. Attaching it here — rather than letting the
    // strategist claim a confidence — is what keeps the number on screen
    // traceable to measured posts. Never fatal.
    ideas = await recordPredictions(
      platform,
      nicheLabel,
      ideas,
      ownerBrief.expectations ?? [],
      ownerBrief.baselineMedian ?? 0,
      goal?.growthGoal ?? null,
    ).catch((error: unknown) => {
      console.error(`[ai:${platform}] prediction recording failed:`, error);
      return ideas;
    });
  } catch (error) {
    note(error);
  }

  const analysis: AiAnalysis = {
    platform,
    generatedAt: new Date().toISOString(),
    model,
    analyst,
    competitors,
    reflection,
    trends,
    audienceQuestions: questions,
    ideas,
    ...(dropped.length ? { dropped } : {}),
    ...(discovery
      ? {
          discovery: {
            niche: discovery.niche,
            searchQueries: discovery.searchQueries,
            candidatesFound: discovery.candidatesFound,
            selected: discovery.selected.map((entry) => ({
              handle: entry.handle,
              displayName: entry.displayName,
              followers: entry.followers,
              lane: entry.lane,
              whyComparable: entry.whyComparable,
              tier: entry.tier,
            })),
            note: discovery.note,
          },
        }
      : {}),
    // Partial success is still worth keeping — one half failing shouldn't discard
    // the other, but the failure must be visible rather than silently absent.
    ...(failures.length ? { error: failures.join(" · ") } : {}),
  };

  await saveAnalysis(platform, analysis).catch((error: unknown) => {
    console.error("[ai] could not cache analysis:", error);
  });

  return analysis;
}

export interface MoreResult {
  analysis: AiAnalysis | null;
  /** The new idea, or null when none survived (see reason). */
  idea: AiAnalysis["ideas"][number] | null;
  reason?: string;
}

/**
 * One more idea, on demand — "write a script for this topic" and "suggest the
 * next one".
 *
 * Exactly one model call, and only because a person clicked for it: the read
 * agents are NOT re-run. Their last output is reused from the cached analysis,
 * which is what keeps a single idea cheap. The new idea is added to the front
 * of the cached set, so it appears on the dashboard with everything else.
 *
 * With `sourceId`, that story is the ONLY source offered — the schema's enum
 * holds one id — so the idea is guaranteed to be about the topic clicked.
 */
export async function generateMore(
  platform: PlatformId,
  options: { sourceId?: string } = {},
): Promise<MoreResult> {
  if (!hasOpenAi()) {
    return { analysis: null, idea: null, reason: "OPENAI_API_KEY is not set." };
  }

  const prepared = await prepareOwner(platform, { classify: false });
  if (!prepared) {
    return { analysis: null, idea: null, reason: "No posts stored yet — run a sync first." };
  }
  const { ownerBrief, goal } = prepared;

  let sources;
  if (options.sourceId) {
    sources = await readSourceItemsById([options.sourceId]).catch(() => []);
    if (!sources.length) {
      return {
        analysis: null,
        idea: null,
        reason: "That topic is no longer stored — refresh the topics.",
      };
    }
  } else {
    await refreshSources(platform).catch(() => null);
    sources = await sourceCandidates(platform).catch(() => []);
  }

  const [cached, rivalBriefs] = await Promise.all([
    readAnalysis(platform).catch(() => null),
    briefsFor(platform),
  ]);

  const result = await generateIdeas(
    platform,
    ownerBrief,
    rivalBriefs,
    {
      analyst: cached?.analyst ?? null,
      competitive: cached?.competitors ?? null,
      reflection: cached?.reflection ?? null,
    },
    1,
    sources,
  );

  const niche = await currentNiche(platform).catch(() => platform);
  const ideas = await recordPredictions(
    platform,
    niche,
    result.ideas,
    ownerBrief.expectations ?? [],
    ownerBrief.baselineMedian ?? 0,
    goal?.growthGoal ?? null,
  ).catch(() => result.ideas);

  const idea = ideas[0] ?? null;
  const analysis: AiAnalysis = {
    ...(cached ?? {
      platform,
      generatedAt: new Date().toISOString(),
      model: result.model,
      competitors: null,
      ideas: [],
    }),
    ideas: [...ideas, ...(cached?.ideas ?? [])],
  };
  if (idea) {
    await saveAnalysis(platform, analysis).catch((error: unknown) =>
      console.error(`[ai:${platform}] could not cache the new idea:`, error),
    );
  }

  return {
    analysis: idea ? analysis : cached,
    idea,
    ...(idea
      ? {}
      : {
          reason: result.dropped.length
            ? `The idea was discarded: ${result.dropped.join("; ")}`
            : "The model returned no idea.",
        }),
  };
}
