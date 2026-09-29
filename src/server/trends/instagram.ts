// The Instagram trend catcher.
//
// Answers "what is working on Instagram in our niche right now, and where can
// I see it?" from data the sync already collects. No scraping, no model call,
// no cost — and every result links to the post it came from.
//
// The pipeline, in order, because the order is the point:
//
//   competitor posts -> per-account median -> breakouts -> OFF-VOICE gate
//   -> LANE gate -> already-covered check -> ranked
//
// The two gates in the middle are what separate this from a view counter. The
// loudest breakouts in this niche are meme humour; without them the inbox
// would recommend exactly the content this account has no business making.
import { OWNER_ACCOUNTS } from "../apify/accounts";
import {
  readCalendarEntries,
  readPosts,
  readTaxonomy,
  competitorSnapshots,
  trendSourceSnapshots,
} from "../store";
import { classifyLane, distinctiveSubjects } from "@/lib/calendar-classify";
import { LANE_FIT_THRESHOLD, buildLaneVocabulary, laneFit } from "@/lib/lane-fit";
import {
  BREAKOUT_MULTIPLE,
  MIN_POSTS_FOR_MEDIAN,
  TREND_WINDOW_DAYS,
  median,
  offVoiceReason,
  trendScore,
  type InstagramTrend,
} from "@/lib/instagram-trends";
import {
  engagementsOf,
  lanePerformance,
  viewsOf,
  type PlatformId,
  type PostRecord,
} from "@/lib/analytics-types";

export interface InstagramTrendResult {
  trends: InstagramTrend[];
  /** Breakouts that were found but gated out, so the filtering is inspectable. */
  rejected: InstagramTrend[];
  /** Accounts whose posts were scanned, with the median each was judged against. */
  scanned: Array<{ handle: string; posts: number; median: number }>;
  /**
   * Which metric the breakout was measured on. Instagram publishes a view count
   * and LinkedIn does not, so on LinkedIn this is interactions — the same
   * fallback every other panel makes rather than a special case for trends.
   */
  metric: "views" | "interactions";
  /** Present when nothing could be computed. */
  reason?: string;
}

/** The owner's lane vocabulary — the gate every candidate is judged against. */
async function ownerLanes(platform: PlatformId): Promise<string[]> {
  const handle = OWNER_ACCOUNTS[platform].handle;
  const taxonomy = await readTaxonomy(platform, handle).catch(() => null);
  if (taxonomy?.length) return taxonomy.map((lane) => lane.name);
  const posts = await readPosts(platform, handle).catch(() => []);
  return lanePerformance(posts).map((lane) => lane.lane);
}

/** The opening line of a caption, which is where these accounts put the hook. */
function hookOf(caption: string): string {
  const first = caption.replace(/\s+/g, " ").split(/(?<=[.!?])\s/)[0] ?? caption;
  return first.slice(0, 160).trim();
}

/**
 * Whether the team has already covered this ground.
 *
 * Matched on the subjects the calendar importer extracted — the brands and
 * tools each past topic was about. A trend about a brand already on the
 * calendar is not new to this account, however new it is to Instagram.
 */
function alreadyCovered(caption: string, subjects: Set<string>): string | null {
  const text = caption.toLowerCase();
  for (const subject of subjects) {
    const name = subject.toLowerCase();
    // Word boundaries, not substring, so a short name cannot match inside a
    // longer word.
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(text)) {
      return `already covered \u201c${subject}\u201d on the calendar`;
    }
  }
  return null;
}

/**
 * Breakout posts across the tracked accounts, gated and ranked.
 *
 * `includeRejected` returns what was filtered out as well. The inbox uses it
 * to show the team why something loud was left out — a filter nobody can
 * inspect is one nobody trusts.
 */
