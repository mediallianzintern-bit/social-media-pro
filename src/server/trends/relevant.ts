// Addendum C.3/C.4 — which of the stored trends reach THIS client's team.
//
// The listener accumulates trends per niche; this is the per-client half. Two
// clients in the same niche, with different lanes and different goals, see
// different subsets of the same signals — which is the difference between a
// useful strip and a generic feed nobody reads.
import { currentNiche } from "../predict";
import { readClient, readPosts, readTrendSignals } from "../store";
import { OWNER_ACCOUNTS } from "../apify/accounts";
import { relevantTrends, type Relevance, type TrendSignal } from "@/lib/trends";
import { lanePerformance, type PlatformId } from "@/lib/analytics-types";

export interface SurfacedTrend {
  signal: TrendSignal;
  relevance: Relevance;
}

/**
 * The trends worth putting in front of this client's team, best first.
 *
 * Returns an empty list rather than throwing when the listener has never run —
 * "no trends yet" is a normal state, and the strip simply does not render.
 */
export async function trendsForClient(platform: PlatformId, limit = 5): Promise<SurfacedTrend[]> {
  try {
    const niche = await currentNiche(platform);
    const [signals, posts, client] = await Promise.all([
      readTrendSignals(niche).catch(() => []),
      readPosts(platform, OWNER_ACCOUNTS[platform].handle).catch(() => []),
      readClient().catch(() => null),
    ]);
    if (!signals.length) return [];

    return relevantTrends(signals, lanePerformance(posts), client?.growthGoal ?? null, limit);
  } catch (error) {
    console.error(`[trends:${platform}] surfacing failed:`, error);
    return [];
  }
}

/**
 * C.5 — is this trend strong enough to auto-draft an idea from?
 *
 * A higher bar than merely surfacing it. A trend the team can glance at costs
 * them a second; a trend promoted into a drafted idea costs a model call and
 * takes a slot in the creator's queue, so it has to have earned more:
 * relevant, genuinely rising, and no longer directional.
 */
export const AUTO_DRAFT_RELEVANCE = 70;

export function qualifiesForAutoDraft(entry: SurfacedTrend): boolean {
  return (
    entry.relevance.score >= AUTO_DRAFT_RELEVANCE &&
    entry.signal.momentum === "rising" &&
    !entry.signal.directional
  );
}
