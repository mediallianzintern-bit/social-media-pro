// How long an Instagram reel's voiceover runs, as the team set it on 29 Oct 2026.
//
// His Tone and Voice brief says 90-115 words, under a minute, and the dashboard
// held reels to 100-115. The reels he actually approved and posted (the
// Master Tracker, 14-26 Oct) run 102-199 words, typically about 126, and at
// 100-115 the scripts came out too thin to carry the figures, the example and
// the lesson together. So the team chose 110-140 words, about 55-70 seconds at
// a relaxed two words a second. His brief's own LENGTH section is still sent
// word for word; the dashboard's handover states this as the team's request.
//
// The team's Tone brief (30 Oct 2026) set about 100-140, depending on how
// complex the topic is, and never cutting context to hit a count.
//
// Every rule that holds a reel to a length reads it from here. Client-safe.
export const REEL_WORDS = { min: 100, max: 140 } as const;

/**
 * The word count the writer and the review are told to aim for. Above the
 * middle of the range on purpose: the model counts its own words high (it
 * reported 114-116 for drafts of 93-105, 29 Oct 2026), so aiming at the middle
 * lands it short. The code still holds the real limit, REEL_WORDS.
 */
export const REEL_AIM_WORDS = 130;

/** The longest a reel may run, in seconds: 140 words at two words a second. */
export const REEL_MAX_SECONDS = 70;

/** The shortest, in seconds: 100 words at two words a second. */
export const REEL_MIN_SECONDS = 50;
