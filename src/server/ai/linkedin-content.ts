// LinkedIn content analysis (Oct 2026): what each post is about, read from its
// full text, and the lanes proposed from Pritesh Sir's analysed posts.
//
// The lanes used to come from the first 300 characters of 30 posts, so three
// of the five were all "AI" and overlapped. Here every post is analysed first
// (subject, topic, format, hook, takeaway, audience), and the lanes are then
// proposed from those analyses, with each of his posts assigned to one, so
// every lane can be checked against the posts it holds. A proposal is held for
// the team to approve (content_proposals, 0032) before it replaces the lanes.
//
// Competitors' posts are analysed the same way, so the competitor benchmark
// compares what they write with what he writes.
//
// Cost: gpt-4o-mini. About a tenth of a cent per ten posts analysed, and about
// two cents for a lane proposal. Only posts not yet analysed are sent.
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { costOf, type GenerationCost } from "@/lib/ai-cost";
import type { PostRecord } from "@/lib/analytics-types";
import {
  HOOK_KINDS,
  POST_FORMATS,
  type PostAnalysis,
  type ProposedLane,
} from "@/lib/linkedin-content";

import { completeJson } from "./client";
import { addCosts, reviewModel } from "./review";
import { hasDurableStore, savePostLanes, saveTaxonomy } from "../store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

const BATCH = 10;
/** Words of a post sent for analysis: his longest run about 430. */
const MAX_WORDS = 600;

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  required: ["posts"],
  properties: {
    posts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["postId", "subject", "topic", "format", "hook", "takeaway", "audience"],
        properties: {
          postId: { type: "string" },
          subject: {
            type: "string",
            description: 'The brand, tool, company or event the post is about, or "none".',
          },
          topic: { type: "string", description: "What the post is about, in at most eight words." },
          format: { type: "string", enum: [...POST_FORMATS] },
          hook: { type: "string", enum: [...HOOK_KINDS] },
          takeaway: {
            type: "string",
            description: "The point the reader is left with, one sentence.",
          },
          audience: {
            type: "string",
            description: "Who it is written for, in two or three words.",
          },
        },
      },
    },
  },
} as const;

const analysisReply = z.object({
  posts: z.array(
    z.object({
      postId: z.string(),
      subject: z.string(),
      topic: z.string(),
      format: z.enum(POST_FORMATS),
      hook: z.enum(HOOK_KINDS),
      takeaway: z.string(),
      audience: z.string(),
    }),
  ),
});

/** Stored analyses, by post id. */
export async function readAnalyses(handles: string[]): Promise<Map<string, PostAnalysis>> {
  if (!hasDurableStore() || !handles.length) return new Map();
  const { data, error } = await db()
    .from("linkedin_content")
    .select("post_id,analysis")
    .in("handle", handles);
  if (error) return new Map();
  return new Map(
    ((data ?? []) as Array<{ post_id: string; analysis: PostAnalysis }>).map((row) => [
      row.post_id,
      row.analysis,
    ]),
  );
}

/**
 * Analyses every post not analysed yet, ten to a call, and stores the result.
 * Never fatal: a batch that fails is left for the next run.
 */
export async function analysePosts(
  handle: string,
  posts: PostRecord[],
): Promise<{ analysed: number; cost: GenerationCost | undefined }> {
  const known = await readAnalyses([handle]);
  const pending = posts.filter((post) => post.caption.trim() && !known.has(post.postId));
  let cost: GenerationCost | undefined;
  let analysed = 0;
  for (let index = 0; index < pending.length; index += BATCH) {
    const batch = pending.slice(index, index + BATCH);
    try {
      const result = await completeJson<unknown>({
        system: `You analyse LinkedIn posts for a content strategist. For each post, read the WHOLE text and
say what it is about. Be specific and factual: name the real subject (a brand, tool, company or
event) when the post has one, describe the topic in plain words, and state the takeaway the post
actually gives. Never guess beyond the text.
format: news_breakdown (explains a development or announcement), how_to (steps or a process),
opinion (an argued point of view), story (a personal or client story), list (a list of items),
article_teaser (a short post pointing to an article), other.
hook (the first line): named_subject (opens by naming the brand, tool or company), question,
bold_claim, statistic, story, contrast, other.`,
        user: `POSTS:\n${batch
          .map(
            (post) =>
              `--- postId: ${post.postId}\n${post.caption.split(/\s+/).slice(0, MAX_WORDS).join(" ")}`,
          )
          .join("\n\n")}`,
        schemaName: "linkedin_post_analysis",
        schema: analysisSchema as unknown as Record<string, unknown>,
        temperature: 0.1,
        effort: "low",
        timeoutMs: 120_000,
      });
      if (result.usage) cost = addCosts(cost, costOf(result.usage, result.model));
      const reply = analysisReply.safeParse(result.data);
      if (!reply.success) continue;
      const byId = new Map(batch.map((post) => [post.postId, post]));
      const rows = reply.data.posts
        .filter((entry) => byId.has(entry.postId))
        .map((entry) => {
          const { postId, ...analysis } = entry;
          return {
            post_id: postId,
            handle,
            analysis: { ...analysis, words: words(byId.get(postId)!.caption) },
            analysed_at: new Date().toISOString(),
          };
        });
      if (rows.length && hasDurableStore()) {
        const { error } = await db()
          .from("linkedin_content")
          .upsert(rows, { onConflict: "post_id" });
        if (!error) analysed += rows.length;
      }
    } catch (error) {
      console.warn(`[linkedin-content] a batch of ${handle}'s posts was not analysed:`, error);
    }
  }
  return { analysed, cost };
}

