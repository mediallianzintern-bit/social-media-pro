// The AI analyst.
//
// Division of labour, deliberately strict:
//   • TypeScript computes every statistic and hands them over as facts.
//   • The model interprets those facts and writes copy.
//   • The model is told, explicitly, never to compute or invent a figure.
//
// This is what makes the output usable. A model asked to "analyse this account"
// will happily produce plausible engagement rates that are simply wrong, and a
// wrong number in a client dashboard is worse than no number.
import { completeJson } from "./client";
import { saveSuggestedIdeas } from "../store";
import {
  COMPETITOR_SCHEMA,
  competitorAnalysisSchema,
  ideaSetSchema,
  ideasSchemaFor,
} from "./schemas";
import {
  cadence,
  engagementRate,
  engagementsOf,
  lanePerformance,
  measuredPosts,
  median,
  medianViews,
  organicPosts,
  reachEngagementRate,
  type InstagramInsights,
  type LanePerformance,
  type NicheLane,
  type PlatformId,
  type PostRecord,
  type SuggestionFeedback,
} from "@/lib/analytics-types";
import { computeInsights } from "@/lib/insights";
import { goalReadFor, laneExpectations, type LaneExpectation } from "@/lib/prediction";
import { trajectoryStatement, type GrowthGoal, type GrowthTrajectory } from "@/lib/growth";
import type { GoalScorecard } from "@/lib/goal-scorecard";
import { classifyHook } from "@/lib/script-features";
import { blockReason } from "@/lib/loop";
import type { SourceItem } from "@/lib/sources";
import type { BlockedPattern } from "@/lib/analytics-types";
import type {
  AnalystRead,
  CompetitorAnalysis,
  ContentIdea,
  FeedRead,
  ReflectionRead,
} from "@/lib/ai-types";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** One post as the model sees it, with its performance already contextualised. */
export interface BriefPost {
  format: string;
  publishedAt: string;
  /** Day of week — cadence advice is worthless without it. */
  weekday: string;
  views: number;
  likes: number;
  comments: number;
  caption: string;
  /**
   * This post's primary metric as a multiple of the account's own median.
   * 1 is typical, 3.2 is a breakout, 0.4 is a miss. Given because raw counts
   * are meaningless across accounts of different sizes — a 4,000-view post is a
   * flop at 200k followers and a triumph at 11k, and the model cannot know
   * which without being told.
   */
  vsMedian: number;
  /** Owner-only, from the Graph API. Absent on competitors, always. */
  reach?: number;
  saves?: number;
  shares?: number;
  avgWatchSeconds?: number;
  /** Saves ÷ reach, as a percentage. The strongest ranking signal Instagram has. */
  saveRatePct?: number;
  /** Shares ÷ reach, as a percentage. What drives distribution beyond followers. */
  shareRatePct?: number;
}

/** Everything the model is allowed to know about one account. */
export interface AccountBrief {
  handle: string;
  displayName: string;
  headline: string;
  followers: number;
  postsAnalysed: number;
  medianViews: number;
  medianInteractions: number;
  engagementRatePct: number;
  postsPerWeek: number;
  byFormat: Array<{
    format: string;
    count: number;
    medianViews: number;
    medianInteractions: number;
  }>;
  topPosts: BriefPost[];
  /**
   * The weakest posts, given deliberately alongside the best.
   *
   * A list of winners alone tells the model what the account publishes, not what
   * makes a post work — every trait of a hit also appears in the flops, and
   * without the flops there is no way to tell which traits actually separate
   * them. Naming the contrast set explicitly is what turns "your top posts are
   * about AI" into "AI posts win only when the hook is a claim, not a topic".
   */
  weakestPosts: BriefPost[];
  /** How this account's output splits across its own content lanes. */
  lanes?: LanePerformance[];
  /**
   * Layer 4's cold-start output, computed in TypeScript before this brief was
   * built. The strategist is handed these and forbidden from deriving its own —
   * that separation is the whole reason the field is here rather than left for
   * the model to work out from `lanes`.
   */
  expectations?: LaneExpectation[];
  /** The account median the expectations are multiples of. */
  baselineMedian?: number;
  /**
   * Addendum A — the objective this account is managed toward, and where the
   * primary metric currently stands. The strategist ranks options by their
   * contribution to THIS, rather than to generic performance.
   */
  goal?: {
    growthGoal: GrowthGoal;
    primaryMetric: string;
    secondaryMetrics: string[];
    trajectory: GrowthTrajectory | null;
    /** A.5 — the primary metric in weeks we influenced, against the rest. */
    scorecard?: GoalScorecard | null;
  };
  /**
   * Every idea already proposed for this account, filmed or not.
   *
   * Separate from `pastSuggestions`, which carries only advice that was acted
   * on and measured. This is memory, not feedback: without it the strategist
   * starts from scratch each run and re-proposes subjects the creator has
   * already been handed.
   */
  priorSuggestions?: Array<{ hook: string; lane: string | null; trait: string }>;
  /**
   * Every subject this creator has ALREADY PUBLISHED, across BOTH platforms and
   * the whole stored history — not the 8 in topPosts.
   *
   * topPosts and weakestPosts are material to learn STRUCTURE from; this exists
   * to stop the model reusing the SUBJECT. Cross-platform because it is one
   * creator: "AI search" was proposed for Instagram after being published twice
   * on LinkedIn, because an Instagram brief could not see LinkedIn.
   */
  publishedSubjects?: Array<{
    opening: string;
    publishedAt: string;
    lane: string | null;
    /** Which platform it went out on — this brief's own, or the creator's other. */
    platform: string;
  }>;
  /**
   * §5.1 — how this system's own past suggestions performed once published.
   * Owner only, and built from measured signals.
   */
  pastSuggestions?: SuggestionFeedback;
  /**
   * §5.2 — lane-vs-lane across every tracked account, in vsMedian terms.
   * PUBLIC signal only. Kept separate from `owned` and `pastSuggestions` so a
   * competitor's scraped figure can never end up inside a measured one.
   */
  nicheLanes?: NicheLane[];
  /**
   * Owner-only aggregate metrics. Present only for the account we hold a Meta
   * token for — which is why it is a separate block rather than more fields on
   * the brief: its absence on a competitor is a fact about access, not about
   * that account, and the prompt has to be able to say so.
   */
  owned?: {
    postsMeasured: number;
    medianReach: number;
    medianSaves: number;
    medianShares: number;
    reachEngagementRatePct: number;
    medianWatchSeconds?: number;
    audienceTopAges?: string[];
    audienceTopCountries?: string[];
    audienceGenderSplit?: string[];
  };
}

