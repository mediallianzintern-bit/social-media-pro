import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireStaff } from "@/lib/require-staff";

import type { AiAnalysis } from "@/lib/ai-types";
import type { DashboardData, PlatformId, SyncResult } from "@/lib/analytics-types";
import type { ReportPeriod } from "@/lib/report-types";
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
/**
 * "manual" is a person pressing Sync; "schedule" is the dashboard syncing by
 * itself. They were indistinguishable here — auto-sync sent "manual" — which
 * meant the server could not apply a cheaper cadence to an unattended pass, and
 * every page load on stale data bought every platform.
 */
const syncInputSchema = z.object({
  trigger: z.enum(["manual", "schedule"]).default("manual"),
  /** Narrow the sync to these platforms. Omitted means all of them. */
  platforms: z.array(platformSchema).optional(),
});

export const syncNow = createServerFn({ method: "POST" })
  .validator((input: unknown) => syncInputSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<SyncResult> => {
    const { runSync } = await import("@/server/sync");
    return runSync(data.trigger, data.platforms ? { platforms: data.platforms } : {});
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

/**
 * T63 — records which of an idea's hooks is being filmed.
 *
 * The hook must be one the idea actually offers; the store checks that against
 * the stored idea rather than trusting the request, so this cannot be used to
 * write arbitrary text onto a row. Passing null returns the idea to its own
 * first hook.
 */
export const chooseHook = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ ideaId: z.string().min(1), hook: z.string().nullable() }).parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string }> => {
    const { setChosenHook } = await import("@/server/store");
    const ok = await setChosenHook(data.ideaId, data.hook);
    return ok
      ? { ok }
      : {
          ok: false,
          reason: "That hook could not be saved — reload the ideas and try again.",
        };
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
export const getReport = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.enum(["30d", "90d", "all"]).catch("30d").parse(input))
  .handler(async ({ data }): Promise<ClientReport> => {
    const { loadReport } = await import("@/server/report");
    return loadReport(data);
  });

/** One cache entry per period, so switching back and forth is instant. */
export const reportQueryOptions = (period: ReportPeriod = "30d") => ({
  queryKey: ["report", period] as const,
  queryFn: () => getReport({ data: period }),
  staleTime: 5 * 60 * 1000,
});

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
  .middleware([requireStaff])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().min(1),
        from: z.string().min(1),
        to: z.string().min(1),
        role: roleSchema,
        shortcode: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; reason?: string }> => {
    const { advance } = await import("@/server/workspace");
    // The actor comes from the verified session, never the request. This
    // function used to accept an actorId from the browser, and advance() reads
    // that id to decide which roles the person holds — so a request could
    // simply name someone else's user and act with their permissions.
    return advance({ ...data, staffEmail: context.staffEmail });
  });

/** Who can be handed an idea: everyone who has acted in the workspace. */
export const getTeam = createServerFn({ method: "GET" }).handler(async () => {
  const { readUsers } = await import("@/server/store");
  const users = await readUsers().catch(() => []);
  return users.map((user) => ({ id: user.id, name: user.name, role: user.role }));
});

export const teamQueryOptions = {
  queryKey: ["team"] as const,
  queryFn: () => getTeam(),
  staleTime: 60 * 1000,
};

/**
 * Hands an idea to a person, or clears who has it.
 *
 * Limited to the growth manager and team manager lenses, matching B.8.1:
 * deciding who makes what is a planning decision. As with every workspace
 * move, the lens is a claim until T46 ties people to roles — the session is
 * verified, the role is not yet.
 */
