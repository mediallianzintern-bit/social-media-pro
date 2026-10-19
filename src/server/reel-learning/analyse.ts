// Analyse (paid, from a button): what of the dashboard's script made it into
// the live reel.
//
// Two costs, both small and both capped: one Apify run for the transcript
// (~1.5¢, capped at 5¢ by Apify), and one model call to describe the changes
// (~1-2¢). The numbers (how much of the hook, script and caption survived, and
// which hashtags) are computed in code from the two texts; the model only
// names what was kept, dropped and added, and describes the team's own style.
// The topic is the anchor and is checked first: if the reel covers a
// different story, the match was wrong and the drawer says so.
import { z } from "zod";

import { costOf } from "@/lib/ai-cost";
import type { ContentIdea } from "@/lib/ai-types";
import type { ElementVerdict, ReelComparison, ReelUsage } from "@/lib/reel-learning-types";
import { closestHook, hashtagsIn, orderedOverlap, scriptOf } from "@/lib/reel-match";

import { fetchReelTranscript } from "../apify/reels";
import { completeJson, hasOpenAi } from "../ai/client";
import { reviewModel } from "../ai/review";
import { readIdeaById } from "../store";
import { linkedPost } from "./match";
import { readReelLearning, updateReelLearning, type ReelLearningRow } from "./store";

/** Rough cost of one transcript run, for the row's running total. Apify caps it at 5¢. */
const TRANSCRIPT_COST_USD = 0.015;

/** Overlap thresholds, shared by every element so "adapted" means one thing. */
function verdictFor(overlap: number): ElementVerdict {
  if (overlap >= 0.6) return "as_written";
  if (overlap >= 0.25) return "adapted";
  return "own";
}

/** How much of the script was used, from the script's own overlap. */
function usageFor(scriptOverlap: number, topicSame: boolean): ReelUsage {
  if (!topicSame) return "topic_only";
  if (scriptOverlap >= 0.6) return "as_written";
  if (scriptOverlap >= 0.25) return "partly";
  return "topic_only";
}

const schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "topicSame",
    "topicNote",
    "spokenHook",
    "hookStyle",
    "hookNote",
    "kept",
    "dropped",
    "added",
    "structure",
    "captionNote",
    "teamStyle",
  ],
  properties: {
    topicSame: {
      type: "boolean",
      description: "True when the reel covers the same story as the dashboard's script.",
    },
    topicNote: { type: "string", description: "One sentence: the story each one covers." },
    spokenHook: {
      type: "string",
      description:
        "The reel's opening line, word for word from the transcript (or the caption's first line when there is no speech).",
    },
    hookStyle: {
      type: "string",
      description:
        "The opening's style in one or two words: authority, curiosity, question, statement, hypothetical, story, statistic.",
    },
    hookNote: {
      type: "string",
      description: "One sentence: how the opening differs from the offered hooks, if it does.",
    },
    kept: {
      type: "array",
      items: { type: "string" },
      description: "Ideas or beats from the dashboard script that the reel kept. Short phrases.",
    },
    dropped: {
      type: "array",
      items: { type: "string" },
      description: "Ideas or beats from the dashboard script that the reel left out.",
    },
    added: {
      type: "array",
      items: { type: "string" },
      description: "Ideas or beats the reel has that the dashboard script did not.",
    },
    structure: {
      type: "string",
      description: "One or two sentences: the order the reel takes, against the script's order.",
    },
    captionNote: {
      type: "string",
      description: "One sentence: how the posted caption differs from the suggested one.",
    },
    teamStyle: {
      type: "string",
      description:
        "Two sentences at most: what the team does when they change a script (their kind of opening, length, structure, tone), for a writer to imitate. Empty when nothing was changed.",
    },
  },
} as const;

const parsed = z.object({
  topicSame: z.boolean(),
  topicNote: z.string(),
  spokenHook: z.string(),
  hookStyle: z.string(),
  hookNote: z.string(),
  kept: z.array(z.string()),
  dropped: z.array(z.string()),
  added: z.array(z.string()),
  structure: z.string(),
  captionNote: z.string(),
  teamStyle: z.string(),
});

function dashboardVersion(idea: ContentIdea): string {
  const hooks = [idea.hook, ...(idea.altHooks ?? [])]
    .filter(Boolean)
    .map((hook, index) => `${String.fromCharCode(65 + index)}: ${hook}`)
    .join("\n");
  return `STORY: ${idea.source?.headline ?? idea.title}
OFFERED HOOKS:
${hooks}
SCRIPT (spoken, in order):
${scriptOf(idea)}
CAPTION:
${idea.caption ?? ""}
HASHTAGS: ${(idea.hashtags ?? []).join(" ")}`;
}

