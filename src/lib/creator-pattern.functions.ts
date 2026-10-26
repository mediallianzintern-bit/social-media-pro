import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { CreatorPattern } from "@/lib/creator-pattern";
import { requireStaff } from "@/lib/require-staff";

const platformInput = z.enum(["instagram", "linkedin"]);

export interface CreatorLanePattern {
  lane: string;
  creators: Array<{
    handle: string;
    role: "reference" | "found";
    active: boolean;
    fit: number | null;
    foundBy: string | null;
    retiredReason: string | null;
  }>;
  pattern: CreatorPattern | null;
}

export interface CreatorFinderStatus {
  /** Monthly cap in dollars; 0 means the search is off. */
  budgetUsd: number;
  spentUsd: number;
  runs: Array<{
    lane: string;
    ranAt: string;
    terms: string[];
    candidates: number;
    checked: number;
    added: number;
    costUsd: number;
    note: string | null;
  }>;
}

/** Every creator-fed lane with its watched creators and learned pattern. Free: stored rows. */
export const getCreatorPatterns = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .validator((input: unknown) => platformInput.parse(input))
  .handler(async ({ data: platform }): Promise<CreatorLanePattern[]> => {
    const [{ readAllWatchedCreators }, { readPattern }] = await Promise.all([
      import("@/server/creators"),
      import("@/server/creator-pattern"),
    ]);
    const creators = await readAllWatchedCreators(platform);
    const lanes = [...new Set(creators.map((creator) => creator.lane))];
    return Promise.all(
      lanes.map(async (lane) => ({
        lane,
        creators: creators
          .filter((creator) => creator.lane === lane)
          .map(({ handle, role, active, fit, foundBy, retiredReason }) => ({
            handle,
            role,
            active,
            fit,
            foundBy,
            retiredReason,
          })),
        pattern: await readPattern(platform, lane),
      })),
    );
  });

/**
 * Relearns every creator-fed lane's pattern from the creators' latest posts,
 * then re-reads the creators with it. Free: Instagram's own API and stored rows.
 */
export const rebuildCreatorPatterns = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator((input: unknown) => platformInput.parse(input))
  .handler(async ({ data: platform }) => {
    const { watchCreators } = await import("@/server/creators");
    return watchCreators(platform, { rebuildPattern: true });
  });

/** The creator search's budget, this month's spend and its recent runs. Free. */
export const getCreatorFinderStatus = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .validator((input: unknown) => platformInput.parse(input))
  .handler(async ({ data: platform }): Promise<CreatorFinderStatus> => {
    const { monthlyBudgetUsd, readSearchRuns, spentThisMonth } =
      await import("@/server/creator-finder");
    const [spentUsd, runs] = await Promise.all([
      spentThisMonth(platform),
      readSearchRuns(platform, 10),
    ]);
    return { budgetUsd: monthlyBudgetUsd(), spentUsd, runs };
  });

/**
 * Searches for new creators now instead of waiting for the weekly run. Paid
 * (about $0.20), and still refused when it would pass the monthly cap.
 */
export const findCreatorsNow = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator((input: unknown) => platformInput.parse(input))
  .handler(async ({ data: platform }) => {
    const { findCreators } = await import("@/server/creator-finder");
    return findCreators(platform, { force: true });
  });

export const creatorFinderQueryOptions = (platform: "instagram" | "linkedin") => ({
  queryKey: ["creator-finder", platform] as const,
  queryFn: () => getCreatorFinderStatus({ data: platform }),
  staleTime: 60 * 1000,
});

export const creatorPatternsQueryOptions = (platform: "instagram" | "linkedin") => ({
  queryKey: ["creator-patterns", platform] as const,
  queryFn: () => getCreatorPatterns({ data: platform }),
  staleTime: 60 * 1000,
});
