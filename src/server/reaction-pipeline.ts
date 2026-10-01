// Addendum E — the automated reaction flow.
//
// "Prepare reaction" turns a clip worth reacting to into a script in one
// click: store the clip from its real permalink, fetch what it says, write the
// expert's response with the client's CTA. Each paid step is its own capped
// run, so the cost of a click is known in advance — about three cents.
//
// The source stays correct by construction throughout: the clip is stored
// from the post the sync found, never from text a model produced, and the
// script is attached to that stored row by id.
import { fetchReelTranscript, fetchReelVideoUrl } from "./apify/reels";
import { generateReaction } from "./ai/reaction";
import { createReactionSource } from "./reactions";
import { readReactionSource, saveReactionSource } from "./store";
import { approvalBlockers, type ReactionSource } from "@/lib/reaction";
import type { ContentIdea } from "@/lib/ai-types";
import type { PlatformId } from "@/lib/analytics-types";

/** Rewrites one stored source with a change, keeping everything else. */
async function updateSource(
  source: ReactionSource,
  patch: Partial<Pick<ReactionSource, "transcript" | "extractedClaim">>,
): Promise<ReactionSource> {
  return saveReactionSource({
    platform: source.platform,
    sourceUrl: source.sourceUrl,
    sourcePlatform: source.sourcePlatform,
    sourceCreatorHandle: source.sourceCreatorHandle,
    sourceType: source.sourceType,
    sourcePublicViews: source.sourcePublicViews,
    transcript: patch.transcript !== undefined ? patch.transcript : source.transcript,
    extractedClaim:
      patch.extractedClaim !== undefined ? patch.extractedClaim : source.extractedClaim,
    creditText: source.creditText,
    rightsStatus: source.rightsStatus,
    foundBy: source.foundBy,
    createdBy: null,
  });
}

/** Fetches and stores what a clip says. One capped Apify run. */
export async function transcribeSource(
  sourceId: string,
): Promise<{ source: ReactionSource } | { reason: string }> {
  const source = await readReactionSource(sourceId);
  if (!source) return { reason: "That clip is no longer stored." };
  if (source.sourcePlatform !== "instagram") {
    return {
      reason: "Automatic transcripts cover Instagram reels. Paste this clip's transcript instead.",
    };
  }
  const result = await fetchReelTranscript(source.sourceUrl);
  if ("reason" in result) return result;
  return { source: await updateSource(source, { transcript: result.transcript }) };
}

/**
 * A fresh link to the clip's video file, for the editor. One capped run.
 *
 * Only once the rights are settled as a CREDITED CLIP. A native remix or
 * stitch is made inside Instagram and needs no file; an unresolved clip is not
 * cleared to be used at all. Instagram's file links expire within a day or
 * three, so this fetches a new one each time rather than storing a copy.
 */
export async function sourceVideoFile(
  sourceId: string,
): Promise<{ videoUrl: string; filename: string } | { reason: string }> {
  const source = await readReactionSource(sourceId);
  if (!source) return { reason: "That clip is no longer stored." };
  if (source.rightsStatus === "native_remix") {
    return {
      reason:
        "This clip is set to native remix — make it with Instagram's Remix on the original post; no file is needed.",
    };
  }
  const blockers = approvalBlockers(source);
  if (blockers.length) return { reason: `Not cleared for use yet: ${blockers.join(" ")}` };
  if (source.sourcePlatform !== "instagram") {
    return {
      reason:
        "Source files can be fetched for Instagram reels. Download this one from the original link.",
    };
  }
  const result = await fetchReelVideoUrl(source.sourceUrl);
  if ("reason" in result) return result;
  const code = source.sourceUrl.split("/").filter(Boolean).pop() ?? "clip";
  const who = source.sourceCreatorHandle ? `${source.sourceCreatorHandle}_` : "";
  return { videoUrl: result.videoUrl, filename: `source_${who}${code}.mp4` };
}

export interface PrepareStep {
  step: "source" | "transcript" | "script";
  ok: boolean;
  note: string;
}

/**
 * Clip → stored source → transcript → script, in one click.
 *
 * A music-only reel has no speech to transcribe; the caption's hook stands in
 * as the claim so the script can still be written, and the step says so. Any
 * step that fails stops the ones after it, and every step reports what
 * happened — a half-finished preparation should be obvious, not silent.
 */
export async function prepareReaction(
  clip: { platform: PlatformId; url: string; handle: string; views: number | null; hook: string },
  staffEmail: string | null,
): Promise<{ steps: PrepareStep[]; source: ReactionSource | null; idea: ContentIdea | null }> {
  const steps: PrepareStep[] = [];

  const created = await createReactionSource(
    {
      platform: clip.platform,
      sourceUrl: clip.url,
      sourceCreatorHandle: clip.handle,
      sourceType: "other",
      sourcePublicViews: clip.views,
      foundBy: "trend_listener",
    },
    staffEmail,
  );
  if ("reason" in created) {
    steps.push({ step: "source", ok: false, note: created.reason });
    return { steps, source: null, idea: null };
  }
  let source = created.source;
  steps.push({ step: "source", ok: true, note: `Stored ${source.sourceUrl}` });

  const transcribed = await transcribeSource(source.id).catch((error: unknown) => ({
    reason: error instanceof Error ? error.message : String(error),
  }));
  if ("source" in transcribed) {
    source = transcribed.source;
    steps.push({ step: "transcript", ok: true, note: "Transcript fetched, with timestamps." });
  } else {
    // Music-only or unreadable: the caption's opening line is the claim.
    source = await updateSource(source, { extractedClaim: clip.hook });
    steps.push({
      step: "transcript",
      ok: false,
      note: `${transcribed.reason} Using the caption's hook as the claim instead.`,
    });
  }

  const written = await generateReaction(source.id).catch((error: unknown) => ({
    idea: null,
    reason: error instanceof Error ? error.message : String(error),
  }));
  if (written.idea) {
    steps.push({ step: "script", ok: true, note: "Script written with your CTA." });
  } else {
    steps.push({
      step: "script",
      ok: false,
      note: written.reason ?? "The script could not be written.",
    });
  }
  return { steps, source, idea: written.idea };
}
