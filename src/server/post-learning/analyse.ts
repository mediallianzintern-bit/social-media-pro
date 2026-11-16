// Analyse one published LinkedIn post: its parts, for the review and the
// patterns (lib/post-learning.ts).
//
// Code measures everything it can: the opening and its kind (question,
// statistic, statement…), the close and its kind, the length, reading grade,
// numbered points, figures and hashtags. One small call (gpt-4o-mini, ~0.1¢)
// names the rest: the opening's style, the body's shape, the example, and the
// order the post takes.
import { z } from "zod";

import { costOf } from "@/lib/ai-cost";
import type { PostRecord } from "@/lib/analytics-types";
import type { PostAnalysis } from "@/lib/post-learning";
import { hashtagsIn } from "@/lib/reel-match";
import { BODY_SHAPES, ctaTypeOf, EXAMPLE_TYPES, hookTypeOf } from "@/lib/reel-parts";

import { completeJson } from "../ai/client";
import { postParts, postShape } from "../reel-learning/analyse-post";
import { savePostLearning } from "./store";

/** Cheap on purpose: naming parts needs no stronger model. */
const ANALYSE_MODEL = "gpt-4o-mini";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["hookStyle", "bodyShape", "exampleType", "structure"],
  properties: {
    hookStyle: {
      type: "string",
      description:
        "The opening's style in one or two words: story twist, lesson, question, statement, statistic, position, news report.",
    },
    bodyShape: {
      type: "string",
      enum: [...BODY_SHAPES],
      description: "The shape of the body, the closest of these.",
    },
    exampleType: {
      type: "string",
      enum: [...EXAMPLE_TYPES],
      description: "The kind of example the post uses.",
    },
    structure: {
      type: "string",
      description:
        "One sentence: the order the post takes, part by part (e.g. 'news in one line, why it matters, three numbered points, a question').",
    },
  },
} as const;

const parsed = z.object({
  hookStyle: z.string(),
  bodyShape: z.enum(BODY_SHAPES).catch("other"),
  exampleType: z.enum(EXAMPLE_TYPES).catch("none"),
  structure: z.string(),
});

/** Code's half of the analysis. Exported for the tests. */
export function measuredParts(
  post: PostRecord,
): Omit<PostAnalysis, "hookStyle" | "bodyShape" | "exampleType" | "structure"> {
  const parts = postParts(post.caption, 1);
  const opening = post.caption
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join("\n");
  return {
    opening,
    hookType: hookTypeOf(parts.hook),
    close: parts.cta,
    ctaType: ctaTypeOf(parts.cta, post.contentLane),
    shape: postShape(post.caption),
    hashtags: hashtagsIn(post.caption),
  };
}

/** Analyses one post and stores it. Never throws for a bad reply: it records the cost and says why. */
export async function analysePost(
  post: PostRecord,
  title: string | null = null,
): Promise<{ analysis: PostAnalysis } | { reason: string }> {
  const reply = await completeJson<unknown>({
    system: `You describe how one LinkedIn post by Pritesh Patel is built, for a writer who will
build new posts the same way. Describe only; never praise or judge it.`,
    user: `${post.format === "article" ? `A LinkedIn ARTICLE, shared with this introduction${title ? `. Its title: "${title}"` : ""}.\n\n` : ""}THE POST:
${post.caption}`,
    schemaName: "post_analysis",
    schema: schema as unknown as Record<string, unknown>,
    model: ANALYSE_MODEL,
    temperature: 0.2,
    timeoutMs: 60_000,
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
    return { reason: "The analysis could not be read." };
  }
  const analysis: PostAnalysis = { ...measuredParts(post), ...answer.data };
  await savePostLearning(stored, { analysis, analysed_at: new Date().toISOString() }, cost);
  return { analysis };
}
