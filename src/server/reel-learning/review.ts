// Review (paid, from a button, once the reel has run 14 days, or a LinkedIn
// post 7): did it work, and why. A LinkedIn post is judged on LinkedIn's own
// impressions against his typical post (Phase 3, 5 Nov 2026).
//
// "Get results now" runs the same review earlier, as an EARLY CHECK: the reel's
// figures are still growing while the typical reel's are final, so it is marked
// early, never decides worked or not, and is never counted in patterns, rules or
// lessons. The full 14-day review replaces it.
//
// Whether it worked is decided in code, never by the model: its views against
// this account's typical reel over the 90 days before it, the same yardstick
// the rest of the dashboard uses. "The layer that grades the advice must not
// be the layer that gives it" (outcomes.ts). The model only explains, element
// by element, which of the topic, hook, script, caption and hashtags helped or
// hurt, tied to a measured figure, and turns that into lessons the writer
// reads next time. One call, ~1-2¢.
import { z } from "zod";

import { costOf } from "@/lib/ai-cost";
import { engagementsOf, median, viewsOf, type PostRecord } from "@/lib/analytics-types";
import type { ReelLesson, ReelReview } from "@/lib/reel-learning-types";
import { REEL_USAGE_LABEL, reviewDaysFor, VIRAL_RATIO } from "@/lib/reel-learning-types";
import { scriptOf, shortcodeFromUrl } from "@/lib/reel-match";

import { OWNER_ACCOUNTS } from "../apify/accounts";
import { completeJson, hasOpenAi } from "../ai/client";
import { reviewModel } from "../ai/review";
import { fetchSkipRates } from "../graph/instagram";
import { readIdeaById, readPosts } from "../store";
import { readReelLearning, updateReelLearning, type ReelLearningRow } from "./store";

const DAY_MS = 86_400_000;

/**
 * When a reel or post published at `publishedAt` has run long enough to
 * judge: 14 days for a reel, 7 for a LinkedIn post.
 */
export function reviewableAt(
  publishedAt: string,
  platform: "instagram" | "linkedin" = "instagram",
): string {
  return new Date(Date.parse(publishedAt) + reviewDaysFor(platform) * DAY_MS).toISOString();
}

/**
 * A LinkedIn post's figures against his typical post of the same format over
 * the 90 days before it. Impressions, members reached, saves and sends are
 * LinkedIn's own (linkedin-analytics.ts); reactions, comments and reposts come
 * from the sync. Exported for the tests.
 */
export function measurePost(
  post: PostRecord,
  others: PostRecord[],
  stats: Map<string, { impressions: number; membersReached: number; saves: number; sends: number }>,
): ReelReview["metrics"] {
  const engagements = (item: PostRecord) =>
    (item.likes ?? 0) + (item.comments ?? 0) + (item.shares ?? 0);
  const metrics: Metric[] = [
    { label: IMPRESSIONS_LABEL, of: (item) => stats.get(item.postId)?.impressions },
    { label: "Members reached", of: (item) => stats.get(item.postId)?.membersReached },
    { label: ENGAGEMENTS_LABEL, of: engagements },
    {
      label: "Engagement rate (%)",
      of: (item) => {
        const seen = stats.get(item.postId)?.impressions;
        return seen ? Math.round((engagements(item) / seen) * 1000) / 10 : undefined;
      },
    },
    { label: "Reactions", of: (item) => item.likes },
    { label: "Comments", of: (item) => item.comments },
    { label: "Reposts", of: (item) => item.shares },
    { label: "Saves", of: (item) => stats.get(item.postId)?.saves },
    { label: "Sends", of: (item) => stats.get(item.postId)?.sends },
  ];
  const start = Date.parse(post.publishedAt) - 90 * DAY_MS;
  const before = others.filter((item) => {
    const at = Date.parse(item.publishedAt);
    return (
      !item.pinned &&
      item.postId !== post.postId &&
      item.format === post.format &&
      at >= start &&
      at < Date.parse(post.publishedAt)
    );
  });
  return metrics.flatMap((metric) => {
    const value = metric.of(post);
    if (value === undefined) return [];
    const values = before.map(metric.of).filter((entry): entry is number => entry !== undefined);
    const typical = values.length ? median(values) : null;
    return [{ label: metric.label, value, typical, ratio: typical ? value / typical : null }];
  });
}

