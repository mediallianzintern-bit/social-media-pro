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

/** Google News exclusions for a search that otherwise brings back people moving jobs. */
const NO_JOB_MOVES = " -appoints -appointed -joins -hires -promoted";

export const LANE_QUERIES: Record<string, string[]> = {
  "marketing stunts": ['"marketing stunt"', "intitle:campaign brand ad"],
  "brand strategy lessons": ['"brand strategy"', "rebrand OR repositioning brand"],
  // No news since 23 Oct 2026: see NEWS_OFF_LANES.
  // Launches, and since 23 Oct 2026 the security and safety side of frontier AI
  // too: AI-found vulnerabilities (PHP2Shell, OpenAI's "Patch the Planet"),
  // rogue agents (the OpenAI and Hugging Face hack) and lab safety news. Each
  // was tested on the live feed and returned those stories first. TechCrunch's
  // AI coverage comes in through its own search (see OWN_SHARE).
  "frontier ai developments": [
    "intitle:AI model launch",
    '"frontier AI"',
    '"AI" cybersecurity flaw',
    '"AI agents" cyberattack',
    '"AI safety" OpenAI',
    "intitle:AI site:techcrunch.com",
  ],
  // LinkedIn's six lanes (30 Oct 2026), searched for the subjects his own
  // posts in each lane cover (the lane table: OpenAI, Claude, Gemini and Meta
  // launches; Meta's AI ads, ChatGPT ads, AI search, agentic shopping; AI-found
  // flaws, rogue agents, lab safety; ad effectiveness and consumer studies;
  // the creator economy, YouTube's AI tools, AI content and trust; the last two
  // re-searched below). Each was
  // tested on the live feed on 2 Nov 2026 and returned that lane's stories
  // first. Job moves ("appoints", "joins") are excluded where they crept in.
  // Reflections has no news: see NEWS_OFF_LANES.
  "ai launches explained": [
    "intitle:AI model launch",
    '(OpenAI OR Anthropic OR Gemini OR "Meta AI") launches new model businesses',
  ],
  "ai x marketing bridge": [
    '"Meta" AI ads advertisers',
    '"ChatGPT ads" OR "ads in ChatGPT"',
    '"AI search" OR "AI Overviews" brands visibility',
    '"agentic commerce" OR "AI shopping" retailers',
  ],
  "ai risks and security": [
    '"AI" cybersecurity flaw',
    '"AI agents" security risk',
    '"AI safety" model unexpected behaviour',
  ],
  // Re-searched on 2 Nov 2026, when both lanes were filling with the wrong
  // kind of story. Marketing fundamentals had festive campaign launches
  // ("brand marketing" campaign) and AI-shopping surveys, where his posts are
  // principles and evidence: ad recall, measurement, the customer journey, a
  // brand's business move (McDonald's ad business). Content and creator craft
  // had platform and earnings news (Instagram's long videos, YouTube's
  // subscriber count, Alphabet's results), where his posts are how to make
  // content work: AI content volume against quality, on camera, trust.
  "marketing fundamentals": [
    `"brand recall" OR "ad recall" study${NO_JOB_MOVES}`,
    `Kantar OR Nielsen OR "System1" advertising study${NO_JOB_MOVES}`,
    `"brand building" "performance marketing"${NO_JOB_MOVES}`,
    `"marketing funnel" OR attribution marketers${NO_JOB_MOVES}`,
    `"retail media" business brand advertising revenue${NO_JOB_MOVES}`,
  ],
  "content and creator craft": [
    `"AI slop" brands${NO_JOB_MOVES}`,
    `"creator marketing"${NO_JOB_MOVES}`,
    `creators trust audiences brands content${NO_JOB_MOVES}`,
    `"video storytelling" OR "storytelling" brands content${NO_JOB_MOVES}`,
  ],
};

/**
 * Searches that keep their own share of their lane's stories instead of
 * competing for it. A lane keeps its top stories ranked trending-first, and a
 * single outlet's feed is never "trending", so ranked with the lane's other
 * searches it would always lose its place.
 */
export const OWN_SHARE = new Set(["intitle:AI site:techcrunch.com"]);

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

/**
 * Lanes fed by something other than news. AI tool workflows shows a tool being
 * used, step by step, and no article contains that: since 23 Oct 2026 (the
 * approved AI Tool Workflows proposal, phase 1) it is fed by standout reels
 * from watched creators instead (server/creators.ts). Its old news stories are
 * hidden from the topic list as well, not just no longer fetched.
 */
export const NEWS_OFF_LANES = new Set([
  "ai tool workflows",
  // LinkedIn: personal lessons on work and purpose. No news story is one; a
  // search on the name found sermons.
  "reflections",
]);

export function isNewsOffLane(lane: string | null | undefined): boolean {
  return NEWS_OFF_LANES.has((lane ?? "").trim().toLowerCase());
}

export function queriesForLane(lane: string): string[] {
  const key = lane.trim().toLowerCase();
  if (key === "other" || NEWS_OFF_LANES.has(key)) return [];
  const tested = LANE_QUERIES[key];
  if (tested?.length) return tested;
  const derived = derivedQuery(lane);
  return derived ? [derived] : [];
}
