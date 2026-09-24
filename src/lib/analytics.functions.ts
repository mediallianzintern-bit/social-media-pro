import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { AiAnalysis } from "@/lib/ai-types";
import type { DashboardData, PlatformId, SyncResult } from "@/lib/analytics-types";
import type { ClientReport } from "@/lib/report-types";
import type { Role } from "@/lib/roles";
import type { Workspace } from "@/lib/workspace-types";

const platformSchema = z.enum(["instagram", "linkedin"]);

/**
 * Read path. Server-only modules are imported inside the handler so Apify and
 * Supabase credentials never reach the client bundle.
 */
export const getDashboard = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardData> => {
    const { loadDashboard } = await import("@/server/dashboard");
    return loadDashboard();
  },
);

/** Write path: scrape now, store the snapshot, and report what happened. */
export const syncNow = createServerFn({ method: "POST" }).handler(async (): Promise<SyncResult> => {
  const { runSync } = await import("@/server/sync");
  return runSync("manual");
});

export const dashboardQueryOptions = {
  queryKey: ["dashboard"] as const,
  queryFn: () => getDashboard(),
  // The data is only as fresh as the last sync, so there is nothing to gain
  // from refetching more often than the sync cadence.
  staleTime: 60 * 1000,
};

/** Cached AI analysis for one platform. Returns null when none has been generated. */
export const getAnalysis = createServerFn({ method: "GET" })
  .validator((input: unknown) => platformSchema.parse(input))
  .handler(async ({ data }): Promise<AiAnalysis | null> => {
    const { loadAnalysis } = await import("@/server/ai/index");
    return loadAnalysis(data);
  });

const analysisInputSchema = z.object({
  platform: platformSchema,
  /** Refresh the competitor set even if one already exists. */
  rediscover: z.boolean().default(false),
});

/** Runs the model and caches the result. Explicit — never fires on page load. */
export const generateAnalysis = createServerFn({ method: "POST" })
  .validator((input: unknown) => analysisInputSchema.parse(input))
  .handler(async ({ data }): Promise<AiAnalysis> => {
    const { runAnalysis } = await import("@/server/ai/index");
    return runAnalysis(data.platform, { rediscover: data.rediscover });
  });

export function analysisQueryOptions(platform: z.infer<typeof platformSchema>) {
  return {
    queryKey: ["analysis", platform] as const,
    queryFn: () => getAnalysis({ data: platform }),
    staleTime: 5 * 60 * 1000,
  };
}

const markUsedInputSchema = z.object({
  ideaId: z.string(),
  /** The full URL a creator pastes — extraction happens server-side. */
  permalink: z.string().min(1),
});

/**
 * Links a suggested idea to the real post made from it.
 *
 * The permalink is parsed server-side with the same shortcodeOf() the Graph
 * adapter uses, so this can never disagree with the sync pipeline about what
 * identifies a post. Rejects up front rather than silently storing a permalink
 * that failed to yield one — a broken link here is worse than no link, because
 * it would look connected without ever being usable by the rollup.
 */
export const markIdeaUsed = createServerFn({ method: "POST" })
  .validator((input: unknown) => markUsedInputSchema.parse(input))
  .handler(async ({ data }): Promise<{ shortcode: string }> => {
    const { parsePostLink } = await import("@/server/post-link");
    const { markIdeaUsed: persistUsed } = await import("@/server/store");

    const link = parsePostLink(data.permalink);
    if (!link) {
      throw new Error(
        "That doesn't look like an Instagram or LinkedIn post link — couldn't find a post id in it.",
      );
    }
    await persistUsed(data.ideaId, link.value);
    return { shortcode: link.value };
  });

const dismissInputSchema = z.object({ ideaId: z.string() });

export const dismissIdea = createServerFn({ method: "POST" })
  .validator((input: unknown) => dismissInputSchema.parse(input))
  .handler(async ({ data }): Promise<void> => {
    const { markIdeaDismissed } = await import("@/server/store");
    await markIdeaDismissed(data.ideaId);
  });

/**
 * The client report. Read-only by construction: it never syncs, so a shared
 * link cannot spend Apify credit however often it is opened.
 */
export const getReport = createServerFn({ method: "GET" }).handler(
  async (): Promise<ClientReport> => {
    const { loadReport } = await import("@/server/report");
    return loadReport();
  },
);

