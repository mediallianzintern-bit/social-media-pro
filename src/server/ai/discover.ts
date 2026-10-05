// Automatic competitor discovery.
//
// Three stages, arranged so the model never states a fact it could invent:
//
//   1. The model reads the owner's bio and captions and proposes SEARCH TERMS.
//   2. Apify runs those searches; Instagram returns accounts that exist.
//   3. Those accounts are scraped for real follower counts and posts, and the
//      model picks the most comparable ones from that real list.
//
// The model's only outputs are search phrases and a selection from a list it was
// given. It is never asked to name a handle from memory.
import { completeJson } from "./client";
import { NICHE_SCHEMA, SCREEN_SCHEMA, nicheSchema, screenSchema } from "./schemas";
import type { AccountBrief } from "./analyst";
import { OWNER_ACCOUNTS } from "../apify/accounts";
import { normalizeInstagram, readInstagramDataset } from "../apify/instagram";
import { normalizeLinkedInProfile } from "../apify/linkedin";
import { datasetItems, runActor } from "../apify/client";
import { searchInstagram, searchLinkedIn, type Candidate } from "../apify/search";
import {
  readCalendarEntries,
  readPosts,
  readTaxonomy,
  savePosts,
  saveSnapshots,
  saveWatchlist,
} from "../store";
import { buildLaneVocabulary, LANE_FIT_THRESHOLD, laneFit } from "@/lib/lane-fit";
import { engagementsOf, median, medianViews, organicPosts } from "@/lib/analytics-types";
import type { AccountSnapshot, PlatformId, PostRecord } from "@/lib/analytics-types";
import { winningLanes, type LaneSeed } from "@/lib/lane-seeds";

/**
 * Two kinds of competitor are worth tracking, and they answer different
 * questions:
 *
 *   • PEERS — within roughly an order of magnitude. What they do is directly
 *     copyable, and beating them is a realistic near-term goal.
 *   • BENCHMARKS — the large accounts in the same domain, up to millions of
 *     followers. Nothing about their distribution is reproducible, but their
 *     structure is: how they open, how long they hold, what they repeat.
 *
 * The ceiling is deliberately generous. An earlier version capped at 25× the
 * owner and excluded exactly the accounts most worth studying.
 */
const PEER_MULTIPLE = 12;

function followerFloor(ownerFollowers: number): number {
  if (ownerFollowers <= 0) return 300;
  return Math.max(300, Math.round(ownerFollowers * 0.05));
}

export function tierOf(ownerFollowers: number, followers: number): "peer" | "benchmark" {
  return followers <= ownerFollowers * PEER_MULTIPLE ? "peer" : "benchmark";
}

/** How many candidates to scrape before screening. Each costs ~$0.0026. */
const MAX_TO_ENRICH = 24;
/** LinkedIn profiles cost more and are scraped in chunks, so fewer of them. */
const MAX_TO_ENRICH_LINKEDIN = 12;
const TARGET_SELECTION = 5;

export interface DiscoveredCompetitor {
  handle: string;
  displayName: string;
  followers: number;
  postsSampled: number;
  medianViews: number;
  lane: string;
  whyComparable: string;
  tier: "peer" | "benchmark";
}

export interface DiscoveryResult {
  platform: PlatformId;
  niche: string;
  audience: string;
  searchQueries: string[];
  /** T25 — the winning lanes the search was seeded from. Empty means bio-based. */
  seededFrom: LaneSeed[];
  /** Each search actually run, and the winning lane it was written for. */
  queryPlan: Array<{ query: string; lane: string | null }>;
  candidatesFound: number;
  candidatesScreened: number;
  selected: DiscoveredCompetitor[];
  note: string;
  model: string;
}

