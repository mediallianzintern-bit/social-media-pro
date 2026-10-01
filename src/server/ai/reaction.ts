// Addendum E.6 — the reaction-hook script.
//
// One model call, made only when someone presses "Write reaction script".
// Everything about the SOURCE is decided before the call and attached after
// it: the clip's link, platform, creator, on-screen credit and rights status
// come from the stored reaction_sources row. The model is never given a field
// it could write a URL or a credit into, so a reaction can only ever point at
// the clip the team chose — the guarantee this format depends on.
//
// After the call, code enforces what the prompt only asks for: shot 1 is the
// source clip, the CTA is the client's word for word, and any figure the
// source did not supply is marked [VERIFY] whether or not the model did.
import { z } from "zod";

import { completeJson, hasOpenAi } from "./client";
import { OWNER_ACCOUNTS } from "../apify/accounts";
import { recordPredictions, currentNiche } from "../predict";
import {
  latestSnapshot,
  readAnalysis,
  readPosts,
  readReactionSettings,
  readReactionSource,
  readTaxonomy,
  saveAnalysis,
  saveSuggestedIdeas,
  setReactionClaim,
} from "../store";
import { loadReactionLearning } from "../reactions";
import { lanePerformance, medianViews, type PlatformId } from "@/lib/analytics-types";
import type { AiAnalysis, ContentIdea, Shot } from "@/lib/ai-types";
import {
  BEAT_LABEL,
  defaultCredit,
  enforceVerify,
  EXPERT_SECONDS_CEILING,
  EXPERT_SECONDS_FLOOR,
  REACTION_BEATS,
  SOURCE_PLATFORM_LABEL,
  SOURCE_TYPE_LABEL,
  type ReactionFields,
  type ReactionSource,
} from "@/lib/reaction";

/** The longest transcript sent. Enough for a ~60s clip; the claim is near the start. */
const TRANSCRIPT_LIMIT = 3_000;

const SHOT_JSON = {
  type: "object",
  additionalProperties: false,
  required: ["mark", "shotType", "visual", "voiceover", "onScreenText", "transition"],
  properties: {
    mark: { type: "string", description: 'Time range, e.g. "0:00–0:06".' },
    shotType: {
      type: "string",
      description: '"Source clip", "Talking head — tight", "Screen", "B-roll".',
    },
    visual: { type: "string" },
    voiceover: { type: "string", description: "Spoken line. Empty for the source clip shot." },
    onScreenText: { type: "string" },
    transition: { type: "string" },
  },
} as const;

export const REACTION_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "extractedClaim",
    "title",
    "hook",
    "angle",
    "pivotType",
    "sourceIn",
    "sourceOut",
    "beats",
    "shots",
    "expertSeconds",
    "contentLane",
    "whyNow",
    "winningTrait",
    "caption",
    "hashtags",
  ],
  properties: {
    extractedClaim: {
      type: "string",
      description:
        "The belief or claim the source sets up, in one sentence, as the source says it.",
    },
    title: { type: "string", description: "Short working title for the team." },
    hook: {
      type: "string",
      description:
        "The expert's FIRST sentence. Contradicts, concedes-then-reframes, or raises the stakes.",
    },
    angle: { type: "string", description: "The expert's take in one sentence." },
    pivotType: { type: "string", enum: ["contradict", "concede_reframe", "raise_stakes"] },
    sourceIn: {
      type: "string",
      description: 'Where the borrowed segment starts in the source, e.g. "0:02".',
    },
    sourceOut: {
      type: "string",
      description:
        'Where it ends — the earliest moment the viewer has heard the claim, e.g. "0:09".',
    },
    beats: {
      type: "array",
      description: "The expert's segment, one entry per beat, in order.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["beat", "line"],
        properties: {
          beat: { type: "string", enum: [...REACTION_BEATS] },
          line: {
            type: "string",
            description: "What the expert says. Mark domain facts [VERIFY].",
          },
        },
      },
    },
    shots: {
      type: "array",
      description:
        "Shot list. Shot 1 is the source clip; the rest is the expert on the branded set.",
      items: SHOT_JSON,
    },
    expertSeconds: { type: "number", description: "Length of the expert's segment in seconds." },
    contentLane: { type: "string", description: "The owned lane the topic is redirected into." },
    whyNow: {
      type: "string",
      description: "Why this clip, for this account, now — citing the DATA.",
    },
    winningTrait: { type: "string", description: "The trait this reel tests, 5–8 words." },
    caption: { type: "string" },
    hashtags: { type: "array", items: { type: "string" } },
  },
};