/** The owner-only block, or undefined when no Graph data reached these posts. */
function ownedMetrics(
  allPosts: PostRecord[],
  insights?: InstagramInsights | undefined,
): AccountBrief["owned"] {
  const measured = measuredPosts(organicPosts(allPosts));
  if (!measured.length) return undefined;

  const watch = measured
    .map((post) => post.insight?.avgWatchMs)
    .filter((value): value is number => value !== undefined && value > 0);
  const rate = reachEngagementRate(allPosts);

  const owned: NonNullable<AccountBrief["owned"]> = {
    postsMeasured: measured.length,
    medianReach: Math.round(median(measured.map((post) => post.insight?.reach ?? 0))),
    medianSaves: Math.round(median(measured.map((post) => post.insight?.saved ?? 0))),
    medianShares: Math.round(median(measured.map((post) => post.insight?.shares ?? 0))),
    reachEngagementRatePct: Number(((rate ?? 0) * 100).toFixed(2)),
  };
  if (watch.length) owned.medianWatchSeconds = Number((median(watch) / 1000).toFixed(1));

  const label = (slices: { label: string; value: number }[], count: number) =>
    slices.slice(0, count).map((slice) => `${slice.label} (${slice.value})`);
  if (insights) {
    owned.audienceTopAges = label(insights.audience.ageGender, 5);
    owned.audienceTopCountries = label(insights.audience.country, 5);
    owned.audienceGenderSplit = label(insights.audience.gender, 3);
  }
  return owned;
}

export function buildBrief(
  handle: string,
  displayName: string,
  headline: string,
  followers: number,
  allPosts: PostRecord[],
  captionChars = 400,
  graphInsights?: InstagramInsights | undefined,
  learning?:
    | {
        pastSuggestions?: SuggestionFeedback | null;
        nicheLanes?: NicheLane[];
        priorSuggestions?: Array<{ hook: string; lane: string | null; trait: string }>;
        publishedSubjects?: Array<{
          opening: string;
          publishedAt: string;
          lane: string | null;
          /** Which platform it went out on — this brief's own, or the creator's other. */
          platform: string;
        }>;
        goal?: AccountBrief["goal"];
      }
    | undefined,
): AccountBrief {
  const posts = organicPosts(allPosts);
  const insights = computeInsights(allPosts);
  const useViews = insights.useViews;
  const primary = (post: PostRecord) => (useViews ? post.views : engagementsOf(post));

  const byFormat = new Map<string, PostRecord[]>();
  for (const post of posts) {
    byFormat.set(post.format, [...(byFormat.get(post.format) ?? []), post]);
  }

  const owned = ownedMetrics(allPosts, graphInsights);
  const lanes = lanePerformance(allPosts);
  const expectations = laneExpectations(allPosts, lanes);

  // The account's own median is the yardstick every post is scored against, so
  // "3.2× typical" travels across accounts of wildly different sizes in a way a
  // raw view count never can.
  const medianPrimary = median(posts.map(primary)) || 1;

  const toBriefPost = (post: PostRecord): BriefPost => {
    const brief: BriefPost = {
      format: post.format,
      publishedAt: post.publishedAt.slice(0, 10),
      weekday: WEEKDAYS[new Date(post.publishedAt).getUTCDay()] ?? "?",
      views: post.views,
      likes: post.likes,
      comments: post.comments,
      caption: post.caption.slice(0, captionChars),
      vsMedian: Number((primary(post) / medianPrimary).toFixed(2)),
    };
    if (post.insight) {
      const { reach, saved, shares, avgWatchMs } = post.insight;
      brief.reach = reach;
      brief.saves = saved;
      brief.shares = shares;
      if (avgWatchMs) brief.avgWatchSeconds = Number((avgWatchMs / 1000).toFixed(1));
      // Rates rather than counts: 17 saves means nothing without knowing how
      // many people saw the post, and the model must never divide for itself.
      if (reach > 0) {
        brief.saveRatePct = Number(((saved / reach) * 100).toFixed(2));
        brief.shareRatePct = Number(((shares / reach) * 100).toFixed(2));
      }
    }
    return brief;
  };

  const ranked = [...posts].sort((a, b) => primary(b) - primary(a));
  // Only offer a contrast set when there are enough posts for "best" and
  // "worst" to be different populations rather than overlapping slices.
  const weakest = ranked.length >= 8 ? ranked.slice(-3).reverse() : [];

  return {
    handle,
    displayName,
    headline,
    followers,
    postsAnalysed: posts.length,
    medianViews: Math.round(medianViews(posts)),
    medianInteractions: Math.round(median(posts.map((post) => engagementsOf(post)))),
    engagementRatePct: Number((engagementRate(allPosts, followers) * 100).toFixed(2)),
    postsPerWeek: Number(cadence(allPosts).toFixed(1)),
    byFormat: [...byFormat.entries()].map(([format, group]) => ({
      format,
      count: group.length,
      medianViews: Math.round(medianViews(group)),
      medianInteractions: Math.round(median(group.map((post) => engagementsOf(post)))),
    })),
    topPosts: ranked.slice(0, 8).map(toBriefPost),
    weakestPosts: weakest.map(toBriefPost),
    ...(lanes.length ? { lanes } : {}),
    ...(expectations.length
      ? {
          expectations,
          // The same figure the lane multiples were taken against — views where
          // the platform reports them, interactions where it does not. Stored
          // so a calibrated range can be converted back to absolute terms.
          baselineMedian: Math.round(
            useViews ? medianViews(posts) : median(posts.map((post) => engagementsOf(post))),
          ),
        }
      : {}),
    ...(learning?.pastSuggestions ? { pastSuggestions: learning.pastSuggestions } : {}),
    ...(learning?.nicheLanes?.length ? { nicheLanes: learning.nicheLanes } : {}),
    ...(learning?.priorSuggestions?.length ? { priorSuggestions: learning.priorSuggestions } : {}),
    ...(learning?.publishedSubjects?.length
      ? { publishedSubjects: learning.publishedSubjects }
      : {}),
    ...(learning?.goal ? { goal: learning.goal } : {}),
    ...(owned ? { owned } : {}),
  };
}

