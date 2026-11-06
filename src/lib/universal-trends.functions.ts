// The Trends page's server calls (server/trends/universal.ts). Every server
// function passes the staff check registered in src/start.ts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { TrendsView } from "@/lib/universal-trends";

const platformSchema = z.enum(["instagram", "linkedin"]);

/** The stored trends and each platform's lanes. Read only, free. */
export const getUniversalTrends = createServerFn({ method: "GET" }).handler(
  async (): Promise<TrendsView> => {
    const { readUniversalTrends } = await import("@/server/trends/universal");
    return readUniversalTrends();
  },
);

export const universalTrendsQueryOptions = {
  queryKey: ["universal-trends"] as const,
  queryFn: () => getUniversalTrends(),
  staleTime: 5 * 60 * 1000,
};

/** Searches every category now. Free: a public news feed, no model call. */
export const fetchTrendsNow = createServerFn({ method: "POST" }).handler(async () => {
  const { fetchUniversalTrends } = await import("@/server/trends/universal");
  return fetchUniversalTrends();
});

/**
 * Adds one trend to a platform's topics in a lane, and with `write` also
 * writes its post or script there. Writing IS a model call, and only ever
 * runs from the "Add and write" button.
 */
export const addTrend = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        trendId: z.string().uuid(),
        platform: platformSchema,
        lane: z.string().min(1).max(120),
        write: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { addTrendToPlatform } = await import("@/server/trends/universal");
    const { sourceId } = await addTrendToPlatform(data.trendId, data.platform, data.lane);
    if (!data.write) return { sourceId, idea: null, reason: null };
    const { generateMore } = await import("@/server/ai/index");
    const result = await generateMore(data.platform, { sourceId });
    return { sourceId, idea: result.idea ?? null, reason: result.reason ?? null };
  });