interface EnrichedCandidate extends Candidate {
  displayName: string;
  followers: number;
  postsCount: number;
  biography: string;
  medianViews: number;
  medianInteractions: number;
  sampleCaptions: string[];
  /** T25 — the winning lane whose search found this account, if any. */
  foundForLane?: string | null;
  /** T25 — which of the owner's lanes their captions actually read like. Measured, not modelled. */
  laneEvidence?: { lane: string; matched: string[] } | null;
  /** Retained so a selected candidate can be persisted without re-scraping. */
  snapshot: AccountSnapshot;
  posts: PostRecord[];
}

/**
 * Stage 1 — the request that turns the owner into search terms.
 *
 * T25: when the account has WINNING LANES, those lead. The model writes one
 * search phrase per winning lane, from that lane's definition, so each search
 * hunts for creators who are good at something that already works here — not
 * for accounts that merely resemble the bio, which finds look-alikes in lanes
 * the owner should be doing less of. With no winning lane yet, it falls back
 * to the bio and captions, as discovery always did.
 *
 * Built separately from the call so it can be read and tested for free.
 */
export function buildNicheRequest(
  platform: PlatformId,
  owner: AccountBrief,
  seeds: LaneSeed[],
): { system: string; user: string } {
  const platformNote =
    platform === "instagram"
      ? `These go into Instagram's search box. Keep them 2-4 words — Instagram's search is literal
and shallow, and long phrases return nothing.`
      : `These go into LinkedIn's people search. 3-6 words works well, and professional role
language ("digital marketing consultant", "marketing AI trainer") outperforms consumer phrasing.`;

  const seeded = seeds.length
    ? `

WINNING LANES are given: the subjects where this account measurably beats its own median.
They are the point of this search — find creators who are STRONG IN THESE LANES.
- In laneQueries, return exactly one phrase per winning lane, in the order given, with the lane
  name copied exactly. Write each phrase from that lane's definition, not from the bio.
- searchQueries may add a couple of broader phrases for the niche as a whole.`
    : `

No winning lanes are given, so propose phrases from the bio and captions, and return an empty
laneQueries list.`;

  const system = `You classify social media accounts so similar creators can be found by search.

You will be given one account's bio, follower count and recent captions.

Return search phrases that would surface creators doing the same kind of work.
${platformNote}

Rules:
- Plain keyword phrases only. No hashtags, no "@", no usernames.
- Describe the CRAFT, not the person. "ai marketing tools" not "pritesh patel".
- Vary the angle across the phrases so the searches do not all return the same accounts.
- Order them best-first: only the first few are actually run.${seeded}`;

  const user = `ACCOUNT:
${JSON.stringify(
  {
    handle: owner.handle,
    displayName: owner.displayName,
    bio: owner.headline,
    followers: owner.followers,
    recentCaptions: owner.topPosts.map((post) => post.caption.slice(0, 220)),
  },
  null,
  2,
)}
${
  seeds.length
    ? `
WINNING LANES (strongest first, judged on ${seeds[0]!.metric}):
${seeds.map((seed) => `- ${seed.lane} — ${seed.multiple}× the account median on ${seed.metric}, ${seed.posts} posts. Covers: ${seed.definition}`).join("\n")}
`
    : ""
}
Classify this account and propose the search phrases.`;

  return { system, user };
}

async function profileNiche(
  platform: PlatformId,
  owner: AccountBrief,
  seeds: LaneSeed[],
): Promise<{
  niche: string;
  audience: string;
  contentLanes: string[];
  laneQueries: Array<{ lane: string; query: string }>;
  searchQueries: string[];
  model: string;
}> {
  const { system, user } = buildNicheRequest(platform, owner, seeds);
  const result = await completeJson<unknown>({
    system,
    user,
    schemaName: "niche_profile",
    schema: NICHE_SCHEMA,
    temperature: 0.4,
    effort: "medium",
  });

  const parsed = nicheSchema.parse(result.data);
  return { ...parsed, model: result.model };
}

