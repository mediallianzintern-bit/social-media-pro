// Analyse for LinkedIn (Phase 3, 5 Nov 2026): what of the dashboard's post
// made it into the one the team published.
//
// No transcript and no Apify run: his whole post is already stored by the
// sync. Code measures everything it can from the two texts: which offered
// opening was used (A, B, C…), how much of the body survived, in order, the
// closing question and Repost line, length, reading grade, points, figures
// and hashtags. One model call (~1¢) only checks the topic and names what was
// kept, cut and added, and how the team writes when it changes a post.
import { z } from "zod";

import { costOf } from "@/lib/ai-cost";
import type { ContentIdea } from "@/lib/ai-types";
import type { PostRecord } from "@/lib/analytics-types";
import { figuresOf } from "@/lib/fact-check";
import { isOpeningPair, withChosenHook } from "@/lib/hook-variants";
import { readingGrade } from "@/lib/linkedin-readability";
import type {
  ElementVerdict,
  PostShape,
  ReelComparison,
  ReelUsage,
} from "@/lib/reel-learning-types";
import { closestHook, hashtagsIn, orderedOverlap } from "@/lib/reel-match";
import { BODY_SHAPES, ctaTypeOf, EXAMPLE_TYPES, hookTypeOf, wordCount } from "@/lib/reel-parts";
import { researchUsage } from "@/lib/research";

import { completeJson } from "../ai/client";
import { reviewModel } from "../ai/review";
import { confirmMatch, rejectMatch } from "./match";
import { readReelLearning, updateReelLearning, type ReelLearningRow } from "./store";

function verdictFor(overlap: number): ElementVerdict {
  if (overlap >= 0.6) return "as_written";
  if (overlap >= 0.25) return "adapted";
  return "own";
}

function usageFor(bodyOverlap: number, topicSame: boolean): ReelUsage {
  if (!topicSame) return "topic_only";
  if (bodyOverlap >= 0.6) return "as_written";
  if (bodyOverlap >= 0.25) return "partly";
  return "topic_only";
}

const linesOf = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/**
 * A LinkedIn post in three parts: its opening (one line, or two for a
 * headline and subheadline), its body, and its close, from the last question
 * to the end (the question and the Repost line). Exported for the tests.
 */
export function postParts(
  text: string,
  openingLines: number,
): { hook: string; body: string; cta: string } {
  const lines = linesOf(text);
  const hook = lines.slice(0, openingLines);
  const rest = lines.slice(openingLines);
  let close = rest.length;
  for (let index = rest.length - 1; index >= Math.max(0, rest.length - 4); index -= 1) {
    if (/\?["'’”)]*$/.test(rest[index]!)) {
      close = index;
      break;
    }
  }
  // No closing question: the Repost line alone is the close.
  if (close === rest.length && rest.length && /\brepost\b/i.test(rest[rest.length - 1]!)) {
    close = rest.length - 1;
  }
  return {
    hook: hook.join("\n"),
    body: rest.slice(0, close).join("\n"),
    cta: rest.slice(close).join("\n"),
  };
}

/** A published post's shape, measured in code. Exported for the tests. */
export function postShape(text: string): PostShape {
  const lines = linesOf(text);
  return {
    words: wordCount(text),
    grade: readingGrade(text),
    points: lines.filter((line) => /^\d+[.)]\s/.test(line)).length,
    figures: figuresOf(text).length,
    repost: /\brepost\b/i.test(lines.slice(-2).join(" ")),
    closingQuestion: lines.slice(-3).some((line) => /\?["'’”)]*$/.test(line)),
  };
}

const schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "topicSame",
    "topicNote",
    "hookStyle",
    "hookNote",
    "kept",
    "dropped",
    "added",
    "structure",
    "teamStyle",
    "bodyShape",
    "exampleType",
  ],
  properties: {
    topicSame: {
      type: "boolean",
      description:
        "True when the published post is about the same story: the same launch, campaign, product, company or event, even from a different angle. False only when it is about a different story altogether.",
    },
    topicNote: { type: "string", description: "One sentence: the story each one covers." },
    hookStyle: {
      type: "string",
      description:
        "The published opening's style in one or two words: story twist, lesson, question, statement, statistic, position, news report.",
    },
    hookNote: {
      type: "string",
      description:
        "One sentence: how the published opening differs from the offered ones, if it does.",
    },
    kept: {
      type: "array",
      items: { type: "string" },
      description:
        "Ideas, facts or points from the dashboard's post that were kept. Short phrases.",
    },
    dropped: {
      type: "array",
      items: { type: "string" },
      description: "Ideas, facts or points from the dashboard's post that were left out.",
    },
    added: {
      type: "array",
      items: { type: "string" },
      description: "Ideas, facts or points the published post has that the dashboard's did not.",
    },
    structure: {
      type: "string",
      description:
        "One or two sentences: the order the published post takes, against the dashboard's.",
    },
    teamStyle: {
      type: "string",
      description:
        "Two sentences at most: what the team does when it changes a post (its kind of opening, length, points, tone, ending), for a writer to imitate. Empty when nothing was changed.",
    },
    bodyShape: {
      type: "string",
      enum: [...BODY_SHAPES],
      description: "The shape of the published post's body, the closest of these.",
    },
    exampleType: {
      type: "string",
      enum: [...EXAMPLE_TYPES],
      description: "The kind of example the published post uses.",
    },
  },
} as const;

const parsed = z.object({
  topicSame: z.boolean(),
  topicNote: z.string(),
  hookStyle: z.string(),
  hookNote: z.string(),
  kept: z.array(z.string()),
  dropped: z.array(z.string()),
  added: z.array(z.string()),
  structure: z.string(),
  teamStyle: z.string(),
  bodyShape: z.enum(BODY_SHAPES).catch("other"),
  exampleType: z.enum(EXAMPLE_TYPES).catch("none"),
});

