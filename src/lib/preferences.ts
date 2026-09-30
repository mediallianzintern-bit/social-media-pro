// T67 — what the team likes, learned from the ticks and crosses they give.
//
// Every topic the dashboard shows — a news story, a rising post, a reel idea —
// can be marked liked or not. Those votes teach the system two things over
// time: which SUBJECTS the team wants more of, and which lanes deserve more of
// the list. Liked subjects rise and their lanes get more room; disliked ones
// sink, and once enough dislikes agree, stop being shown at all.
//
// A HUMAN PREFERENCE signal, deliberately kept apart from the measured one.
// loop.ts blocks a pattern when published posts underperformed; this learns
// what people chose. They answer different questions — "did it work" versus
// "do we want it" — and the rule set out in ai/feedback.ts applies: never fold
// a measured result and a taste into one number. Each is shown, and acted on,
// as itself.
//
// Learned in code, not by a model. Arithmetic on the votes, every step of
// which can be read back: the reason printed beside a ranking names the votes
// and the words that produced it.
//
// Client-safe.
import { significantWords } from "@/lib/lane-fit";

export type TopicKind = "source" | "trend" | "idea";
export type Verdict = "like" | "dislike";

/** One stored vote. The text is kept so the vote still teaches after the item is gone. */
export interface TopicVote {
  kind: TopicKind;
  itemId: string;
  verdict: Verdict;
  text: string;
  lane: string | null;
  actor: string | null;
  createdAt: string;
}

/**
 * A vote counts half after this many days, a quarter after twice that.
 *
 * Taste drifts, and a cross given in March should not still be suppressing a
 * subject in September after the team has changed its mind. Long enough that
 * a pattern established over a month holds; short enough that it can be
 * outgrown.
 */
export const HALF_LIFE_DAYS = 45;

/**
 * Pseudo-votes added to every tally, split evenly.
 *
 * Without them the first vote is total: one tick gives a lane an affinity of
 * 1.0 and every story in it leaps the queue. With three, one tick moves it to
 * 0.25 and it takes a consistent run of votes to get near the ends. This is
 * what makes the learning GRADUAL rather than twitchy.
 */
export const PRIOR = 3;

/**
 * The prior for LANES, heavier than for words.
 *
 * A lane is a coarse bucket — dozens of unrelated stories share one — so a vote
 * on one story says little about the rest. With the word prior, simulating a
 * single cross on one off-topic story cut its whole lane's share of the list
 * and marked down every story in it. At this weight one vote moves a lane by
 * about a seventh, and it takes a consistent pattern to move it far.
 */
export const LANE_PRIOR = 6;

/** Votes a lane needs before its share of the list is changed at all. */
export const LANE_QUOTA_MIN_VOTES = 3;

/**
 * Voted items a word must appear in before it is learned.
 *
 * A word seen in one voted headline is that headline, not a preference — the
 * same reason lane-fit ignores words seen once in a lane.
 */
export const MIN_WORD_SUPPORT = 2;

/** Preference at or below this, with enough evidence behind it, hides an item. */
export const SUPPRESS_AT = -0.45;

/**
 * Weighted dislikes that must agree before anything is hidden.
 *
 * Hiding is the one irreversible-feeling action in this file — a person cannot
 * like what they never see — so it waits for a pattern rather than acting on a
 * single cross. Down-ranking starts at the first vote; hiding does not.
 */
export const SUPPRESS_MIN_EVIDENCE = 3;

interface Tally {
  like: number;
  dislike: number;
  /** Raw count of votes, undecayed — the support test counts votes, not weight. */
  votes: number;
}

export interface PreferenceModel {
  lanes: Map<string, Tally>;
  words: Map<string, Tally>;
  /** Exact memory: "kind:itemId" -> verdict. */
  exact: Map<string, Verdict>;
  totalVotes: number;
}

