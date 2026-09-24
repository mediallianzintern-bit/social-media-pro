// Which news searches each content lane runs.
//
// Tested, not guessed. Every query below was run against the live feed and
// read before it was written here, and the pattern was unambiguous:
//
//   • a quoted phrase is precise   — "marketing stunt" returns marketing stunts
//   • an OR list is noise          — "billboard" returned the Billboard Hot 100
//   • a bare tech term drifts      — "AI tool" alone returned medical research;
//                                    anchoring it to the niche ("marketing")
//                                    brought it back on topic
//
// Keyed by lane name, lowercased, so it applies to whichever platform uses the
// lane. Edit freely: a query is a plain Google News search, and the result of a
// change shows up on the next topic refresh.

export const LANE_QUERIES: Record<string, string[]> = {
  "marketing stunts": ['"marketing stunt"', "intitle:campaign brand ad"],
  "brand strategy lessons": ['"brand strategy"', "rebrand OR repositioning brand"],
  "ai tool workflows": ['"AI tool" marketing'],
  "frontier ai developments": ["intitle:AI model launch", '"frontier AI"'],
};

/**
 * Words that describe the KIND of post rather than its subject. Stripped when a
 * query is derived from a lane name, because "brand strategy lessons" is a post
 * format and "brand strategy" is what the news actually covers.
 */
const FORMAT_WORDS = new Set([
  "lessons",
  "lesson",
  "developments",
  "workflows",
  "workflow",
  "tips",
  "breakdowns",
  "breakdown",
  "ideas",
  "insights",
  "news",
  "updates",
  "trends",
  "stories",
  "explainers",
  "tutorials",
]);

/**
 * A quoted phrase from the lane's own name — the fallback for any lane without
 * a tested entry above (every LinkedIn lane, until one is added).
 */
export function derivedQuery(lane: string): string | null {
  const words = lane
    .trim()
    .split(/\s+/)
    .filter((word) => !FORMAT_WORDS.has(word.toLowerCase()));
  if (!words.length) return null;
  const last = words[words.length - 1] ?? "";
  // "stunts" -> "stunt": a quoted phrase is literal, and headlines use both.
  if (last.length > 3 && /[^s]s$/i.test(last)) words[words.length - 1] = last.slice(0, -1);
  const phrase = words.join(" ");
  return phrase.length > 2 ? `"${phrase}"` : null;
}

export function queriesForLane(lane: string): string[] {
  const key = lane.trim().toLowerCase();
  if (key === "other") return [];
  const tested = LANE_QUERIES[key];
  if (tested?.length) return tested;
  const derived = derivedQuery(lane);
  return derived ? [derived] : [];
}
