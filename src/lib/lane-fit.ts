// Does this topic look like something this team would make?
//
// Judged against the team's OWN past topics rather than a keyword list. The
// keyword classifier in calendar-classify.ts had to guess what "Brand strategy
// lessons" means; this reads 165 real examples of it and compares. Measured on
// live competitor posts, the hand-written rules threw away "90% of
// award-winning ads follow six creative patterns" — a textbook topic for this
// account — because none of my chosen words happened to appear in it.
//
// The model is deliberately the simplest thing that works: per-lane word
// frequencies from the calendar, scored against a candidate. No training, no
// embeddings, no API call — and, importantly, it is inspectable: the caller
// can show which words drove the match.
//
// Client-safe.

/** Words too common to distinguish one lane from another. */
const STOP = new Set(
  (
    "the a an and or but of to in on for with at by from as is are was were be been being it its " +
    "this that these those how why what when where who which your you yours our ours their they " +
    "them we us i me my he she his her not no nor so if then than too very can could would should " +
    "will just even still yet also more most some any all each every one two three into over under " +
    "about after before during while because here there now new like get got make made see saw " +
    "say said go went do did done have has had been out up down off again once only own same such " +
    "own s t don didn isn wasn aren won t re ve ll d m " +
    // Call-to-action and house-formula words. These are how this team ENDS a
    // post, not what a post is ABOUT, and they are frequent enough to swamp
    // the topical signal: a dropshipping video matched the AI-tool lane purely
    // on "comment", because every tool post asks for one.
    "comment link follow dm save share subscribe bio caption hashtag reel post posts " +
    "watch swipe tap click download guide free video story stories page profile " +
    "day here's heres lesson lessons takeaway learn business owners small " +
    "want need know thing things way ways thats that's youre you're its it's " +
    "wasnt didnt doesnt isnt couldnt wouldnt"
  ).split(" "),
);

/**
 * How much more concentrated in a lane a word must be than in the calendar at
 * large before it counts as evidence. 1.0 would mean "no more common here than
 * anywhere"; the margin above it discards words that drift just over the line.
 */
const MIN_LIFT = 1.25;

/**
 * The score a candidate must reach to be called part of a lane.
 *
 * Swept against hand-labelled competitor captions once the weighting became
 * lift-based, which lowered every score: the old 0.15 came from the frequency
 * formula and now rejects everything. Above ~0.1 real topics start dropping
 * out; this sits below that with the three known false positives still out.
 */
export const LANE_FIT_THRESHOLD = 0.06;

/**
 * A word in more than this share of the WHOLE calendar is a stop word for this
 * corpus, whatever its lift, and is dropped before lift is even considered.
 *
 * Lift alone could not carry this. With four lanes and one of them nearly half
 * the calendar, a word like "people" — in 56% of Marketing stunts entries and
 * 43% of all of them — clears any sane lift cutoff by a hair, and its sheer
 * frequency then makes it the heaviest term in the match. That single word,
 * with "million", is what filed a documentary about the Druze under Marketing
 * stunts. Deriving the stop list from the corpus also retires the guesswork in
 * the hand-written one above, which only ever caught the cases I thought of.
 */
const MAX_DOC_FREQ = 0.25;

/**
 * Below this many distinctive words there is not enough text to place a post.
 * "The Most Private Religion! Only 2 million people." is five words; any two
 * of them matching is a coincidence the short-caption divisor then magnifies.
 */
const MIN_SIGNIFICANT_WORDS = 8;

/**
 * Pseudo-counts that pull a small lane's word rates back toward the corpus.
 *
 * The lanes are wildly uneven — 63 Marketing stunts entries against 11 for
 * Frontier AI developments — and a raw in-lane rate treats 3 hits out of 11 as
 * "27% of this lane", which outweighs anything the big lanes can show. That is
 * how a post about a government face wash became a frontier-AI topic, on
 * "actually" and "multiple". Smoothing makes a lane earn its confidence with
 * examples: with 11 of them the evidence is halved, with 63 it barely moves.
 */
const SMOOTHING = 15;

export interface LaneFit {
  lane: string | null;
  /** 0-1. How much this candidate's vocabulary overlaps that lane's. */
  score: number;
  /** The words that drove the match, so a decision can be explained. */
  matched: string[];
}

