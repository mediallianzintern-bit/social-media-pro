// Addendum E — reaction sources and their learning, server side.
//
// Saving a clip is where the source link is made trustworthy: it is
// normalised, its platform identified, its credit defaulted from the handle
// the team confirmed, and its rights status started at "needs review". No
// model is involved anywhere in this file.
import {
  competitorSnapshots,
  readCalendarEntries,
  readOutcomes,
  readPosts,
  readReactionIdeas,
  readReactionSources,
  trendSourceSnapshots,
  resolveStaffUser,
  saveReactionSource,
} from "./store";
import {
  defaultCredit,
  initialRights,
  normalizeSourceUrl,
  type ReactionSource,
  type RightsStatus,
  type SourceType,
} from "@/lib/reaction";
import { reactionLearning, type ReactionLearning } from "@/lib/reaction-learning";
import { CLAIM_LABEL, readClaim, type ClaimRead } from "@/lib/reactable";
import {
  BREAKOUT_MULTIPLE,
  MIN_POSTS_FOR_MEDIAN,
  TREND_WINDOW_DAYS,
  median,
  offVoiceReason,
  trendScore,
} from "@/lib/instagram-trends";
import { buildLaneVocabulary, LANE_FIT_THRESHOLD, laneFit } from "@/lib/lane-fit";
import { viewsOf } from "@/lib/analytics-types";
import type { PlatformId } from "@/lib/analytics-types";

export interface NewReactionSource {
  platform: PlatformId;
  sourceUrl: string;
  sourceCreatorHandle?: string | null | undefined;
  sourceType: SourceType;
  sourcePublicViews?: number | null | undefined;
  transcript?: string | null | undefined;
  extractedClaim?: string | null | undefined;
  creditText?: string | null | undefined;
  rightsStatus?: RightsStatus | undefined;
  foundBy?: "team" | "trend_listener" | undefined;
}

/**
 * Validates and stores a clip. Returns the row, or why it was refused.
 *
 * The handle the team types wins over one read from the link, and is stored
 * without a leading "@". The credit, if left blank, is built from that handle
 * — so it can only ever name the creator this row names.
 */
export async function createReactionSource(
  input: NewReactionSource,
  staffEmail: string | null,
): Promise<{ source: ReactionSource } | { reason: string }> {
  const link = normalizeSourceUrl(input.sourceUrl);
  if (!link.ok) return { reason: link.reason };

  const handle = (input.sourceCreatorHandle?.trim() || link.handle || "").replace(/^@/, "") || null;
  const existing = (await readReactionSources(input.platform).catch(() => [])).find(
    (source) => source.sourceUrl === link.url,
  );
  const credit = input.creditText?.trim() || defaultCredit(handle, link.platform);
  const createdBy = staffEmail
    ? await resolveStaffUser(staffEmail, "creator").catch(() => null)
    : null;

  const source = await saveReactionSource({
    platform: input.platform,
    sourceUrl: link.url,
    sourcePlatform: link.platform,
    sourceCreatorHandle: handle,
    sourceType: input.sourceType,
    sourcePublicViews:
      input.sourcePublicViews != null && Number.isFinite(input.sourcePublicViews)
        ? Math.round(input.sourcePublicViews)
        : null,
    transcript: input.transcript?.trim() || null,
    extractedClaim: input.extractedClaim?.trim() || null,
    creditText: credit,
    rightsStatus: initialRights(input.sourceType, input.rightsStatus, !existing),
    foundBy: input.foundBy ?? "team",
    createdBy,
  });
  return { source };
}

/** E.9 — reaction reels measured against the account's own median. */
export async function loadReactionLearning(platform: PlatformId): Promise<ReactionLearning> {
  const [ideas, outcomes] = await Promise.all([
    readReactionIdeas(platform).catch(() => []),
    readOutcomes(platform).catch(() => []),
  ]);
  const byId = new Map(ideas.map((idea) => [idea.id, idea]));
  const measured = outcomes
    .filter((row) => row.excludedReason == null && byId.has(row.suggestionId))
    .map((row) => ({
      reaction: byId.get(row.suggestionId)!.reaction,
      vsMedian: row.vsMedian,
      saveRatePct: row.saveRatePct,
      shareRatePct: row.shareRatePct,
    }));
  return reactionLearning(measured, ideas.length);
}

// ---------------------------------------------------------------------------
// E.5 v2 — clips worth reacting to, found from posts the sync already stores
// ---------------------------------------------------------------------------