export const assignIdeaTo = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().min(1),
        userId: z.string().uuid().nullable(),
        role: roleSchema,
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string }> => {
    if (data.role !== "growth_manager" && data.role !== "team_manager") {
      return { ok: false, reason: "Only a growth manager or team manager assigns ideas." };
    }
    const { assignIdea } = await import("@/server/store");
    const ok = await assignIdea(data.id, data.userId);
    return ok ? { ok } : { ok: false, reason: "That idea no longer exists." };
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
 * Gives this account its content lanes, from the posts already stored.
 *
 * A model call, so it only ever runs from an explicit button. It exists because
 * three panels need lanes — the lane scorecard, the news topics and the trend
 * catcher — and until now the only thing that created them was a full analysis
 * run on a different panel.
 */
export const deriveLanes = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ platform: platformSchema, rebuild: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { deriveLanesForOwner } = await import("@/server/ai/lanes");
    return deriveLanesForOwner(data.platform, { rebuild: data.rebuild === true });
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

/**
 * A fresh set of three for "Next reel to make", replacing the current list.
 *
 * One model call, explicit button only — the strategist on the cached reads,
 * with the latest stories. Cheaper than Regenerate, which re-runs the three
 * read agents first. Never fired automatically.
 */
export const refreshIdeas = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ platform: platformSchema }).parse(input))
  .handler(async ({ data }) => {
    const { generateMore } = await import("@/server/ai/index");
    return generateMore(data.platform, { fresh: true });
  });

// ---------------------------------------------------------------------------
// What is working on Instagram right now, in this account's niche
// ---------------------------------------------------------------------------

/**
 * Breakout posts across the tracked competitors, gated and ranked.
 *
 * Read-only and free: it scores posts the sync already collected, so opening
 * this never scrapes and never calls a model.
 */
export const getInstagramTrends = createServerFn({ method: "GET" })
  .validator((input: unknown) => platformSchema.parse(input))
  .handler(async ({ data }) => {
    const { instagramTrends } = await import("@/server/trends/instagram");
    return instagramTrends(data);
  });

export const instagramTrendsQueryOptions = (platform: PlatformId) => ({
  queryKey: ["instagram-trends", platform] as const,
  queryFn: () => getInstagramTrends({ data: platform }),
  // Recomputed from stored posts, so it only changes when a sync brings new
  // ones in.
  staleTime: 15 * 60 * 1000,
});

/** Mirrors EraDetection in lib/eras.ts; validated because it is persisted. */
const eraDetectionSchema = z.object({
  score: z.number(),
  reason: z.string(),
  evidence: z.object({
    cadence: z.tuple([z.number(), z.number()]),
    formatShift: z.number(),
    laneShift: z.number(),
    cadenceShift: z.number(),
    from: z.object({ format: z.string(), lane: z.string().nullable() }),
    to: z.object({ format: z.string(), lane: z.string().nullable() }),
  }),
});

/**
 * Addendum D — this account's eras, plus any the detector proposes.
 *
 * Proposals are computed on every read rather than stored: they are cheap
 * arithmetic over posts already in memory, and a stored proposal would go
 * stale the moment new posts arrive. Only a CONFIRMED era is written.
 */
export const getEras = createServerFn({ method: "GET" })
  .validator((input: unknown) => platformSchema.parse(input))
  .handler(async ({ data }) => {
    const [{ readEras, readPosts }, { detectEras }, { OWNER_ACCOUNTS }] = await Promise.all([
      import("@/server/store"),
      import("@/lib/eras"),
      import("@/server/apify/accounts"),
    ]);
    const handle = OWNER_ACCOUNTS[data].handle;
    const [eras, posts] = await Promise.all([
      readEras(data, handle).catch(() => []),
      readPosts(data, handle, 1000).catch(() => []),
    ]);
    const known = new Set(eras.map((era) => era.startsAt));
    return {
      eras,
      // Anything already confirmed is not proposed again.
      proposed: detectEras(posts).filter((boundary) => !known.has(boundary.startsAt)),
    };
  });

export const confirmEra = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        platform: platformSchema,
        startsAt: z.string().min(4),
        label: z.string().min(1).max(120),
        note: z.string().max(500).optional(),
        origin: z.enum(["manual", "detected"]).optional(),
        detection: eraDetectionSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const [{ saveEra }, { OWNER_ACCOUNTS }] = await Promise.all([
      import("@/server/store"),
      import("@/server/apify/accounts"),
    ]);
    await saveEra({
      platform: data.platform,
      handle: OWNER_ACCOUNTS[data.platform].handle,
      startsAt: data.startsAt,
      label: data.label,
      note: data.note ?? null,
      origin: data.origin ?? "manual",
      detection: data.detection ?? null,
    });
    return { ok: true };
  });

