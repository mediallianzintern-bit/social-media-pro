// Review one published LinkedIn post once it has run REVIEW_DAYS: did it
// work, and why (lib/post-learning.ts).
//
// Whether it worked is decided in code: its impressions against his typical
// post of the same kind over the 90 days before it, LinkedIn's own figures
// (reel-learning/review.ts measurePost), or its engagements where LinkedIn
// has none. The model only explains, part by part, and writes the lessons
// the writer reads next time. One call, ~1-2¢.
import { z } from "zod";

import { costOf } from "@/lib/ai-cost";
import type { PostRecord } from "@/lib/analytics-types";
import type { PostAnalysis } from "@/lib/post-learning";
import { REVIEW_DAYS } from "@/lib/post-learning";
import type { ReelLesson, ReelReview } from "@/lib/reel-learning-types";
import { VIRAL_RATIO } from "@/lib/reel-learning-types";
import { CTA_TYPE_LABEL, HOOK_TYPE_LABEL } from "@/lib/reel-parts";

import { completeJson } from "../ai/client";
import { reviewModel } from "../ai/review";
import { ENGAGEMENTS_LABEL, IMPRESSIONS_LABEL, measurePost } from "../reel-learning/review";
import { savePostLearning } from "./store";

const ELEMENTS = ["topic", "hook", "script", "cta", "caption", "hashtags"] as const;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "elements", "lessons", "suggestions"],
  properties: {
    summary: {
      type: "string",
      description: "Two sentences: how the post did against his typical post, and the main reason.",
    },
    elements: {
      type: "array",
      description:
        "Exactly one entry for each of topic, hook (the opening), script (the body), cta (the close), caption, hashtags.",
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
            description: "An instruction a post writer can follow next time, in one sentence.",
          },
          evidence: {
            type: "string",
            description: "The figure it rests on, e.g. 'impressions 505 vs typical 207'.",
          },
        },
      },
    },
    suggestions: {
      type: "array",
      items: { type: "string" },
      description: "At most four concrete changes that would have made THIS post stronger.",
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

const SYSTEM = `You review one LinkedIn post by Pritesh Patel after it has run for ${REVIEW_DAYS} days, for
the team that writes his posts, so the next post is better.

How to attribute, from the figures you are given:
- HOOK (the opening lines, all a phone shows before "see more"): shows in impressions and members
  reached against his typical post, because LinkedIn shows a post more widely when people stop and
  expand it, and in the engagement rate.
- SCRIPT (the body): shows in the engagement rate, saves and sends: a body worth keeping or
  sending is one that taught something.
- TOPIC: shows in impressions and reactions: whether the story was one his audience wanted at all.
- CTA (the close: a question, a Repost line): shows in comments (for the question) and reposts.
- CAPTION: a LinkedIn post has none; always "unclear". HASHTAGS: a weak signal; "unclear" unless
  the figures clearly point at them.

Rules:
- Whether it worked is already decided by the figures. Do not argue with it.
- One post is thin evidence. Every lesson names the figure it rests on. Do not invent figures.
- A post at ${VIRAL_RATIO}x his typical impressions or more is the most valuable result there is:
  say exactly which parts made it spread (the kind of opening, the body's shape, the example, the
  length, the close), as REPEAT lessons a writer can follow.
- Lessons are about how a post is BUILT, never about its facts: the next post is about another story.
- Plain words, no hype.`;

/** Reviews one analysed post and stores it. */
export async function reviewPost(
  post: PostRecord,
  analysis: PostAnalysis,
  posts: PostRecord[],
  stats: Map<string, { impressions: number; membersReached: number; saves: number; sends: number }>,
  title: string | null = null,
): Promise<{ review: ReelReview; worked: boolean } | { reason: string }> {
  const metrics = measurePost(post, posts, stats);
  const primary =
    metrics.find((metric) => metric.label === IMPRESSIONS_LABEL && metric.ratio !== null) ??
    metrics.find((metric) => metric.label === ENGAGEMENTS_LABEL && metric.ratio !== null);
  if (!primary) return { reason: "No earlier posts of this kind to compare it with." };
  const measure = primary.label === IMPRESSIONS_LABEL ? "impressions" : "engagements";
  const primaryRatio = primary.ratio!;
  const worked = primaryRatio >= 1;

  const reply = await completeJson<unknown>({
    system: SYSTEM,
    user: `RESULT (decided by the figures): this post ${primaryRatio >= VIRAL_RATIO ? "WENT VIRAL" : worked ? "WORKED" : "DID NOT WORK"}: ${primaryRatio.toFixed(2)}x his typical post's ${measure}.

FIGURES (this post vs his typical ${post.format === "article" ? "article" : "post"} of the 90 days before it):
${metrics
  .map(
    (metric) =>
      `- ${metric.label}: ${metric.value}${metric.typical !== null ? ` vs typical ${metric.typical}${metric.ratio !== null ? ` (${metric.ratio.toFixed(2)}x)` : ""}` : ""}`,
  )
  .join("\n")}

HOW IT IS BUILT:
- Opening (${HOOK_TYPE_LABEL[analysis.hookType]}, ${analysis.hookStyle}): "${analysis.opening.replace(/\n/g, " / ")}"
- Body: ${analysis.bodyShape}; example: ${analysis.exampleType}
- Order: ${analysis.structure}
- Close (${CTA_TYPE_LABEL[analysis.ctaType]}): ${analysis.close ? `"${analysis.close.replace(/\n/g, " / ")}"` : "none"}
- ${analysis.shape.words} words, about Grade ${analysis.shape.grade}, ${analysis.shape.points} numbered points, ${analysis.shape.figures} figures

${post.format === "article" ? `A LinkedIn ARTICLE${title ? ` titled "${title}"` : ""}; its introduction as shared:` : "THE POST:"}
${post.caption}`,
    schemaName: "post_review",
    schema: schema as unknown as Record<string, unknown>,
    model: reviewModel(),
    temperature: 0.3,
    effort: "medium",
    timeoutMs: 120_000,
  });
  const cost = reply.usage ? (costOf(reply.usage, reply.model).usd ?? 0) : 0;
  const stored = {
    postId: post.postId,
    url: post.url ?? null,
    publishedAt: post.publishedAt,
    format: post.format ?? null,
  };
  const answer = parsed.safeParse(reply.data);
  if (!answer.success) {
    await savePostLearning(stored, {}, cost);
    return { reason: "The review could not be read." };
  }
  const review: ReelReview = {
    metrics,
    primaryRatio,
    summary: answer.data.summary,
    elements: answer.data.elements,
    lessons: answer.data.lessons.slice(0, 4) as ReelLesson[],
    suggestions: answer.data.suggestions.slice(0, 4),
  };
  await savePostLearning(stored, { review, worked, reviewed_at: new Date().toISOString() }, cost);
  return { review, worked };
}