/**
 * The rules change shape depending on whether we hold a Meta token for the owner.
 *
 * Rule 3 is the one that matters. Before the Graph API was wired up, reach and
 * saves existed for nobody and mentioning them was always a hallucination. Now
 * they exist for the owner and still exist for nobody else — so the ban has to
 * become asymmetric rather than disappear, or the model will start comparing the
 * owner's measured reach against a competitor number it invented.
 */
function groundRules(hasOwnedMetrics: boolean): string {
  const third = hasOwnedMetrics
    ? `3. Reach, saves, shares, watch time and audience demographics exist ONLY in
   the owner's "owned" block and the "reach"/"saves"/"shares"/"avgWatchSeconds"
   fields of the owner's topPosts. They are measured by Instagram itself.
   Competitors have NONE of these and never will — they are scraped from public
   pages. Never state, estimate or imply such a figure for a competitor, and
   never compare the owner's reach against a competitor's anything. Compare
   owner-to-owner over time, or compare public metrics side by side.
   Never mention impressions: the metric no longer exists.`
    : `3. Never refer to impressions, reach, saves, shares, audience demographics,
   watch time or retention. Those metrics are NOT in the data and are not
   available for these accounts. Referring to them makes the analysis unusable.`;

  return `
HARD RULES — these override anything else:
1. Every number you mention must appear verbatim in the DATA block. Never
   calculate, estimate, extrapolate or round into a new figure.
2. If the data does not support a claim, say so plainly. "Too few posts to tell"
   is a valid and useful answer.
${third}
4. Sample sizes are small. Treat anything under 6 posts as directional and say
   so rather than asserting it.
5. Write plainly. No marketing filler, no "in today's digital landscape", no
   exclamation marks.
6. "vsMedian" is each post's performance as a multiple of that same account's
   own median — 1.0 is typical for them, 3.0 is a breakout, 0.4 is a miss. Use
   it, not raw view counts, when judging whether something worked: raw counts
   are not comparable between accounts of different sizes.
   WRITE IT AS A MULTIPLE, ALWAYS: "3.9x the account's median" or "nearly 4x
   its typical post". NEVER write the bare number, and never write the field
   name — "3.89 vsMedian" reads to a human like a view count of 3.89K, which is
   a completely different and much larger claim. When you quote a multiple,
   quote the post's actual views or reach in the same sentence so there is
   nothing to misread.
7. "weakestPosts" are that account's worst performers. They are given so you can
   work out what SEPARATES a hit from a miss on this specific account. A trait
   that appears in both the top and the weakest posts explains nothing — say so
   rather than presenting it as a lesson.
8. NEVER write a field name. The data uses names like medianViews, postsAnalysed,
   shareOfOutputPct, shareOfPerformancePct, medianSaves, avgWatchSeconds,
   saveRatePct, ratePerWeek and ratePerMonth. Those are column headings for a
   developer, not words. Say what the number MEANS, with its unit, the way you
   would to a creator who has never seen the database:
     "medianViews 184"            -> "a typical post gets 184 views"
     "shareOfOutputPct 23"        -> "23% of the posts"
     "avgWatchSeconds 18.1"       -> "people watch about 18 seconds"
     "ratePerWeek -31"            -> "losing about 31 followers a week"
   whyNow is read by the person deciding whether to film the idea. A sentence
   they have to decode is a sentence that will not be acted on.
`.trim();
}

function dataBlock(owner: AccountBrief, rivals: AccountBrief[]): string {
  return [
    owner.owned
      ? "DATA — the only figures that exist. Competitor figures are scraped from public pages. The owner's `owned` block and the reach/saves/shares/avgWatchSeconds fields on the owner's topPosts come from Instagram's own analytics and have no competitor equivalent."
      : "DATA — the only figures that exist. All engagement is public data.",
    "",
    "OWNER ACCOUNT:",
    JSON.stringify(owner, null, 2),
    "",
    rivals.length
      ? `COMPETITOR ACCOUNTS (${rivals.length}):\n${JSON.stringify(rivals, null, 2)}`
      : "COMPETITOR ACCOUNTS: none tracked.",
  ].join("\n");
}

/**
 * Where an idea's SUBJECT is allowed to come from.
 *
 * With sources, the subject must be a story this system fetched — and the model
 * is told plainly that it has seen the headline and nothing else. That is the
 * honest boundary: the headline is a fact we hold; the article's contents are
 * not. Details only the article holds are written as bracketed instructions
 * for the team, who open the link before filming, instead of being invented
 * and spoken on camera.
 */
