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
import { PRITESH_VOICE } from "./voice";
import { significantWords } from "@/lib/lane-fit";
import { DAILY_CTA, closingLineFor } from "@/lib/script-families";
import { workflowCta } from "@/lib/tool-workflow";

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
  EXPERT_WORDS_MAX,
  EXPERT_WORDS_MIN,
  REEL_SECONDS_CEILING,
  REEL_SECONDS_FLOOR,
  REACTION_BEATS,
  SOURCE_PLATFORM_LABEL,
  SOURCE_TYPE_LABEL,
  type ReactionFields,
  type ReactionSource,
} from "@/lib/reaction";

/** The longest transcript sent. Enough for a ~60s clip; the claim is near the start. */
const TRANSCRIPT_LIMIT = 3_000;

/** How the expert's beats can be filmed: the variety the written reels have. */
export const EXPERT_SHOT_TYPES = [
  "Talking head — tight",
  "Talking head — wide",
  "Screen recording",
  "B-roll",
  "Text card",
] as const;

/**
 * The fallback shot for a beat the model left undescribed, so a script never
 * collapses back into one long talking head.
 */
const BEAT_SHOT: Record<(typeof REACTION_BEATS)[number], { shotType: string; visual: string }> = {
  pivot: {
    shotType: "Talking head — tight",
    visual: "Pritesh straight to camera on the branded set",
  },
  authority: {
    shotType: "Talking head — wide",
    visual: "Pritesh on the branded set, brand screen visible",
  },
  specifics: { shotType: "Screen recording", visual: "The example he names, on screen" },
  mechanism: { shotType: "B-roll", visual: "Footage that shows how it works" },
  twist: { shotType: "Talking head — tight", visual: "Pritesh straight to camera, closer framing" },
  redirect: { shotType: "Talking head — wide", visual: "Pritesh on the branded set" },
  cta: { shotType: "Text card", visual: "Simple text card with the CTA" },
};