const reactionSchema = z.object({
  extractedClaim: z.string().min(1),
  title: z.string().min(1),
  hook: z.string().min(1),
  angle: z.string(),
  pivotType: z.enum(["contradict", "concede_reframe", "raise_stakes"]),
  sourceIn: z.string(),
  sourceOut: z.string(),
  beats: z.array(z.object({ beat: z.enum(REACTION_BEATS), line: z.string() })),
  shots: z.array(
    z.object({
      mark: z.string(),
      shotType: z.string(),
      visual: z.string(),
      voiceover: z.string(),
      onScreenText: z.string(),
      transition: z.string(),
    }),
  ),
  expertSeconds: z.number(),
  contentLane: z.string(),
  whyNow: z.string(),
  winningTrait: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
});

export interface ReactionContext {
  source: ReactionSource;
  account: { handle: string; followers: number; medianViews: number };
  lanes: Array<{ lane: string; vsMedian: number; posts: number }>;
  ownedLane: string | null;
  standardCta: string | null;
  leadMagnet: string | null;
  brandSetNotes: string | null;
  /** E.9 — the expert length this account's reaction reels have won at. */
  expertTarget: { seconds: number | null; basis: string };
}

/**
 * The prompt. Built separately from the call so it can be inspected and
 * tested without spending anything.
 */
export function buildReactionRequest(context: ReactionContext): { system: string; user: string } {
  const { source } = context;
  const target =
    context.expertTarget.seconds != null
      ? `about ${context.expertTarget.seconds} seconds (${context.expertTarget.basis})`
      : `${EXPERT_SECONDS_FLOOR}–${EXPERT_SECONDS_CEILING} seconds (${context.expertTarget.basis})`;

  const system = `You write short-form video scripts for a professional's Instagram account.

REACTION-HOOK FORMAT. You are writing the expert's response to a borrowed clip. The DATA block
contains the clip's transcript and the claim it makes.
- Choose the cut-in point: the earliest moment the viewer has heard the claim. Give the source
  segment's in and out timestamps (sourceIn, sourceOut) against the source clip.
- The expert's FIRST sentence is the hook. It must contradict, concede-then-reframe, or raise
  the stakes on the claim. Never open with a greeting or with the expert's name.
- Respond to the CLAIM, never mock the person who made it. Where the source is partly right,
  say so first; it builds credibility.
- Follow the beats, in order: ${REACTION_BEATS.join(" → ")}. One entry per beat.
  ${REACTION_BEATS.map((beat) => `${beat}: ${BEAT_LABEL[beat]}`).join("; ")}.
- The redirect lands the topic in the account's OWNED LANE named in the DATA block.
- The cta beat is the account's STANDARD CTA, word for word, when one is given.
- Keep the expert segment near ${target}. The expert must add real information, not just react.
- Any factual or domain claim in the voiceover — statistics, prices, dates, figures, legal or
  financial points — must be marked [VERIFY] at the end of its line. Do not present a figure as
  settled fact unless it appears in the DATA block.
- Shot 1 is the source clip itself, with the credit overlay. Every later shot is the expert on
  the account's branded set, same framing each time, word-by-word burned-in captions.
- Do not write any URL, link, handle or credit text yourself. The source and its credit are
  attached to the script by the system after you answer.`;

  const transcript = (source.transcript ?? "").trim();
  const user = `DATA

ACCOUNT: @${context.account.handle} — ${context.account.followers.toLocaleString("en-US")} followers,
median ${context.account.medianViews.toLocaleString("en-US")} views per reel.

LANES (views as a multiple of this account's own median):
${context.lanes.length ? context.lanes.map((lane) => `- ${lane.lane}: ${lane.vsMedian}× over ${lane.posts} posts`).join("\n") : "- none classified yet"}

OWNED LANE FOR THE REDIRECT: ${context.ownedLane ?? "choose the best-fitting lane above"}
STANDARD CTA: ${context.standardCta ? `"${context.standardCta}"` : "none set — write one clear ask"}
LEAD MAGNET: ${context.leadMagnet ?? "none"}
BRAND SET: ${context.brandSetNotes ?? "the account's usual set"}

SOURCE CLIP
type: ${SOURCE_TYPE_LABEL[source.sourceType]} on ${SOURCE_PLATFORM_LABEL[source.sourcePlatform]}
${source.sourcePublicViews != null ? `public views: ${source.sourcePublicViews.toLocaleString("en-US")} (public signal only)` : ""}
${source.extractedClaim ? `claim (stated by the team): ${source.extractedClaim}` : "claim: not stated — extract it from the transcript"}
transcript:
${transcript ? transcript.slice(0, TRANSCRIPT_LIMIT) : "(no transcript — work from the claim above)"}

Write the reaction script.`;

  return { system, user };
}