function sourceRules(hasSources: boolean): string {
  if (!hasSources) {
    return `- No live source was available for this generation, so set source.sourceId to "none".
  Every idea must still have a concrete, real, documented subject you are confident exists:
  subject names it, origin says where it happened — write "widely covered, original outlet
  uncertain" rather than guess a publication — and searchQuery finds it. NEVER invent a URL, a
  headline, a publication name, an author or a date. IF YOU CANNOT NAME A REAL, DOCUMENTED
  SUBJECT FOR AN IDEA, DO NOT PROPOSE THAT IDEA. These ideas are shown as unverified.`;
  }
  return `- EVERY IDEA IS BUILT ON A REAL STORY FROM THE SOURCES BLOCK. Each source is an article this
  system fetched from a live news search within the last fortnight: an id, the headline exactly
  as published, the publisher, the date, the lane the search was run for, and how many outlets
  carried the story. Build each idea on one of them and copy its id into source.sourceId. No two
  ideas may use the same source.
- Choose stories that fit a lane this account wins in and that its audience would act on. The
  search is broad and some results are noise; skip anything off-niche even though it is listed.
  Prefer stories with coverage above 1 — several outlets running it is measured evidence the
  story is live, not merely that our search matched it.
- YOU HAVE READ THE HEADLINE, NOT THE ARTICLE. The headline is the only fact you hold about the
  story. The script may say what the headline says and nothing more about the story itself.
  Where the script needs a detail only the article holds — a figure, a date, a quote, exactly
  what the brand did — write it as a bracketed instruction, e.g. "[from the article: what the
  campaign cost]". The team opens the article before filming and fills these in. A bracket is
  honest; a detail invented and then spoken on camera is a public correction waiting to happen.
- source.subject names what the headline is about; source.origin is the publisher as given.
  Never write a URL anywhere — the link is attached from the stored source, not from you.`;
}

/** What the finished deliverable must contain — a shot list, or a publishable post. */
function deliverableRules(written: boolean): string {
  if (written) {
    return `THE POST IS THE DELIVERABLE. It is published as written, so write it finished — not an outline,
not notes for someone else to expand:
- hook: the first line, which is all LinkedIn shows above "see more". It has to earn the click
  on its own: a specific claim, a figure from the data, or a named story — never a warm-up.
- text_post: post.body is the complete post, 120-250 words, with the hook as its first line.
  Paragraphs of one to three lines with a blank line between them — that is how LinkedIn is
  read. post.sections is empty.
- article: post.body is the introduction; post.sections are 4-7 sections, each a heading and its
  full paragraphs. An article is analysis, not a stretched post: every section adds something
  the one before it did not.
- document: post.body is the short post that sits above the PDF; post.sections are 6-10 pages,
  each a heading and two to four lines. One idea per page — a page someone has to read twice
  is a page they swipe past.
- End on ONE clear ask that serves the goal: a question worth answering in the comments, or a
  reason to save or share. One, not three.
- hashtags: three to five, specific to the story. A wall of tags reads as spam on LinkedIn.
- Write as the creator, in the first person, in the rhythm of their own captions. LinkedIn
  readers can tell a ghostwriter.`;
  }
  return `THE SHOT LIST IS A HANDOVER DOCUMENT. An editor will cut from it without speaking to anyone, so
every shot must answer four questions and leave nothing implied:
- visual: what is physically on screen. "Screen recording of the prompt being typed, cursor
  visible" — not "show the tool".
- voiceover: the exact words spoken, written out. Empty string only for genuinely silent shots.
- onScreenText: the exact words burned on screen, in the case they should appear. Empty if none.
- transition: how the shot leaves. "Hard cut", "Whip pan", "Hold on face", "Cross dissolve".
- mark: a real time range like "0:00–0:04" whose ranges are contiguous and add up to
  production.durationSeconds. For a carousel use "Slide 1", "Slide 2".

Give 6-10 shots. Front-load: the first shot must work with the sound off, because most viewers
decide in the first second.

production must be fillable by the editor without a follow-up question:
- durationSeconds: realistic for the shot list, typically 25-60 for a reel.
- coverText: 3-6 words for the cover frame.
- musicDirection: genre, energy and where it should drop, not a track name.
- subtitleStyle: how captions should look and behave.
- assetsNeeded: b-roll, screen recordings or graphics to source BEFORE the edit starts.
- editorNotes: pacing, cuts, anything that would otherwise be discovered halfway through.`;
}

/** The inputs a strategist call is built from. */
export interface IdeaReads {
  analyst?: AnalystRead | null;
  competitive?: CompetitorAnalysis | null;
  reflection?: ReflectionRead | null;
  trends?: FeedRead | null;
  questions?: FeedRead | null;
}

export interface IdeaRequest {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  /** Patterns the loop has blocked — enforced again on the output. */
  blocked: BlockedPattern[];
  written: boolean;
}

/**
 * Everything the strategist is sent — prompt and schema — with no model call.
 *
 * Split from the call itself so the request can be read and checked before
 * anything is spent: the prompt a generation WILL send is inspectable for free.
 */