export const REACTION_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "extractedClaim",
    "title",
    "hook",
    "altHooks",
    "angle",
    "pivotType",
    "sourceIn",
    "sourceOut",
    "beats",
    "musicDirection",
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
    altHooks: {
      type: "array",
      items: { type: "string" },
      description:
        "Exactly 2 OTHER opening sentences for this same reaction, for an A/B test. Each must " +
        "pivot off the SAME claim and lead into the same beats, but open a genuinely different " +
        "way — one may contradict, another concede then reframe, another raise the stakes. " +
        "Three rewordings of one opening are not a test and are the one thing this must not be.",
    },
    angle: { type: "string", description: "The expert's take in one sentence." },
    pivotType: { type: "string", enum: ["contradict", "concede_reframe", "raise_stakes"] },
    sourceIn: {
      type: "string",
      description:
        'Where the borrowed segment starts, as m:ss within the source clip, e.g. "0:02". ' +
        "The source is a reel, so this is seconds and single-digit minutes — never an hour.",
    },
    sourceOut: {
      type: "string",
      description:
        'Where it ends — the earliest moment the viewer has heard the claim, e.g. "0:09". ' +
        "MUST be LATER than sourceIn: this is a span of real footage, so the two are never " +
        "equal. Aim for 3 to 20 seconds of borrowed clip, long enough to state the claim and " +
        "no longer.",
    },
    beats: {
      type: "array",
      description: "The expert's segment, one entry per beat, in order.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["beat", "line", "shotType", "visual", "onScreenText"],
        properties: {
          beat: { type: "string", enum: [...REACTION_BEATS] },
          line: {
            type: "string",
            description: "What the expert says. Mark domain facts [VERIFY].",
          },
          shotType: {
            type: "string",
            enum: [...EXPERT_SHOT_TYPES],
            description: "How this beat is filmed. Vary it across the beats.",
          },
          visual: {
            type: "string",
            description:
              "What the viewer sees during this beat, concretely enough for an editor to source " +
              "it: the exact screen, footage or framing.",
          },
          onScreenText: {
            type: "string",
            description: "Two to five words burned on screen for this beat.",
          },
        },
      },
    },
    musicDirection: {
      type: "string",
      description:
        "Music under the expert's part: mood, genre and energy. The source clip keeps its own audio.",
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
  altHooks: z.array(z.string()).default([]),
  angle: z.string(),
  pivotType: z.enum(["contradict", "concede_reframe", "raise_stakes"]),
  sourceIn: z.string(),
  sourceOut: z.string(),
  beats: z.array(
    z.object({
      beat: z.enum(REACTION_BEATS),
      line: z.string(),
      shotType: z.string().default(""),
      visual: z.string().default(""),
      onScreenText: z.string().default(""),
    }),
  ),
  musicDirection: z.string().default(""),
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
  // What the expert may spend, once the borrowed clip has taken its share of
  // the whole reel. Named in WORDS as well as seconds, because words are what
  // the writer controls and seconds are what it kept guessing wrong.
  const measured =
    context.expertTarget.seconds != null
      ? ` This account's own winning reaction reels ran about ${context.expertTarget.seconds} seconds of expert (${context.expertTarget.basis}); stay near that where you can.`
      : "";

  // The core voice only, not the general reel module: this format fixes its
  // own beats, its own timing target and a word-for-word CTA, and the reel
  // module's "30-90 seconds, hook-context-explanation" guidance would compete
  // with those. How Pritesh sounds is the same; the shape is the format's.
  const system = `You write the expert's reaction scripts for Pritesh Sir's Instagram account.

${PRITESH_VOICE}

REACTION-HOOK FORMAT. You are writing the expert's response to a borrowed clip. The DATA block
contains the clip's transcript and the claim it makes. The beats, timing and CTA rules below are
fixed by this format and take precedence over any general guidance.
- Choose the cut-in point: the earliest moment the viewer has heard the claim. Give the source
  segment's in and out timestamps (sourceIn, sourceOut) against the source clip, as m:ss.
  sourceOut MUST be LATER than sourceIn — this is a span of footage an editor will cut, so
  "0:00-0:00" is not an answer. Borrow 3 to 20 seconds. Where the transcript carries
  timestamps, take them from the line that states the claim; where it does not, judge from how
  long the claim takes to say.
- The expert's FIRST sentence is the hook. It must contradict, concede-then-reframe, or raise
  the stakes on the claim. Never open with a greeting or with the expert's name.
- Give TWO alternative opening sentences in altHooks, for the team to choose between. Each
  pivots off the same claim into the same beats, but opens a different way: if the hook
  contradicts, let one concede-then-reframe and one raise the stakes. Not three rewordings.
- Respond to the CLAIM, never mock the person who made it. Where the source is partly right,
  say so first; it builds credibility. Correct it the way he explains anything — calmly, simply,
  with what people are getting wrong and what he actually thinks — not as a takedown.
- Follow the beats, in order: ${REACTION_BEATS.join(" → ")}. One entry per beat.
  ${REACTION_BEATS.map((beat) => `${beat}: ${BEAT_LABEL[beat]}`).join("; ")}.
- The redirect lands the topic in the account's OWNED LANE named in the DATA block.
- The cta beat is the account's STANDARD CTA, word for word, when one is given.
- LENGTH, AND IT IS A HARD LIMIT. The WHOLE reel — the borrowed clip plus the expert — runs
  ${REEL_SECONDS_FLOOR} to ${REEL_SECONDS_CEILING} seconds. The borrowed clip takes 3 to 12 of
  those, so the expert speaks ${EXPERT_WORDS_MIN} to ${EXPERT_WORDS_MAX} WORDS in total across
  every beat. Count them before you answer. Set expertSeconds to roughly half your word count,
  which is the pace he actually speaks at.${measured}
- THAT BUDGET IS THE WHOLE JOB, so spend it. Each beat is ONE sentence, twelve to eighteen
  words. No preamble, no restating the claim before answering it, no sentence that only
  introduces the next one. If a beat needs a second sentence, something earlier is wasting
  words — cut that instead. The expert must add real information, not just react.
- Any factual or domain claim in the voiceover — statistics, prices, dates, figures, legal or
  financial points — must be marked [VERIFY] at the end of its line. Do not present a figure as
  settled fact unless it appears in the DATA block.
- EVERY BEAT IS ITS OWN SHOT, like a normal reel's shot list — never one long talking head.
  For each beat give shotType (${EXPERT_SHOT_TYPES.join(", ")}), a concrete visual an editor
  can source (the exact screen, footage or framing) and two to five words of onScreenText.
  Vary the shots: open on a tight talking head, show the specifics on screen or in B-roll,
  and end the cta beat on a text card. The source clip itself is shot 1 and is added by the
  system; do not describe it.
- musicDirection: the mood, genre and energy under the expert's part.
- Do not write any URL, link, handle or credit text yourself. The source and its credit are
  attached to the script by the system after you answer.
- Exactly 5 hashtags.`;

  const transcript = (source.transcript ?? "").trim();
  const user = `DATA

ACCOUNT: @${context.account.handle} — ${context.account.followers.toLocaleString("en-US")} followers,
median ${context.account.medianViews.toLocaleString("en-US")} views per reel.

LANES (views as a multiple of this account's own median):
${context.lanes.length ? context.lanes.map((lane) => `- ${lane.lane}: ${lane.vsMedian}× over ${lane.posts} posts`).join("\n") : "- none classified yet"}

OWNED LANE FOR THE REDIRECT: ${context.ownedLane ?? "choose the best-fitting lane above"}
STANDARD CTA: ${context.standardCta ? `"${context.standardCta}"` : `none set by the client, so the lane's: Frontier AI developments, Brand strategy lessons and Marketing stunts end on "${DAILY_CTA}"; AI tool workflows end on "${workflowCta("KEYWORD")}" with one keyword in capitals from the topic`}
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
  // The borrowed span, checked and repaired before anything reads it — the
  // shot mark, the visual, the editor note and the duration all quote it.
  const segment = borrowedSegment(rawInput, source.transcript, source.extractedClaim);
  // Every model-written string, cleaned of links before anything else reads it.
  const raw = {
    ...rawInput,
    sourceIn: segment.sourceIn,
    sourceOut: segment.sourceOut,
    title: stripLinks(rawInput.title),
    hook: stripLinks(rawInput.hook),
    angle: stripLinks(rawInput.angle),
    whyNow: stripLinks(rawInput.whyNow),
    extractedClaim: stripLinks(rawInput.extractedClaim),
    beats: rawInput.beats.map((entry) => ({
      ...entry,
      line: stripLinks(entry.line),
      visual: stripCredits(stripLinks(entry.visual), source.sourceCreatorHandle),
      onScreenText: stripCredits(stripLinks(entry.onScreenText), source.sourceCreatorHandle),
    })),
    caption: stripCredits(stripLinks(rawInput.caption), source.sourceCreatorHandle),
  };
  const credit =
    source.creditText?.trim() || defaultCredit(source.sourceCreatorHandle, source.sourcePlatform);

  // Figures the expert may state as fact: only those in what the script was
  // given. Everything else is [VERIFY], whatever the model marked.
  // The client's own CTA when one is set, otherwise the lane's agreed line.
  const closing =
    context.standardCta ?? closingLineFor(context.ownedLane ?? raw.contentLane, raw.title);
  const allowed = [
    source.transcript ?? "",
    source.extractedClaim ?? "",
    raw.extractedClaim,
    context.leadMagnet ?? "",
    closing ?? "",
  ].join(" \n ");

  const beats = REACTION_BEATS.map((beat) => {
    const line = raw.beats.find((entry) => entry.beat === beat)?.line ?? "";
    // The CTA is the client's, word for word, whenever one is set.
    return { beat, line: beat === "cta" && closing ? closing : line };
  });
  const checkedBeats = enforceVerify(
    beats.map((entry) => entry.line),
    allowed,
  );

  // Shot 1 is the source clip, always, carrying the stored credit — never a
  // credit the model composed. After it, ONE SHOT PER BEAT: a real script had
  // the model put every beat in a single 51-second talking head, which gives
  // an editor nothing to cut to. Built from the beats, so that cannot recur.
  // The closing line is already in the cta beat, so the marks below are timed
  // on the words actually said, CTA included.
  const beatShots = REACTION_BEATS.map((beat, index) => {
    const entry = raw.beats.find((candidate) => candidate.beat === beat);
    return {
      beat,
      line: checkedBeats.lines[index] ?? beats[index]!.line,
      shotType: entry?.shotType?.trim() || BEAT_SHOT[beat].shotType,
      visual: entry?.visual?.trim() || BEAT_SHOT[beat].visual,
      onScreenText: entry?.onScreenText?.trim() ?? "",
    };
  }).filter((shot) => shot.line.trim());
  const expertShots = beatShots.map((shot, index) => ({
    mark: "",
    shotType: shot.shotType,
    visual: shot.visual,
    voiceover: shot.line,
    onScreenText: shot.beat === "cta" && !shot.onScreenText ? (closing ?? "") : shot.onScreenText,
    transition: index === beatShots.length - 1 ? "End" : "Hard cut",
  }));

  // THE REEL'S OWN CLOCK, rebuilt here rather than taken from the model.
  //
  // Two timelines are in play and they are not the same one: where a moment
  // sits inside the SOURCE clip (borrow 0:25-0:33 of the original), and where
  // it sits in the FINISHED reel (that borrowed piece runs 0:00-0:08 of what
  // the viewer watches). The model was writing the first and the shot list was
  // printing it as the second, so a real handover read "0:00-0:04" for shot 1
  // and then jumped to "0:27-0:30" for shot 2 — twenty-three seconds of
  // nothing, and a shot list ending at 0:54 under a heading that said 32s.
  //
  // So the source shot runs from zero for as long as the borrow lasts, and the
  // expert's shots follow it without a gap, sharing his segment in proportion
  // to how much there is to say in each. The last one ends exactly on the
  // duration the production block states.
  const spokenLines = expertShots.map((shot) => shot.voiceover);
  // How long the expert's part ACTUALLY runs, from the words written rather
  // than from the model's own estimate of them. Asked for 28-32 seconds it
  // returned 12 for seven full sentences, which put a fifteen-word line in a
  // one-second shot. Words are the thing that takes time to say, so they are
  // what the clock is built from — the same two-words-a-second the review pass
  // uses on a written reel.
  const expertSeconds = expertSecondsFor(spokenLines);
  const expertMarks = reelTimeline(segment.seconds, expertSeconds, spokenLines);
  const sourceShot: Shot = {
    mark: `0:00–${asMark(segment.seconds)}`,
    shotType: "Source clip",
    visual: `Borrowed clip from ${source.sourceCreatorHandle ? `@${source.sourceCreatorHandle}` : "the source"}, ${raw.sourceIn}–${raw.sourceOut} of the original. Vertical, credit overlay small and legible.`,
    voiceover: "",
    onScreenText: credit,
    transition: "Hard cut to the expert",
  };
  const shots: Shot[] = [
    sourceShot,
    ...expertShots.map((shot, index) => ({ ...shot, mark: expertMarks[index] ?? shot.mark })),
  ];

  const verifyItems = [...new Set(checkedBeats.verifyItems)];
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
    expertSeconds,
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
    // Two other ways in, for the same A/B the written reels get.
    altHooks: rawInput.altHooks
      .map((line) => stripLinks(line).trim())
      .filter(Boolean)
      .slice(0, 2),
    shots,
    production: {
      durationSeconds: expertSeconds + segment.seconds,
      aspectRatio: "9:16",
      coverText: raw.title,
      musicDirection: raw.musicDirection.trim()
        ? `${raw.musicDirection.trim()} under the expert; the source clip keeps its own audio.`
        : "None under the expert; the source clip keeps its own audio.",
      subtitleStyle: "Word-by-word burned-in captions, the same style across the series.",
      assetsNeeded: [
        `The source clip: ${source.sourceUrl}`,
        // What the editor must find for the shots that are not filmed on set.
        ...expertShots
          .filter((shot) => /b-roll|screen/i.test(shot.shotType))
          .map((shot) => `${shot.shotType}: ${shot.visual}`),
        ...(context.leadMagnet ? [`Lead magnet on screen at the end: ${context.leadMagnet}`] : []),
      ],
      editorNotes: [
        // Said exactly, because an editor who is told the wrong thing about
        // where a number came from stops believing the notes.
        // Said when the words written overrun the length this format is
        // measured to work at, because the fix is cutting lines, not reading
        // faster.
        // Judged on the WHOLE reel, which is what the team watches.
        ...(expertSeconds + segment.seconds > REEL_SECONDS_CEILING
          ? [
              `This runs about ${expertSeconds + segment.seconds}s all in (${segment.seconds}s borrowed + ${expertSeconds}s of expert) against a ${REEL_SECONDS_FLOOR}-${REEL_SECONDS_CEILING}s target. Cut words, do not read faster.`,
            ]
          : []),
        ...(segment.from === "transcript"
          ? [
              `The borrowed in/out ${segment.sourceIn}-${segment.sourceOut} was read from the clip's own transcript, not chosen by the writer. Check it against the video before cutting.`,
            ]
          : segment.from === "placeholder"
            ? [
                `PLACEHOLDER in/out: ${segment.sourceIn}-${segment.sourceOut}. This clip has no timed transcript and the writer's own answer was unusable, so watch the clip and set the real cut.`,
              ]
            : []),
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
    // Five, per the voice — capped in code because a model asked for five
    // still returns more.
    hashtags: raw.hashtags.slice(0, 5),
    reaction,
  };
}

const toSeconds = (mark: string): number =>
  mark
    .split(":")
    .map(Number)
    .reduce((total, part) => total * 60 + (Number.isFinite(part) ? part : 0), 0);

const asMark = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

/** A relaxed speaking pace, the same one the written reels are timed at. */
const WORDS_PER_SECOND = 2;

/**
 * How many seconds the expert's lines really need, from the words alone.
 *
 * The model is asked for this figure and is reliably wrong about it: 12
 * seconds for seven full sentences on one script, 58 for the 96 words of the
 * next — which put a reel two seconds past its ceiling while the words it
 * contained were comfortably inside it. Its estimate was briefly kept as a
 * floor, on the theory that a slow delivery should not be squeezed; all that
 * did was let a bad guess set the length. The words are what gets spoken, so
 * the words decide, at the same two a second the written reels are timed at.
 */
export function expertSecondsFor(lines: string[]): number {
  const words = lines
    .join(" ")
    // Bracketed notes are for the team, never said aloud.
    .replace(/\[[^\]]*\]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(Math.max(1, lines.length), Math.ceil(words / WORDS_PER_SECOND));
}

/**
 * The finished reel's own shot marks: the borrowed clip, then the expert,
 * continuous, ending exactly on the stated duration.
 *
 * Each expert shot gets a share of his segment in proportion to how many words
 * it carries, with a floor so a three-word line still has room to land. Marks
 * are cumulative, so they are contiguous by construction rather than by
 * arithmetic that can drift.
 */
export function reelTimeline(
  borrowSeconds: number,
  expertSeconds: number,
  lines: string[],
): string[] {
  if (!lines.length) return [];
  const words = lines.map((line) => Math.max(1, line.trim().split(/\s+/).filter(Boolean).length));
  const total = words.reduce((sum, count) => sum + count, 0);
  const span = Math.max(lines.length, expertSeconds);

  let at = 0;
  const bounds = [0];
  for (const count of words) {
    at += (span * count) / total;
    bounds.push(at);
  }

  const marks: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const from = Math.round(borrowSeconds + bounds[i]!);
    // Never a zero-length shot, however short its line.
    const to = Math.max(from + 1, Math.round(borrowSeconds + bounds[i + 1]!));
    marks.push(`${asMark(from)}–${asMark(to)}`);
  }
  return marks;
}