export const IMPRESSIONS_LABEL = "Impressions";
export const ENGAGEMENTS_LABEL = "Engagements";

type Metric = { label: string; of: (post: PostRecord) => number | undefined };

const METRICS: Metric[] = [
  { label: "Views", of: (post) => viewsOf(post) || undefined },
  { label: "Reach", of: (post) => post.insight?.reach },
  {
    label: "Avg watch (s)",
    of: (post) => (post.insight?.avgWatchMs ? post.insight.avgWatchMs / 1000 : undefined),
  },
  { label: "Interactions", of: (post) => engagementsOf(post) },
  { label: "Saves", of: (post) => post.insight?.saved },
  { label: "Shares", of: (post) => post.shares },
  { label: "Comments", of: (post) => post.comments },
];

/** This reel's figures against the typical reel of the 90 days before it. */
/** The figure Instagram calls reels_skip_rate; lower is better. */
export const SKIP_RATE_LABEL = "Skip rate (%, lower is better)";

function measure(
  reel: PostRecord,
  others: PostRecord[],
  skipRates: Map<string, number>,
): ReelReview["metrics"] {
  const metrics: Metric[] = [
    ...METRICS,
    {
      label: SKIP_RATE_LABEL,
      of: (post) => skipRates.get(shortcodeFromUrl(post.url) ?? post.postId),
    },
  ];
  const start = Date.parse(reel.publishedAt) - 90 * DAY_MS;
  const before = others.filter((post) => {
    const at = Date.parse(post.publishedAt);
    return (
      !post.pinned &&
      post.postId !== reel.postId &&
      at >= start &&
      at < Date.parse(reel.publishedAt)
    );
  });
  return metrics.flatMap((metric) => {
    const value = metric.of(reel);
    if (value === undefined) return [];
    const values = before.map(metric.of).filter((entry): entry is number => entry !== undefined);
    const typical = values.length ? median(values) : null;
    return [{ label: metric.label, value, typical, ratio: typical ? value / typical : null }];
  });
}

const ELEMENTS = ["topic", "hook", "script", "cta", "caption", "hashtags"] as const;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "elements", "lessons", "suggestions"],
  properties: {
    summary: {
      type: "string",
      description: "Two sentences: how the reel did against the typical reel, and the main reason.",
    },
    elements: {
      type: "array",
      description:
        "Exactly one entry for each of topic, hook, script (the main body), cta, caption, hashtags.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["element", "effect", "why"],
        properties: {
          element: { type: "string", enum: ELEMENTS },
          effect: { type: "string", enum: ["helped", "hurt", "unclear"] },
          why: {
            type: "string",
            description: "One sentence that names the measured figure it rests on.",
          },
        },
      },
    },
    lessons: {
      type: "array",
      description: "At most four. Only what the figures actually support.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["element", "kind", "lesson", "evidence"],
        properties: {
          element: { type: "string", enum: ELEMENTS },
          kind: { type: "string", enum: ["repeat", "avoid"] },
          lesson: {
            type: "string",
            description: "An instruction a script writer can follow next time, in one sentence.",
          },
          evidence: {
            type: "string",
            description: "The figure it rests on, e.g. 'avg watch 4.8s vs typical 6.1s'.",
          },
        },
      },
    },
    suggestions: {
      type: "array",
      items: { type: "string" },
      description: "At most four concrete changes that would have made THIS reel stronger.",
    },
  },
} as const;

const parsed = z.object({
  summary: z.string(),
  elements: z.array(
    z.object({
      element: z.enum(ELEMENTS),
      effect: z.enum(["helped", "hurt", "unclear"]),
      why: z.string(),
    }),
  ),
  lessons: z.array(
    z.object({
      element: z.enum(ELEMENTS),
      kind: z.enum(["repeat", "avoid"]),
      lesson: z.string(),
      evidence: z.string(),
    }),
  ),
  suggestions: z.array(z.string()),
});

