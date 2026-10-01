// Addendum E — the reaction-hook format ("viral video hook").
//
// A borrowed clip from a bigger creator sets up a belief; the expert cuts in
// with a correction or a deeper take and lands it in their own lane. This file
// holds the parts every layer shares: the shapes, the rules for a source link,
// and the gates an idea must pass before it is approved or filmed.
//
// The source reel is the one thing this format cannot get wrong. A reaction
// that credits the wrong creator, or links to a clip nobody chose, is a
// reputational problem for a professional and possibly a legal one. So the
// link is normalised here, stored once, and attached to an idea by id — the
// model that writes the script never sees a field it could put a URL in.
//
// Client-safe.

export type SourcePlatform =
  "instagram" | "youtube" | "tiktok" | "linkedin" | "x" | "facebook" | "other";
export type SourceType =
  "meme" | "street_interview" | "podcast" | "news" | "tutorial" | "movie_tv" | "other";
export type RightsStatus = "native_remix" | "credited_clip" | "needs_review";
export type PivotType = "contradict" | "concede_reframe" | "raise_stakes";

/** One borrowed clip, as stored. */
export interface ReactionSource {
  id: string;
  platform: "instagram" | "linkedin";
  sourceUrl: string;
  sourcePlatform: SourcePlatform;
  sourceCreatorHandle: string | null;
  sourceType: SourceType;
  /** Public signal only — labelled as such wherever it is shown. */
  sourcePublicViews: number | null;
  transcript: string | null;
  extractedClaim: string | null;
  creditText: string | null;
  rightsStatus: RightsStatus;
  foundBy: "team" | "trend_listener";
  createdAt: string;
}

/** The reaction-specific fields carried on a ContentIdea (E.6). */
export interface ReactionFields {
  sourceId: string;
  /** Copied from the stored source by the server — never written by the model. */
  sourceUrl: string;
  sourcePlatform: SourcePlatform;
  sourceCreatorHandle: string | null;
  sourceType: SourceType;
  creditOverlayText: string;
  rightsStatus: RightsStatus;
  claim: string;
  sourceIn: string;
  sourceOut: string;
  pivotType: PivotType;
  /** Seconds of the expert's own segment, as scripted. */
  expertSeconds: number;
  /**
   * The expert's segment beat by beat, in E.2's order — pivot, authority,
   * specifics, mechanism, twist, redirect, CTA — so the structure the format
   * depends on is visible and checkable, not buried in a shot list.
   */
  beats: Array<{ beat: (typeof REACTION_BEATS)[number]; line: string }>;
  /** Beats the script left empty. The structure is the format; a gap is flagged. */
  missingBeats: Array<(typeof REACTION_BEATS)[number]>;
  /** Every voiceover claim that must be confirmed by the client before filming. */
  verifyItems: string[];
  /** Set when the client has confirmed every [VERIFY] item. */
  verifiedAt?: string | null;
  verifiedBy?: string | null;
}

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  meme: "Meme",
  street_interview: "Street interview",
  podcast: "Podcast clip",
  news: "News clip",
  tutorial: "Tutorial",
  movie_tv: "Movie / TV scene",
  other: "Other",
};

export const RIGHTS_LABEL: Record<RightsStatus, string> = {
  native_remix: "Native remix / stitch",
  credited_clip: "Credited clip",
  needs_review: "Needs review",
};

export const PIVOT_LABEL: Record<PivotType, string> = {
  contradict: "Flat contradiction",
  concede_reframe: "Agree, then reframe",
  raise_stakes: "Concede, then raise the stakes",
};

export const SOURCE_PLATFORM_LABEL: Record<SourcePlatform, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  x: "X",
  facebook: "Facebook",
  other: "the web",
};

/** E.2 — the beats, in order. The expert's segment follows the source clip. */
export const REACTION_BEATS = [
  "pivot",
  "authority",
  "specifics",
  "mechanism",
  "twist",
  "redirect",
  "cta",
] as const;

/** E.2 — what each beat is for, in the words the editor and creator see. */
export const BEAT_LABEL: Record<(typeof REACTION_BEATS)[number], string> = {
  pivot: "Pivot — the real hook",
  authority: "Authority",
  specifics: "Specifics",
  mechanism: "Mechanism",
  twist: "Twist",
  redirect: "Redirect to the owned lane",
  cta: "Call to action",
};

/** Observed across the three reference reels; validated by the loop as data arrives. */
export const EXPERT_SECONDS_FLOOR = 28;
export const EXPERT_SECONDS_CEILING = 32;

