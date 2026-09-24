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
import { savePosts, saveSnapshots, saveWatchlist } from "../store";
import { engagementsOf, median, medianViews, organicPosts } from "@/lib/analytics-types";
import type { AccountSnapshot, PlatformId, PostRecord } from "@/lib/analytics-types";

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
  /** Retained so a selected candidate can be persisted without re-scraping. */
  snapshot: AccountSnapshot;
  posts: PostRecord[];
}

/** Stage 1 — turn the owner's own content into search terms. */
async function profileNiche(
  platform: PlatformId,
  owner: AccountBrief,
): Promise<{
  niche: string;
  audience: string;
  contentLanes: string[];
  searchQueries: string[];
  model: string;
}> {
  const platformNote =
    platform === "instagram"
      ? `These go into Instagram's search box. Keep them 2-4 words — Instagram's search is literal
and shallow, and long phrases return nothing.`
      : `These go into LinkedIn's people search. 3-6 words works well, and professional role
language ("digital marketing consultant", "marketing AI trainer") outperforms consumer phrasing.`;

  const system = `You classify social media accounts so similar creators can be found by search.

You will be given one account's bio, follower count and recent captions.

Return search phrases that would surface creators doing the same kind of work.
${platformNote}

Rules:
- Plain keyword phrases only. No hashtags, no "@", no usernames.
- Describe the CRAFT, not the person. "ai marketing tools" not "pritesh patel".
- Vary the angle across the phrases so the searches do not all return the same accounts.
- Order them best-first: only the first few are actually run.`;

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

Classify this account and propose the search phrases.`;

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
   original content, and anything whose captions are in a language the owner does not post in.`;

  const user = `OWNER:
${JSON.stringify(
  {
    handle: owner.handle,
    bio: owner.headline,
    followers: owner.followers,
    medianViews: owner.medianViews,
    postsPerWeek: owner.postsPerWeek,
    sampleCaptions: owner.topPosts.slice(0, 4).map((post) => post.caption.slice(0, 200)),
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
  const niche = await profileNiche(platform, owner);

  // Instagram search is shallow, so a handful of distinct queries beats one
  // broad query with a high cap. LinkedIn's is deeper; two suffice.
  const queries = niche.searchQueries.slice(0, platform === "instagram" ? 3 : 2);
  const candidates =
    platform === "instagram"
      ? await searchInstagram(queries, [ownerAccount.handle])
      : await searchLinkedIn(queries, [ownerAccount.handle]);

  const enriched =
    platform === "instagram" ? await enrichInstagram(candidates) : await enrichLinkedIn(candidates);

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
      searchQueries: niche.searchQueries,
      candidatesFound: candidates.length,
      candidatesScreened: 0,
      selected: [],
      note: `Found ${candidates.length} accounts, scraped ${enriched.length}, but none cleared the ${floor.toLocaleString("en-US")}-follower floor. ${observed}`,
      model: niche.model,
    };
  }

  const screening = await screenCandidates(owner, inBand);
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
      lane: choice.lane,
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
    searchQueries: niche.searchQueries,
    candidatesFound: candidates.length,
    candidatesScreened: inBand.length,
    selected,
    note: screening.note,
    model: screening.model,
  };
}