const SYSTEM = `You review one Instagram reel after it has run for two weeks, for the team that makes
Pritesh Patel's reels, so the next script is better.

How to attribute, from the figures you are given:
- HOOK: shows first in the skip rate (the share of viewers who swiped away in the first seconds;
  LOWER is better, so a skip rate above typical means the opening lost people), then in average
  watch time. A low watch time against the typical reel means people left
  early, which is the opening's job to prevent.
- SCRIPT: shows in average watch time beyond the opening, and in shares and saves: a script worth
  keeping or sending is one that taught something.
- TOPIC: shows in views and reach against the typical reel: whether the story was one this audience
  wanted at all.
- CTA: shows in comments (for a "comment" ask) and in shares and saves (for a save or share
  ask). A follow ask cannot be measured per reel: say "unclear" unless comments clearly respond.
- CAPTION and HASHTAGS: weak signals on Instagram. Say "unclear" unless the figures clearly point
  at them. Never blame hashtags by default.

Rules:
- Whether it worked is already decided by the figures. Do not argue with it.
- One reel is thin evidence. Every lesson names the figure it rests on. Do not invent figures.
- Where the team changed the dashboard's script, say whether the change helped or hurt: that is
  how the writer learns what the team knows that it does not.
- A VIRAL reel (3x the typical views or more) is the most valuable result there is: say exactly
  which parts made it spread (the kind of hook, the shape of the body, the example, the length,
  the ending), as REPEAT lessons a writer can follow.
- Plain words, no hype.`;

const LINKEDIN_SYSTEM = `You review one LinkedIn post by Pritesh Patel after it has run for a week, for the team
that writes his posts with a dashboard, so the next post is better.

How to attribute, from the figures you are given:
- HOOK (the headline and subheadline, all a phone shows before "see more"): shows in impressions
  and members reached against his typical post, because LinkedIn shows a post more widely when
  people stop and expand it, and in the engagement rate.
- SCRIPT (the body): shows in the engagement rate, saves and sends: a body worth keeping or
  sending is one that taught something.
- TOPIC: shows in impressions and reactions: whether the story was one his audience wanted at all.
- CTA (the closing question and the Repost line): shows in comments (for the question) and
  reposts (for the Repost line).
- CAPTION: a LinkedIn post has none; always "unclear". HASHTAGS: a weak signal; "unclear" unless
  the figures clearly point at them.

Rules:
- Whether it worked is already decided by the figures. Do not argue with it.
- One post is thin evidence. Every lesson names the figure it rests on. Do not invent figures.
- Where the team changed the dashboard's post, say whether the change helped or hurt: that is how
  the writer learns what the team knows that it does not.
- A post at 3x his typical impressions or more is the most valuable result there is: say exactly
  which parts made it spread (the kind of opening, the body's shape, the example, the length, the
  ending), as REPEAT lessons a writer can follow.
- Plain words, no hype.`;