/** Builds everything the prompt needs from stored data. No model call. */
export async function reactionContext(
  sourceId: string,
): Promise<ReactionContext | { reason: string }> {
  const source = await readReactionSource(sourceId);
  if (!source) return { reason: "That source clip is no longer stored." };
  if (!source.transcript?.trim() && !source.extractedClaim?.trim()) {
    return {
      reason: "Add the clip's transcript, or at least its key claim, before writing the script.",
    };
  }

  const platform = source.platform;
  const owner = OWNER_ACCOUNTS[platform];
  const [snapshot, posts, settings, taxonomy, learning] = await Promise.all([
    latestSnapshot(platform, owner.handle).catch(() => null),
    readPosts(platform, owner.handle).catch(() => []),
    readReactionSettings().catch(() => null),
    readTaxonomy(platform, owner.handle).catch(() => null),
    loadReactionLearning(platform).catch(() => null),
  ]);

  const lanes = lanePerformance(posts)
    .filter((lane) => lane.lane !== "other")
    .map((lane) => ({ lane: lane.lane, vsMedian: lane.medianVsMedian, posts: lane.postCount }));
  const known = new Set((taxonomy ?? []).map((lane) => lane.name));
  const owned =
    settings?.ownedLaneForRedirect && (!known.size || known.has(settings.ownedLaneForRedirect))
      ? settings.ownedLaneForRedirect
      : (settings?.ownedLaneForRedirect ?? null);

  return {
    source,
    account: {
      handle: owner.handle,
      followers: snapshot?.followers ?? 0,
      medianViews: Math.round(medianViews(posts)),
    },
    lanes,
    ownedLane: owned,
    standardCta: settings?.standardCta ?? null,
    leadMagnet: settings?.leadMagnet ?? null,
    brandSetNotes: settings?.brandSetNotes ?? null,
    expertTarget: learning?.winningExpertSeconds
      ? {
          seconds: learning.winningExpertSeconds,
          basis: "the length this account's own winning reaction reels ran",
        }
      : {
          seconds: null,
          basis: "the reference reels; replaced by this account's own once measured",
        },
  };
}

/**
 * Removes any link the model wrote.
 *
 * The prompt tells it not to, and the source link is attached separately —
 * but a made-up URL in a caption or a shot would still be a wrong source in
 * front of a client, so this does not rely on the instruction being obeyed.
 */
