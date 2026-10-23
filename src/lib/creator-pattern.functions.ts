import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { CreatorPattern } from "@/lib/creator-pattern";
import { requireStaff } from "@/lib/require-staff";

const platformInput = z.enum(["instagram", "linkedin"]);

export interface CreatorLanePattern {
  lane: string;
  creators: Array<{ handle: string; role: "reference" | "found" }>;
  pattern: CreatorPattern | null;
}

/** Every creator-fed lane with its watched creators and learned pattern. Free: stored rows. */
export const getCreatorPatterns = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .validator((input: unknown) => platformInput.parse(input))
  .handler(async ({ data: platform }): Promise<CreatorLanePattern[]> => {
    const [{ readWatchedCreators }, { readPattern }] = await Promise.all([
      import("@/server/creators"),
      import("@/server/creator-pattern"),
    ]);
    const creators = await readWatchedCreators(platform);
    const lanes = [...new Set(creators.map((creator) => creator.lane))];
    return Promise.all(
      lanes.map(async (lane) => ({
        lane,
        creators: creators
          .filter((creator) => creator.lane === lane)
          .map(({ handle, role }) => ({ handle, role })),
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

export const creatorPatternsQueryOptions = (platform: "instagram" | "linkedin") => ({
  queryKey: ["creator-patterns", platform] as const,
  queryFn: () => getCreatorPatterns({ data: platform }),
  staleTime: 60 * 1000,
});