export const removeEra = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ id: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { deleteEra } = await import("@/server/store");
    await deleteEra(data.id);
    return { ok: true };
  });

export const erasQueryOptions = (platform: PlatformId) => ({
  queryKey: ["eras", platform] as const,
  queryFn: () => getEras({ data: platform }),
  staleTime: 60 * 1000,
});

/**
 * T67 — the team's ticks and crosses, plus what the system has learned from
 * them. The vote list lets every row show its own state; the summary is what
 * the "what it has learned" card reads.
 */
export const getTopicFeedback = createServerFn({ method: "GET" })
  .validator((input: unknown) => platformSchema.parse(input))
  .handler(async ({ data }) => {
    const [{ readTopicVotes }, { buildPreferenceModel, learnedSummary }] = await Promise.all([
      import("@/server/store"),
      import("@/lib/preferences"),
    ]);
    const votes = await readTopicVotes(data).catch(() => []);
    return {
      votes: votes.map((vote) => ({ kind: vote.kind, itemId: vote.itemId, verdict: vote.verdict })),
      summary: learnedSummary(buildPreferenceModel(votes)),
    };
  });

/**
 * Casts, changes or clears one vote. `verdict: null` clears it.
 *
 * The voter is taken from the verified session in requireStaff, never from
 * the request: a preference that shapes what the whole team is shown should
 * be traceable to the person who set it, and a name typed into a payload
 * would not be.
 */
export const voteTopic = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator((input: unknown) =>
    z
      .object({
        platform: platformSchema,
        kind: z.enum(["source", "trend", "idea"]),
        itemId: z.string().min(1).max(200),
        verdict: z.enum(["like", "dislike"]).nullable(),
        text: z.string().min(1).max(2000),
        lane: z.string().max(120).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { saveTopicVote } = await import("@/server/store");
    await saveTopicVote({ ...data, actor: context.staffEmail });
    return { ok: true };
  });

export const topicFeedbackQueryOptions = (platform: PlatformId) => ({
  queryKey: ["topic-feedback", platform] as const,
  queryFn: () => getTopicFeedback({ data: platform }),
  staleTime: 30 * 1000,
});

// ---------------------------------------------------------------------------
// Addendum E — the reaction-hook format
// ---------------------------------------------------------------------------

const sourceTypeSchema = z.enum([
  "meme",
  "street_interview",
  "podcast",
  "news",
  "tutorial",
  "movie_tv",
  "other",
]);
const rightsSchema = z.enum(["native_remix", "credited_clip", "needs_review"]);

/** The clip library, the client's reaction settings, and what has been learned. */
export const getReactions = createServerFn({ method: "GET" })
  .validator((input: unknown) => platformSchema.parse(input))
  .handler(async ({ data }) => {
    const [{ readReactionSources, readReactionSettings }, { loadReactionLearning }] =
      await Promise.all([import("@/server/store"), import("@/server/reactions")]);
    const [sources, settings, learning] = await Promise.all([
      readReactionSources(data).catch(() => []),
      readReactionSettings().catch(() => null),
      loadReactionLearning(data).catch(() => null),
    ]);
    return { sources, settings, learning };
  });

export const reactionsQueryOptions = (platform: PlatformId) => ({
  queryKey: ["reactions", platform] as const,
  queryFn: () => getReactions({ data: platform }),
  staleTime: 30 * 1000,
});

/** One clip, read live — the script drawer shows the current credit and rights. */
export const getReactionSource = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.string().uuid().parse(input))
  .handler(async ({ data }) => {
    const { readReactionSource } = await import("@/server/store");
    return readReactionSource(data).catch(() => null);
  });

/**
 * Stores a clip the team chose (v1: pasted link and transcript). Pasting the
 * same link again updates it — which is also how its credit and rights are
 * edited.
 */