export interface Preference {
  /** -1 to 1. Zero when nothing learned applies. */
  score: number;
  /** Multiply a rank score by this. Exactly 1 when nothing is known. */
  multiplier: number;
  /** Should be hidden: voted down directly, or a strong disliked pattern. */
  suppressed: boolean;
  /** The team's own vote on this exact item, if any. */
  voted: Verdict | null;
  /** Words that drove the score, strongest first. */
  matched: string[];
  /** Why, in words; null when nothing applied. */
  reason: string | null;
}

const NEUTRAL: Preference = {
  score: 0,
  multiplier: 1,
  suppressed: false,
  voted: null,
  matched: [],
  reason: null,
};

export const voteKey = (kind: TopicKind, itemId: string) => `${kind}:${itemId}`;

function decay(createdAt: string, now: number): number {
  const age = Math.max(0, (now - new Date(createdAt).getTime()) / 86_400_000);
  return 0.5 ** (age / HALF_LIFE_DAYS);
}

function add(map: Map<string, Tally>, key: string, verdict: Verdict, weight: number) {
  const tally = map.get(key) ?? { like: 0, dislike: 0, votes: 0 };
  if (verdict === "like") tally.like += weight;
  else tally.dislike += weight;
  tally.votes += 1;
  map.set(key, tally);
}

/** -1 to 1, smoothed by a prior. */
function affinity(tally: Tally | undefined, prior = PRIOR): number {
  if (!tally) return 0;
  return (tally.like - tally.dislike) / (tally.like + tally.dislike + prior);
}