/**
 * The searches actually run, and which winning lane each came from.
 *
 * Lane phrases go first, one per winning lane, in strength order; any slots
 * left are filled with the broader niche phrases. A lane phrase naming a lane
 * that was not given is ignored rather than trusted — the model was told to
 * copy the names, and a drifted name cannot be traced back to a lane.
 */
export function planQueries(
  seeds: LaneSeed[],
  laneQueries: Array<{ lane: string; query: string }>,
  searchQueries: string[],
  slots: number,
): Array<{ query: string; lane: string | null }> {
  const plan: Array<{ query: string; lane: string | null }> = [];
  const seen = new Set<string>();
  const add = (query: string, lane: string | null) => {
    const key = query.trim().toLowerCase();
    if (!key || seen.has(key) || plan.length >= slots) return;
    seen.add(key);
    plan.push({ query: query.trim(), lane });
  };
  for (const seed of seeds) {
    const match = laneQueries.find(
      (entry) => entry.lane.trim().toLowerCase() === seed.lane.toLowerCase(),
    );
    if (match) add(match.query, seed.lane);
  }
  for (const query of searchQueries) add(query, null);
  return plan;
}

/**
 * Stage 2b — scrape candidates so screening happens on real numbers.
 *
 * Instagram's profile scraper returns counters and recent posts in one call, so
 * engagement is available immediately. LinkedIn's profile scraper returns only
 * the profile; posts cost a separate run per profile, which is not worth paying
 * for on candidates that may be rejected. Selected LinkedIn competitors get
 * their posts on the next ordinary sync instead.
 */
async function enrichInstagram(candidates: Candidate[]): Promise<EnrichedCandidate[]> {
  if (!candidates.length) return [];

  const slice = candidates.slice(0, MAX_TO_ENRICH);
  const { datasetId } = await runActor("apify/instagram-profile-scraper", {
    usernames: slice.map((candidate) => candidate.handle),
  });
  const profiles = await readInstagramDataset(datasetId);

  const byHandle = new Map(slice.map((candidate) => [candidate.handle.toLowerCase(), candidate]));
  const capturedAt = new Date().toISOString();
  const enriched: EnrichedCandidate[] = [];

  for (const profile of profiles) {
    if (!profile?.username) continue;
    const candidate = byHandle.get(profile.username.toLowerCase());
    if (!candidate) continue;

    const { snapshot, posts } = normalizeInstagram(profile, capturedAt);
    const organic = organicPosts(posts);
    enriched.push({
      ...candidate,
      displayName: snapshot.displayName,
      followers: snapshot.followers,
      postsCount: snapshot.postsCount ?? 0,
      biography: snapshot.headline ?? "",
      medianViews: Math.round(medianViews(organic)),
      medianInteractions: Math.round(median(organic.map((post) => engagementsOf(post)))),
      sampleCaptions: organic.slice(0, 3).map((post) => post.caption.slice(0, 180)),
      snapshot,
      posts,
    });
  }

  return enriched;
}

interface LiProfileRow {
  firstName?: string;
  lastName?: string;
  headline?: string;
  publicIdentifier?: string;
  followerCount?: number;
  connectionsCount?: number;
}

/**
 * LinkedIn profiles are scraped in small batches.
 *
 * The actor silently degrades on a large batch: 24 URLs in one run returned a
 * single record with no publicIdentifier, while 3 URLs returned all 3 correctly.
 * Chunking keeps each run inside whatever that limit is, and a failed chunk
 * costs only its own candidates rather than the whole discovery.
 */
const LI_CHUNK = 6;

