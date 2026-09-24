// Normalized analytics domain.
//
// Everything here is derived from PUBLIC profile data scraped via Apify. Private
// analytics (impressions, reach, audience demographics, video retention) have no
// public source and are deliberately absent rather than estimated.

import type { ScriptFeatures } from "@/lib/script-features";

export type PlatformId = "instagram" | "linkedin";

export const PLATFORM_IDS: PlatformId[] = ["instagram", "linkedin"];

export type ContentFormat = "reel" | "carousel" | "image" | "video" | "text" | "article";

/** One stored sync — the row that makes the growth curve possible. */
export interface AccountSnapshot {
  handle: string;
  displayName: string;
  headline?: string;
  followers: number;
  following?: number;
  postsCount?: number;
  capturedAt: string;
}

export interface GrowthPoint {
  capturedAt: string;
  followers: number;
}

export interface PostRecord {
  platform: PlatformId;
  postId: string;
  url?: string;
  caption: string;
  format: ContentFormat;
  publishedAt: string;
  /** 0 when the platform does not publish a view count for this format. */
  views: number;
  likes: number;
  comments: number;
  shares: number;
  /**
   * Pinned posts stay at the top of a profile indefinitely, so they accumulate
   * views for months and are often years older than the rest of the feed.
   * Including them wrecks both cadence and engagement rate, so the derived
   * metrics below skip them — the posts table still shows them, marked.
   */
  pinned: boolean;
  /** Present only for the owner's own posts, and only once Graph is configured. */
  insight?: MediaInsight;
  /**
   * Which content lane this post belongs to, from the account's own taxonomy.
   * Absent until the post has been classified; "other" when it fits no lane.
   */
  contentLane?: string;
}

/** One lane in an account's stable vocabulary. */
export interface ContentLane {
  name: string;
  /** One line, so later classification runs apply the same boundary. */
  definition: string;
}

/**
 * How one lane performs for one account.
 *
 * The headline comparison is shareOfOutput against shareOfPerformance: a lane
 * that is 40% of what an account publishes but 10% of what it earns is wasted
 * effort, and a small lane that over-indexes is an opening. Neither is visible
 * from volume or from totals alone.
 */
export interface LanePerformance {
  lane: string;
  postCount: number;
  /** This lane's share of the account's posts, as a whole percentage (0-100). */
  shareOfOutputPct: number;
  /** This lane's share of the account's total interactions, as a whole percentage. */
  shareOfPerformancePct: number;
  /** Median of each post's performance against this account's own median. */
  medianVsMedian: number;
  medianInteractions: number;
  /** Owner-only, and only where Graph measured the posts. */
  medianSaves?: number;
  medianWatchSeconds?: number;
  /** Under this, a median is one or two posts wearing a statistic's clothing. */
  directional: boolean;
}

/** Below this many posts, a lane's numbers are a hint, not a result. */
export const THIN_LANE = 3;

/**
 * Owner-only per-post metrics from the Meta Graph API. Optional throughout:
 * competitors never have these, and neither does any post older than the window
 * the Graph adapter walks. A missing block means "not measured", never "zero".
 */
export interface MediaInsight {
  /** Unique accounts that saw the post — the honest denominator for a rate. */
  reach: number;
  saved: number;
  shares: number;
  /** Graph's own view count; more accurate than the public one Apify reads. */
  views: number;
  /** Reels only. Milliseconds. */
  avgWatchMs?: number;
  totalWatchMs?: number;
  /** Feed posts only — Instagram does not report these for reels. */
  follows?: number;
  profileVisits?: number;
  /**
   * Graph's own like and comment counts for the owner's post.
   *
   * Unlike `views`, these are NOT a different measurement from the scraped
   * ones — a like is a like. Graph simply reads them reliably where the public
   * scrape does not: it returned 0 comments for a reel with 164 likes, 106
   * shares and 9,000 reach. So where Graph supplies them they replace the
   * scraped values, while `views` deliberately does not.
   */
  likes?: number;
  comments?: number;
}

/** One slice of an audience breakdown, already sorted and labelled for display. */
export interface AudienceSlice {
  label: string;
  value: number;
}

export interface AudienceBreakdowns {
  ageGender: AudienceSlice[];
  age: AudienceSlice[];
  gender: AudienceSlice[];
  country: AudienceSlice[];
  city: AudienceSlice[];
}