export const reportQueryOptions = {
  queryKey: ["report"] as const,
  queryFn: () => getReport(),
  staleTime: 5 * 60 * 1000,
};

// ---------------------------------------------------------------------------
// Addendum B — the role workspace
// ---------------------------------------------------------------------------

const roleSchema = z.enum(["growth_manager", "creator", "editor", "team_manager"]);

/** Everything a role's landing view needs: its queue, and its "for you today". */
export const getWorkspace = createServerFn({ method: "GET" })
  .validator((input: unknown) => roleSchema.parse(input))
  .handler(async ({ data }): Promise<Workspace> => {
    const { loadWorkspace } = await import("@/server/workspace");
    return loadWorkspace(data);
  });

/**
 * Advances one suggestion through the lifecycle.
 *
 * The role is validated against the transition table on the SERVER, not merely
 * hidden on the client. A queue view that omits a button is a convenience; this
 * is the enforcement.
 */
export const advanceIdea = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().min(1),
        from: z.string().min(1),
        to: z.string().min(1),
        role: roleSchema,
        actorId: z.string().optional(),
        shortcode: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string }> => {
    const { advance } = await import("@/server/workspace");
    return advance(data);
  });

export const workspaceQueryOptions = (role: Role) => ({
  queryKey: ["workspace", role] as const,
  queryFn: () => getWorkspace({ data: role }),
  staleTime: 30 * 1000,
});

/** C.4 — rising, relevant trends for this account. Empty until the listener runs. */
export const getTrends = createServerFn({ method: "GET" })
  .validator((input: unknown) => platformSchema.parse(input))
  .handler(async ({ data }) => {
    const { trendsForClient } = await import("@/server/trends/relevant");
    return trendsForClient(data);
  });

export const trendsQueryOptions = (platform: PlatformId) => ({
  queryKey: ["trends", platform] as const,
  queryFn: () => getTrends({ data: platform }),
  // Trends move over days; the listener writes at most daily.
  staleTime: 30 * 60 * 1000,
});

/**
 * C.1 — runs one listening pass.
 *
 * Deliberately a POST behind an explicit action rather than something a page
 * load can reach: this is the one path in the system that scrapes on demand
 * outside a sync, so it must always be a person choosing to spend.
 */
export const runTrendListener = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ platform: platformSchema, force: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { listenForTrends } = await import("@/server/trends/listen");
    return listenForTrends(data.platform, { force: data.force ?? false });
  });

/** Whether the feeds are configured, so the UI can say what is missing. */
export const getListenerStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { listenerStatus } = await import("@/server/trends/listen");
  return listenerStatus();
});

export const listenerStatusQueryOptions = {
  queryKey: ["listener-status"] as const,
  queryFn: () => getListenerStatus(),
  staleTime: 5 * 60 * 1000,
};

// ---------------------------------------------------------------------------
// Real sources, the topic inbox, and one-idea generation
// ---------------------------------------------------------------------------

/** Fresh stories for this platform's lanes. Read-only: never fetches, never spends. */
export const getTopicInbox = createServerFn({ method: "GET" })
  .validator((input: unknown) => platformSchema.parse(input))
  .handler(async ({ data }) => {
    const { topicInbox } = await import("@/server/sources");
    return topicInbox(data);
  });

export const topicInboxQueryOptions = (platform: PlatformId) => ({
  queryKey: ["topic-inbox", platform] as const,
  queryFn: () => getTopicInbox({ data: platform }),
  staleTime: 10 * 60 * 1000,
});

/**
 * Fetches fresh stories now. Free — a public news feed — so it needs no
 * spending decision; `force` skips the few-hours floor for an explicit click.
 */
export const refreshTopics = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ platform: platformSchema, force: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { refreshSources } = await import("@/server/sources");
    return refreshSources(data.platform, { force: data.force ?? false });
  });

/**
 * One new idea — for a clicked topic, or the next best one.
 *
 * This IS a model call, and it only ever runs from an explicit button. Nothing
 * reaches it on page load, on sync, or when an idea is marked filmed.
 */
export const generateOneIdea = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ platform: platformSchema, sourceId: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { generateMore } = await import("@/server/ai/index");
    return generateMore(data.platform, data.sourceId ? { sourceId: data.sourceId } : {});
  });