async function enrichLinkedIn(candidates: Candidate[]): Promise<EnrichedCandidate[]> {
  if (!candidates.length) return [];

  const slice = candidates.slice(0, MAX_TO_ENRICH_LINKEDIN);
  const byHandle = new Map(slice.map((candidate) => [candidate.handle.toLowerCase(), candidate]));
  const capturedAt = new Date().toISOString();
  const enriched: EnrichedCandidate[] = [];

  for (let start = 0; start < slice.length; start += LI_CHUNK) {
    const chunk = slice.slice(start, start + LI_CHUNK);
    let profiles: LiProfileRow[] = [];
    try {
      const { datasetId } = await runActor("harvestapi/linkedin-profile-scraper", {
        profileScraperMode: "Profile details no email ($4 per 1k)",
        queries: chunk.map((candidate) => `https://www.linkedin.com/in/${candidate.handle}/`),
      });
      profiles = await datasetItems<LiProfileRow>(datasetId, chunk.length + 3);
    } catch (error) {
      console.error(`[discover:linkedin] chunk of ${chunk.length} failed:`, error);
      continue;
    }

    for (const profile of profiles) {
      const snapshot = normalizeLinkedInProfile(profile, capturedAt);
      if (!snapshot.handle) continue;
      const candidate = byHandle.get(snapshot.handle.toLowerCase());
      if (!candidate) continue;

      enriched.push({
        ...candidate,
        displayName: snapshot.displayName,
        followers: snapshot.followers,
        postsCount: 0,
        biography: snapshot.headline ?? "",
        // Post metrics are not fetched for candidates — see the note above.
        medianViews: 0,
        medianInteractions: 0,
        sampleCaptions: [],
        snapshot,
        posts: [],
      });
    }
  }

  console.log(`[discover:linkedin] enriched ${enriched.length} of ${slice.length} candidates`);
  return enriched;
}

/** Stage 3 — choose from the real list. */
async function screenCandidates(
  owner: AccountBrief,
  candidates: EnrichedCandidate[],
  seeds: LaneSeed[] = [],
): Promise<{
  selected: Array<{ handle: string; lane: string; whyComparable: string }>;
  note: string;
  model: string;
}> {
  const system = `You are selecting competitor accounts for a social media benchmark.

You will be given one OWNER account and a list of CANDIDATE accounts with real, scraped figures.

Rules:
1. Choose ONLY from the CANDIDATES list. Copy each handle exactly. Never introduce an account
   that is not in the list.
2. Select a deliberate MIX of two kinds:
   - PEERS: within about 12× the owner's follower count. Directly comparable, realistically
     beatable.
   - BENCHMARKS: the biggest accounts in the same domain, however large — hundreds of thousands
     or millions of followers. Their reach is not reproducible but their structure is, and the
     owner needs to see what the ceiling of this niche looks like.
   Aim for at least one benchmark account if any large one appears in the candidates.
3. Domain match matters more than size. A 2-million-follower account teaching the same subject
   is worth far more than a same-sized account in an unrelated field.
4. Prefer variety of approach over similarity — the point is to see different plays in the same
   niche, not five versions of the same account.
5. Do NOT reject an account merely for being smaller than the owner. A smaller account with
   stronger engagement is one of the most instructive comparisons available — it isolates what
   the content is doing, with audience size held against it. Reject for wrong domain, dormancy
   or spam, not for size alone.
6. Select up to ${TARGET_SELECTION}. Return an empty list only if nothing is in the same domain
   at all, and say so in rejectedReason.
7. Reject dormant accounts (no recent posts), pure agency or course-selling accounts with no
   original content, and anything whose captions are in a language the owner does not post in.${
     seeds.length
       ? `
8. WINNING LANES. The owner wins in the lanes listed under winningLanes, and this search was
   seeded from them: find creators STRONG IN THOSE LANES. Each candidate's foundForLane says
   which winning lane's search surfaced it; laneEvidence is a measured word-match of their
   captions against the owner's own lanes. A candidate whose laneEvidence agrees with its
   foundForLane is the strongest fit. Set "lane" to the winning lane the account competes in
   wherever one applies, and cover more than one winning lane if the candidates allow.`
       : ""
   }`;

  const user = `OWNER:
${JSON.stringify(
  {
    handle: owner.handle,
    bio: owner.headline,
    followers: owner.followers,
    medianViews: owner.medianViews,
    postsPerWeek: owner.postsPerWeek,
    sampleCaptions: owner.topPosts.slice(0, 4).map((post) => post.caption.slice(0, 200)),
    ...(seeds.length
      ? {
          winningLanes: seeds.map((seed) => ({
            lane: seed.lane,
            multipleOfMedian: seed.multiple,
            metric: seed.metric,
          })),
        }
      : {}),
  },
  null,
  2,
)}

CANDIDATES (${candidates.length}):
${JSON.stringify(
  candidates.map((candidate) => ({
    handle: candidate.handle,
    displayName: candidate.displayName,
    followers: candidate.followers,
    posts: candidate.postsCount,
    medianViews: candidate.medianViews,
    medianInteractions: candidate.medianInteractions,
    bio: candidate.biography,
    sampleCaptions: candidate.sampleCaptions,
    ...(seeds.length
      ? {
          foundForLane: candidate.foundForLane ?? null,
          laneEvidence: candidate.laneEvidence ?? null,
        }
      : {}),
  })),
  null,
  2,
)}

Select the most useful competitors for benchmarking ${owner.handle}.`;

  const result = await completeJson<unknown>({
    system,
    user,
    schemaName: "competitor_screening",
    schema: SCREEN_SCHEMA,
    temperature: 0.2,
    effort: "medium",
  });

  const parsed = screenSchema.parse(result.data);
  return { selected: parsed.selected, note: parsed.rejectedReason, model: result.model };
}