/** Runs the review for one filmed idea and stores it. */
export async function reviewFilmedReel(
  ideaId: string,
  options: { early?: boolean } = {},
): Promise<{ row: ReelLearningRow } | { reason: string }> {
  if (!hasOpenAi()) return { reason: "OPENAI_API_KEY is not set." };
  const row = await readReelLearning(ideaId);
  if (!row?.shortcode) return { reason: "The live reel hasn't been found yet." };
  if (!row.comparison)
    return { reason: "Press Analyse first, so the review knows what was changed." };
  const idea = await readIdeaById(ideaId);
  if (!idea) return { reason: "That idea is no longer stored." };

  const linkedin = row.platform === "linkedin";
  const thing = linkedin ? "post" : "reel";
  const days = reviewDaysFor(row.platform);
  const posts = await readPosts(row.platform, OWNER_ACCOUNTS[row.platform].handle, 1000);
  const reel = posts.find((post) => (shortcodeFromUrl(post.url) ?? post.postId) === row.shortcode);
  if (!reel)
    return { reason: `The ${thing} isn't in the synced posts. Press Sync, then try again.` };
  const ready = reviewableAt(reel.publishedAt, row.platform);
  // Once the 14 days are up, every review is the real one, however it was asked for.
  const early = Date.now() < Date.parse(ready);
  if (early && !options.early) {
    return {
      reason: `It has not run a full ${days} days yet. Review it after ${new Date(ready).toDateString()}.`,
    };
  }

  // Skip rate is read live from Instagram for this account's recent reels.
  // Free, and optional: without the Graph token the review runs without it.
  const skipRates =
    row.platform === "instagram"
      ? await fetchSkipRates(100).catch((error: unknown) => {
          console.warn("[reel-learning] skip rate unavailable:", error);
          return new Map<string, number>();
        })
      : new Map<string, number>();
  // LinkedIn: judged on LinkedIn's own impressions, or on engagements when
  // the API has no figures for the post.
  const stats = linkedin
    ? await import("../linkedin-analytics")
        .then(({ readLinkedInAnalytics }) => readLinkedInAnalytics())
        .then((stored) => new Map(stored.posts.map((entry) => [entry.postId, entry])))
        .catch(() => new Map())
    : new Map();
  const metrics = linkedin
    ? measurePost(reel, posts, stats)
    : measure(
        reel,
        posts.filter((post) => post.format === reel.format),
        skipRates,
      );
  const views = linkedin
    ? (metrics.find((metric) => metric.label === IMPRESSIONS_LABEL && metric.ratio !== null) ??
      metrics.find((metric) => metric.label === ENGAGEMENTS_LABEL))
    : metrics.find((metric) => metric.label === "Views");
  const measureWord =
    views?.label === ENGAGEMENTS_LABEL ? "engagements" : linkedin ? "impressions" : "views";
  const primaryRatio = views?.ratio ?? 0;
  const worked = primaryRatio >= 1;
  const daysRun = Math.max(0, Math.floor((Date.now() - Date.parse(reel.publishedAt)) / DAY_MS));
  const resultLine = early
    ? `EARLY CHECK, not the result: this ${thing} has run ${daysRun} of ${days} days. So far it has ${primaryRatio.toFixed(2)}x the typical ${thing}'s ${measureWord}.
Its figures are still growing while the typical ${thing}'s are final, so they will rise. Do not say
whether it worked: say what the early figures show, and mark every lesson as provisional.`
    : `RESULT (decided by the figures): this ${thing} ${primaryRatio >= VIRAL_RATIO ? "WENT VIRAL" : worked ? "WORKED" : "DID NOT WORK"}: ${primaryRatio.toFixed(2)}x the typical ${thing}'s ${measureWord}.`;

  const reply = await completeJson<unknown>({
    system: linkedin ? LINKEDIN_SYSTEM : SYSTEM,
    user: `${resultLine}

FIGURES (this ${thing} vs the typical ${thing} of the 90 days before it):
${metrics
  .map(
    (metric) =>
      `- ${metric.label}: ${metric.value}${metric.typical !== null ? ` vs typical ${metric.typical}${metric.ratio !== null ? ` (${metric.ratio.toFixed(2)}x)` : ""}` : ""}`,
  )
  .join("\n")}

WHAT WAS USED: ${REEL_USAGE_LABEL[row.usage ?? "partly"]}
COMPARISON WITH THE DASHBOARD'S SCRIPT:
${JSON.stringify(row.comparison, null, 2)}

THE DASHBOARD'S ${linkedin ? "POST" : "SCRIPT"}, for reference:
${scriptOf(idea)}

${linkedin ? `THE PUBLISHED POST:\n${reel.caption}` : `THE POSTED REEL:\n${row.transcript ? `Transcript: ${row.transcript}\n` : ""}Caption: ${reel.caption}`}`,
    schemaName: "reel_review",
    schema: schema as unknown as Record<string, unknown>,
    model: reviewModel(),
    temperature: 0.3,
    effort: "medium",
    timeoutMs: 120_000,
  });
  const cost = reply.usage ? (costOf(reply.usage, reply.model).usd ?? 0) : 0;
  const answer = parsed.safeParse(reply.data);
  if (!answer.success) {
    if (cost) await updateReelLearning(ideaId, {}, cost);
    return { reason: "The review could not be read. Try again." };
  }

  const review: ReelReview = {
    metrics,
    primaryRatio,
    summary: answer.data.summary,
    elements: answer.data.elements,
    lessons: answer.data.lessons.slice(0, 4) as ReelLesson[],
    suggestions: answer.data.suggestions.slice(0, 4),
    ...(early ? { early: { days: daysRun } } : {}),
  };
  // An early check never decides whether it worked: that waits for the full 14 days.
  await updateReelLearning(
    ideaId,
    { review, worked: early ? null : worked, reviewed_at: new Date().toISOString() },
    cost,
  );
  return { row: (await readReelLearning(ideaId))! };
}