export function buildIdeaRequest(
  platform: PlatformId,
  owner: AccountBrief,
  rivals: AccountBrief[],
  reads: IdeaReads = {},
  count = 3,
  sources: SourceItem[] = [],
): IdeaRequest {
  const {
    analyst = null,
    competitive = null,
    reflection = null,
    trends = null,
    questions = null,
  } = reads;
  const formats = owner.byFormat
    .map((entry) => `${entry.format} (${entry.count} posts, median ${entry.medianViews} views)`)
    .join(", ");

  // The owner's own best performers, stated separately so the model anchors on
  // them rather than treating all posts as equally instructive.
  const topPerformers = owner.topPosts.slice(0, 4);

  const written = platform === "linkedin";
  const blocked = owner.pastSuggestions?.blocked ?? [];
  const blockedLanes = new Set(
    blocked.filter((entry) => entry.kind === "lane").map((entry) => entry.value),
  );
  // The lanes an idea may target: the account's own, minus any the loop has
  // blocked. This list becomes an enum in the schema, so a blocked lane is not
  // discouraged — it is unavailable.
  const allowedLanes = (owner.lanes ?? [])
    .map((lane) => lane.lane)
    .filter((lane) => !blockedLanes.has(lane.trim().toLowerCase()));

  const system = `You are a content strategist writing production-ready ${
    written ? "LinkedIn posts" : `${platform} scripts`
  } for a
creator, based on their own measured performance.

${groundRules(Boolean(owner.owned))}

Additional requirements:
- EVERY IDEA MUST HAVE A CONCRETE SUBJECT. Name the specific brand, campaign, product, tool,
  person or event the reel covers, in the title and again in the angle. A reader who sees only
  the title should know what the reel is about. "Make the box the ad" and "The new AI scam"
  are not subjects — they are themes with the subject left out, and a creator handed one still
  has to decide what to actually make. "Patagonia's anti-shopping campaign" is a subject.
  The account's own top posts are all specific — Dove, Audi, Netflix, KitKat, Old Spice — which
  is the pattern to keep.
${sourceRules(sources.length > 0)}
- Match the account's existing voice. Study the captions in the DATA block: sentence length,
  paragraph rhythm, how they open and close. Write as that person, not as a marketer describing
  them.
${
  written
    ? `- Choose the format — text_post, article or document — for the story. A text post is the
  default: most LinkedIn reach goes to plain posts. Use an article only for a story with enough
  substance for 600+ words of real analysis, and a document only when the idea is naturally a
  sequence of steps or frames someone would swipe through and save.`
    : `- Choose the format (reel or carousel) based on which performs better in the data. Only mention
  the format choice in whyNow if the account actually publishes both and one measurably wins.
  Where every post is one format, saying so is filler — spend the words on something else.`
}
- Before writing anything, work out what separates the owner's topPosts from their weakestPosts.
  Each script must deliberately reproduce a winning trait and avoid the losing one. A script
  that could have been written without looking at the contrast is a failed script.
- The top performers almost always share MORE THAN ONE separator — how they open, how they
  structure the middle, what they ask of the viewer. Find several, and give each idea a
  DIFFERENT one. Returning the same winningTrait on every idea means you stopped analysing
  after the first thing you noticed, and it makes the set impossible to learn from: when every
  suggestion carries one label, no later comparison can tell which trait actually worked.
- "whyNow" is at most three sentences and must OPEN with that separator stated plainly, then
  cite the literal figures that establish it. Write it to a strategist who will act on it, not
  to an auditor checking your sources: no restating of field names, no "this traces to".
- You are given the client's GROWTH GOAL, their PRIMARY METRIC, and where that metric currently
  stands. Optimize every recommendation for the primary metric. An idea that would win on a
  non-goal metric — likes, say — but would not move the primary metric is the weaker choice; if
  you propose one anyway, say plainly in whyNow that it does not serve the goal.
- whyNow must connect the idea to the goal AND to the current trajectory, citing the real
  figures you were given. Not "this will grow the account" — rather the shape of
  "follower growth has slowed to +0.5/week; this targets the lane with the strongest save rate,
  which is what drives new follows on this account".
- The ordering rule above is unchanged — still start from the client's own proven winners. The
  goal RANKS and FILTERS those options; it does not replace them with generic growth advice.
- You are given an ALREADY PUBLISHED block: the opening line of EVERY post on record for this
  creator, ACROSS BOTH PLATFORMS, each tagged with the platform it went out on. Reproducing the
  account's proven STRUCTURE is the job; reusing its subjects is not.
- A subject already published ON THIS PLATFORM is spent. Do not build an idea on it. If a brand,
  tool, campaign or news story appears there, find a different subject the same structure fits.
- A subject published on the creator's OTHER platform is not automatically spent — the same
  analysis retold for a different audience can be a deliberate, good move. But it is never NEW.
  Propose one only if the other platform's treatment genuinely would not serve this audience,
  and whyNow must say plainly that it is a port from the other platform and why it is worth
  repeating. Silently re-proposing it as a fresh idea is the failure to avoid.
- Check this block before you commit to a subject, not after. The list is what the record holds,
  not everything the creator has ever made — older posts may be missing — so treat a near-miss
  as a repeat rather than a licence.
- You are given an ALREADY SUGGESTED block: every idea this system has handed this account
  before, filmed or not. None of your ideas may repeat one, and none may be a near-variant of
  one — the same subject with a different hook is a repeat. The creator has already seen these;
  proposing them again wastes the slot and makes the system look like it is not paying
  attention. If an earlier idea's LANE is still the right one, take a different subject inside
  it.
- "winningTrait" restates that idea's separator as a short standalone label, five to eight words —
  the trait this idea reproduces, not this idea's topic. Every idea ever suggested for this
  account is kept and will eventually be checked against how it actually performed once
  published, grouped by this label. A vague or topic-shaped trait ("AI content") makes that
  check meaningless; a real trait ("names the stakes in the first line") makes it possible to
  learn, months from now, which traits this account's audience actually rewards.${
    owner.owned
      ? `
- Rank what worked by saveRatePct and shareRatePct FIRST, likes last. A save means the viewer
  wanted it later; a share means they staked their own name on it. Both drive reach far harder
  than a like, which costs nothing. If a post has a high saveRatePct but ordinary views, it is a
  better model to copy than a high-view post nobody saved.
- medianWatchSeconds is the retention bar this script has to clear. Pace the shot list so the
  reason to keep watching renews before that mark, and make the duration realistic against it —
  do not write a 60-second script for an account whose median watch time is 13 seconds.
- Write for the audience in audienceTopAges, audienceGenderSplit and audienceTopCountries.
  Examples, references, idiom and pacing should land for those specific people.`
      : ""
  }${
    owner.lanes?.length
      ? `
- "lanes" is how this account's own output splits by subject. Judge a lane by
  medianVsMedian, never by postCount — a lane can be most of what they publish and still be
  their weakest work. Where shareOfOutputPct badly exceeds shareOfPerformancePct, that lane is
  absorbing effort it does not repay; where a small lane over-indexes, that is an opening.
  Set "contentLane" to the exact name of the lane each idea targets.
- SPREAD THE IDEAS ACROSS DIFFERENT LANES. Rank the lanes by the GOAL METRIC — the figure named
  in the EXPECTATIONS block as "goalMultiple" — highest first. Where no goal is set, rank by
  medianVsMedian instead. Either way it is ONE figure that decides the order, not
  shareOfPerformancePct and not which lane the single biggest post happened to land in.
- The goal metric outranks reach, and this is the rule that catches people out. A lane can run
  4.6x on reach and 0.2x on the goal metric: that lane is NOT the strongest lane for this
  client, it is a lane that gets seen and does not do the thing they are paying for. Picking it
  and citing its reach multiple as though that settled it is the specific mistake to avoid.
  Quote the goal multiple in whyNow, not the flattering one. Every lane at or above 1.0x is a candidate; aim your
  strongest idea at the highest-ranked one and work down. Where two or more lanes clear that
  bar, no two ideas may share a lane UNTIL every qualifying lane has one. When there are more
  ideas than qualifying lanes, put the extra idea back into the HIGHEST-ranked lane with a
  visibly different subject — do not reach down into a lane below 1.0x just to fill a slot. A
  second idea in a lane that runs 1.9x is better advice than a first idea in one that runs
  0.6x. Write into a below-median lane only when you have a specific reason, and then give that
  reason and the lane's multiple in whyNow. Only when a single lane is the sole one above the
  account's median may all the ideas share it — and then each must take a visibly different
  subject, and whyNow must say that the other lanes are below median. A creator who asked for three ideas and received three angles on one
  subject has received one idea.
- Lanes marked directional have too few posts to be a result. You may still write into one,
  but say in whyNow that it is a bet rather than a proven lane.`
      : ""
  }${
    owner.pastSuggestions
      ? `
- You are given PAST SUGGESTIONS: ideas this system proposed before, which the creator
  actually filmed, scored against how they performed. This is the only true feedback in the
  brief — everything else is observation; this is a result. Weight new ideas toward the lanes
  and traits whose suggestions beat the account's median, and away from ones that missed. If
  a trait has been tried and failed on THIS account, stop proposing it, however sound it
  looks in theory.
- Every past suggestion was graded on "gradedOn" — the client's goal metric wherever the post
  was measured for it — and "score" is that figure as a multiple of the account's median; "hit"
  means it beat the median on it. byLane.hitRate, byTrait.medianScore and byScript are the
  scoreboard. A pattern with one measured attempt is an anecdote — say so rather than treating
  it as settled.
- byScript says which SCRIPT SHAPES win on this account: the kind of hook, the length, the call
  to action, the format. scriptExamples gives the skeletons of the best and worst filmed
  scripts. Reproduce the winning shape — the same kind of opening, the same length band, the
  same ask at the end — on a new subject, and steer away from the losing shape. Where
  byScript is empty there is not enough filmed yet; say nothing about script shape rather
  than inventing a pattern.
- "blocked" lists lanes, traits and hook types that failed repeatedly on this account. Do not
  use any of them. Blocked lanes are already absent from the lanes you may choose; a blocked
  trait or hook type is equally off-limits, and any idea that uses one is discarded unread.`
      : ""
  }${
    owner.expectations?.length
      ? `
- You are given an EXPECTATIONS block: what each lane is measured to do, as multiples of this
  account's own median. These were computed in TypeScript from published posts. Use them to
  choose the lane, and quote them in whyNow if useful.
- You must NOT produce an expectation, a forecast, a confidence score, a percentage or a
  likelihood of your own — not for an idea, not for a lane, not anywhere. A number of that kind
  is only meaningful when it has been checked against what actually happened, which is done
  elsewhere in this system and is not your job. Write the script; the expectation is already
  attached to it.`
      : `
- Do NOT produce an expectation, a forecast, a confidence score, a percentage or a likelihood
  for any idea. There is no measured basis for one here, and inventing it would put a number on
  screen that looks like a result and is not.`
  }${
    owner.nicheLanes?.length
      ? `
- You are given a NICHE block: lane-vs-lane across every tracked account, in vsMedian terms.
  accountsAboveMedian over accountsPublishing is how BROADLY a lane wins — a lane clearing
  its own median on 4 of 5 accounts is a structural finding; one account is noise. Use it to
  find contested and open lanes and to ADAPT proven structure to this account's voice, never
  to copy another account. A niche result is a lead, not a template.
- The NICHE block is PUBLIC signal only. It says what is structurally working, not what any
  audience privately valued — only the owner's own measured figures (saves, shares, watch
  time) speak to that. Competitor lane labels are inferred from captions and are less
  reliable than the owner's own, so treat every cross-account lane claim as directional, and
  never state a competitor's reach, saves or watch time.`
      : ""
  }