/** A borrowed setup states the claim and stops. Outside this, the model guessed. */
const MIN_BORROW_SECONDS = 3;
// Twelve, not twenty: the whole reel has 50-60 seconds and the expert needs
// most of them. A setup longer than this is the source's reel, not his.
const MAX_BORROW_SECONDS = 12;

/**
 * The borrowed segment, repaired when the model returns one an editor cannot cut.
 *
 * Two failures seen on real scripts: "0:00-0:00", which is no footage at all,
 * and "00:45:00-00:45:00", which reads as forty-five MINUTES into a thirty
 * second reel. Both are the model filling a required field it had no evidence
 * for — which happens whenever the clip has no timed transcript.
 *
 * So the span is checked rather than trusted. Where it is unusable, the
 * transcript's own timestamps answer it: the line that states the claim, and
 * the line after it. Where there is no transcript either, it falls back to the
 * opening seconds and SAYS SO in the editor notes, because a made-up
 * timestamp presented as a decision is worse than an obvious placeholder.
 */
export function borrowedSegment(
  raw: { sourceIn: string; sourceOut: string },
  transcript: string | null,
  claim: string | null,
): {
  sourceIn: string;
  sourceOut: string;
  seconds: number;
  /** "model" when its own answer was usable, otherwise where the repair came from. */
  from: "model" | "transcript" | "placeholder";
} {
  const start = toSeconds(raw.sourceIn);
  const end = toSeconds(raw.sourceOut);
  const span = end - start;
  const sane =
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start >= 0 &&
    start < 600 &&
    span >= MIN_BORROW_SECONDS &&
    span <= MAX_BORROW_SECONDS;
  if (sane) {
    return { sourceIn: asMark(start), sourceOut: asMark(end), seconds: span, from: "model" };
  }

  // "0:04 For research, this is bad..." — the shape transcripts are stored in.
  const timed = [...(transcript ?? "").matchAll(/(\d{1,2}:\d{2})\s+([^\n]+)/g)].map((match) => ({
    at: toSeconds(match[1]!),
    line: (match[2] ?? "").trim(),
  }));
  if (timed.length) {
    // Stopword-aware, or the match is decided by whichever line happens to
    // contain "this": on a real transcript that pointed the cut at 0:04, four
    // lines before the claim it was meant to find.
    const words = significantWords(claim ?? "");
    const hit =
      timed.find((entry) => {
        const line = entry.line.toLowerCase();
        return words.length >= 2 && words.filter((word) => line.includes(word)).length >= 2;
      }) ?? timed[0]!;
    const index = timed.indexOf(hit);
    const after = timed[index + 1]?.at ?? hit.at + 8;
    const to = Math.min(hit.at + MAX_BORROW_SECONDS, Math.max(after, hit.at + MIN_BORROW_SECONDS));
    return {
      sourceIn: asMark(hit.at),
      sourceOut: asMark(to),
      seconds: to - hit.at,
      from: "transcript",
    };
  }

  return { sourceIn: "0:00", sourceOut: "0:08", seconds: 8, from: "placeholder" };
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
