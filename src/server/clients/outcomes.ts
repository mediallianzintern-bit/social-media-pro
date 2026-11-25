// A Studio client's posts after 14 days, back to Studio with a one-line lesson
// each (25 Nov 2026). Called from sendToStudio (clients/lanes.ts) on the
// client's sync, so only a client linked from Studio ever reaches it.
//
// The figures are code (lib/client-outcomes.ts). The lessons are ONE model
// call for all of a sync's due posts (gpt-4o-mini, a fraction of a cent),
// inside a monthly cap per client: STUDIO_LESSON_MONTHLY_USD, default $0.50,
// "0" or "off" for figures only. Over the cap, or with no OpenAI key, the
// figures are still sent, with no lesson.
//
// Each post is sent once: Studio keeps the first result and says so on a
// repeat, so a sync that fails half-way loses nothing. What lessons have cost
// is read back from Studio's own record of them, so the cap needs no table in
// Pro.
import { z } from "zod";

import { costOf } from "@/lib/ai-cost";
import { interactionsOf, type ExportedPost, type PublicationMatch } from "@/lib/client-lanes";
import {
  dueOutcomes,
  lessonSpendThisMonth,
  typicalBefore,
  type DueOutcome,
} from "@/lib/client-outcomes";
import { organicPosts, type PostRecord } from "@/lib/analytics-types";

import { completeJson, hasOpenAi } from "../ai/client";
import type { ActiveClient } from "./context";
import { callStudio } from "./studio";

/** Cheap on purpose: one sentence per post from figures it is handed. */
const LESSON_MODEL = "gpt-4o-mini";
/** Posts sent per sync; the rest wait for the next. Keeps one call small. */
export const OUTCOMES_PER_SYNC = 8;
const DEFAULT_MONTHLY_USD = 0.5;
/** A whole call, at most, for the cap check before it is made. */
const LESSON_CALL_ESTIMATE_USD = 0.01;

/** The monthly lesson cap per client in dollars; 0 when lessons are off. */
export function lessonCap(value = process.env["STUDIO_LESSON_MONTHLY_USD"]): number {
  if (value === undefined || value.trim() === "") return DEFAULT_MONTHLY_USD;
  if (/^(off|false|no)$/i.test(value.trim())) return 0;
  const cap = Number(value);
  return Number.isFinite(cap) && cap >= 0 ? cap : DEFAULT_MONTHLY_USD;
}

const lessonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["lessons"],
  properties: {
    lessons: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["postId", "lesson"],
        properties: {
          postId: { type: "string" },
          lesson: { type: "string" },
        },
      },
    },
  },
} as const;

const lessonReply = z.object({
  lessons: z.array(z.object({ postId: z.string(), lesson: z.string() })),
});

const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

/** The client's three strongest and three weakest other recent posts, as context. */
function contrast(due: DueOutcome[], posts: PostRecord[]) {
  const skip = new Set(due.map((item) => item.post.postId));
  const scored = organicPosts(posts)
    .filter((post) => !skip.has(post.postId) && post.caption.trim())
    .slice(0, 40)
    .map((post) => {
      const { typical } = typicalBefore(post, posts);
      return { post, vs: typical > 0 ? interactionsOf(post) / typical : null };
    })
    .filter((row): row is { post: PostRecord; vs: number } => row.vs !== null)
    .sort((a, b) => b.vs - a.vs);
  const pick = [...scored.slice(0, 3), ...scored.slice(3).slice(-3)];
  return pick.map(({ post, vs }) => ({
    format: post.format,
    lane: post.contentLane ?? null,
    vsTypical: Number(vs.toFixed(2)),
    caption: clip(post.caption, 220),
  }));
}

/**
 * One lesson per due post, from one call. Never throws: a failed call means
 * figures without lessons, and what it cost is still counted.
 */
