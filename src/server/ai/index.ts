// Orchestration: discover → read stored data → build briefs → analyse → cache.
//
// Generation is explicit and cached. It is never triggered by a page load,
// because every run costs money and the answer only changes when the underlying
// posts change.
import { trackedCompetitorSnapshots, withoutUntracked } from "../competitors";
import { buildBrief, generateIdeas, type AccountBrief, type LinkedInOwned } from "./analyst";
import {
  analystRead,
  audienceQuestions,
  competitorRead,
  reflectionRead,
  trendScout,
} from "./agents";
import { questionFeedActor, trendFeedActor, trendFeedInAnalysis } from "./feeds";
import { currentNiche, recordPredictions } from "../predict";
import { hasOpenAi, OpenAiError, openAiKeyIsPlaceholder } from "./client";
import { addCosts } from "./review";
import { workflowLaneForSource } from "./tool-workflow";
import { isAiToolWorkflowLane } from "@/lib/tool-workflow";
import { discoverCompetitors, type DiscoveryResult } from "./discover";
import { filmedLessonsBlock, learnedRules } from "../reel-learning/lessons";
import { classifyPosts, ensureLanes } from "./lanes";
import { nicheLanes, suggestionFeedback } from "./feedback";
import { buildPreferenceModel, learnedSummary } from "@/lib/preferences";
import { currentEra, scopeToEra } from "@/lib/eras";
import type { SourceItem } from "@/lib/sources";
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
  readCalendarEntries,
  readRecentSuggestions,
  readSourceItems,
  readSourceItemsById,
  readEras,
  readTaxonomy,
  saveAnalysis,
  readTopicVotes,
} from "../store";
import { refreshSources, sourceCandidates } from "../sources";
import type { AiAnalysis } from "@/lib/ai-types";
import { PLATFORM_IDS, type PlatformId, type PostRecord } from "@/lib/analytics-types";
import type { PeriodTotals } from "@/lib/linkedin-analytics";
import { DEFAULT_PRIMARY_METRIC, DEFAULT_SECONDARY_METRICS, growthTrajectory } from "@/lib/growth";
import { goalScorecard } from "@/lib/goal-scorecard";
import { plainFiguresDeep } from "@/lib/plain-figures";