export interface ReactableClip {
  postId: string;
  /** The real permalink — the source the script will credit. */
  url: string;
  handle: string;
  hook: string;
  caption: string;
  views: number;
  /** Views as a multiple of that creator's own median. */
  vsCreatorMedian: number;
  ageDays: number;
  claim: ClaimRead;
  lane: string | null;
  /** Why it is on the list, in words the team can disagree with. */
  reason: string;
  score: number;
}

/** Paid partnerships and ads, by the markers creators are required to use. */
const SPONSORED =
  /(#ad\b|#ads\b|#sponsored|#paidpartnership|paid partnership|#collab\b|\bsponsored\b)/i;

/** A claim this strong qualifies on its own; below it, the clip needs a lane. */
const STRONG_CLAIM = 1;

/**
 * Reels from tracked creators that pass the spec's four tests, best first.
 *
 * Costs nothing: every post here was fetched by the ordinary sync. Reels only,
 * because the format borrows a moving clip. Memes and hashtag soup are
 * dropped by the same gate the trend catcher uses; clips already in the
 * library are dropped so the list only ever shows new candidates.
 */
export async function reactableClips(platform: PlatformId, limit = 12): Promise<ReactableClip[]> {
  const [competitors, sources, calendar, saved] = await Promise.all([
    competitorSnapshots(platform).catch(() => []),
    trendSourceSnapshots(platform).catch(() => []),
    readCalendarEntries(platform).catch(() => []),
    readReactionSources(platform).catch(() => []),
  ]);
  const vocabulary = calendar.length >= 20 ? buildLaneVocabulary(calendar) : null;
  const already = new Set(saved.map((source) => source.sourceUrl));
  const now = Date.now();
  const found: ReactableClip[] = [];

  for (const rival of [...competitors, ...sources]) {
    const posts = await readPosts(platform, rival.handle, 200).catch(() => []);
    const baseline = median(posts.map((post) => viewsOf(post)));
    if (posts.length < MIN_POSTS_FOR_MEDIAN || !baseline) continue;

    for (const post of posts) {
      if (post.format !== "reel" && post.format !== "video") continue;
      if (!post.url) continue;
      const link = normalizeSourceUrl(post.url);
      if (!link.ok || already.has(link.url)) continue;

      const views = viewsOf(post);
      const ageDays = (now - new Date(post.publishedAt).getTime()) / 86_400_000;
      if (!views || ageDays < 0 || ageDays > TREND_WINDOW_DAYS) continue;
      const multiple = views / baseline;
      if (multiple < BREAKOUT_MULTIPLE) continue;

      const caption = post.caption.trim();
      if (offVoiceReason(caption)) continue;
      // Someone else's paid ad. A professional reacting to a sponsored post
      // reads as either an attack on the brand or an unpaid endorsement of it.
      if (SPONSORED.test(caption)) continue;

      // Test 2 — something an expert can correct or deepen.
      const claim = readClaim(caption);
      if (!claim.score) continue;

      // Tests 1 and 4 — adjacent, and redirectable. Usually a ranking signal:
      // the spec's own reel 2 was about ageing, not sleep, and still
      // redirected cleanly. But a WEAK claim — a lone figure, a lone question,
      // a bare announcement — only qualifies when there is a lane to land it
      // in. Measured, "The Most Private Religion!" got through on the words
      // "2 million" alone, with nowhere for the expert to take it.
      const fit = vocabulary ? laneFit(caption, vocabulary, LANE_FIT_THRESHOLD) : null;
      const lane = fit?.lane ?? null;
      if (claim.score < STRONG_CLAIM && !lane) continue;

      found.push({
        postId: post.postId,
        url: link.url,
        handle: rival.handle,
        hook: caption.split(/(?<=[.!?])\s/)[0]?.slice(0, 160) ?? caption.slice(0, 160),
        caption,
        views,
        vsCreatorMedian: Number(multiple.toFixed(1)),
        ageDays: Math.round(ageDays),
        claim,
        lane,
        reason:
          `${multiple.toFixed(1)}× @${rival.handle}'s median · ${claim.kinds.map((kind) => CLAIM_LABEL[kind]).join(", ")}` +
          (lane ? ` · redirects into ${lane}` : " · no clear lane — judge the redirect yourself"),
        score: Number(
          (
            trendScore(multiple, ageDays) *
            claim.score *
            (1 + Math.min(fit?.score ?? 0, 1))
          ).toFixed(3),
        ),
      });
    }
  }

  return found.sort((a, b) => b.score - a.score).slice(0, limit);
}
