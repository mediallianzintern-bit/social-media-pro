// Followed and unfollowed on Instagram for the period on the page. Free:
// Instagram's own API (server/graph/follows.ts).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireStaff } from "@/lib/require-staff";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const getFollowFlow = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .validator((input: unknown) => z.object({ start: day.nullable(), end: day }).parse(input))
  .handler(async ({ data }) => {
    const { fetchFollowFlow } = await import("@/server/graph/follows");
    return fetchFollowFlow(data);
  });

export const followFlowQueryOptions = (period: { start: string | null; end: string }) => ({
  queryKey: ["instagram-follow-flow", period.start, period.end] as const,
  queryFn: () => getFollowFlow({ data: period }),
  // Instagram fills a day in a day or two later; an hour is fresh enough.
  staleTime: 60 * 60 * 1000,
});
