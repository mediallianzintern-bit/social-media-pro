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
import {
  BODY_SHAPES,
  captionStats,
  ctaTypeOf,
  EXAMPLE_TYPES,
  hookTypeOf,
  ourParts,
  reelSeconds,
  spokenOnly,
  wordCount,
} from "@/lib/reel-parts";
import { closingLineFor } from "@/lib/script-families";

import { fetchReelTranscript } from "../apify/reels";
import { completeJson, hasOpenAi } from "../ai/client";
import { reviewModel } from "../ai/review";
import { readIdeaById } from "../store";
import { confirmMatch, linkedPost, rejectMatch } from "./match";
import { readReelLearning, updateReelLearning, type ReelLearningRow } from "./store";
import { researchUsage } from "@/lib/research";

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
    "theirBody",
    "theirCta",
    "bodyShape",
    "exampleType",
  ],
  properties: {
    topicSame: {
      type: "boolean",
      description:
        "True when the reel is about the same news story: the same launch, campaign, product, company or event, even when the reel takes a different angle, adds its own advice or leaves parts out. False only when it is about a different story altogether.",
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
    theirBody: {
      type: "string",
      description:
        "The reel's MAIN BODY, word for word from the transcript: everything after the opening line and before the closing call to action.",
    },
    theirCta: {
      type: "string",
      description:
        'The reel\'s closing call to action, word for word ("Follow for…", "Comment…", a closing question). Empty string when the reel simply ends with no ask.',
    },
    bodyShape: {
      type: "string",
      enum: [...BODY_SHAPES],
      description: "The shape of the reel's main body, the closest of these.",
    },
    exampleType: {
      type: "string",
      enum: [...EXAMPLE_TYPES],
      description:
        'The kind of example the reel uses: a real case (a named brand or event), a hypothetical ("Imagine…", "Let\'s say…"), a demo shown on screen, or none.',
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
  theirBody: z.string(),
  theirCta: z.string(),
  bodyShape: z.enum(BODY_SHAPES).catch("other"),
  exampleType: z.enum(EXAMPLE_TYPES).catch("none"),
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
  // Timestamps are not words: measured on the spoken text alone.
  const spokenText = hadTranscript ? spokenOnly(transcript!) : post.caption;

  const reply = await completeJson<unknown>({
    system: `You compare a reel script a dashboard wrote with the reel that was actually posted.
Be exact and literal. Quote the reel's real words. Never praise or judge quality here: only
describe what was kept, dropped, added and changed. The topic is the anchor: say plainly
whether the two cover the same story. Split the posted reel into its three parts, word for
word: the opening line (the hook), the main body, and the closing call to action, if any.`,
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

  // The topic is the anchor. Only a timing GUESS is unlinked when the analyst
  // reads a different story: a reel matched on the story's own names (or
  // linked by a person) stays, because a different angle on the same news is
  // not a different reel. The Beam reel, matched on "Beam", was unlinked on
  // 21 October because it discussed Beam's cost rather than its launch.
  const guessed = row.match?.by === "timing" && !row.match.confirmed;
  if (!answer.topicSame && guessed) {
    if (cost) await updateReelLearning(ideaId, {}, cost);
    await rejectMatch((await readReelLearning(ideaId))!);
    return {
      reason: `That reel covers a different story (${answer.topicNote}), so it was unlinked. The right one is found on the next Sync, or link it yourself.`,
    };
  }
  // A timing guess is now confirmed, and scored from here on.
  await confirmMatch(row);

  // The numbers, from the texts themselves.
  const hook = closestHook(idea, answer.spokenHook);
  const scriptOverlap = orderedOverlap(scriptOf(idea), spokenText);
  const captionOverlap = orderedOverlap(idea.caption ?? "", post.caption);
  // Stored hashtags come in several shapes ("#ai", "ai", "#ai #ml", ""): one
  // clean list of "#tag", so an empty entry never reads as a dropped "#".
  const offeredTags = [
    ...new Set(
      (idea.hashtags ?? [])
        .flatMap((tag) => tag.split(/[\s,]+/))
        .map((tag) => tag.replace(/^#+/, "").trim().toLowerCase())
        .filter(Boolean)
        .map((tag) => `#${tag}`),
    ),
  ];
  const postedTags = hashtagsIn(post.caption);

  // The three parts, ours against the team's, measured in code.
  const ours = ourParts(idea);
  const part = (mine: string, theirs: string) => {
    const overlap = mine && theirs ? orderedOverlap(mine, theirs) : 0;
    return {
      ours: mine,
      theirs,
      oursWords: wordCount(mine),
      theirsWords: wordCount(theirs),
      overlap,
      verdict: verdictFor(overlap),
    };
  };
  // The closing ask: the analyst quotes it, code classifies it. Checked against
  // the end of the transcript too, so a CTA the analyst missed is still seen.
  const tail = spokenText.split(/\s+/).slice(-30).join(" ");
  const expectedCta = closingLineFor(idea.contentLane, idea.title);
  const closing =
    answer.theirCta.trim() || (ctaTypeOf(tail, idea.contentLane) === "lane" ? tail : "");
  const ctaType = ctaTypeOf(closing, idea.contentLane);
  const seconds = hadTranscript ? reelSeconds(transcript) : null;

  // Which researched facts reached the reel: said, or shown in the caption.
  const research = idea.source?.research
    ? researchUsage(idea.source.research, `${spokenText}\n${post.caption}`)
    : null;

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
    ...(research ? { research } : {}),
    parts: {
      hook: part(ours.hook, answer.spokenHook),
      body: part(ours.body, answer.theirBody),
      cta: part(ours.cta, closing),
    },
    hookType: hookTypeOf(answer.spokenHook),
    cta: { expected: expectedCta, spoken: closing, type: ctaType, usedLaneCta: ctaType === "lane" },
    body: { shape: answer.bodyShape, exampleType: answer.exampleType },
    reel: {
      seconds: seconds?.seconds ?? null,
      measured: seconds?.measured ?? false,
      words: wordCount(spokenText),
    },
    captionStats: captionStats(post.caption),
  };

  await updateReelLearning(
    ideaId,
    {
      transcript: transcript ?? null,
      comparison,
      usage: usageFor(scriptOverlap, answer.topicSame || !guessed),
      analysed_at: new Date().toISOString(),
    },
    cost,
  );
  return { row: (await readReelLearning(ideaId))! };
}
