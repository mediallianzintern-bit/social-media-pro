// How the team stands on each watched creator (AI tool workflows, phase 4),
// learned from the ticks and crosses on that creator's reels in the lane.
//
// Two uses, deliberately different in strength:
//   standing  a score per creator, shown on Data sources. NOT used to order the
//             lane (27 Oct 2026): like outlet trust (lib/source-trust.ts) it
//             keeps learning in the background until the team says to switch
//             it on, so a handful of early votes cannot reshuffle the lane.
//   drop      a found creator whose last DROP_WINDOW reels hold DROP_CROSSES
//             crosses is clearly unwanted and is retired on the next sync.
//             Reference creators are never dropped: they are the team's choice.
//
// Learned in code from counts, like the outlet model: every standing reads back
// as the numbers that produced it. Older votes count for less in the score
// (the same half-life as votes); the drop rule counts plain crosses.
//
// Client-safe.
import { HALF_LIFE_DAYS } from "@/lib/preferences";
import {
  AVOIDED_MIN_CROSSES,
  AVOIDED_SCORE,
  OUTLET_PRIOR,
  TRUSTED_MIN_BACKING,
  TRUSTED_SCORE,
} from "@/lib/source-trust";

/** A found creator is dropped when DROP_CROSSES of their last DROP_WINDOW reels are crossed. */
export const DROP_WINDOW = 15;
export const DROP_CROSSES = 10;

export interface CreatorReelVote {
  handle: string;
  reelId: string;
  /** When the creator posted it: "last 15 reels" means the 15 most recently posted. */
  postedAt: string | null;
  verdict: "like" | "dislike" | null;
  votedAt: string | null;
}

export type CreatorStandingKind = "backed" | "crossed" | "untested";

export interface CreatorStanding {
  handle: string;
  /** Reels of theirs the lane has shown. */
  reels: number;
  ticks: number;
  crosses: number;
  /** Crosses among their last DROP_WINDOW reels, the count the drop rule reads. */
  recentCrosses: number;
  recentReels: number;
  /** -1 to 1, smoothed like outlet trust: (ticks - crosses) / (ticks + crosses + prior). */
  score: number;
  standing: CreatorStandingKind;
  /** Meets the drop rule. Applied to found creators only. */
  drop: boolean;
}

function decay(at: string | null, now: number): number {
  const time = at ? new Date(at).getTime() : NaN;
  if (!Number.isFinite(time)) return 1;
  return 0.5 ** (Math.max(0, (now - time) / 86_400_000) / HALF_LIFE_DAYS);
}

/** Creator handles as stored on reels ("@mavgpt") and in watched_creators ("mavgpt") match. */
export function creatorKey(handle: string): string {
  return handle.replace(/^@/, "").trim().toLowerCase();
}

export function buildCreatorStandings(
  reels: CreatorReelVote[],
  now = Date.now(),
): Map<string, CreatorStanding> {
  const byCreator = new Map<string, CreatorReelVote[]>();
  for (const reel of reels) {
    const key = creatorKey(reel.handle);
    byCreator.set(key, [...(byCreator.get(key) ?? []), reel]);
  }

  const standings = new Map<string, CreatorStanding>();
  for (const [handle, own] of byCreator) {
    let pro = 0;
    let con = 0;
    for (const reel of own) {
      if (reel.verdict === "like") pro += decay(reel.votedAt, now);
      else if (reel.verdict === "dislike") con += decay(reel.votedAt, now);
    }
    const ticks = own.filter((reel) => reel.verdict === "like").length;
    const crosses = own.filter((reel) => reel.verdict === "dislike").length;
    const recent = [...own]
      .sort((a, b) => (Date.parse(b.postedAt ?? "") || 0) - (Date.parse(a.postedAt ?? "") || 0))
      .slice(0, DROP_WINDOW);
    const recentCrosses = recent.filter((reel) => reel.verdict === "dislike").length;
    const score = (pro - con) / (pro + con + OUTLET_PRIOR);
    const standing: CreatorStandingKind =
      score >= TRUSTED_SCORE && ticks >= TRUSTED_MIN_BACKING
        ? "backed"
        : score <= AVOIDED_SCORE && crosses >= AVOIDED_MIN_CROSSES
          ? "crossed"
          : "untested";
    standings.set(handle, {
      handle,
      reels: own.length,
      ticks,
      crosses,
      recentCrosses,
      recentReels: recent.length,
      score: Number(score.toFixed(3)),
      standing,
      drop: recentCrosses >= DROP_CROSSES,
    });
  }
  return standings;
}

/** Why a creator was dropped, in words, for retired_reason. */
export function dropReason(standing: CreatorStanding): string {
  return `crossed ${standing.recentCrosses} of their last ${standing.recentReels} reels`;
}
