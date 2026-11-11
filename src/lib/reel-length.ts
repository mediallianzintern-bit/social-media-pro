// How long an Instagram reel's script runs.
//
// 11 Nov 2026, the team's Script Comparison sheet: "80 to 115 spoken words.
// Must be comfortable to say in 45 to 55 seconds." The scripts it holds up as
// right (Jaguar, Bikaji, Tencent's Hy4, Sarvam's Prism, Levi's, Disney) run
// about 90 to 110 words, short lines, one idea. It replaced the 110-140 the
// team set on 29 Oct, which had been filling scripts with figures and specs.
//
// The range is the SCRIPT: hook to closing insight. The fixed intro
// (lib/reel-intro.ts) and the lane's closing line are said on top of it and
// are not counted (lib/reel-intro.ts scriptWords).
//
// Every rule that holds a reel to a length reads it from here. Client-safe.
export const REEL_WORDS = { min: 80, max: 115 } as const;

/**
 * Where a script is sent back or flagged as too long. The writer is told 115;
 * the code allows five words over, because the team's own Jaguar script, which
 * the sheet marks as right, is 116 words counted word for word.
 */
export const REEL_WORDS_LIMIT = REEL_WORDS.max + 5;

/**
 * The word count the writer and the review are told to aim for. Above the
 * middle of the range on purpose: the model counts its own words high (it
 * reported 114-116 for drafts of 93-105, 29 Oct 2026), so aiming at the middle
 * lands it short. The code still holds the real limit, REEL_WORDS.
 */
export const REEL_AIM_WORDS = 105;

/**
 * The whole reel, in seconds: the script's 45-55 seconds plus about ten for
 * the fixed intro and the closing line.
 */
export const REEL_MAX_SECONDS = 70;

/** The shortest whole reel, in seconds. */
export const REEL_MIN_SECONDS = 50;
