// Layer 5 — the narrow agent roles.
//
// Each agent has one job, a strict JSON schema in and out, and a hard "must
// not". None of them compute a number: every figure they cite was calculated in
// TypeScript and handed to them.
//
// The Analyst and the Competitor agent used to be a single call. Splitting them
// is not tidying — it changes what is guaranteed. The old prompt received the
// owner's measured block (reach, saves, watch time) *while* being asked to write
// competitor verdicts, and the only thing standing between those two facts was
// an instruction not to mix them. The Competitor agent below is handed a brief
// with those fields removed, so it cannot state an owner-only metric for a
// rival: not because it was told not to, but because it was never given one.
import { completeJson } from "./client";
import {
  ANALYST_SCHEMA,
  COMPETITOR_SCHEMA,
  FEED_SELECTION_SCHEMA,
  REFLECTION_SCHEMA,
  analystSchema,
  competitorAnalysisSchema,
  feedSelectionSchema,
  reflectionSchema,
} from "./schemas";
import { fetchAudienceQuestions, fetchTrends, feedQueries, type FeedItem } from "./feeds";
import type { AccountBrief } from "./analyst";
import type { AnalystRead, CompetitorAnalysis, FeedRead, ReflectionRead } from "@/lib/ai-types";
import type { PlatformId } from "@/lib/analytics-types";

/** Rules every agent shares. Each agent adds its own prohibition on top. */
const SHARED_RULES = `
HARD RULES — these override anything else:
1. Every number you mention must appear verbatim in the DATA block. Never
   calculate, estimate, extrapolate or round into a new figure.
2. If the data does not support a claim, say so plainly. "Too few posts to tell"
   is a valid and useful answer, and a better one than a confident guess.
3. "vsMedian" and "medianVsMedian" are multiples of that same account's own
   median — 1.0 is typical for them, 3.0 is a breakout, 0.4 is a miss. Write
   them as multiples ("3.9x its typical post"), never as a bare number, which
   reads to a person like a raw count.
4. Sample sizes are small. Treat anything under six posts, or a lane marked
   directional, as a direction to test rather than a finding.
5. Write plainly. No marketing filler, no "in today's digital landscape", no
   exclamation marks.
6. NEVER write a field name. The data uses names like medianViews, postsAnalysed,
   shareOfOutputPct, shareOfPerformancePct, medianSaves, avgWatchSeconds,
   saveRatePct, ratePerWeek and ratePerMonth. Those are column headings for a
   developer, not words. Say what the number MEANS, with its unit, the way you
   would to a client who has never seen the database:
     "medianViews 184"                   -> "a typical post gets 184 views"
     "postsAnalysed 60"                  -> "across 60 posts"
     "shareOfOutputPct 23 and
      shareOfPerformancePct 24"          -> "23% of the posts, 24% of the engagement"
     "medianSaves 4"                     -> "4 saves on a typical post"
     "avgWatchSeconds 18.1"              -> "people watch about 18 seconds"
     "saveRatePct 0.71"                  -> "0.71% of viewers saved it"
     "ratePerWeek -31"                   -> "losing about 31 followers a week"
   A sentence a reader has to decode is a sentence that will not be acted on.
`.trim();

/**
 * Strips every owner-measured figure from a brief.
 *
 * Exported so the guarantee can be tested rather than asserted.
 *
 * This is what makes the Competitor agent's guarantee structural. Reach, saves,
 * shares and watch time exist only for accounts we hold a Graph token for, so a
 * competitor comparison that referenced them would be comparing a measured
 * number against one that does not exist anywhere.
 */