${deliverableRules(written)}

How to choose what to write about — in this order. The order is the point: it is what keeps this
account sounding like itself instead of converging on whatever is generically popular.
1. Start from the account's OWN top performers. They are listed separately below. Work out what
   they have in common — the opening move, the structure, the subject — and build on that. A
   proven structure applied to a new subject beats an unproven idea.${
     sources.length
       ? " The new subject comes from the SOURCES block: the account's proven STRUCTURE, applied to a real story someone published this fortnight."
       : ""
   } Where a goal is set, "top" means
   top ON THE GOAL METRIC — a post that reached far but earned nothing on that metric is not a
   model to copy for this client.
2. Then use the competitive read. Where it names an opening the competitors are not covering,
   aim an idea at it. Where a competitor is measurably beating this account at something, say
   what they do differently and adapt it rather than copying it.${
     trends?.picks.length
       ? `
3. Then the TRENDS block: rising search terms, pulled from a live feed. A trend is a reason to
   publish something NOW, never a reason to publish something off-voice. Use one only where it
   can be told through a lane this account already wins; if none fits, ignore the block entirely
   rather than bending the account around it.`
       : ""
   }${
     questions?.picks.length
       ? `
${trends?.picks.length ? "4" : "3"}. Then the AUDIENCE QUESTIONS block: things people in this niche actually ask, pulled from a
   live feed rather than imagined. A question that this account is uniquely placed to answer
   makes a strong hook, because the demand for the answer is already demonstrated.`
       : ""
   }