// ---------------------------------------------------------------------------
// The source link
// ---------------------------------------------------------------------------

/** Query parameters that identify the sharer, not the clip. */
const TRACKING = /^(utm_|igsh|igshid|fbclid|gclid|si$|feature$|ref$|ref_src|s$|t$|share)/i;

/**
 * A pasted link, cleaned and identified.
 *
 * The path is the clip's identity and is never rewritten; what is removed is
 * everything that identifies the person who shared it. A share link like
 * ".../reel/ABC123/?igsh=xyz" and the bare permalink are the same clip and must
 * not become two rows. A YouTube share timestamp is dropped too — the script
 * chooses its own in-point.
 */
export function normalizeSourceUrl(
  raw: string,
):
  | { ok: true; url: string; platform: SourcePlatform; handle: string | null }
  | { ok: false; reason: string } {
  const text = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, reason: "That isn't a link. Paste the full address of the clip." };
  }
  if (!/\./.test(parsed.hostname)) {
    return { ok: false, reason: "That isn't a link. Paste the full address of the clip." };
  }

  const host = parsed.hostname.replace(/^(www\.|m\.|mobile\.)/, "").toLowerCase();
  const platform: SourcePlatform =
    host === "instagram.com" || host.endsWith(".instagram.com")
      ? "instagram"
      : host === "youtube.com" || host === "youtu.be" || host.endsWith(".youtube.com")
        ? "youtube"
        : host === "tiktok.com" || host.endsWith(".tiktok.com")
          ? "tiktok"
          : host === "linkedin.com" || host.endsWith(".linkedin.com")
            ? "linkedin"
            : host === "x.com" || host === "twitter.com"
              ? "x"
              : host === "facebook.com" || host === "fb.watch" || host.endsWith(".facebook.com")
                ? "facebook"
                : "other";

  // Where a platform keeps the clip's identity in the PATH, every query
  // parameter is about the sharer and is dropped. YouTube and Facebook watch
  // links keep `v`, which IS the clip. Elsewhere only known trackers go.
  const pathIdentity = ["instagram", "tiktok", "x", "linkedin"].includes(platform);
  for (const key of [...parsed.searchParams.keys()]) {
    if ((platform === "youtube" || platform === "facebook") && key === "v") continue;
    if (pathIdentity || TRACKING.test(key)) parsed.searchParams.delete(key);
  }
  parsed.hash = "";

  // One spelling per clip, so the same reel pasted from the app and from a
  // browser is one row rather than two. youtu.be/ID becomes the watch URL.
  if (platform === "youtube" && host === "youtu.be") {
    const id = parsed.pathname.split("/").filter(Boolean)[0];
    if (id) {
      parsed = new URL("https://www.youtube.com/watch");
      parsed.searchParams.set("v", id);
    }
  } else if (platform === "instagram") {
    // One spelling per post, keyed on its shortcode. Instagram serves the same
    // post at /p/CODE/, /reel/CODE/, /reels/CODE/, /tv/CODE/ and
    // /<handle>/reel/CODE/, with or without the trailing slash. The sync
    // stores the /p/ form, so that is the canonical one — otherwise a reel
    // pasted from the app would not match the same reel found by the sync,
    // and would be saved, and credited, twice. Found by testing: a trailing
    // slash alone produced a second row.
    const parts = parsed.pathname.split("/").filter(Boolean);
    const at = parts.findIndex((part) => ["p", "reel", "reels", "tv"].includes(part));
    const code = at >= 0 ? parts[at + 1] : undefined;
    parsed.hostname = "www.instagram.com";
    if (code) parsed.pathname = `/p/${code}/`;
  } else if (["youtube", "linkedin", "facebook"].includes(platform)) {
    parsed.hostname = `www.${host}`;
  } else if (platform === "tiktok") {
    parsed.hostname = "www.tiktok.com";
  } else if (platform === "x") {
    parsed.hostname = "x.com";
  }
  parsed.protocol = "https:";
  if (platform !== "instagram" && parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }
  const url = parsed.toString().replace(/\?$/, "");

  // A handle where the link itself carries one. Instagram reel and YouTube
  // links do not, so the team types it — it is never guessed.
  const segments = parsed.pathname.split("/").filter(Boolean);
  let handle: string | null = null;
  if (platform === "tiktok")
    handle = segments.find((part) => part.startsWith("@"))?.slice(1) ?? null;
  if (platform === "x")
    handle = segments[0] && !["i", "home"].includes(segments[0]) ? segments[0] : null;
  if (platform === "youtube" && segments[0]?.startsWith("@")) handle = segments[0].slice(1);
  if (
    platform === "instagram" &&
    segments[0] &&
    !["reel", "reels", "p", "tv", "stories"].includes(segments[0])
  ) {
    handle = segments[0];
  }

  return { ok: true, url, platform, handle };
}