/** The words a vote or a candidate is judged on. */
function wordsOf(text: string): string[] {
  // Trailing quote marks stripped so "dots’" in one headline and "dots" in the
  // next are one word. Headlines use curly quotes inconsistently.
  return [
    ...new Set(
      significantWords(text.slice(0, 600))
        .map((word) => word.replace(/['’‘]+$/, ""))
        .filter((word) => word.length >= 3),
    ),
  ];
}

export function buildPreferenceModel(votes: TopicVote[], now = Date.now()): PreferenceModel {
  const model: PreferenceModel = {
    lanes: new Map(),
    words: new Map(),
    exact: new Map(),
    totalVotes: votes.length,
  };
  for (const vote of votes) {
    const weight = decay(vote.createdAt, now);
    model.exact.set(voteKey(vote.kind, vote.itemId), vote.verdict);
    if (vote.lane) add(model.lanes, vote.lane, vote.verdict, weight);
    for (const word of wordsOf(vote.text)) add(model.words, word, vote.verdict, weight);
  }
  return model;
}

/**
 * How much the team is likely to want this topic.
 *
 * Words carry more weight than the lane (0.6 to 0.4) because they are what a
 * vote is actually about. A cross on "Meta's new VR glasses" is a verdict on
 * VR hardware, not on every Frontier AI story — the lane is a coarse
 * backstop for when too few words have been learned yet.
 */
export function preferenceFor(
  model: PreferenceModel,
  candidate: { kind: TopicKind; itemId: string; text: string; lane: string | null },
): Preference {
  if (!model.totalVotes) return NEUTRAL;

  const voted = model.exact.get(voteKey(candidate.kind, candidate.itemId)) ?? null;
  // A direct cross is final for that item: it asked not to see THIS.
  if (voted === "dislike") {
    return {
      ...NEUTRAL,
      score: -1,
      multiplier: 0,
      suppressed: true,
      voted,
      reason: "you marked this ✗",
    };
  }

  const laneTally = candidate.lane ? model.lanes.get(candidate.lane) : undefined;
  const laneScore = affinity(laneTally, LANE_PRIOR);

  const learned = wordsOf(candidate.text)
    .map((word) => ({ word, tally: model.words.get(word) }))
    .filter(
      (entry): entry is { word: string; tally: Tally } =>
        !!entry.tally && entry.tally.votes >= MIN_WORD_SUPPORT,
    );

  // Weighted by how much voting stands behind each word, so a word the team
  // has voted on ten times outweighs one voted on twice.
  let weightSum = 0;
  let weighted = 0;
  for (const { tally } of learned) {
    const mass = tally.like + tally.dislike;
    weighted += affinity(tally) * mass;
    weightSum += mass;
  }
  // Scaled by how many learned words matched, not just their average. An
  // average cannot tell one shared word from three: simulated against the real
  // inbox, a story sharing only the generic "model" with four ticked OpenAI
  // safety stories ranked exactly level with one sharing "openai", "model" and
  // "safety". Confidence now builds with each match — half at one word, three
  // quarters at two — so a specific resemblance beats a coincidental one.
  const coverage = 1 - 0.5 ** learned.length;
  const wordScore = weightSum ? (weighted / weightSum) * coverage : 0;

  // With no learned words the lane is all there is, and it is weak evidence
  // about one specific story — so it is halved rather than trusted in full.
  const score = learned.length ? 0.6 * wordScore + 0.4 * laneScore : 0.5 * laneScore;

  const dislikeEvidence =
    learned.reduce((total, { tally }) => total + tally.dislike, 0) + (laneTally?.dislike ?? 0);
  const suppressed = score <= SUPPRESS_AT && dislikeEvidence >= SUPPRESS_MIN_EVIDENCE;

  const matched = learned
    .sort((a, b) => Math.abs(affinity(b.tally)) - Math.abs(affinity(a.tally)))
    .slice(0, 3)
    .map((entry) => entry.word);

  const reason =
    voted === "like"
      ? "you marked this ✓"
      : Math.abs(score) < 0.05
        ? null
        : score > 0
          ? `like topics you ticked${matched.length ? ` (${matched.join(", ")})` : candidate.lane ? ` in ${candidate.lane}` : ""}`
          : `like topics you crossed${matched.length ? ` (${matched.join(", ")})` : candidate.lane ? ` in ${candidate.lane}` : ""}`;

  return {
    score: Number(score.toFixed(3)),
    // A liked item always gets at least a modest lift, so ticking something
    // visibly keeps it near the top rather than doing nothing.
    multiplier: Number(Math.max(voted === "like" ? 1.3 : 0.2, 1 + score).toFixed(3)),
    suppressed,
    voted,
    matched,
    reason,
  };
}

/**
 * How many slots a lane gets, scaled by how much the team likes it.
 *
 * This is the "show me more of these" half: a lane the team keeps ticking
 * gets up to twice its share of the list, one it keeps crossing shrinks — but
 * never below two, so a lane is never starved of the chance to win back
 * favour with a better story.
 */
export function laneQuota(model: PreferenceModel, lane: string | null, base: number): number {
  if (!lane || !model.totalVotes) return base;
  const tally = model.lanes.get(lane);
  if (!tally || tally.votes < LANE_QUOTA_MIN_VOTES) return base;
  const scaled = Math.round(base * (1 + affinity(tally, LANE_PRIOR)));
  return Math.max(2, Math.min(base * 2, scaled));
}

/** What the model has learned, for display. Strongest first. */
export function learnedSummary(model: PreferenceModel) {
  const rank = (map: Map<string, Tally>, minVotes: number) =>
    [...map.entries()]
      .filter(([, tally]) => tally.votes >= minVotes)
      .map(([key, tally]) => ({
        key,
        affinity: Number(affinity(tally, map === model.lanes ? LANE_PRIOR : PRIOR).toFixed(2)),
        votes: tally.votes,
      }))
      .sort((a, b) => b.affinity - a.affinity);

  const lanes = rank(model.lanes, 1);
  const words = rank(model.words, MIN_WORD_SUPPORT);
  return {
    totalVotes: model.totalVotes,
    likedLanes: lanes.filter((entry) => entry.affinity > 0.05),
    dislikedLanes: lanes.filter((entry) => entry.affinity < -0.05).reverse(),
    likedWords: words.filter((entry) => entry.affinity > 0.05).slice(0, 8),
    dislikedWords: words
      .filter((entry) => entry.affinity < -0.05)
      .reverse()
      .slice(0, 8),
  };
}