/** Account-level totals over the trailing window Graph allows (28 days). */
export interface AccountInsights {
  reach: number;
  views: number;
  profileViews: number;
  accountsEngaged: number;
  totalInteractions: number;
  websiteClicks: number;
}

export interface InstagramInsights {
  capturedAt: string;
  account: AccountInsights;
  audience: AudienceBreakdowns;
  /** How many posts carry a MediaInsight, for honest sample-size labelling. */
  postsMeasured: number;
}

export interface CompetitorRecord {
  handle: string;
  displayName: string;
  followers: number;
  /** Median views across the posts we captured; 0 when views aren't public. */
  medianViews: number;
  medianEngagements: number;
  postsPerWeek: number;
  engagementRate: number;
}

// ---------------------------------------------------------------------------
// The learning loop
// ---------------------------------------------------------------------------

/** One past suggestion, scored against what the account normally does. */
export interface SuggestionOutcome {
  hook: string;
  winningTrait: string;
  lane: string | null;
  publishedAt: string;
  /** Reach — views (Graph where available) as a multiple of the account's median. */
  vsMedian: number;
  /**
   * The client's GOAL metric for this post, as a multiple of the account's own
   * median on that metric. Null when the post was not measured for it — then
   * the outcome is graded on reach, and `gradedOn` says so.
   */
  goalVsMedian: number | null;
  /** What the hit/miss was decided on: "save rate", "share rate", "reach", "engagement". */
  gradedOn: string;
  /** The figure the verdict rests on — goalVsMedian where measured, vsMedian otherwise. */
  score: number;
  /**
   * Beat the median on the graded metric.
   *
   * Replaces the old beatMedian, which was always reach. That was the loop's
   * central bug: ideas were CHOSEN for save rate and GRADED on views, so a lane
   * few people see but many save — exactly what the strategist is told to find
   * — would be marked a miss every time, and the loop would learn to stop
   * suggesting it.
   */
  hit: boolean;
  saveRatePct?: number;
  shareRatePct?: number;
  watchSeconds?: number;
  /** The script's shape, by rule. Absent on suggestions stored before 0010. */
  features?: ScriptFeatures;
}

/** One group of outcomes, scored the same way the verdicts were. */
export interface OutcomeGroup {
  count: number;
  /** Median of each outcome's score. */
  medianScore: number;
  /** Share that were hits, 0-1. */
  hitRate: number;
}

/** A script feature and how scripts carrying it did. */
export interface ScriptPatternScore extends OutcomeGroup {
  feature: "hookType" | "lengthBucket" | "ctaType" | "format";
  value: string;
  /** Plain-English label for the value. */
  label: string;
}

/**
 * A lane, trait or hook type the loop has stopped suggesting.
 *
 * Blocking is the loop acting on evidence rather than advising on it. A written
 * lesson ("this didn't work") can be ignored by the next generation; a block is
 * enforced in code — the lane is removed from the strategist's allowed list and
 * any idea that still carries a blocked trait is dropped before it is saved.
 */
export interface BlockedPattern {
  kind: "lane" | "trait" | "hookType";
  value: string;
  measured: number;
  hits: number;
  /** When the most recent evidence was measured. */
  lastMeasuredAt: string;
  /** The block lifts on this date, so a pattern can earn another trial. */
  expiresAt: string;
}

/** A filmed script, summarised so the next generation can reproduce its STRUCTURE. */
export interface ScriptExample {
  hook: string;
  format: string;
  lane: string | null;
  score: number;
  gradedOn: string;
  features: ScriptFeatures;
  /** Shot types in order, or section headings in order — the skeleton of the script. */
  outline: string[];
}

/** §5.1 — how the system's own past suggestions actually did. */
export interface SuggestionFeedback {
  /** Suggestions linked to a real post AND found in stored metrics. */
  measured: number;
  /** Linked by a creator but not yet present in post_metrics. */
  awaitingData: number;
  /**
   * Linked, found, but pinned — excluded rather than scored. A pinned post
   * accumulates views the rest of the feed never sees, so counting one here
   * would flatter the only number in the system that grades its own advice.
   */
  excludedPinned: number;
  /** The metric most verdicts were decided on — the goal metric wherever it was measured. */
  gradedOn: string;
  /**
   * Spec §7's headline number: how filmed suggestions do against what this
   * account normally does.
   *
   * Every outcome is already a multiple of the account's own median, so the
   * account's median is 1.0 by construction and these medians read directly
   * against it — 1.3 means filmed suggestions typically do 30% better than the
   * account's typical post. `medianScore` is on the graded metric (the goal);
   * `medianReach` is the same comparison on views, which is the spec's literal
   * wording, kept alongside so the two can disagree visibly.
   */
  overall: {
    medianScore: number;
    medianReach: number;
    /** medianScore at or above 1.0. */
    beatsMedian: boolean;
  };
  outcomes: SuggestionOutcome[];
  byLane: Array<OutcomeGroup & { lane: string }>;
  byTrait: Array<OutcomeGroup & { trait: string }>;
  /** Which script shapes win: hook type, length, call to action, format. */
  byScript: ScriptPatternScore[];
  /** The best and worst filmed scripts, as skeletons to copy or avoid. */
  scriptExamples: { winners: ScriptExample[]; losers: ScriptExample[] };
  /** Enforced, not advisory. See BlockedPattern. */
  blocked: BlockedPattern[];
}