export const saveReactionClip = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator((input: unknown) =>
    z
      .object({
        platform: platformSchema,
        sourceUrl: z.string().min(4).max(2000),
        sourceCreatorHandle: z.string().max(100).nullable().optional(),
        sourceType: sourceTypeSchema,
        sourcePublicViews: z.number().nonnegative().nullable().optional(),
        transcript: z.string().max(20_000).nullable().optional(),
        extractedClaim: z.string().max(1_000).nullable().optional(),
        creditText: z.string().max(300).nullable().optional(),
        rightsStatus: rightsSchema.optional(),
        foundBy: z.enum(["team", "trend_listener"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { createReactionSource } = await import("@/server/reactions");
    return createReactionSource(data, context.staffEmail);
  });

export const deleteReactionClip = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator((input: unknown) => z.string().uuid().parse(input))
  .handler(async ({ data }) => {
    const { deleteReactionSource } = await import("@/server/store");
    await deleteReactionSource(data);
    return { ok: true };
  });

/** E.4 — the standard CTA, lead magnet, brand set and owned lane. */
export const saveReactionSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator((input: unknown) =>
    z
      .object({
        standardCta: z.string().max(500).nullable(),
        leadMagnet: z.string().max(300).nullable(),
        brandSetNotes: z.string().max(500).nullable(),
        ownedLaneForRedirect: z.string().max(120).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { saveReactionSettings } = await import("@/server/store");
    const clean = (value: string | null) => (value?.trim() ? value.trim() : null);
    const ok = await saveReactionSettings({
      standardCta: clean(data.standardCta),
      leadMagnet: clean(data.leadMagnet),
      brandSetNotes: clean(data.brandSetNotes),
      ownedLaneForRedirect: clean(data.ownedLaneForRedirect),
    });
    return ok ? { ok } : { ok: false, reason: "Apply migration 0015 to store these settings." };
  });

/**
 * E.6 — writes the reaction script for one clip. One model call, made only
 * from this explicit click.
 */
export const writeReactionScript = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator((input: unknown) => z.string().uuid().parse(input))
  .handler(async ({ data }) => {
    const { generateReaction } = await import("@/server/ai/reaction");
    return generateReaction(data);
  });

/** E.7 — the client has confirmed every [VERIFY] fact in this script. */
export const confirmReactionFactsFn = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator((input: unknown) => z.string().uuid().parse(input))
  .handler(async ({ data, context }) => {
    const { confirmReactionFacts, resolveStaffUser } = await import("@/server/store");
    const userId = await resolveStaffUser(context.staffEmail, "growth_manager").catch(() => null);
    const ok = await confirmReactionFacts(data, userId);
    return ok ? { ok } : { ok: false, reason: "That idea could not be found." };
  });

/** E.5 v2 — clips worth reacting to, from reels the sync already stores. Free. */
export const getReactableClips = createServerFn({ method: "GET" })
  .validator((input: unknown) => platformSchema.parse(input))
  .handler(async ({ data }) => {
    const { reactableClips } = await import("@/server/reactions");
    return reactableClips(data).catch(() => []);
  });

export const reactableQueryOptions = (platform: PlatformId) => ({
  queryKey: ["reactable", platform] as const,
  queryFn: () => getReactableClips({ data: platform }),
  staleTime: 5 * 60 * 1000,
});

/**
 * Clip → stored source → transcript → script, in one click. About three
 * cents: one capped Apify transcript run and one model call.
 */
export const prepareReactionFn = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator((input: unknown) =>
    z
      .object({
        platform: platformSchema,
        url: z.string().url(),
        handle: z.string().min(1).max(100),
        views: z.number().nonnegative().nullable(),
        hook: z.string().max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { prepareReaction } = await import("@/server/reaction-pipeline");
    return prepareReaction(data, context.staffEmail);
  });

/** Fetches what a stored clip says. One capped Apify run, about $0.015. */
export const transcribeReactionClip = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator((input: unknown) => z.string().uuid().parse(input))
  .handler(async ({ data }) => {
    const { transcribeSource } = await import("@/server/reaction-pipeline");
    return transcribeSource(data);
  });

/** A fresh link to the clip's video, once rights are cleared. About $0.003. */
export const reactionSourceFile = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator((input: unknown) => z.string().uuid().parse(input))
  .handler(async ({ data }) => {
    const { sourceVideoFile } = await import("@/server/reaction-pipeline");
    return sourceVideoFile(data);
  });
