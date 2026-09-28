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

  // Weight = how often the word appears in this lane, divided by how widely it
  // appears across all lanes. A word in every lane carries almost no weight.
  const total = entries.filter((e) => e.lane).length || 1;
  const byLane = new Map<string, Map<string, number>>();
  for (const [lane, counts] of perLane) {
    const n = examples.get(lane) ?? 1;
    const weights = new Map<string, number>();
    for (const [word, count] of counts) {
      // Ignore words seen once in a lane: one topic's vocabulary is not the
      // lane's, and with ~30 examples per lane those are mostly proper nouns.
      if (count < 2) continue;
      const inLane = count / n;
      const everywhere = (documentCount.get(word) ?? 1) / total;
      weights.set(word, inLane * Math.log(1 / everywhere + 1));
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
  threshold = 0.08,
  minMatched = 2,
): LaneFit {
  const words = significantWords(text.slice(0, 1200));
  if (!words.length) return { lane: null, score: 0, matched: [] };

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