export async function loadAnalysis(platform: PlatformId): Promise<AiAnalysis | null> {
  const saved = await readAnalysis(platform);
  if (!saved) return saved;
  // Field names the model wrote despite its rules, in plain words.
  const stored = plainFiguresDeep(saved);
  // A competitor removed since this analysis was written is not shown.
  const analysis = {
    ...stored,
    competitors: await withoutUntracked(platform, stored.competitors ?? null).catch(
      () => stored.competitors ?? null,
    ),
  };
  if (!analysis.ideas.length) return analysis;

  // T63 — the cached analysis is the batch as it was written; which hook the
  // team picked afterwards lives on the idea's own row. Merging it here is
  // what makes a choice survive a reload.
  const { readChosenHooks } = await import("../store");
  const chosen = await readChosenHooks(analysis.ideas.map((idea) => idea.id)).catch(
    () => new Map<string, string>(),
  );
  if (!chosen.size) return analysis;

  return {
    ...analysis,
    ideas: analysis.ideas.map((idea) => {
      const hook = chosen.get(idea.id);
      return hook ? { ...idea, chosenHook: hook } : idea;
    }),
  };
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
  const rivals = await trackedCompetitorSnapshots(platform);
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
  const rivals = await trackedCompetitorSnapshots(platform).catch(() => []);
  if (lanes.length && options.classify) {
    for (const rival of rivals) {
      const posts = await readPosts(platform, rival.handle).catch(() => []);
      await classifyPosts(platform, lanes, posts).catch((error) =>
        console.error(`[ai:${platform}] lane classification failed for ${rival.handle}:`, error),
      );
    }
  }

  // T56 — compare against the CURRENT era only.
  //
  // Medians, lane performance and the best and worst posts are all "against
  // this account's own history", and that comparison is only fair inside one
  // strategy. After a deliberate pivot the old posts describe a different
  // account; averaging them in credits or blames today's ideas for a decision
  // made on purpose months ago.
  //
  // Scoped AFTER lane classification, which labels every post, and only for
  // the comparison basis. The don't-repeat inputs below — published subjects,
  // the calendar, prior suggestions — stay full-history: a topic covered
  // before the pivot is still spent.
  //
  // Only a CONFIRMED era counts. The detector's proposals change nothing until
  // a person accepts one, because only the team knows whether a shift in the
  // data was a decision.
  const eras = await readEras(platform, owner.handle).catch(() => []);
  const scoped = scopeToEra(ownerPosts, currentEra(eras));
  let comparisonPosts = scoped.posts;

  // LinkedIn: his own figures from LinkedIn's API, so the analysis judges
  // posts by impressions rather than by likes against followers. Never fatal.
  const linkedin = platform === "linkedin" ? await linkedInOwned(comparisonPosts) : undefined;
  if (linkedin) comparisonPosts = linkedin.posts;

  // The team's own calendar: the only record of topics that are planned but
  // not yet posted, which no platform data can show.
  const calendar = await readCalendarEntries(platform).catch(() => []);
  const votes = await readTopicVotes(platform).catch(() => []);
  const learnedTaste = learnedSummary(buildPreferenceModel(votes));
  // Newest first, text trimmed: the examples carry the tone, and a headline's
  // first ~90 characters carry most of that.
  const exampleOf = (verdict: "like" | "dislike") =>
    votes
      .filter((vote) => vote.verdict === verdict)
      .slice(0, 6)
      .map((vote) => vote.text.replace(/\s+/g, " ").slice(0, 90));

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
      ? nicheLanes(platform, owner.handle, comparisonPosts, rivals).catch(() => [])
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
    comparisonPosts,
    400,
    graphInsights ?? undefined,
    {
      ...(scoped.era || scoped.note
        ? {
            era: {
              label: scoped.era?.label ?? null,
              startsAt: scoped.era?.startsAt ?? null,
              posts: comparisonPosts.length,
              totalPosts: ownerPosts.length,
              note: scoped.note,
            },
          }
        : {}),
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
      // Compressed hard. This list is only asked ONE question — "have we done
      // this already?" — and the opening clause plus the brand answers it. The
      // uncompressed form (120-char openings, status and lane on every row)
      // tripled the whole prompt to 27k tokens, which is paid on every
      // generation and buries the blocks the model actually has to reason over.
      // The 60 most recent entries keep their opening line — those are the ones
      // a near-variant is actually likely to collide with. Everything older is
      // reduced to its subject.
      calendarTopics: calendar.slice(0, 60).map((entry) => ({
        opening: entry.content.replace(/\s+/g, " ").slice(0, 70),
        subject: entry.subjects[0] ?? null,
        status: null,
        lane: null,
      })),
      calendarSubjects: [
        ...new Set(calendar.slice(60).flatMap((entry) => entry.subjects.slice(0, 2))),
      ].slice(0, 300),
      ...(votes.length
        ? {
            teamPreferences: {
              liked: exampleOf("like"),
              disliked: exampleOf("dislike"),
              likedWords: learnedTaste.likedWords.map((entry) => entry.key),
              dislikedWords: learnedTaste.dislikedWords.map((entry) => entry.key),
              likedLanes: learnedTaste.likedLanes.map((entry) => entry.key),
              dislikedLanes: learnedTaste.dislikedLanes.map((entry) => entry.key),
            },
          }
        : {}),
      ...(goal ? { goal } : {}),
      ...(linkedin ? { linkedin: linkedin.owned } : {}),
    },
  );

  return { ownerBrief, goal, rivals };
}

/** Below this many measured posts, LinkedIn's figures are left out of the brief. */
const MIN_MEASURED_LINKEDIN = 8;

