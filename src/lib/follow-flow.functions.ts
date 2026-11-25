// Followed and unfollowed on Instagram for the period on the page. Free:
// Instagram's own API (server/graph/follows.ts).
//
// Pritesh's alone. It reads the one Meta Graph connection there is, his, so a
// client chosen in the sidebar gets nothing rather than his figures under its
// name (24 Nov 2026: Tim Hortons showed his "+162 followed, -244 unfollowed").
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { clientScope } from "@/lib/client-scope";
import { requireStaff } from "@/lib/require-staff";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const getFollowFlow = createServerFn({ method: "GET" })
  .middleware([requireStaff, clientScope])
  .validator((input: unknown) => z.object({ start: day.nullable(), end: day }).parse(input))
  .handler(async ({ data }) => {
    const { activeClient } = await import("@/server/clients/context");
    if (activeClient()) return null;
    const { fetchFollowFlow } = await import("@/server/graph/follows");
    return fetchFollowFlow(data);
  });

export const followFlowQueryOptions = (period: { start: string | null; end: string }) => ({
  queryKey: ["instagram-follow-flow", period.start, period.end] as const,
  queryFn: () => getFollowFlow({ data: period }),
  // Instagram fills a day in a day or two later; an hour is fresh enough.
  staleTime: 60 * 60 * 1000,
});