export async function discoverCompetitors(
  platform: PlatformId,
  owner: AccountBrief,
): Promise<DiscoveryResult> {
  const ownerAccount = OWNER_ACCOUNTS[platform];

  // T25 — seed from the lanes that win, judged on the goal metric. The brief
  // is already scoped to the current era (T56), so these are the lanes that
  // win under the strategy in force now, not across every past one.
  const [taxonomy, ownPosts, calendar] = await Promise.all([
    readTaxonomy(platform, ownerAccount.handle).catch(() => null),
    readPosts(platform, ownerAccount.handle, 400).catch(() => [] as PostRecord[]),
    readCalendarEntries(platform).catch(() => []),
  ]);
  const definitions = new Map((taxonomy ?? []).map((lane) => [lane.name, lane.definition]));
  const seeds = winningLanes(
    owner.lanes,
    owner.expectations,
    owner.goal?.growthGoal ?? null,
    definitions,
  );

  const niche = await profileNiche(platform, owner, seeds);

  // Instagram search is shallow, so a handful of distinct queries beats one
  // broad query with a high cap. LinkedIn's is deeper; two suffice.
  const plan = planQueries(
    seeds,
    niche.laneQueries,
    niche.searchQueries,
    platform === "instagram" ? 3 : 2,
  );
  const queries = plan.map((entry) => entry.query);
  const laneForQuery = new Map(plan.map((entry) => [entry.query.toLowerCase(), entry.lane]));
  const candidates =
    platform === "instagram"
      ? await searchInstagram(queries, [ownerAccount.handle])
      : await searchLinkedIn(queries, [ownerAccount.handle]);

  const enrichedRaw =
    platform === "instagram" ? await enrichInstagram(candidates) : await enrichLinkedIn(candidates);

  // Which of the owner's lanes each candidate actually writes in, measured
  // against a vocabulary built from the owner's OWN classified posts — plus
  // the team's calendar where one exists. Free, and it does not take the
  // search's word for it: a phrase written for a lane can still surface an
  // account that writes about something else.
  const vocabulary = buildLaneVocabulary([
    ...ownPosts
      .filter((post) => post.contentLane && post.contentLane !== "other")
      .map((post) => ({ lane: post.contentLane ?? null, content: post.caption })),
    ...calendar.map((entry) => ({ lane: entry.lane, content: entry.content })),
  ]);
  const enriched = enrichedRaw.map((candidate) => {
    const fit = candidate.sampleCaptions.length
      ? laneFit(candidate.sampleCaptions.join(" "), vocabulary, LANE_FIT_THRESHOLD, 2)
      : null;
    return {
      ...candidate,
      foundForLane: laneForQuery.get(candidate.matchedQuery.toLowerCase()) ?? null,
      laneEvidence: fit?.lane ? { lane: fit.lane, matched: fit.matched.slice(0, 4) } : null,
    };
  });

  // Only a floor now: tiny accounts have too little signal to read. There is no
  // ceiling — a million-follower account in the same domain is the most
  // instructive row in the table, not an outlier to discard.
  const floor = followerFloor(owner.followers);
  const inBand = enriched.filter((candidate) => candidate.followers >= floor);

  if (!inBand.length) {
    // Report what was actually seen — "nothing qualified" without the observed
    // range gives no way to tell a bad search from a bad threshold.
    const counts = enriched.map((candidate) => candidate.followers).sort((a, b) => a - b);
    const observed = counts.length
      ? `Scraped accounts ranged ${counts[0]?.toLocaleString("en-US")}–${counts[counts.length - 1]?.toLocaleString("en-US")} followers.`
      : "None of the accounts found could be scraped — they may be private or newly created.";

    return {
      platform,
      niche: niche.niche,
      audience: niche.audience,
      searchQueries: queries,
      seededFrom: seeds,
      queryPlan: plan,
      candidatesFound: candidates.length,
      candidatesScreened: 0,
      selected: [],
      note: `Found ${candidates.length} accounts, scraped ${enriched.length}, but none cleared the ${floor.toLocaleString("en-US")}-follower floor. ${observed}`,
      model: niche.model,
    };
  }

  const screening = await screenCandidates(owner, inBand, seeds);
  const byHandle = new Map(inBand.map((candidate) => [candidate.handle.toLowerCase(), candidate]));

  // Defence in depth: even told to copy handles verbatim, a model can drift.
  // Anything not in the scraped list is discarded rather than trusted.
  const selected: DiscoveredCompetitor[] = [];
  const chosen: EnrichedCandidate[] = [];
  for (const choice of screening.selected) {
    const candidate = byHandle.get(choice.handle.toLowerCase());
    if (!candidate) continue;
    chosen.push(candidate);
    selected.push({
      handle: candidate.handle,
      displayName: candidate.displayName,
      followers: candidate.followers,
      postsSampled: candidate.posts.length,
      medianViews: candidate.medianViews,
      // A lane we can stand behind: their captions' measured lane when it is
      // one of the winning lanes, then the winning lane whose search found
      // them, and only then the model's own label.
      lane:
        (candidate.laneEvidence && seeds.some((seed) => seed.lane === candidate.laneEvidence?.lane)
          ? candidate.laneEvidence.lane
          : null) ??
        candidate.foundForLane ??
        choice.lane,
      whyComparable: choice.whyComparable,
      // Trust the measured follower count over the model's own labelling.
      tier: tierOf(owner.followers, candidate.followers),
    });
  }

  // Persist what was already scraped during screening, so the benchmark table
  // and the analysis have data immediately rather than after the next sync.
  if (chosen.length) {
    await saveWatchlist(
      platform,
      chosen.map((candidate) => candidate.handle),
    );
    await saveSnapshots(
      platform,
      null,
      chosen.map((candidate) => ({ snapshot: candidate.snapshot, role: "competitor" as const })),
    );
    for (const candidate of chosen) {
      await savePosts(candidate.handle, candidate.posts);
    }
  }

  return {
    platform,
    niche: niche.niche,
    audience: niche.audience,
    searchQueries: queries,
    seededFrom: seeds,
    queryPlan: plan,
    candidatesFound: candidates.length,
    candidatesScreened: inBand.length,
    selected,
    note: screening.note,
    model: screening.model,
  };
}
