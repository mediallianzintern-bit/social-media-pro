import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { LaneReport } from "@/lib/lane-report";
import { requireStaff } from "@/lib/require-staff";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const laneReportInput = z.object({
  platform: z.enum(["instagram", "linkedin"]),
  from: z.string().regex(DAY),
  to: z.string().regex(DAY),
});

export type LaneReportInput = z.infer<typeof laneReportInput>;

/**
 * Every reel in each content lane between two dates, with its metrics.
 *
 * Read-only: the owner's stored posts, the lanes they already carry. No model
 * call and no scrape, so it is safe to open as often as anyone likes.
 */
export const getLaneReport = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .validator((input: unknown) => laneReportInput.parse(input))
  .handler(async ({ data }): Promise<LaneReport & { handle: string; generatedAt: string }> => {
    const [{ readPosts }, { OWNER_ACCOUNTS }, { laneReport }] = await Promise.all([
      import("@/server/store"),
      import("@/server/apify/accounts"),
      import("@/lib/lane-report"),
    ]);
    const handle = OWNER_ACCOUNTS[data.platform].handle;
    // The whole back catalogue: the window may reach past the default page.
    const posts = await readPosts(data.platform, handle, 1000);
    return {
      ...laneReport(posts, data.from, data.to),
      handle,
      generatedAt: new Date().toISOString(),
    };
  });

export const laneReportQueryOptions = (input: LaneReportInput) => ({
  queryKey: ["lane-report", input.platform, input.from, input.to] as const,
  queryFn: () => getLaneReport({ data: input }),
  staleTime: 60 * 1000,
});