/** §5.2 — one lane's standing across every tracked account. */
export interface NicheLane {
  lane: string;
  /** Accounts with at least one post in this lane. */
  accountsPublishing: number;
  /** Of those, how many run at or above their own median in it. */
  accountsAboveMedian: number;
  /** Median, across accounts, of each account's vsMedian in this lane. */
  medianVsMedian: number;
  ownerVsMedian: number | null;
  ownerShareOfOutputPct: number | null;
  ownerShareOfPerformancePct: number | null;
}

export type PlatformStatus = "ok" | "unconfigured" | "error" | "empty";

export interface PlatformData {
  platform: PlatformId;
  status: PlatformStatus;
  profileUrl: string;
  error?: string;
  missingEnv?: string[];
  latest: AccountSnapshot | null;
  /** Oldest first. One point per stored sync. */
  growth: GrowthPoint[];
  posts: PostRecord[];
  competitors: CompetitorRecord[];
  /**
   * Handles configured for tracking, whether or not a sync has stored them yet.
   * Lets the UI distinguish "none configured" from "configured, awaiting sync".
   */
  trackedCompetitors: string[];
  lastSyncedAt: string | null;
  /**
   * §7 — the learning scorecard. Present once at least one suggestion has been
   * linked to a published post, and once posts carry lanes.
   */
  learning?: {
    suggestions: SuggestionFeedback | null;
    lanes: LanePerformance[];
    /** True when enough posts fell outside the taxonomy to warrant a rebuild. */
    taxonomyStale: boolean;
    /**
     * Each lane's multiple on the metric the CLIENT'S GOAL is judged by, which
     * is usually not reach.
     *
     * Present so the lane table can show the figure the reel suggestions are
     * actually ordered by. Without it the table shows reach alone, and a lane
     * that is weak on reach but strong on the goal reads as a failing lane that
     * the suggestions then inexplicably target. Empty when no growth goal is
     * set, since there is no second figure to show.
     */
    goalByLane?: Array<{
      lane: string;
      /** Human label of the goal metric — "save rate", "reach", "share rate". */
      metric: string;
      /** Null when this lane has no measurement of that metric at all. */
      multiple: number | null;
      servesGoal: boolean;
      /** Posts behind the multiple; null when unmeasured. Hedges the figure, not the lane. */
      sample: number | null;
    }>;
  };
  /**
   * Addendum A.2/A.6 — the primary metric's trajectory for this account.
   *
   * Typed loosely here because analytics-types is the base module with no runtime
   * imports; the real shape is GrowthTrajectory in @/lib/growth.
   */
  trajectory?: {
    primaryMetric: string;
    currentValue: number;
    ratePerWeek: number;
    ratePerMonth: number;
    trend: "accelerating" | "steady" | "slowing" | "declining";
    sinceEngagementStart: number;
    directional: boolean;
    samples: number;
    windowDays: number;
  } | null;
  /** Instagram only, and only when a Graph token is configured. */
  insights?: InstagramInsights;
  /** Why `insights` is absent — surfaced in place of the locked panels. */
  insightsMissingEnv?: string[];
}