const laneSchema = {
  type: "object",
  additionalProperties: false,
  required: ["lanes", "assignments"],
  properties: {
    lanes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "definition", "covers"],
        properties: {
          name: { type: "string", description: "Two to four words, plain, no jargon." },
          definition: {
            type: "string",
            description: "One sentence: what belongs in this lane, and what does not.",
          },
          covers: {
            type: "array",
            items: { type: "string" },
            description: "Subjects and topics from his posts that belong here.",
          },
        },
      },
    },
    assignments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["postId", "lane"],
        properties: { postId: { type: "string" }, lane: { type: "string" } },
      },
    },
  },
} as const;

const laneReply = z.object({
  lanes: z.array(
    z.object({ name: z.string(), definition: z.string(), covers: z.array(z.string()) }),
  ),
  assignments: z.array(z.object({ postId: z.string(), lane: z.string() })),
});

/**
 * Proposes his LinkedIn lanes from his analysed posts, assigns each post to
 * one, and stores the proposal for the team to approve. Nothing the dashboard
 * uses changes until it is approved.
 */
export async function proposeLanes(
  handle: string,
  posts: PostRecord[],
): Promise<{ lanes: ProposedLane[]; unassigned: number; cost: GenerationCost | undefined } | null> {
  const analyses = await readAnalyses([handle]);
  const analysed = posts.filter((post) => analyses.has(post.postId));
  if (analysed.length < 12) return null;

  const result = await completeJson<unknown>({
    system: `You define the content lanes of one LinkedIn creator from analyses of his own posts. A lane is a
recurring kind of post he writes, defined by its SUBJECT MATTER, so the team can plan, measure and
compare by lane.
Rules:
- Four to six lanes. Every lane must be clearly DISTINCT from every other: a reader must be able to
  put any post in exactly one lane from the definitions alone. Never two lanes that are both just
  "AI" or both just "marketing"; split by what the posts are actually about.
- Name each lane plainly in two to four words, from his posts, not from generic marketing terms.
- The definition says what belongs and what does not.
- Split by WHAT THE POST IS ABOUT, never by a vague theme. No catch-all lane: names like
  "Insights", "Strategy", "Trends" or "Customer Journey" that could hold anything are wrong.
- Decide by the post's main subject: a post about AI changing advertising is an advertising post;
  a post about an AI security incident is a security post if there are three or more such posts;
  a post about a new AI model or tool launch is a launch post. Personal reflections on work,
  decisions or purpose are their own lane when there are three or more, never mixed into a
  marketing lane.
- Base every lane on posts he actually wrote. A lane needs at least three of his posts.
- Before answering, check every pair of lanes: if one post could sit in both, redraw them.
- Assign every post to exactly one lane, by its postId, using a lane name exactly as you wrote it.
  A post that fits no lane gets "other"; keep "other" small.`,
    user: `HIS POSTS, analysed (${analysed.length}):\n${JSON.stringify(
      analysed.map((post) => {
        const analysis = analyses.get(post.postId)!;
        return {
          postId: post.postId,
          subject: analysis.subject,
          topic: analysis.topic,
          format: analysis.format,
          takeaway: analysis.takeaway,
          opening: post.caption.split("\n")[0]!.slice(0, 120),
        };
      }),
      null,
      1,
    )}`,
    schemaName: "linkedin_lane_proposal",
    schema: laneSchema as unknown as Record<string, unknown>,
    // The stronger model: drawing distinct lanes is judgement, and the
    // cheaper one returned overlapping AI lanes and a catch-all (30 Oct 2026).
    model: reviewModel(),
    temperature: 0.2,
    effort: "medium",
    timeoutMs: 150_000,
  });
  const cost = result.usage ? costOf(result.usage, result.model) : undefined;
  const reply = laneReply.safeParse(result.data);
  if (!reply.success) return null;

  const byId = new Map(analysed.map((post) => [post.postId, post]));
  const lanes: ProposedLane[] = reply.data.lanes.map((lane) => {
    const mine = reply.data.assignments.filter(
      (entry) => entry.lane.trim().toLowerCase() === lane.name.trim().toLowerCase(),
    );
    return {
      ...lane,
      posts: mine.length,
      examples: mine
        .slice(0, 3)
        .map((entry) => byId.get(entry.postId)?.caption.split("\n")[0]!.slice(0, 110) ?? "")
        .filter(Boolean),
    };
  });
  const unassigned = analysed.length - lanes.reduce((sum, lane) => sum + lane.posts, 0);

  if (hasDurableStore()) {
    await db()
      .from("content_proposals")
      .insert({
        platform: "linkedin",
        kind: "lanes",
        proposal: { lanes, assignments: reply.data.assignments, unassigned },
      });
  }
  return { lanes, unassigned, cost };
}