/**
 * Pritesh Sir's LinkedIn posts carrying LinkedIn's own figures, and his whole
 * account over the last 30 days. Each measured post gets an `insight`:
 * impressions as views, members reached as reach, saves, and private sends in
 * the shares slot (public reposts stay on post.shares).
 *
 * Only the measured posts are compared, once there are enough of them: an
 * unmeasured post has no impressions, and scoring it as zero would make it
 * look like a miss. Free: stored rows, plus at most one call for the 30-day
 * members reached when it is not cached.
 */
async function linkedInOwned(
  posts: PostRecord[],
): Promise<{ posts: PostRecord[]; owned: LinkedInOwned } | undefined> {
  try {
    const { readLinkedInAnalytics, readLinkedInPeriod } = await import("../linkedin-analytics");
    const stored = await readLinkedInAnalytics();
    if (!stored.connected) return undefined;
    const byId = new Map(stored.posts.map((row) => [row.postId, row]));
    const measured: PostRecord[] = [];
    for (const post of posts) {
      const row = byId.get(post.postId);
      if (row?.impressions == null) continue;
      measured.push({
        ...post,
        insight: {
          views: row.impressions,
          reach: row.membersReached ?? 0,
          saved: row.saves ?? 0,
          shares: row.sends ?? 0,
        },
      });
    }
    if (measured.length < MIN_MEASURED_LINKEDIN) return undefined;

    const end = new Date(Date.now() + 86_400_000);
    const day = (date: Date) => date.toISOString().slice(0, 10);
    const figures = await readLinkedInPeriod({
      start: day(new Date(end.getTime() - 30 * 86_400_000)),
      end: day(end),
    }).catch(() => null);
    const change = (now: number, before: number | undefined) =>
      before ? Number((((now - before) / before) * 100).toFixed(1)) : null;
    const engaged = (totals: PeriodTotals) =>
      totals.reactions + totals.comments + totals.reposts + totals.saves + totals.sends;
    const period = figures?.period;
    return {
      posts: measured,
      owned: {
        last30Days: period
          ? {
              impressions: period.impressions,
              impressionsChangePct: change(period.impressions, figures?.prior?.impressions),
              membersReached: figures?.membersReached ?? null,
              socialEngagements: engaged(period),
              socialEngagementsChangePct: change(
                engaged(period),
                figures?.prior ? engaged(figures.prior) : undefined,
              ),
              reactions: period.reactions,
              comments: period.comments,
              reposts: period.reposts,
              saves: period.saves,
              sends: period.sends,
            }
          : null,
      },
    };
  } catch (error) {
    console.error("[ai:linkedin] LinkedIn's own figures unavailable:", error);
    return undefined;
  }
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
  let cost: AiAnalysis["cost"];
  try {
    const result = await generateIdeas(
      platform,
      ownerBrief,
      rivalBriefs,
      {
        analyst,
        competitive: competitors,
        reflection,
        trends,
        questions,
        filmed: await filmedLessonsBlock(platform).catch(() => ""),
        filmedRules: await learnedRules(platform).catch(() => null),
      },
      3,
      sources,
    );
    ideas = result.ideas;
    dropped = result.dropped;
    cost = result.cost;
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
    // The strategist call only. The read agents above cost too, but this is
    // the one a person triggers and the one the panel is asked about.
    ...(cost ? { cost } : {}),
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
            seededFrom: discovery.seededFrom.map((seed) => ({
              lane: seed.lane,
              multiple: seed.multiple,
              metric: seed.metric,
            })),
            queryPlan: discovery.queryPlan,
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

  const shown = plainFiguresDeep(analysis);
  await saveAnalysis(platform, shown).catch((error: unknown) => {
    console.error("[ai] could not cache analysis:", error);
  });

  return shown;
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
 *
 * With `lane`, the idea is confined to that content lane — the per-lane
 * buttons, which are the SOP's "one more ai" / "one more marketing" commands
 * generalised to whatever lanes this account actually has. The lane becomes
 * the only value the schema accepts, so the idea lands there by construction
 * rather than by request.
 *
 * With `fresh`, it writes a new set of three and REPLACES the "Next reel to
 * make" list instead of adding to it — the refresh on that section. Still one
 * model call: the same strategist call Regenerate ends with, minus the three
 * read agents Regenerate runs first. Nothing is lost by replacing: every idea
 * ever suggested stays in suggested_ideas, the Workspace queue and the
 * don't-repeat list, so the fresh set will not hand back the old one.
 */
/**
 * The one story a script is being written from, with its article text where
 * it can be read — from its own outlet, or another outlet covering the same
 * story. See server/sources/article.ts. Never throws.
 */
async function withArticle(platform: PlatformId, sources: SourceItem[]): Promise<SourceItem[]> {
  const [source] = sources;
  if (!source) return sources;
  try {
    const { readStory } = await import("../sources/article");
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const inbox = await readSourceItems(platform, since).catch(() => []);
    const article = await readStory(
      source,
      inbox.map((item) => item.title),
    );
    if (!article) {
      console.info(
        `[ai:${platform}] article not readable, writing from the headline: ${source.title}`,
      );
      return sources;
    }
    console.info(
      `[ai:${platform}] article read from ${article.publisher ?? "unknown"} (${article.words} words)` +
        (article.sameOutlet ? "" : `; ${source.publisher ?? "its own outlet"} could not be read`),
    );
    return [
      {
        ...source,
        article: { publisher: article.publisher, url: article.url, text: article.text },
      },
      ...sources.slice(1),
    ];
  } catch (error) {
    console.warn(`[ai:${platform}] article read failed, writing from the headline:`, error);
    return sources;
  }
}

/**
 * The time one "Write script" request may take, inside Vercel's 300-second
 * limit with half a minute left to save the result.
 */
const WRITE_BUDGET_MS = 270_000;

/** Below this much time left, a discarded script is not written a second time. */
const RETRY_MIN_MS = 150_000;

export async function generateMore(
  platform: PlatformId,
  options: { sourceId?: string; fresh?: boolean; lane?: string; regenerate?: boolean } = {},
): Promise<MoreResult> {
  if (!hasOpenAi()) {
    return { analysis: null, idea: null, reason: "OPENAI_API_KEY is not set." };
  }
  // One deadline for the whole request, inside the 300 seconds Vercel allows
  // (vite.config.ts), with room left to save. Every OpenAI call, rate-limit
  // wait and review round is fitted inside it, so a slow minute ends in a
  // clear message instead of the server being stopped and the script lost.
  const deadline = Date.now() + WRITE_BUDGET_MS;

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
    // "Write script" on one story: read the article behind the headline, so
    // the script can say what actually happened. Free, never stored, and a
    // story that cannot be read is written from its headline as before.
    sources = await withArticle(platform, sources);
  } else {
    await refreshSources(platform).catch(() => null);
    sources = await sourceCandidates(platform).catch(() => []);
  }

  const [cached, rivalBriefs] = await Promise.all([
    readAnalysis(platform).catch(() => null),
    briefsFor(platform),
  ]);

  const accountLanes = (ownerBrief.lanes ?? []).map((lane) => lane.lane);
  // A NEWS story filed under AI tool workflows is not a workflow: it says a
  // tool exists or something happened, and never shows the steps the workflow
  // format requires, so every script written from one was discarded (26 Oct
  // 2026: "PHP flaws found by AI put 70% of websites at risk"). It is written as
  // an AI news reel in the account's other AI lane instead. Only creator reels
  // (kind "video"), which show a tool being used, are held to the workflow
  // format: since phase 1 they are what feeds that lane.
  const newsInWorkflowLane =
    Boolean(options.sourceId) &&
    sources[0]?.kind !== "video" &&
    isAiToolWorkflowLane(sources[0]?.lane);
  const workflowLane =
    options.sourceId && !newsInWorkflowLane
      ? workflowLaneForSource(platform, sources[0]?.lane, accountLanes)
      : undefined;
  const newsLane = newsInWorkflowLane
    ? accountLanes.find((lane) => /\bai\b/i.test(lane) && !isAiToolWorkflowLane(lane))
    : undefined;
  const requestedLane = workflowLane ?? newsLane ?? options.lane;
  // Regeneration rewrites ONE story's script, so it needs that story. Any
  // lane may be regenerated; it used to be AI tool workflows only.
  if (options.regenerate && (!options.sourceId || options.fresh)) {
    return {
      analysis: cached,
      idea: null,
      reason: "Choose a topic to regenerate its script.",
    };
  }
  if (
    workflowLane &&
    ownerBrief.pastSuggestions?.blocked.some(
      (entry) =>
        entry.kind === "lane" &&
        entry.value.trim().toLowerCase() === workflowLane.trim().toLowerCase(),
    )
  ) {
    return {
      analysis: cached,
      idea: null,
      reason: "This workflow lane is currently blocked by measured feedback.",
    };
  }

  const reads = {
    analyst: cached?.analyst ?? null,
    competitive: cached?.competitors ?? null,
    reflection: cached?.reflection ?? null,
    filmed: await filmedLessonsBlock(platform).catch(() => ""),
    filmedRules: await learnedRules(platform).catch(() => null),
  };
  const write = (discarded?: string[]) =>
    generateIdeas(
      platform,
      ownerBrief,
      rivalBriefs,
      reads,
      options.fresh ? 3 : 1,
      sources,
      requestedLane,
      options.regenerate,
      { deadline, ...(discarded ? { discarded } : {}) },
    );

  let result: Awaited<ReturnType<typeof generateIdeas>>;
  try {
    result = await write();
    // "Write script" on one story: a draft the checks discarded (most often an
    // AI tool workflow reel without two demonstrated steps) used to end the
    // request, and the team clicked again until one passed. It is now written
    // once more with the reasons, while there is time for a full second try.
    if (
      options.sourceId &&
      !options.fresh &&
      !result.ideas.length &&
      deadline - Date.now() > RETRY_MIN_MS
    ) {
      const reasons = result.dropped.length ? result.dropped : ["no idea came back"];
      console.warn(`[ai:${platform}] script discarded, writing it once more:`, reasons);
      const second = await write(reasons);
      result = {
        ...second,
        dropped: second.ideas.length ? [] : [...result.dropped, ...second.dropped],
        cost: addCosts(result.cost, second.cost),
      };
    }
  } catch (error) {
    if (!(error instanceof OpenAiError)) throw error;
    console.error(`[ai:${platform}] script not written:`, error.message);
    return {
      analysis: cached && plainFiguresDeep(cached),
      idea: null,
      reason: /rate limit|429|timed out|no time left/i.test(error.message)
        ? "OpenAI was too slow or busy to finish this script in time. Nothing was saved; try again in a minute."
        : `OpenAI could not write this script: ${error.message}`,
    };
  }

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
    // Keep older versions in durable history, but show only the new version
    // of this source in the current idea list after a successful rewrite.
    ideas: options.fresh
      ? ideas
      : [
          ...ideas,
          ...(cached?.ideas ?? []).filter(
            (existing) =>
              !(options.regenerate && idea && existing.source?.sourceId === options.sourceId),
          ),
        ],
    ...(result.cost ? { cost: result.cost } : {}),
    // A refresh is a new set, so it carries its own timestamp; adding one idea
    // to an existing set does not make the set new.
    ...(options.fresh ? { generatedAt: new Date().toISOString(), model: result.model } : {}),
  };
  const shown = plainFiguresDeep(analysis);
  if (idea) {
    await saveAnalysis(platform, shown).catch((error: unknown) =>
      console.error(`[ai:${platform}] could not cache the new idea:`, error),
    );
  }

  return {
    analysis: idea ? shown : cached && plainFiguresDeep(cached),
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