/** Runs the analysis for one filmed idea and stores it. */
export async function analyseFilmedReel(
  ideaId: string,
): Promise<{ row: ReelLearningRow } | { reason: string }> {
  if (!hasOpenAi()) return { reason: "OPENAI_API_KEY is not set." };
  const row = await readReelLearning(ideaId);
  if (!row) return { reason: "Press I filmed this first." };
  if (!row.shortcode || !row.reelUrl) return { reason: "The live reel hasn't been found yet." };
  const idea = await readIdeaById(ideaId);
  if (!idea) return { reason: "That idea is no longer stored." };
  const post = await linkedPost(row);
  if (!post) return { reason: "The reel isn't in the synced posts. Press Sync, then try again." };

  // The transcript: once per reel. A reel with no speech (music under on-screen
  // text) has none, and the caption stands in for it.
  let transcript = row.transcript;
  let cost = 0;
  // A LinkedIn post is read, not watched: its text is the script.
  if (!transcript && row.platform === "instagram") {
    const result = await fetchReelTranscript(row.reelUrl).catch((error: unknown) => ({
      reason: error instanceof Error ? error.message : String(error),
    }));
    cost += TRANSCRIPT_COST_USD;
    if ("transcript" in result) transcript = result.transcript;
    else console.warn(`[reel-learning] no transcript for ${row.shortcode}: ${result.reason}`);
  }
  const hadTranscript = Boolean(transcript?.trim());
  const spokenText = hadTranscript ? transcript! : post.caption;

  const reply = await completeJson<unknown>({
    system: `You compare a reel script a dashboard wrote with the reel that was actually posted.
Be exact and literal. Quote the reel's real words. Never praise or judge quality here: only
describe what was kept, dropped, added and changed. The topic is the anchor: say plainly
whether the two cover the same story.`,
    user: `THE DASHBOARD'S VERSION
${dashboardVersion(idea)}

THE POSTED REEL
${hadTranscript ? `TRANSCRIPT:\n${transcript}` : "TRANSCRIPT: none (no speech). Use the caption's opening as the hook."}
CAPTION:
${post.caption}`,
    schemaName: "reel_comparison",
    schema: schema as unknown as Record<string, unknown>,
    model: reviewModel(),
    temperature: 0.2,
    effort: "medium",
    timeoutMs: 120_000,
  });
  if (reply.usage) cost += costOf(reply.usage, reply.model).usd ?? 0;
  const model = parsed.safeParse(reply.data);
  if (!model.success) {
    if (cost) await updateReelLearning(ideaId, { transcript }, cost);
    return { reason: "The comparison could not be read. Try again." };
  }
  const answer = model.data;

  // The numbers, from the texts themselves.
  const hook = closestHook(idea, answer.spokenHook);
  const scriptOverlap = orderedOverlap(scriptOf(idea), spokenText);
  const captionOverlap = orderedOverlap(idea.caption ?? "", post.caption);
  const offeredTags = (idea.hashtags ?? []).map((tag) =>
    (tag.startsWith("#") ? tag : `#${tag}`).toLowerCase(),
  );
  const postedTags = hashtagsIn(post.caption);

  const comparison: ReelComparison = {
    topic: { same: answer.topicSame, note: answer.topicNote },
    hook: {
      spoken: answer.spokenHook,
      variant: hook.overlap >= 0.6 ? hook.variant : null,
      overlap: hook.overlap,
      verdict: verdictFor(hook.overlap),
      style: answer.hookStyle,
      note: answer.hookNote,
    },
    script: {
      overlap: scriptOverlap,
      verdict: verdictFor(scriptOverlap),
      kept: answer.kept,
      dropped: answer.dropped,
      added: answer.added,
      structure: answer.structure,
    },
    caption: {
      overlap: captionOverlap,
      verdict: verdictFor(captionOverlap),
      note: answer.captionNote,
    },
    hashtags: {
      used: offeredTags.filter((tag) => postedTags.includes(tag)),
      dropped: offeredTags.filter((tag) => !postedTags.includes(tag)),
      added: postedTags.filter((tag) => !offeredTags.includes(tag)),
    },
    teamStyle: answer.teamStyle,
    hadTranscript,
  };

  await updateReelLearning(
    ideaId,
    {
      transcript: transcript ?? null,
      comparison,
      usage: usageFor(scriptOverlap, answer.topicSame),
      analysed_at: new Date().toISOString(),
    },
    cost,
  );
  return { row: (await readReelLearning(ideaId))! };
}
