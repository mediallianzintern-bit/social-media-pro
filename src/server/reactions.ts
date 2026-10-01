// Addendum E — reaction sources and their learning, server side.
//
// Saving a clip is where the source link is made trustworthy: it is
// normalised, its platform identified, its credit defaulted from the handle
// the team confirmed, and its rights status started at "needs review". No
// model is involved anywhere in this file.
import {
  readOutcomes,
  readReactionIdeas,
  readReactionSources,
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
