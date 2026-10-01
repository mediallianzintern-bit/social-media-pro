// Addendum E — the two paid steps for a source clip, each one Apify run:
//
//   transcript — what the clip says, with timestamps, so the script can cut
//                in at the moment the claim is actually heard;
//   video      — a fresh link to the clip's video file, for the editor.
//
// Both run only from an explicit click, and each run carries a spend cap that
// Apify enforces itself. The actors are configurable, because a marketplace
// actor can be repriced or retired; the defaults were chosen from the Apify
// store on usage and price:
//
//   transcript  steadyfetch/instagram-reel-transcript-scraper
//               ~$0.015 a reel, timestamped segments, music-only reels free
//   video       apify/instagram-scraper (official)
//               ~$0.003 a post, returns the post's videoUrl
//
// Neither output shape is guaranteed by the store listing, so both are read
// tolerantly, and a reply that does not match says which fields it DID have —
// a parse failure should point at the cause, not just say "failed".
import { apifyToken, datasetItems, runActor } from "./client";

const TRANSCRIPT_ACTOR =
  process.env["REACTION_TRANSCRIPT_ACTOR"]?.trim() ||
  "steadyfetch/instagram-reel-transcript-scraper";
const VIDEO_ACTOR = process.env["REACTION_VIDEO_ACTOR"]?.trim() || "apify/instagram-scraper";

/** The most one transcript or video run may cost, in USD. Enforced by Apify. */
const TRANSCRIPT_CAP_USD = 0.05;
const VIDEO_CAP_USD = 0.02;

type Row = Record<string, unknown>;

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** "83.4" seconds -> "1:23". */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function secondsOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Some actors give milliseconds; nothing in a 3-minute reel is past 10,000s.
    return value > 10_000 ? value / 1000 : value;
  }
  if (typeof value === "string") {
    const parts = value.split(":").map(Number);
    if (parts.every((part) => Number.isFinite(part))) {
      return parts.reduce((total, part) => total * 60 + part, 0);
    }
  }
  return null;
}

/** Timestamped lines, when the actor gave segments. */
function segmentsOf(row: Row): string | null {
  const list = [row["segments"], row["transcriptSegments"], row["timestamps"], row["chunks"]].find(
    (value): value is unknown[] => Array.isArray(value) && value.length > 0,
  );
  if (!list) return null;
  const lines = list
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const segment = entry as Row;
      const words =
        text(segment["text"]) ?? text(segment["transcript"]) ?? text(segment["content"]);
      if (!words) return null;
      const start = secondsOf(
        segment["start"] ?? segment["startTime"] ?? segment["from"] ?? segment["offset"],
      );
      return start != null ? `${clock(start)} ${words}` : words;
    })
    .filter((line): line is string => Boolean(line));
  return lines.length ? lines.join("\n") : null;
}

export async function fetchReelTranscript(
  url: string,
): Promise<{ transcript: string } | { reason: string }> {
  if (!apifyToken()) return { reason: "APIFY_TOKEN is not set." };
  const { datasetId } = await runActor(
    TRANSCRIPT_ACTOR,
    { reelUrls: [url], maxItems: 1, maxRunSeconds: 240 },
    5 * 60_000,
    { maxTotalChargeUsd: TRANSCRIPT_CAP_USD },
  );
  const rows = await datasetItems<Row>(datasetId, 5);
  const row = rows[0];
  if (!row) return { reason: "The transcript service returned nothing for this reel." };

  const failure = text(row["error"]) ?? text(row["errorMessage"]) ?? text(row["reason"]);
  const transcript =
    segmentsOf(row) ??
    text(row["transcript"]) ??
    text(row["text"]) ??
    text(row["fullText"]) ??
    text(row["transcriptText"]) ??
    text(row["onScreenText"]);
  if (transcript) return { transcript };
  if (failure) return { reason: `No transcript: ${failure}` };
  return {
    reason: `No speech found — likely a music-only reel. Paste the key claim instead. (Fields returned: ${Object.keys(row).slice(0, 12).join(", ")})`,
  };
}

export async function fetchReelVideoUrl(
  url: string,
): Promise<{ videoUrl: string } | { reason: string }> {
  if (!apifyToken()) return { reason: "APIFY_TOKEN is not set." };
  const { datasetId } = await runActor(
    VIDEO_ACTOR,
    { directUrls: [url], resultsType: "posts", resultsLimit: 1, addParentData: false },
    4 * 60_000,
    { maxTotalChargeUsd: VIDEO_CAP_USD },
  );
  const rows = await datasetItems<Row>(datasetId, 3);
  const row = rows[0];
  if (!row) return { reason: "The post could not be fetched — it may be private or removed." };

  const videos = Array.isArray(row["videos"]) ? (row["videos"] as Row[]) : [];
  const videoUrl =
    text(row["videoUrl"]) ?? text(row["video_url"]) ?? text(videos[0]?.["url"]) ?? null;
  if (videoUrl) return { videoUrl };
  if (text(row["error"])) return { reason: `Could not fetch the video: ${text(row["error"])}` };
  return {
    reason: `This post has no video file — it may be a photo or carousel. (Fields returned: ${Object.keys(row).slice(0, 12).join(", ")})`,
  };
}