/**
 * The on-screen credit, before the team edits it.
 *
 * Built from the handle and platform the team confirmed, so it can only ever
 * name the creator the source row names.
 */
export function defaultCredit(handle: string | null, platform: SourcePlatform): string {
  const who = handle ? `@${handle.replace(/^@/, "")}` : "the original creator";
  return `🎥 ${who} on ${SOURCE_PLATFORM_LABEL[platform]}`;
}

/**
 * E.7 — the rights status a clip is stored with.
 *
 * A NEW movie or TV scene always starts at needs_review: it carries the most
 * risk, and the first save should never clear it. After that, a person's
 * explicit choice stands — that edit IS the sign-off. Forcing needs_review on
 * every save would make a movie clip impossible to approve even after legal
 * had cleared it.
 *
 * Everything else also starts at needs_review unless the team states the
 * route, so the system never assumes a remix or a licence.
 */
export function initialRights(
  type: SourceType,
  requested: RightsStatus | undefined,
  isNew: boolean,
): RightsStatus {
  if (isNew && type === "movie_tv") return "needs_review";
  return requested ?? "needs_review";
}

// ---------------------------------------------------------------------------
// E.7 — the gates
// ---------------------------------------------------------------------------

/**
 * Why a reaction idea may NOT be approved yet. Empty means it may.
 *
 * The agency's policy on borrowed clips is enforced here, not on screen: an
 * idea without a credit, or whose rights are still unresolved, cannot reach
 * the creator's queue at all.
 */
export function approvalBlockers(source: {
  creditText: string | null;
  rightsStatus: RightsStatus;
  sourceUrl: string | null;
}): string[] {
  const blockers: string[] = [];
  if (!source.sourceUrl) blockers.push("The source clip has no link.");
  if (!source.creditText?.trim()) blockers.push("Add the on-screen credit for the source clip.");
  if (source.rightsStatus === "needs_review") {
    blockers.push(
      "Set the rights status: native remix/stitch, or a credited clip. Movie and TV scenes need sign-off first.",
    );
  }
  return blockers;
}

/**
 * Why a reaction idea may NOT go into production yet. Empty means it may.
 *
 * The script puts factual claims in the mouth of a professional. Every
 * [VERIFY] item has to be confirmed by the client before anyone films it.
 */
export function productionBlockers(
  reaction: Pick<ReactionFields, "verifyItems" | "verifiedAt">,
): string[] {
  if (reaction.verifyItems.length && !reaction.verifiedAt) {
    return [
      `The client must confirm ${reaction.verifyItems.length} fact${reaction.verifyItems.length === 1 ? "" : "s"} marked [VERIFY] before filming.`,
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// E.6 — the [VERIFY] safety net
// ---------------------------------------------------------------------------

/** Figures in a line: numbers, percentages, durations, multiples. */
function figuresIn(text: string): string[] {
  return (
    text.match(
      /\d+(?:[.,]\d+)?\s?(?:%|x|×|k|m|million|crore|lakh|hours?|minutes?|seconds?|years?|times)?/gi,
    ) ?? []
  )
    .map((figure) => figure.trim().toLowerCase())
    .filter((figure) => /\d/.test(figure));
}

/**
 * Marks any figure the source didn't supply, and returns the full list.
 *
 * The prompt asks the model to mark domain claims [VERIFY]; this does not take
 * its word for it. A number in the expert's voiceover that does not appear in
 * the transcript or the data the script was given is flagged here regardless,
 * because the one thing a reaction must never do is put an invented statistic
 * in a professional's mouth.
 */
export function enforceVerify(
  lines: string[],
  allowedText: string,
): { lines: string[]; verifyItems: string[] } {
  const allowed = new Set(figuresIn(allowedText).map((figure) => figure.replace(/\s+/g, "")));
  const verifyItems: string[] = [];
  const out = lines.map((line) => {
    const already = /\[VERIFY\]/i.test(line);
    const unsourced = figuresIn(line).some((figure) => !allowed.has(figure.replace(/\s+/g, "")));
    const marked = already || unsourced ? (already ? line : `${line.trim()} [VERIFY]`) : line;
    if (already || unsourced) verifyItems.push(marked.replace(/\s*\[VERIFY\]\s*/gi, " ").trim());
    return marked;
  });
  return { lines: out, verifyItems: [...new Set(verifyItems)] };
}