/** Distinctive words of a text. */
export function significantWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'’-]{2,}/g) ?? [])
    .map((w) => w.replace(/['’]s$/, ""))
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

/**
 * A per-lane vocabulary built from the team's past topics.
 *
 * Each lane gets the words that are DISTINCTIVE to it — frequent in that lane
 * and not everywhere. Without that adjustment every lane's top words would be
 * "brand", "campaign" and "marketing", which describe the account rather than
 * distinguishing anything inside it.
 */
export interface LaneVocabulary {
  /** lane -> word -> weight. */
  byLane: Map<string, Map<string, number>>;
  /** How many example topics each lane was built from. */
  examples: Map<string, number>;
}

export function buildLaneVocabulary(
  entries: Array<{ lane: string | null; content: string }>,
): LaneVocabulary {
  const perLane = new Map<string, Map<string, number>>();
  const examples = new Map<string, number>();
  const documentCount = new Map<string, number>();

  for (const entry of entries) {
    if (!entry.lane) continue;
    const words = new Set(significantWords(entry.content.slice(0, 1200)));
    const counts = perLane.get(entry.lane) ?? new Map<string, number>();
    for (const word of words) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
      documentCount.set(word, (documentCount.get(word) ?? 0) + 1);
    }
    perLane.set(entry.lane, counts);
    examples.set(entry.lane, (examples.get(entry.lane) ?? 0) + 1);
  }

  // Weight = LIFT, not frequency.
  //
  // The obvious formula — frequency in the lane, damped by an inverse document
  // frequency — is wrong here, and measurably so. Its leading term rewards
  // exactly the words that are common in every lane, and the damping is too
  // gentle to undo that: "people" appears in roughly 40% of the entries in all
  // four lanes and scored 2.6x higher than "kitkat". A competitor post about
  // the world's most private religion was filed under Marketing stunts on the
  // strength of "people" and "million".
  //
  // So a word earns weight only when it is DISPROPORTIONATELY in one lane.
  // Lift is its rate inside the lane over its rate across the whole calendar;
  // at or below 1 the word is no more this lane's than anyone else's and is
  // worth exactly nothing, however often it occurs.
  const total = entries.filter((e) => e.lane).length || 1;
  const byLane = new Map<string, Map<string, number>>();
  for (const [lane, counts] of perLane) {
    const n = examples.get(lane) ?? 1;
    const weights = new Map<string, number>();
    for (const [word, count] of counts) {
      // Ignore words seen once in a lane: one topic's vocabulary is not the
      // lane's, and with ~30 examples per lane those are mostly proper nouns.
      if (count < 2) continue;
      const everywhere = (documentCount.get(word) ?? 1) / total;
      if (everywhere > MAX_DOC_FREQ) continue;
      // Smoothed toward the corpus rate; see SMOOTHING.
      const inLane = (count + SMOOTHING * everywhere) / (n + SMOOTHING);
      const lift = inLane / everywhere;
      if (lift <= MIN_LIFT) continue;
      weights.set(word, inLane * Math.log2(lift));
    }
    byLane.set(lane, weights);
  }
  return { byLane, examples };
}

/**
 * Which lane a candidate topic best fits, learned from the calendar.
 *
 * Returns a null lane when nothing scores above `threshold` — an honest "this
 * is not our kind of content", which is what keeps memes and general-interest
 * posts out of the inbox.
 */
export function laneFit(
  text: string,
  vocabulary: LaneVocabulary,
  threshold = LANE_FIT_THRESHOLD,
  minMatched = 2,
): LaneFit {
  const words = significantWords(text.slice(0, 1200));
  if (words.length < MIN_SIGNIFICANT_WORDS) return { lane: null, score: 0, matched: [] };

  const unique = [...new Set(words)];
  let best: LaneFit = { lane: null, score: 0, matched: [] };

  for (const [lane, weights] of vocabulary.byLane) {
    let total = 0;
    const matched: Array<[string, number]> = [];
    for (const word of unique) {
      const weight = weights.get(word);
      if (weight) {
        total += weight;
        matched.push([word, weight]);
      }
    }
    // Divided by length so a long caption does not beat a short one purely by
    // having more words in it.
    const score = total / Math.sqrt(unique.length);
    if (score > best.score) {
      best = {
        lane,
        score: Number(score.toFixed(3)),
        matched: matched
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([word]) => word),
      };
    }
  }

  // One shared word is a coincidence, not a topic match — especially on a
  // short caption, where a single common word can carry the whole score.
  const enough = best.score >= threshold && best.matched.length >= minMatched;
  return enough ? best : { lane: null, score: best.score, matched: best.matched };
}