const assignSchema = {
  type: "object",
  additionalProperties: false,
  required: ["assignments"],
  properties: {
    assignments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["postId", "lane"],
        properties: { postId: { type: "string" }, lane: { type: "string" } },
      },
    },
  },
} as const;

/**
 * Files each of his posts under one of a set of lanes the team agreed, read
 * from the whole post, and holds the result as a proposal. Nothing changes
 * until applyLaneProposal.
 */
export async function assignToLanes(
  handle: string,
  posts: PostRecord[],
  lanes: Array<{ name: string; definition: string }>,
  options: {
    /** Hold the result as a proposal for approval (his posts), or not (a competitor's). */
    store?: boolean;
    /** The default model, for competitors' posts: volume, not his own lanes. */
    cheap?: boolean;
  } = {},
): Promise<{
  id: string | null;
  counts: Record<string, number>;
  assignments: Array<{ postId: string; lane: string }>;
  cost: GenerationCost | undefined;
}> {
  const names = new Map(lanes.map((lane) => [lane.name.toLowerCase(), lane.name]));
  const assignments: Array<{ postId: string; lane: string }> = [];
  let cost: GenerationCost | undefined;
  const pending = posts.filter((post) => post.caption.trim());
  for (let index = 0; index < pending.length; index += 15) {
    const batch = pending.slice(index, index + 15);
    const result = await completeJson<unknown>({
      system: `File each LinkedIn post under exactly ONE lane, by its MAIN subject, reading the whole post.
LANES:
${lanes.map((lane) => `- ${lane.name}: ${lane.definition}`).join("\n")}
Use a lane name exactly as written. "other" only when a post truly fits none.`,
      user: batch
        .map(
          (post) =>
            `--- postId: ${post.postId}\n${post.caption.split(/\s+/).slice(0, MAX_WORDS).join(" ")}`,
        )
        .join("\n\n"),
      schemaName: "linkedin_lane_assignment",
      schema: assignSchema as unknown as Record<string, unknown>,
      ...(options.cheap ? {} : { model: reviewModel() }),
      temperature: 0,
      effort: "low",
      timeoutMs: 120_000,
    });
    if (result.usage) cost = addCosts(cost, costOf(result.usage, result.model));
    const reply = z
      .object({ assignments: z.array(z.object({ postId: z.string(), lane: z.string() })) })
      .safeParse(result.data);
    if (!reply.success) continue;
    const ids = new Set(batch.map((post) => post.postId));
    for (const entry of reply.data.assignments) {
      if (!ids.has(entry.postId)) continue;
      assignments.push({
        postId: entry.postId,
        lane: names.get(entry.lane.trim().toLowerCase()) ?? "other",
      });
    }
  }
  const counts: Record<string, number> = {};
  for (const entry of assignments) counts[entry.lane] = (counts[entry.lane] ?? 0) + 1;

  let id: string | null = null;
  if (options.store !== false && hasDurableStore()) {
    const { data } = await db()
      .from("content_proposals")
      .insert({
        platform: "linkedin",
        kind: "lanes",
        proposal: { handle, lanes, assignments, counts },
      })
      .select("id")
      .single();
    id = (data as { id?: string } | null)?.id ?? null;
  }
  return { id, counts, assignments, cost };
}

/** Makes an approved lane proposal the lanes the dashboard uses, and files his posts under them. */
export async function applyLaneProposal(id: string): Promise<number> {
  const { data, error } = await db()
    .from("content_proposals")
    .select("proposal")
    .eq("id", id)
    .single();
  if (error || !data) throw new Error("That lane proposal was not found.");
  const proposal = data.proposal as {
    handle: string;
    lanes: Array<{ name: string; definition: string }>;
    assignments: Array<{ postId: string; lane: string }>;
  };
  await saveTaxonomy("linkedin", proposal.handle, proposal.lanes);
  const filed = await savePostLanes("linkedin", proposal.assignments);
  await db()
    .from("content_proposals")
    .update({ status: "approved", decided_at: new Date().toISOString() })
    .eq("id", id);
  return filed;
}