export interface DashboardData {
  platforms: PlatformData[];
  /**
   * Addendum A.6 — the goal every client headline is read against.
   *
   * The agency console proper needs multi-client; this is the single-client
   * stand-in, and it puts the same thing front and centre: what we are managing
   * toward, and whether it is moving.
   */
  goal?: { growthGoal: string; primaryMetric: string; label: string } | null;
  /** Newest sync across all platforms. */
  lastSyncedAt: string | null;
  /** True when the newest sync is older than the 2-hour cadence. */
  stale: boolean;
  /**
   * Whether the dashboard may sync by itself — on open when stale, and every
   * two hours while left open. False when AUTO_SYNC=off: then only the Sync
   * button spends, so the dashboard can be opened and read for free.
   */
  autoSync: boolean;
  /** Set when the app can't reach its store or Apify at all. */
  setupError?: string;
  /**
   * True when snapshots are being held in process memory instead of Supabase.
   * Syncs work and current numbers are real, but nothing survives a restart —
   * so the growth curve cannot accumulate.
   */
  ephemeral: boolean;
}

export interface SyncOutcome {
  platform: PlatformId;
  status: "ok" | "error";
  error?: string;
  followers?: number;
  postsIngested?: number;
}

export interface SyncResult {
  startedAt: string;
  finishedAt: string;
  outcomes: SyncOutcome[];
}

/** How often the dashboard expects a sync, in milliseconds. */
export const SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Derived metrics. Kept here so the pages and the summary row agree.
// ---------------------------------------------------------------------------

/**
 * The view count to reason with.
 *
 * Graph's own figure where we have it, the scraped one otherwise. For the
 * owner these differ by a median of 2.28x on this account (range 1.53-7.57x),
 * because they measure different things: Graph counts plays, the public page
 * counts something narrower. Graph is the platform's own number and is the one
 * to trust about the owner.
 *
 * The catch, and the reason this function is not simply "use Graph": a Graph
 * figure exists ONLY for accounts we hold a token for. Competitors are scraped
 * permanently, so any cross-account comparison built on this would put an
 * inflated owner against a deflated rival. Within one account it is consistent
 * — post and median move together, so vsMedian stays true — and cross-account
 * view comparisons are marked unavailable rather than silently mixed.
 */
export function viewsOf(post: PostRecord): number {
  return post.insight?.views || post.views;
}

export function engagementsOf(post: PostRecord): number {
  return post.likes + post.comments + post.shares;
}

/**
 * Engagement rate against views where views are published (Instagram reels), and
 * against followers otherwise (LinkedIn, where no view count is public).
 * The two are not comparable, so each page labels which basis it is using.
 */