async function writeLessons(
  client: ActiveClient,
  industry: string,
  due: DueOutcome[],
  posts: PostRecord[],
): Promise<{ lessons: Map<string, string>; costUsd: number; problem?: string }> {
  const brief = due.map(({ figures, exported, post }) => ({
    postId: figures.postId,
    format: post.format,
    lane: figures.lane,
    ageDays: figures.ageDays,
    likes: figures.likes,
    comments: figures.comments,
    vsTypical: figures.vsTypical,
    verdict: figures.verdict,
    caption: clip(exported.caption || post.caption, 700),
  }));
  try {
    const reply = await completeJson<unknown>({
      system: `You write one lesson per post for the person who plans next month's Instagram posts
for ${client.displayName}${industry ? ` (${industry})` : ""}. Each post was measured 14 days or more
after it went up, on likes + comments, against the brand's own typical post (vsTypical 1.0 is
typical; "above" beat it, "below" fell short).

A lesson is ONE sentence, at most 200 characters, saying what most likely made this post land
where it did, in terms a planner can reuse: the topic, the angle, the opening line, the format,
the call to action. Compare it with the brand's other posts you are given. Use only the captions
and figures given: never invent a figure, a reason you cannot see, or a product. Never praise.
When nothing sets the post apart, say what to test next instead.`,
      user: `THE POSTS TO WRITE A LESSON FOR:
${JSON.stringify(brief, null, 1)}

THE BRAND'S OTHER RECENT POSTS, strongest and weakest, for comparison:
${JSON.stringify(contrast(due, posts), null, 1)}`,
      schemaName: "post_lessons",
      schema: lessonSchema as unknown as Record<string, unknown>,
      model: LESSON_MODEL,
      temperature: 0.3,
      timeoutMs: 60_000,
    });
    const costUsd = reply.usage ? (costOf(reply.usage, reply.model).usd ?? 0) : 0;
    const parsed = lessonReply.safeParse(reply.data);
    if (!parsed.success)
      return { lessons: new Map(), costUsd, problem: "the reply could not be read" };
    const wanted = new Set(due.map((item) => item.figures.postId));
    const lessons = new Map<string, string>();
    for (const { postId, lesson } of parsed.data.lessons) {
      const text = clip(lesson, 300);
      if (wanted.has(postId) && text) lessons.set(postId, text);
    }
    return { lessons, costUsd };
  } catch (error) {
    return {
      lessons: new Map(),
      costUsd: 0,
      problem: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Sends the client's due 14-day results to Studio. Returns one line per thing
 * worth telling a manager; throws only when Studio cannot be reached at all,
 * which the caller reports as the step failing.
 */
export async function sendOutcomes(input: {
  client: ActiveClient;
  studioId: string;
  industry: string;
  exported: ExportedPost[];
  matches: PublicationMatch[];
  posts: PostRecord[];
  now: Date;
}): Promise<string[]> {
  const notes: string[] = [];
  const all = dueOutcomes({
    exported: input.exported,
    matches: input.matches,
    posts: input.posts,
    now: input.now,
  });
  if (!all.length) return notes;
  const due = all.slice(0, OUTCOMES_PER_SYNC);

  // Lessons, if a key, the cap and this month's spend allow one call.
  const cap = lessonCap();
  const spent = lessonSpendThisMonth(input.exported, input.now);
  let lessons = new Map<string, string>();
  let perPostCost = 0;
  if (!cap) {
    // Lessons turned off: figures only, and nothing to say about it each sync.
  } else if (!hasOpenAi()) {
    notes.push("14-day lessons need OPENAI_API_KEY in Pro's .env; the figures were sent without.");
  } else if (spent + LESSON_CALL_ESTIMATE_USD > cap) {
    notes.push(
      `This month's lesson budget for ${input.client.displayName} ($${cap.toFixed(2)}) is spent; the figures were sent without lessons.`,
    );
  } else {
    const written = await writeLessons(input.client, input.industry, due, input.posts);
    lessons = written.lessons;
    // Carried on the posts that got a lesson, so Studio's record adds up to the call.
    perPostCost = written.costUsd / Math.max(1, lessons.size);
    if (written.problem) notes.push(`No lessons this time: ${written.problem}.`);
  }

  let recorded = 0;
  const refused: string[] = [];
  for (const item of due) {
    const lesson = lessons.get(item.figures.postId) ?? null;
    try {
      const result = (await callStudio("outcomes", {
        method: "POST",
        body: JSON.stringify({
          clientId: input.studioId,
          ...item.figures,
          lesson,
          lessonCostUsd: lesson ? Number(perPostCost.toFixed(6)) : 0,
        }),
      })) as { data?: { recorded?: boolean } };
      if (result.data?.recorded) recorded += 1;
    } catch (error) {
      refused.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (recorded)
    notes.push(
      `${recorded} post${recorded === 1 ? "" : "s"}' 14-day result${recorded === 1 ? "" : "s"} sent to Studio${lessons.size ? `, with ${lessons.size} lesson${lessons.size === 1 ? "" : "s"}` : ""}.`,
    );
  if (all.length > due.length)
    notes.push(
      `${all.length - due.length} more 14-day result${all.length - due.length === 1 ? "" : "s"} wait for the next refresh.`,
    );
  if (refused.length)
    notes.push(
      `Studio refused ${refused.length} 14-day result${refused.length === 1 ? "" : "s"}: ${refused[0]}`,
    );
  return notes;
}