export function publicOnly(brief: AccountBrief): AccountBrief {
  const strip = (posts: AccountBrief["topPosts"]) =>
    posts.map((post) => {
      const {
        reach: _reach,
        saves: _saves,
        shares: _shares,
        avgWatchSeconds: _watch,
        saveRatePct: _saveRate,
        shareRatePct: _shareRate,
        ...publicFields
      } = post;
      return publicFields;
    });

  const { owned: _owned, pastSuggestions: _past, ...rest } = brief;

  return {
    ...rest,
    topPosts: strip(brief.topPosts),
    weakestPosts: strip(brief.weakestPosts),
    ...(brief.lanes
      ? {
          lanes: brief.lanes.map((lane) => {
            const { medianSaves: _s, medianWatchSeconds: _w, ...publicLane } = lane;
            return publicLane;
          }),
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Analyst — the client's own measured performance
// ---------------------------------------------------------------------------

export async function analystRead(
  platform: PlatformId,
  owner: AccountBrief,
): Promise<{ read: AnalystRead; model: string }> {
  const system = `You are reading ONE ${platform} account's own performance. Not a comparison —
there are no other accounts in this task.

${SHARED_RULES}

6. This account's saves, shares, watch time and reach are measured by the platform itself.
   They are the only signals that say what an audience actually WANTED: a save means someone
   intended to come back to it, a share means they attached their own name to it. Weight them
   above likes, which cost nothing.
7. For lanes, the figure that matters is medianVsMedian, never postCount. A lane can be most
   of what this account publishes and still be its weakest work. Where shareOfOutputPct runs well
   ahead of shareOfPerformancePct, say so plainly — that lane is absorbing effort it is not
   repaying, and naming it is the most useful thing you can do.

Return one laneNote per lane you are given, in the order given.

Then write EXACTLY 4 TEAM TAKEAWAYS — what this account's own numbers mean for the people
making the content. This is the part a busy team reads instead of the lists above, so:
- Plain language. No jargon, no field names, no "leverage" or "double down".
- Each takeaway is ONE sentence of at most 12 words, stating the finding.
- Each "soWhat" is ONE sentence naming something they could start this week with the people
  and budget they already have. "Post more consistently" is not an action — it restates
  wanting to do better. "Open the next three brand lessons with the customer problem" is.
- Most important first.
- If the honest fourth takeaway is that something is too thin to call yet, say that. A real
  limit is more useful to a team than an invented instruction.`;

  const user = `DATA — the only figures that exist. All of it belongs to this one account and is
measured by the platform, so you may cite reach, saves, shares and watch time freely.

ACCOUNT:
${JSON.stringify(owner, null, 2)}

Read this account's own performance.`;

  const result = await completeJson<unknown>({
    system,
    user,
    schemaName: "analyst_read",
    schema: ANALYST_SCHEMA,
    temperature: 0.2,
    effort: "high",
  });

  return { read: analystSchema.parse(result.data), model: result.model };
}

// ---------------------------------------------------------------------------
// Competitor — public data only
// ---------------------------------------------------------------------------

export async function competitorRead(
  platform: PlatformId,
  owner: AccountBrief,
  rivals: AccountBrief[],
): Promise<{ analysis: CompetitorAnalysis; model: string }> {
  const nicheLanes = owner.nicheLanes ?? [];

  const system = `You are mapping the competitive position of a ${platform} account against the
accounts it is tracked alongside.

${SHARED_RULES}

6. EVERY figure in this task is public — likes, comments, view counts, follower counts.
   Reach, saves, shares and watch time are NOT in your data for any account, including the
   owner's, because they are measured only inside an account's own analytics. Never state,
   estimate or imply one. If you find yourself wanting to, say what the public data shows
   instead.
7. An account with more followers but a lower engagement rate is not "doing better". Say
   which of the two it is winning on, never "better" unqualified.
8. Judge a lane by what performs in it, not by what is published most. An account posting
   daily into a lane that never clears 1.0x its own median has not claimed that lane — it is
   open. That distinction is the most valuable thing this task produces.
9. Competitor lane labels were inferred from captions and are less reliable than the owner's
   own. Treat every cross-account lane claim as directional.

For each competitor give the lane it occupies, a verdict of at most four words for a table
cell, and one sentence explaining it that cites a figure. Include the owner in the verdicts
array with gap "baseline" and tone "neutral".

Then write EXACTLY 4 TEAM TAKEAWAYS. This is the part of your answer a busy team actually
reads, so write it to be read on its own, without the tables:
- Plain language. No jargon, no "leverage", no "double down", no "content strategy".
- Each takeaway is ONE sentence of at most 12 words, stating the finding.
- Each "soWhat" is ONE sentence naming something the team could start this week with the
  people and budget they already have. "Post more consistently" and "increase engagement"
  are not actions — they are restatements of wanting to do better. "Open the next three
  teardowns with the customer problem instead of the brand name" is an action.
- Order them most important first.
- Ground them in what the data actually shows. If the honest fourth takeaway is that
  something is too thin to call yet, say that — a real limit is more useful to a team than
  an invented instruction.
- Write multiples as "2.4x", never as a bare decimal, and never quote a raw fraction.`;

  const user = `DATA — public signal only, for every account here.

OWNER ACCOUNT (public fields only):
${JSON.stringify(publicOnly(owner), null, 2)}

${
  rivals.length
    ? `COMPETITOR ACCOUNTS (${rivals.length}):\n${JSON.stringify(rivals.map(publicOnly), null, 2)}`
    : "COMPETITOR ACCOUNTS: none tracked."
}

${
  nicheLanes.length
    ? `LANE-VS-LANE ACROSS THE TRACKED SET, in vsMedian terms. accountsAboveMedian over
accountsPublishing is how BROADLY a lane wins — clearing its own median on 4 of 5 accounts is
a structural finding; on 1 of 5 it is noise:
${JSON.stringify(nicheLanes, null, 2)}`
    : ""
}

Map which lanes are contested and which are open for ${owner.handle}.`;

  const result = await completeJson<unknown>({
    system,
    user,
    schemaName: "competitor_analysis",
    schema: COMPETITOR_SCHEMA,
    temperature: 0.2,
    effort: "high",
  });

  return { analysis: competitorAnalysisSchema.parse(result.data), model: result.model };
}

// ---------------------------------------------------------------------------
// Reflection — what this system learned from its own advice
// ---------------------------------------------------------------------------

export async function reflectionRead(
  platform: PlatformId,
  owner: AccountBrief,
): Promise<{ read: ReflectionRead; model: string } | null> {
  const past = owner.pastSuggestions;
  if (!past || past.measured === 0) return null;

  const system = `You are reviewing whether a content-suggestion system's own advice worked on
one ${platform} account.

${SHARED_RULES}

6. You are NOT scoring confidence and must never produce a percentage, a probability or a
   likelihood. A statistical model fitted on measured outcomes does that; a model asked how
   sure it feels produces a number that looks authoritative and means nothing. Your job is
   qualitative: what to do differently, and why.
7. Each suggestion carries the winningTrait it was built to reproduce. The useful question is
   whether reproducing that trait actually worked on THIS account — a trait that is sound in
   general and fails here should be named as failing here.
8. Mark a lesson confirmed only with three or more measured outcomes behind it. One or two is
   an anecdote, and calling it confirmed is the exact overclaim this task exists to prevent.
9. Say plainly when the sample is too small to conclude anything. Early on that IS the finding.
10. You may be given a GOAL SCORECARD: how the client's primary metric moved in the weeks that
    contained a published suggestion, against the weeks that did not. Reason over it — is our
    advice associated with the metric moving the right way? — but NEVER upgrade it into a
    causal claim. It is a correlation over a handful of weeks, and posting cadence, the
    algorithm and the season all move the same line. If it is marked not comparable, say that
    we cannot tell yet rather than reading a difference into it.
11. Every outcome carries TWO multiples, and only one is the verdict. "score" is the figure the
    suggestion was graded on — named in "gradedOn", normally the client's goal metric such as
    save rate — as a multiple of the account's own median, and "hit" means it beat 1.0 on it.
    "vsMedian" is reach, kept for context only. Judge every suggestion, lane and trait on
    score, never on vsMedian: a post few people saw but most of them saved is a HIT for this
    client, and calling it a miss because its reach was low is the exact mistake this system
    was rebuilt to stop making. Where gradedOn is "reach" or "engagement", the goal metric was
    not measured for that post — say so rather than presenting it as a goal result.
12. "byScript" shows which script SHAPES won — the kind of opening, the length, the ending,
    the format — and "scriptExamples" gives the skeletons of the best and worst filmed
    scripts. Where two or more filmed scripts support it, name the winning shape as a lesson
    the next script can follow. "blocked" lists what the loop has already stopped suggesting;
    do not recommend any of it, and do not restate a block as a new lesson.`;

  const user = `DATA — suggestions this system made, that were actually published, and how they
did. Every figure was measured at a fixed point after publishing and frozen, so these are
results rather than live readings.

${JSON.stringify(past, null, 2)}

${
  owner.lanes?.length
    ? `THE ACCOUNT'S LANES, for context on where each suggestion landed:\n${JSON.stringify(owner.lanes, null, 2)}`
    : ""
}

${
  owner.goal?.scorecard
    ? `GOAL SCORECARD — the client's primary metric in weeks containing a published suggestion,
against weeks without one. Computed in TypeScript; correlational, never causal:
${JSON.stringify(owner.goal.scorecard, null, 2)}`
    : ""
}

What has this system learned about advising ${owner.handle}?`;

  const result = await completeJson<unknown>({
    system,
    user,
    schemaName: "reflection_read",
    schema: REFLECTION_SCHEMA,
    temperature: 0.3,
    effort: "medium",
  });

  return { read: reflectionSchema.parse(result.data), model: result.model };
}

// ---------------------------------------------------------------------------
// Trend scout and Audience questions — selection from real feeds
// ---------------------------------------------------------------------------

/**
 * One selection pass over a live feed.
 *
 * Both feed agents are the same shape and differ only in their candidate list
 * and framing, so they share this. Three properties matter:
 *
 *   • It returns null when the feed is off or empty, so the agent never runs
 *     with nothing to select from — there is no opportunity to fill silence.
 *   • Every pick is checked back against the candidate list afterwards. The
 *     prompt says copy verbatim; this makes it true regardless.
 *   • candidatesFound and queries are computed here, not by the model.
 */
async function selectFromFeed(
  items: FeedItem[],
  queries: string[],
  options: { schemaName: string; system: string; userIntro: string; lanes: string[] },
): Promise<{ read: FeedRead; model: string } | null> {
  if (!items.length) return null;

  const candidates = items.slice(0, 80).map((item) => item.term);

  const user = `${options.userIntro}

THE ACCOUNT'S OWN LANES${options.lanes.length ? "" : " — none classified yet"}:
${options.lanes.length ? JSON.stringify(options.lanes, null, 2) : "(none)"}

CANDIDATES (${candidates.length}) — the only strings you may return as "term":
${JSON.stringify(candidates, null, 2)}

Select the ones worth this account's attention.`;

  const result = await completeJson<unknown>({
    system: options.system,
    user,
    schemaName: options.schemaName,
    schema: FEED_SELECTION_SCHEMA,
    temperature: 0.2,
    effort: "medium",
  });

  const parsed = feedSelectionSchema.parse(result.data);

  // Enforced, not trusted. A pick that does not match a candidate exactly is
  // something the model produced rather than something the feed returned, which
  // is the one failure this whole design exists to prevent.
  const allowed = new Set(candidates.map((term) => term.toLowerCase()));
  const picks = parsed.picks.filter((pick) => allowed.has(pick.term.trim().toLowerCase()));
  const dropped = parsed.picks.length - picks.length;
  if (dropped > 0) {
    console.warn(
      `[agents:${options.schemaName}] dropped ${dropped} pick(s) not present in the feed.`,
    );
  }

  return {
    read: {
      headline: parsed.headline,
      picks,
      note: parsed.note,
      candidatesFound: items.length,
      queries,
    },
    model: result.model,
  };
}

export async function trendScout(
  platform: PlatformId,
  owner: AccountBrief,
  niche: string,
): Promise<{ read: FeedRead; model: string } | null> {
  const lanes = (owner.lanes ?? []).map((lane) => lane.lane);
  const queries = feedQueries(niche, lanes);
  const items = await fetchTrends(queries);

  return selectFromFeed(items, queries, {
    schemaName: "trend_selection",
    lanes,
    system: `You are picking rising topics worth a ${platform} creator's attention.

Everything in the CANDIDATES list came back from a live search-trend source moments ago.
Your ONLY job is to choose from it.

HARD RULES:
1. Never name a trend that is not in the CANDIDATES list, however confident you are that it
   is real. You have no way to know what is rising right now; the list does. A trend recalled
   from memory is indistinguishable from a real one on screen and wrong exactly when someone
   acts on it.
2. Copy each "term" character for character from the list.
3. Relevance to THIS account beats popularity. A hugely rising topic this creator has no
   credible angle on is worth less than a smaller one that sits inside a lane they already
   win. Say which lane it fits.
4. Reject generic or off-domain terms rather than stretching for a connection. An empty
   selection with an honest note is a good answer.
5. Rising interest is not the same as an audience wanting it from this account. Do not imply
   a trend will perform for them — say why it is worth testing.`,
    userIntro: `Rising and related terms from a live trend feed, for the queries ${JSON.stringify(queries)}.`,
  });
}

export async function audienceQuestions(
  platform: PlatformId,
  owner: AccountBrief,
  niche: string,
): Promise<{ read: FeedRead; model: string } | null> {
  const lanes = (owner.lanes ?? []).map((lane) => lane.lane);
  const queries = feedQueries(niche, lanes);
  const items = await fetchAudienceQuestions(queries);

  return selectFromFeed(items, queries, {
    schemaName: "question_selection",
    lanes,
    system: `You are picking real questions a ${platform} creator could answer in a post.

Every string in CANDIDATES is a question people actually searched for, captured from a live
source. Your ONLY job is to choose from it.

HARD RULES:
1. Never write a question of your own, however obvious it seems. If a better phrasing exists,
   it is not your phrasing to invent — the value of this list is that real people asked these.
2. Copy each "term" character for character from the list.
3. Prefer questions this creator is genuinely placed to answer, and say which lane each fits.
   A question they have no standing to answer is worse than no question.
4. Prefer specific over broad. "How do I price a retainer" gives a creator something to make;
   "what is marketing" does not.
5. Reject the off-domain and the trivially obvious rather than padding the list. Returning two
   good questions and saying so is better than five weak ones.`,
    userIntro: `Real questions from a live question feed, for the queries ${JSON.stringify(queries)}.`,
  });
}