export function engagementRate(allPosts: PostRecord[], followers: number): number {
  const posts = organicPosts(allPosts);
  if (!posts.length) return 0;

  // Two guards, both learned from real scraped data.
  //
  // 1. Numerator and denominator must describe the SAME posts. Summing
  //    engagements across every post while summing views across only the posts
  //    that report them is nonsense on an account that mixes formats: a carousel
  //    contributes likes to the top of the fraction and nothing to the bottom.
  //
  // 2. A post cannot have more interactions than views — you have to see
  //    something to like it. Instagram nonetheless sometimes returns a stale or
  //    wrong videoViewCount; one competitor had a reel reported as 132 views and
  //    36,012 likes. A single such row dominates the sum and produced a 1008%
  //    engagement rate. Posts failing this check have unusable view data and are
  //    excluded from the views basis rather than being allowed to poison it.
  const withViews = posts.filter(
    (post) => viewsOf(post) > 0 && engagementsOf(post) <= viewsOf(post),
  );
  if (withViews.length) {
    const engagements = withViews.reduce((sum, post) => sum + engagementsOf(post), 0);
    const views = withViews.reduce((sum, post) => sum + viewsOf(post), 0);
    if (views > 0) return engagements / views;
  }

  // No public view counts anywhere (LinkedIn, or an all-carousel account):
  // fall back to interactions per follower-impression.
  if (followers > 0) {
    const engagements = posts.reduce((sum, post) => sum + engagementsOf(post), 0);
    return engagements / (followers * posts.length);
  }
  return 0;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Median views across posts that actually carry a public view count.
 *
 * Zero-view posts are excluded rather than counted as zero: a carousel has no
 * public view count at all, and averaging those in drags the median toward zero
 * and makes reels look worse than they are. Defined once here because it was
 * previously computed two different ways — the table filtered, the AI brief did
 * not, and the model faithfully reported a number that contradicted the table
 * beside it.
 */
export function medianViews(posts: PostRecord[]): number {
  return median(posts.map(viewsOf).filter((value) => value > 0));
}

/** Posts that reflect current output — i.e. everything except pinned ones. */
export function organicPosts(posts: PostRecord[]): PostRecord[] {
  const organic = posts.filter((post) => !post.pinned);
  // If every captured post is pinned, fall back rather than returning nothing.
  return organic.length ? organic : posts;
}

/**
 * Engagement rate against measured REACH — the number Instagram itself shows.
 *
 * This supersedes `engagementRate` wherever Graph data exists: reach is unique
 * accounts, so the ratio answers "of the people who saw it, how many acted",
 * which is the question the view-count version only approximates. Returns null
 * rather than 0 when nothing is measured, so callers fall back instead of
 * rendering a confident zero.
 */
export function reachEngagementRate(allPosts: PostRecord[]): number | null {
  const measured = organicPosts(allPosts).filter((post) => post.insight && post.insight.reach > 0);
  if (!measured.length) return null;
  const reach = measured.reduce((sum, post) => sum + (post.insight?.reach ?? 0), 0);
  if (reach <= 0) return null;
  const engagements = measured.reduce(
    (sum, post) =>
      sum + engagementsOf(post) + (post.insight?.saved ?? 0) + (post.insight?.shares ?? 0),
    0,
  );
  return engagements / reach;
}

/** Posts carrying owner-only metrics, newest first. */
export function measuredPosts(posts: PostRecord[]): PostRecord[] {
  return posts.filter((post) => post.insight !== undefined);
}

/**
 * Lane-level performance for one account.
 *
 * Everything is expressed relative to the account's OWN median rather than in
 * raw counts, because these rollups get compared across accounts of wildly
 * different sizes. A 500-view post on a small account and a 50,000-view post on
 * a large one are both wins if each beat its own baseline; comparing the raw
 * numbers is the exact trap the rest of this file exists to avoid.
 */
export function lanePerformance(allPosts: PostRecord[]): LanePerformance[] {
  const posts = organicPosts(allPosts).filter((post) => post.contentLane);
  if (!posts.length) return [];

  // The yardstick every post is scored against. Views where the platform
  // publishes them, interactions otherwise — the same primary metric the rest
  // of the dashboard uses, so lane figures and post figures agree.
  const useViews = posts.some((post) => viewsOf(post) > 0);
  const primary = (post: PostRecord) => (useViews ? viewsOf(post) : engagementsOf(post));
  const baseline = median(posts.map(primary)) || 1;
  const totalInteractions = posts.reduce((sum, post) => sum + engagementsOf(post), 0);

  const byLane = new Map<string, PostRecord[]>();
  for (const post of posts) {
    const lane = post.contentLane ?? "other";
    byLane.set(lane, [...(byLane.get(lane) ?? []), post]);
  }

  return [...byLane.entries()]
    .map(([lane, group]) => {
      const interactions = group.reduce((sum, post) => sum + engagementsOf(post), 0);
      const saves = group
        .map((post) => post.insight?.saved)
        .filter((value): value is number => value !== undefined);
      const watch = group
        .map((post) => post.insight?.avgWatchMs)
        .filter((value): value is number => value !== undefined && value > 0);

      const entry: LanePerformance = {
        lane,
        postCount: group.length,
        // Whole percentages, rounded here at the source. These are read by
        // people and quoted by the model, and 0.13333333333333333 is neither
        // more accurate nor more useful than 13 for either of them.
        shareOfOutputPct: Math.round((group.length / posts.length) * 100),
        shareOfPerformancePct:
          totalInteractions > 0 ? Math.round((interactions / totalInteractions) * 100) : 0,
        medianVsMedian: Number((median(group.map(primary)) / baseline).toFixed(2)),
        medianInteractions: Math.round(median(group.map((post) => engagementsOf(post)))),
        directional: group.length < THIN_LANE,
      };
      if (saves.length) entry.medianSaves = Math.round(median(saves));
      if (watch.length) entry.medianWatchSeconds = Number((median(watch) / 1000).toFixed(1));
      return entry;
    })
    .sort((a, b) => b.medianVsMedian - a.medianVsMedian);
}

/** Posts per week across the captured window, ignoring pinned posts. */
export function cadence(allPosts: PostRecord[]): number {
  const posts = organicPosts(allPosts);
  if (posts.length < 2) return posts.length;
  const times = posts.map((p) => new Date(p.publishedAt).getTime()).sort((a, b) => a - b);
  const first = times[0];
  const last = times[times.length - 1];
  if (first === undefined || last === undefined || last === first) return posts.length;
  const weeks = (last - first) / (7 * 86_400_000);
  return weeks > 0 ? posts.length / weeks : posts.length;
}