${trends?.picks.length && questions?.picks.length ? "5" : trends?.picks.length || questions?.picks.length ? "4" : "3"}. Only then consider anything else.`;

  const user = `${dataBlock(owner, rivals)}

THIS ACCOUNT'S TOP PERFORMERS — anchor on these:
${JSON.stringify(topPerformers, null, 2)}
${
  sources.length
    ? `
SOURCES — ${sources.length} real stories fetched from a live news search in the last fortnight. Build
every idea on one of these, by id. You have the headline only; you have not read the article:
${JSON.stringify(
  sources.map((source) => ({
    id: source.id,
    headline: source.title,
    publisher: source.publisher,
    published: source.publishedAt?.slice(0, 10) ?? null,
    lane: source.lane,
    coverage: source.coverage,
  })),
  null,
  2,
)}
`
    : ""
}${
    owner.weakestPosts.length
      ? `
THIS ACCOUNT'S WEAKEST POSTS — the contrast set. Work out what the top performers do that these
do not, and say so in whyNow:
${JSON.stringify(owner.weakestPosts, null, 2)}
`
      : ""
  }
${
  owner.pastSuggestions
    ? `PAST SUGGESTIONS — MEASURED SIGNAL (this account's own audience).
Ideas this system proposed, that the creator filmed, and how they actually did. The only
feedback here that is a result rather than an observation:
${JSON.stringify(owner.pastSuggestions, null, 2)}
`
    : ""
}
${
  owner.goal
    ? `GROWTH GOAL — what this account is being managed toward, and where it stands. The
trajectory was computed in TypeScript from stored snapshots; do not restate it as a new figure:
${JSON.stringify(
  {
    goal: owner.goal.growthGoal,
    primaryMetric: owner.goal.primaryMetric,
    watchButDoNotOptimizeFor: owner.goal.secondaryMetrics,
    trajectory: owner.goal.trajectory,
    inWords: trajectoryStatement(owner.goal.trajectory),
  },
  null,
  2,
)}
`
    : ""
}
${
  owner.publishedSubjects?.length
    ? `ALREADY PUBLISHED — the opening line of all ${owner.publishedSubjects.length} posts on record for this
creator, newest first, across BOTH platforms. Same platform = the subject is spent. Other
platform = not new; propose it only as a deliberate port, and say so in whyNow:
${JSON.stringify(owner.publishedSubjects, null, 2)}
`
    : ""
}
${
  owner.priorSuggestions?.length
    ? `ALREADY SUGGESTED — ${owner.priorSuggestions.length} ideas this account has already been given,
newest first. Do NOT repeat any of these, and do not propose a near-variant of one:
${JSON.stringify(owner.priorSuggestions, null, 2)}
`
    : ""
}
${
  owner.nicheLanes?.length
    ? `NICHE LANES — PUBLIC SIGNAL ONLY (across the tracked accounts).
What is structurally working, in vsMedian terms. Says nothing about why any audience valued
anything, and contains no competitor reach, saves or watch time because those do not exist:
${JSON.stringify(owner.nicheLanes, null, 2)}
`
    : ""
}
${
  owner.expectations?.length
    ? `EXPECTATIONS — computed, not estimated. What each lane is measured to do, as multiples of
this account's own median (1.0 is typical for them). The account's median is ${owner.baselineMedian ?? 0}.
"goalMultiple" is the lane's multiple ON THE METRIC THIS CLIENT IS JUDGED BY — rank lanes by it,
not by vsMedian. Null means that metric was never measured for that lane, which is not a pass.
These are the only expectation figures that exist; do not derive others:
${JSON.stringify(
  owner.expectations.map((entry) => {
    const read = goalReadFor(entry, owner.goal?.growthGoal ?? null);
    return {
      ...entry,
      ...(read
        ? { goalMetric: read.metric, goalMultiple: read.multiple, servesGoal: read.servesGoal }
        : {}),
    };
  }),
  null,
  2,
)}
`
    : ""
}
${
  analyst
    ? `YOUR OWN MEASURED READ (this account only — saves, shares, watch time are real here):
${JSON.stringify({ headline: analyst.headline, strengths: analyst.strengths, weaknesses: analyst.weaknesses, lanes: analyst.laneNotes }, null, 2)}
`
    : ""
}
${
  competitive
    ? `COMPETITIVE READ — PUBLIC SIGNAL ONLY (no reach/saves for anyone, including you):
${JSON.stringify(
  {
    headline: competitive.headline,
    contested: competitive.contestedLanes,
    open: competitive.openLanes,
    perAccount: competitive.verdicts.map((verdict) => ({
      handle: verdict.handle,
      lane: verdict.lane,
      verdict: verdict.gap,
      reasoning: verdict.reasoning,
    })),
  },
  null,
  2,
)}
`
    : "COMPETITIVE READ: unavailable — base the ideas on this account's own performance alone.\n"
}
${
  reflection
    ? `WHAT PAST SUGGESTIONS TAUGHT US — the only feedback here that is a result rather than an
observation. A lesson marked confirmed:false rests on one or two outcomes; treat it as a hint:
${JSON.stringify(reflection, null, 2)}
`
    : ""
}
${
  trends?.picks.length
    ? `TRENDS — rising search terms from a live feed, selected for this account. Every term here is
copied verbatim from real feed data; none was recalled from memory. Timeliness only — these say
nothing about what this account's own audience rewards:
${JSON.stringify(trends.picks, null, 2)}
`
    : ""
}
${
  questions?.picks.length
    ? `AUDIENCE QUESTIONS — real questions people ask in this niche, from a live feed. Demonstrated
demand for an answer, not a measure of this account's performance:
${JSON.stringify(questions.picks, null, 2)}
`
    : ""
}
The account posts in these formats: ${formats}.