export function stripLinks(text: string): string {
  return text
    .replace(/\bhttps?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Removes any credit the model composed.
 *
 * The credit lives on shot 1 only, built from the stored source. Tested
 * against a reply that put "Credit: @someoneelse" in an expert shot: stripping
 * the link alone left the wrong creator's name on screen. So credit lines go
 * entirely, and so does any @handle other than the source's own — a reel that
 * credits the wrong person is the failure this format exists to prevent.
 */
export function stripCredits(text: string, sourceHandle: string | null): string {
  const own = sourceHandle?.replace(/^@/, "").toLowerCase() ?? null;
  return text
    .replace(
      /(?:🎥|📹|©)?\s*\b(?:credit|credits|source|via|courtesy(?: of)?|clip by|video by)\b\s*[:\-–—]?\s*[^\n.]*/gi,
      "",
    )
    .replace(/@([A-Za-z0-9._]+)/g, (match, handle: string) =>
      own && handle.toLowerCase() === own ? match : "",
    )
    .replace(/\s*[—–-]\s*$/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Turns the model's answer into a ContentIdea, enforcing in code what the
 * prompt only requested. Exported so it can be tested on a fixture.
 */
export function assembleReaction(
  rawInput: z.infer<typeof reactionSchema>,
  context: ReactionContext,
): ContentIdea {
  const { source } = context;
  // Every model-written string, cleaned of links before anything else reads it.
  const raw = {
    ...rawInput,
    title: stripLinks(rawInput.title),
    hook: stripLinks(rawInput.hook),
    angle: stripLinks(rawInput.angle),
    whyNow: stripLinks(rawInput.whyNow),
    extractedClaim: stripLinks(rawInput.extractedClaim),
    beats: rawInput.beats.map((entry) => ({ ...entry, line: stripLinks(entry.line) })),
    caption: stripCredits(stripLinks(rawInput.caption), source.sourceCreatorHandle),
    shots: rawInput.shots.map((shot) => ({
      ...shot,
      visual: stripCredits(stripLinks(shot.visual), source.sourceCreatorHandle),
      voiceover: stripLinks(shot.voiceover),
      onScreenText: stripCredits(stripLinks(shot.onScreenText), source.sourceCreatorHandle),
    })),
  };
  const credit =
    source.creditText?.trim() || defaultCredit(source.sourceCreatorHandle, source.sourcePlatform);

  // Figures the expert may state as fact: only those in what the script was
  // given. Everything else is [VERIFY], whatever the model marked.
  const allowed = [
    source.transcript ?? "",
    source.extractedClaim ?? "",
    raw.extractedClaim,
    context.leadMagnet ?? "",
    context.standardCta ?? "",
  ].join(" \n ");

  const beats = REACTION_BEATS.map((beat) => {
    const line = raw.beats.find((entry) => entry.beat === beat)?.line ?? "";
    // The CTA is the client's, word for word, whenever one is set.
    return { beat, line: beat === "cta" && context.standardCta ? context.standardCta : line };
  });
  const checkedBeats = enforceVerify(
    beats.map((entry) => entry.line),
    allowed,
  );

  // Shot 1 is the source clip, always, carrying the stored credit — never a
  // credit the model composed.
  const expertShots = raw.shots.filter((shot) => !/source/i.test(shot.shotType));
  const checkedShots = enforceVerify(
    expertShots.map((shot) => shot.voiceover),
    allowed,
  );
  const sourceShot: Shot = {
    mark: `0:00–${raw.sourceOut}`,
    shotType: "Source clip",
    visual: `Borrowed clip from ${source.sourceCreatorHandle ? `@${source.sourceCreatorHandle}` : "the source"}, ${raw.sourceIn}–${raw.sourceOut} of the original. Vertical, credit overlay small and legible.`,
    voiceover: "",
    onScreenText: credit,
    transition: "Hard cut to the expert",
  };
  const shots: Shot[] = [
    sourceShot,
    ...expertShots.map((shot, index) => ({
      ...shot,
      voiceover: checkedShots.lines[index] ?? shot.voiceover,
    })),
  ];
  // The closing spoken line is the CTA, word for word.
  if (context.standardCta && shots.length > 1) {
    const last = shots[shots.length - 1]!;
    shots[shots.length - 1] = { ...last, voiceover: context.standardCta };
  }

  const verifyItems = [...new Set([...checkedBeats.verifyItems, ...checkedShots.verifyItems])];
  const finalBeats = beats.map((entry, index) => ({
    beat: entry.beat,
    line: checkedBeats.lines[index] ?? entry.line,
  }));
  const missingBeats = finalBeats.filter((entry) => !entry.line.trim()).map((entry) => entry.beat);

  const reaction: ReactionFields = {
    sourceId: source.id,
    sourceUrl: source.sourceUrl,
    sourcePlatform: source.sourcePlatform,
    sourceCreatorHandle: source.sourceCreatorHandle,
    sourceType: source.sourceType,
    creditOverlayText: credit,
    rightsStatus: source.rightsStatus,
    claim: source.extractedClaim?.trim() || raw.extractedClaim,
    sourceIn: raw.sourceIn,
    sourceOut: raw.sourceOut,
    pivotType: raw.pivotType,
    expertSeconds: Math.round(raw.expertSeconds),
    beats: finalBeats,
    missingBeats,
    verifyItems,
    verifiedAt: null,
    verifiedBy: null,
  };

  return {
    id: "",
    format: "reel",
    title: raw.title,
    angle: raw.angle,
    whyNow: raw.whyNow,
    winningTrait: raw.winningTrait,
    contentLane: context.ownedLane ?? raw.contentLane,
    sourceSignal: source.foundBy === "trend_listener" ? "niche_trend" : "niche",
    hook: checkedBeats.lines[0] ?? raw.hook,
    shots,
    production: {
      durationSeconds: Math.round(raw.expertSeconds + Math.max(0, borrowed(raw))),
      aspectRatio: "9:16",
      coverText: raw.title,
      musicDirection: "None under the expert; the source clip keeps its own audio.",
      subtitleStyle: "Word-by-word burned-in captions, the same style across the series.",
      assetsNeeded: [
        `The source clip: ${source.sourceUrl}`,
        ...(context.leadMagnet ? [`Lead magnet on screen at the end: ${context.leadMagnet}`] : []),
      ],
      editorNotes: [
        `Shot 1 is the source clip with the credit overlay: "${credit}".`,
        `Borrow ${raw.sourceIn}–${raw.sourceOut} of the original.`,
        "Hard cut to the expert on the branded set; same framing every time.",
        ...(context.brandSetNotes
          ? [`Brand set: ${context.brandSetNotes}`]
          : ["Keep the brand screen visible."]),
        "End on the CTA with the lead magnet on screen.",
        ...(verifyItems.length
          ? [
              `${verifyItems.length} line(s) marked [VERIFY] must be confirmed by the client before filming.`,
            ]
          : []),
        ...(missingBeats.length
          ? [
              `The script skipped: ${missingBeats.map((beat) => BEAT_LABEL[beat]).join(", ")}. Fill before filming.`,
            ]
          : []),
      ],
    },
    caption: raw.caption,
    hashtags: raw.hashtags,
    reaction,
  };
}

function borrowed(raw: { sourceIn: string; sourceOut: string }): number {
  const toS = (mark: string) =>
    mark
      .split(":")
      .map(Number)
      .reduce((total, part) => total * 60 + (Number.isFinite(part) ? part : 0), 0);
  return toS(raw.sourceOut) - toS(raw.sourceIn);
}

/**
 * Writes one reaction script from a stored source clip. The only function in
 * this file that spends money — one model call — and only ever from a click.
 */
export async function generateReaction(
  sourceId: string,
): Promise<{ idea: ContentIdea | null; reason?: string }> {
  if (!hasOpenAi()) return { idea: null, reason: "OPENAI_API_KEY is not set." };

  const context = await reactionContext(sourceId);
  if ("reason" in context) return { idea: null, reason: context.reason };
  const platform: PlatformId = context.source.platform;

  const request = buildReactionRequest(context);
  const result = await completeJson<unknown>({
    system: request.system,
    user: request.user,
    schemaName: "reaction_script",
    schema: REACTION_SCHEMA,
    temperature: 0.6,
    effort: "medium",
  });
  const raw = reactionSchema.parse(result.data);
  const assembled = assembleReaction(raw, context);

  // The claim the strategist read, kept on the source when the team left it
  // blank, so the next script from this clip starts from the same claim.
  if (!context.source.extractedClaim?.trim()) {
    await setReactionClaim(context.source.id, raw.extractedClaim).catch(() => undefined);
  }

  const niche = await currentNiche(platform).catch(() => platform);
  const [withPrediction] = await recordPredictions(platform, niche, [assembled], [], 0, null).catch(
    () => [assembled],
  );
  const [saved] = await saveSuggestedIdeas(platform, [withPrediction ?? assembled]).catch(() => [
    withPrediction ?? assembled,
  ]);
  const idea = saved ?? assembled;

  // Shown with the other ideas on the platform page, newest first.
  const cached = await readAnalysis(platform).catch(() => null);
  const analysis: AiAnalysis = {
    ...(cached ?? {
      platform,
      generatedAt: new Date().toISOString(),
      model: result.model,
      competitors: null,
      ideas: [],
    }),
    ideas: [idea, ...(cached?.ideas ?? [])],
  };
  await saveAnalysis(platform, analysis).catch((error: unknown) =>
    console.error(`[reaction:${platform}] could not cache the new idea:`, error),
  );

  return { idea };
}