export async function instagramTrends(
  platform: PlatformId = "instagram",
  options: { limit?: number } = {},
): Promise<InstagramTrendResult> {
  const owner = OWNER_ACCOUNTS[platform].handle;
  // Competitors AND trend sources. The catcher is the one reader that wants
  // both: a competitor's breakout says what works in this niche, and a trend
  // source's says what the niche is talking about today. Everything else in
  // the system sees competitors only. See AccountRole in apify/accounts.
  const [competitors, sources, lanes, calendar] = await Promise.all([
    competitorSnapshots(platform).catch(() => []),
    trendSourceSnapshots(platform).catch(() => []),
    ownerLanes(platform),
    readCalendarEntries(platform).catch(() => []),
  ]);
  const rivals = [...competitors, ...sources];

  if (!rivals.length) {
    return {
      trends: [],
      rejected: [],
      scanned: [],
      metric: "views",
      reason: "No competitor or trend-source accounts have been scraped yet.",
    };
  }
  if (!lanes.length) {
    return {
      trends: [],
      rejected: [],
      scanned: [],
      metric: "views",
      reason: "No content lanes yet — the gate has nothing to judge relevance against.",
    };
  }

  // Read every rival's posts up front so the metric can be chosen from the
  // whole set. It has to be one metric for the whole run: a views-based
  // multiple for one account ranked against an interactions-based one for
  // another is two different scales in one list.
  const postsByRival = new Map<string, PostRecord[]>();
  for (const rival of rivals) {
    if (rival.handle === owner) continue;
    postsByRival.set(rival.handle, await readPosts(platform, rival.handle, 200).catch(() => []));
  }
  const all = [...postsByRival.values()].flat();

  // The same fallback every other panel makes, rather than a special case for
  // trends: views where the platform publishes them, interactions where it does
  // not. LinkedIn stores views as 0 on every post because personal profiles
  // publish no view count, which is what used to make every baseline here zero
  // and the whole catcher silently return nothing on that platform.
  const useViews = all.some((post) => viewsOf(post) > 0);
  const metric: InstagramTrendResult["metric"] = useViews ? "views" : "interactions";
  const primary = (post: PostRecord) => (useViews ? viewsOf(post) : engagementsOf(post));

  // Only names specific enough to mean "covered". See distinctiveSubjects.
  const subjects = new Set(distinctiveSubjects(calendar.flatMap((entry) => entry.subjects)));

  // The gate the team's own topics taught. Built from the calendar when one
  // has been imported; the keyword rules stand in until then, so the catcher
  // works on day one and gets sharper once the calendar lands.
  const vocabulary = calendar.length >= 20 ? buildLaneVocabulary(calendar) : null;
  const laneOf = (caption: string): { lane: string | null; fit: number; why: string[] } => {
    if (vocabulary) {
      const fit = laneFit(caption, vocabulary, LANE_FIT_THRESHOLD);
      return { lane: fit.lane, fit: fit.score, why: fit.matched };
    }
    return { lane: classifyLane(caption, lanes), fit: 0, why: [] };
  };
  const now = Date.now();
  const scanned: InstagramTrendResult["scanned"] = [];
  const found: InstagramTrend[] = [];
  const rejected: InstagramTrend[] = [];

  for (const [handle, posts] of postsByRival) {
    const baseline = median(posts.map(primary));
    scanned.push({ handle, posts: posts.length, median: Math.round(baseline) });

    // A median from a handful of posts is not a baseline; one strong post
    // moves it far enough to hide everything else on the account.
    if (posts.length < MIN_POSTS_FOR_MEDIAN || !baseline) continue;

    for (const post of posts) {
      const value = primary(post);
      const ageDays = (now - new Date(post.publishedAt).getTime()) / 86_400_000;
      if (!value || ageDays > TREND_WINDOW_DAYS || ageDays < 0) continue;

      const multiple = value / baseline;
      if (multiple < BREAKOUT_MULTIPLE) continue;

      const caption = (post.caption ?? "").trim();
      const base: Omit<InstagramTrend, "lane" | "reason" | "score"> = {
        handle,
        postId: post.postId,
        url: post.url ?? null,
        hook: hookOf(caption),
        caption,
        publishedAt: post.publishedAt,
        value,
        likes: post.likes,
        comments: post.comments,
        vsAccountMedian: Number(multiple.toFixed(1)),
        ageDays: Math.round(ageDays),
      };
      const score = trendScore(multiple, ageDays);

      const offVoice = offVoiceReason(caption);
      if (offVoice) {
        rejected.push({ ...base, lane: null, reason: offVoice, score });
        continue;
      }

      // The lane is a RANKING signal, not a second hard gate.
      //
      // Competitor captions are a line long; the calendar entries this
      // vocabulary was built from are 500-word scripts. Overlap on five words
      // is too noisy to throw a real breakout away on — measured, it dropped
      // "Flipkart turned a print ad into an unboxing", which is squarely this
      // account's kind of topic. So anything that clears the off-voice gate is
      // shown, and how well it fits decides where it ranks.
      const { lane, fit, why } = laneOf(caption);

      const covered = alreadyCovered(caption, subjects);
      if (covered) {
        rejected.push({ ...base, lane, reason: covered, score });
        continue;
      }

      found.push({
        ...base,
        lane,
        reason:
          `${multiple.toFixed(1)}× @${handle}'s own median` +
          (lane && why.length
            ? `, reads like your ${lane} topics (${why.slice(0, 3).join(", ")})`
            : lane
              ? `, fits ${lane}`
              : ", no clear lane — judge it yourself"),
        // Breakout size AND fit. A modest breakout squarely in this account's
        // territory outranks a bigger one with no lane, which is what keeps
        // the top of the list useful without hiding the rest.
        score: Number((score * (1 + Math.min(fit, 1))).toFixed(3)),
      });
    }
  }

  found.sort((a, b) => b.score - a.score);
  rejected.sort((a, b) => b.score - a.score);

  return {
    trends: found.slice(0, options.limit ?? 20),
    rejected: rejected.slice(0, 10),
    scanned,
    metric,
    ...(found.length ? {} : { reason: "No breakout posts cleared the lane gate in this window." }),
  };
}