Write ${count} distinct content ideas for ${owner.handle}. Each must take a DIFFERENT SUBJECT and,
wherever more than one lane clears the account's median, a different lane — not ${count}
variations of one idea, nothing already in the ALREADY SUGGESTED block, and no subject that
appears in the ALREADY PUBLISHED block. Every idea must trace back either to a top performer
above or to a gap named in the competitive read, and whyNow must say which.${
    sources.length ? " Each idea is built on a different story from the SOURCES block." : ""
  }${
    blocked.length
      ? `\n\nBLOCKED — failed repeatedly on this account; do not use any of these:\n${JSON.stringify(
          blocked.map((entry) => ({
            kind: entry.kind,
            value: entry.value,
            hits: `${entry.hits}/${entry.measured}`,
          })),
          null,
          2,
        )}`
      : ""
  }`;

  return {
    system,
    user,
    schema: ideasSchemaFor({
      platform,
      sourceIds: sources.map((source) => source.id),
      lanes: allowedLanes,
    }),
    blocked,
    written,
  };
}

/**
 * Turns the model's raw output into ideas — with no model call and no storage.
 *
 * Where the honesty rules are enforced on the OUTPUT rather than trusted to the
 * prompt: a source's link, headline, outlet and date are attached from the
 * fetched row by id; an id that matches nothing is marked unverified; and an
 * idea using a blocked trait or opening is discarded.
 */
export function finalizeIdeas(
  data: unknown,
  options: { sources: SourceItem[]; blocked: BlockedPattern[]; written: boolean },
): { ideas: ContentIdea[]; dropped: string[] } {
  const { sources, blocked, written } = options;
  const parsed = ideaSetSchema.parse(data);
  const byId = new Map(sources.map((source) => [source.id, source]));
  const dropped: string[] = [];

  const ideas: ContentIdea[] = [];
  for (const raw of parsed.ideas) {
    // The link, headline, publisher and date come from the stored row — never
    // from the model. The model supplied only an id from a closed list, so a
    // "verified" source is one this system actually fetched.
    const fetched = byId.get(raw.source.sourceId);
    const source = fetched
      ? {
          verified: true,
          sourceId: fetched.id,
          url: fetched.url,
          headline: fetched.title,
          publisher: fetched.publisher ?? undefined,
          publishedAt: fetched.publishedAt ?? undefined,
          coverage: fetched.coverage,
          subject: raw.source.subject,
          origin: fetched.publisher ?? raw.source.origin,
          searchQuery: raw.source.searchQuery,
        }
      : {
          verified: false,
          subject: raw.source.subject,
          origin: raw.source.origin,
          searchQuery: raw.source.searchQuery,
        };

    const idea: ContentIdea = {
      id: raw.id,
      format: raw.format,
      title: raw.title,
      angle: raw.angle,
      whyNow: raw.whyNow,
      winningTrait: raw.winningTrait,
      contentLane: raw.contentLane,
      sourceSignal: raw.sourceSignal,
      source,
      hook: raw.hook,
      // A written format has no shot list and no production brief; the post
      // IS the deliverable.
      shots: written ? [] : raw.shots,
      ...(written ? {} : raw.production ? { production: raw.production } : {}),
      ...(written && raw.post ? { post: raw.post } : {}),
      caption: written ? "" : raw.caption,
      hashtags: raw.hashtags,
    };

    // The loop's blocks, enforced here rather than trusted to the prompt: a
    // blocked lane is already absent from the schema, and a blocked trait or
    // hook type is caught now, before the idea is saved or shown.
    const reason = blockReason(
      {
        contentLane: idea.contentLane,
        winningTrait: idea.winningTrait,
        hookType: classifyHook(idea.hook),
      },
      blocked,
    );
    if (reason) {
      dropped.push(`"${idea.title}" — ${reason}`);
      continue;
    }
    ideas.push(idea);
  }
  return { ideas, dropped };
}

export async function generateIdeas(
  platform: PlatformId,
  owner: AccountBrief,
  rivals: AccountBrief[],
  /** The upstream agents' reads, each kept as its own labelled input. */
  reads: IdeaReads = {},
  count = 3,
  /**
   * Real, fetched stories the ideas must be built on. Empty when no live source
   * was available — the ideas are then marked unverified rather than withheld.
   */
  sources: SourceItem[] = [],
): Promise<{ ideas: ContentIdea[]; model: string; dropped: string[] }> {
  const request = buildIdeaRequest(platform, owner, rivals, reads, count, sources);

  const result = await completeJson<unknown>({
    system: request.system,
    user: request.user,
    schemaName: "content_ideas",
    // Higher temperature: this half is copywriting, not measurement. Reasoning
    // models ignore it and take the effort dial instead.
    temperature: 0.75,
    // Medium, not high: this call emits three full shot lists — roughly 3,000
    // tokens of JSON — on top of whatever it spends reasoning, and at high
    // effort it overran even a generous timeout. The analytical work is already
    // done by the time we get here; the competitive read is passed in as input,
    // so this call is mostly writing.
    effort: "medium",
    schema: request.schema,
    timeoutMs: 420_000,
  });

  const { ideas, dropped } = finalizeIdeas(result.data, {
    sources,
    blocked: request.blocked,
    written: request.written,
  });
  if (dropped.length) console.warn(`[ai:${platform}] dropped blocked idea(s):`, dropped);

  // Persisted append-only, separately from the cached ai_analyses row that
  // regeneration overwrites — this is the feedback loop's memory. The ids
  // that come back replace the model's own kebab-case slugs, because "I filmed
  // this one" needs an id that still resolves to a row next week.
  //
  // Caught rather than left to throw: by this point the model has already done
  // its (paid) work and produced usable ideas. A migration not yet applied, or
  // any other storage hiccup, must not throw those away — it only costs the
  // feedback loop this one generation's worth of history, which is recoverable
  // next time, unlike the ideas themselves if this call fails outright.
  try {
    const saved = await saveSuggestedIdeas(platform, ideas);
    return { ideas: saved, model: result.model, dropped };
  } catch (error) {
    console.error(`[ai:${platform}] could not persist suggested ideas:`, error);
    return { ideas, model: result.model, dropped };
  }
}
