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
// Every rule that holds a reel to a length reads it from here. Client-safe.
export const REEL_WORDS = { min: 110, max: 140 } as const;

/** The longest a reel may run, in seconds: 140 words at two words a second. */
export const REEL_MAX_SECONDS = 70;

/** The shortest, in seconds: 110 words at two words a second. */
export const REEL_MIN_SECONDS = 55;