/** Runs the analysis for one published LinkedIn post and stores it. */
export async function analysePublishedPost(
  row: ReelLearningRow,
  stored: ContentIdea,
  post: PostRecord,
): Promise<{ row: ReelLearningRow } | { reason: string }> {
  // The post as the drawer showed it: opening with the hook the team picked.
  const idea = withChosenHook(stored);
  const ourText = idea.post?.body ?? "";
  if (!ourText.trim()) return { reason: "This idea has no post to compare." };
  const theirText = post.caption;
  const openingLines = isOpeningPair(idea.hook ?? "") ? 2 : 1;
  const ours = postParts(ourText, openingLines);
  const theirs = postParts(theirText, openingLines);

  const hooks = [idea.hook, ...(idea.altHooks ?? [])]
    .filter(Boolean)
    .map((hook, index) => `${String.fromCharCode(65 + index)}: ${hook.replace(/\n/g, " / ")}`)
    .join("\n");
  const reply = await completeJson<unknown>({
    system: `You compare a LinkedIn post a dashboard wrote with the post that was actually published.
Be exact and literal: quote the published post's own words. Never praise or judge quality here:
only describe what was kept, dropped, added and changed. The topic is the anchor: say plainly
whether the two cover the same story.`,
    user: `THE DASHBOARD'S POST
STORY: ${idea.source?.headline ?? idea.title}
OFFERED OPENINGS:
${hooks}
POST:
${ourText}

THE PUBLISHED POST
${theirText}`,
    schemaName: "post_comparison",
    schema: schema as unknown as Record<string, unknown>,
    model: reviewModel(),
    temperature: 0.2,
    effort: "medium",
    timeoutMs: 120_000,
  });
  const cost = reply.usage ? (costOf(reply.usage, reply.model).usd ?? 0) : 0;
  const model = parsed.safeParse(reply.data);
  if (!model.success) {
    if (cost) await updateReelLearning(row.ideaId, {}, cost);
    return { reason: "The comparison could not be read. Try again." };
  }
  const answer = model.data;

  // As for reels: only a timing guess is unlinked when the topic differs.
  const guessed = row.match?.by === "timing" && !row.match.confirmed;
  if (!answer.topicSame && guessed) {
    if (cost) await updateReelLearning(row.ideaId, {}, cost);
    await rejectMatch((await readReelLearning(row.ideaId))!);
    return {
      reason: `That post covers a different story (${answer.topicNote}), so it was unlinked. The right one is found on the next Sync, or link it yourself.`,
    };
  }
  await confirmMatch(row);

  const hook = closestHook(idea, theirs.hook);
  const bodyOverlap = orderedOverlap(ourText, theirText);
  const offeredTags = [
    ...new Set(
      (idea.hashtags ?? [])
        .flatMap((tag) => tag.split(/[\s,]+/))
        .map((tag) => tag.replace(/^#+/, "").trim().toLowerCase())
        .filter(Boolean)
        .map((tag) => `#${tag}`),
    ),
  ];
  const postedTags = hashtagsIn(theirText);
  const part = (mine: string, published: string) => {
    const overlap = mine && published ? orderedOverlap(mine, published) : 0;
    return {
      ours: mine,
      theirs: published,
      oursWords: wordCount(mine),
      theirsWords: wordCount(published),
      overlap,
      verdict: verdictFor(overlap),
    };
  };
  const research = idea.source?.research ? researchUsage(idea.source.research, theirText) : null;
  const ctaType = ctaTypeOf(theirs.cta, idea.contentLane);

  const comparison: ReelComparison = {
    topic: { same: answer.topicSame, note: answer.topicNote },
    hook: {
      spoken: theirs.hook,
      variant: hook.overlap >= 0.6 ? hook.variant : null,
      overlap: hook.overlap,
      verdict: verdictFor(hook.overlap),
      style: answer.hookStyle,
      note: answer.hookNote,
    },
    script: {
      overlap: bodyOverlap,
      verdict: verdictFor(bodyOverlap),
      kept: answer.kept,
      dropped: answer.dropped,
      added: answer.added,
      structure: answer.structure,
    },
    // A LinkedIn post is its own caption.
    caption: {
      overlap: bodyOverlap,
      verdict: verdictFor(bodyOverlap),
      note: "On LinkedIn the post is its own caption.",
    },
    hashtags: {
      used: offeredTags.filter((tag) => postedTags.includes(tag)),
      dropped: offeredTags.filter((tag) => !postedTags.includes(tag)),
      added: postedTags.filter((tag) => !offeredTags.includes(tag)),
    },
    teamStyle: answer.teamStyle,
    hadTranscript: true,
    ...(research ? { research } : {}),
    parts: {
      hook: part(ours.hook, theirs.hook),
      body: part(ours.body, theirs.body),
      cta: part(ours.cta, theirs.cta),
    },
    hookType: hookTypeOf(linesOf(theirs.hook)[0] ?? ""),
    cta: { expected: null, spoken: theirs.cta, type: ctaType, usedLaneCta: false },
    body: { shape: answer.bodyShape, exampleType: answer.exampleType },
    reel: { seconds: null, measured: false, words: wordCount(theirText) },
    post: postShape(theirText),
  };

  await updateReelLearning(
    row.ideaId,
    {
      comparison,
      usage: usageFor(bodyOverlap, answer.topicSame || !guessed),
      analysed_at: new Date().toISOString(),
    },
    cost,
  );
  return { row: (await readReelLearning(row.ideaId))! };
}
