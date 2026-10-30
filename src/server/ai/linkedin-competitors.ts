// LinkedIn competitors found and judged by what they POST (Oct 2026).
//
// They used to be found by job title (a people search on phrases written from
// his bio) and judged on their bio and three caption snippets, so the list
// held people who describe themselves like Pritesh Sir rather than people who
// write what he writes. Now:
//
//   1. Search terms come from his own lanes and the subjects of his analysed
//      posts, never his bio.
//   2. LinkedIn POSTS are searched with them (harvestapi/linkedin-post-search),
//      and the people who wrote the matching posts are the candidates.
//   3. Each candidate's own recent posts are read, analysed the same way as
//      his (linkedin-content.ts) and filed under HIS lanes.
//   4. A candidate is scored on its posts: the share that fall in his lanes,
//      how many of his lanes it covers, and how much its formats match his.
//      Bios and titles play no part.
//
// The shortlist is held as a proposal for the team to approve; nothing the
// dashboard benchmarks against changes until then.
//
// Cost per run: about 150 searched posts and 120 candidate posts on Apify at
// $0.002 each (about $0.55), and a few cents of gpt-4o-mini.
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { costOf, type GenerationCost } from "@/lib/ai-cost";
import type { PostRecord } from "@/lib/analytics-types";
import { median } from "@/lib/analytics-types";

import { completeJson } from "./client";
import { addCosts } from "./review";
import { analysePosts, assignToLanes, readAnalyses } from "./linkedin-content";
import { OWNER_ACCOUNTS } from "../apify/accounts";
import { datasetItems, runActor } from "../apify/client";
import { authorOf, LINKEDIN_POSTS_ACTOR, normalizeLinkedInPosts } from "../apify/linkedin";
import { hasDurableStore, readPosts, readTaxonomy } from "../store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

const POST_SEARCH_ACTOR = "harvestapi/linkedin-post-search";
const POSTS_PER_QUERY = 25;
const CANDIDATES = 12;
const POSTS_PER_CANDIDATE = 10;
/** Below this share of posts in his lanes, a candidate does not write what he writes. */
const MIN_OVERLAP = 0.4;

interface SearchedPost {
  id?: string;
  content?: string;
  linkedinUrl?: string;
  postedAt?: { date?: string };
  engagement?: { likes?: number; comments?: number; shares?: number };
  author?: {
    publicIdentifier?: string;
    name?: string;
    info?: string;
    linkedinUrl?: string;
    type?: string;
  };
}

export interface CandidateEvidence {
  handle: string;
  name: string;
  profileUrl: string;
  /** Posts of theirs that matched his topics in the search. */
  matchedPosts: number;
  /** Their own recent posts that were read and analysed. */
  postsRead: number;
  /** Share of their posts that fall in his lanes, 0-1. */
  overlap: number;
  /** His lanes their posts cover, with how many posts in each. */
  lanes: Record<string, number>;
  /** Share of their posts in the formats he uses most, 0-1. */
  formatMatch: number;
  medianEngagement: number;
  score: number;
  /** A few of their post openings, for the team to recognise them. */
  examples: string[];
}

const querySchema = {
  type: "object",
  additionalProperties: false,
  required: ["queries"],
  properties: {
    queries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["lane", "query"],
        properties: { lane: { type: "string" }, query: { type: "string" } },
      },
    },
  },
} as const;

/** One LinkedIn post search per lane, written from his own posts in it. */
async function searchQueries(
  lanes: Array<{ name: string; definition: string }>,
  topicsByLane: Map<string, string[]>,
): Promise<{ queries: Array<{ lane: string; query: string }>; cost: GenerationCost | undefined }> {
  const result = await completeJson<unknown>({
    system: `Write LinkedIn POST search queries that find posts on the same subjects as one creator's posts.
One query per lane, 2 to 5 plain keywords, the way someone would type them into LinkedIn's search to
find posts (not people). Use the subjects his posts actually cover, not job titles, and no hashtags.`,
    user: lanes
      .map(
        (lane) =>
          `LANE: ${lane.name} — ${lane.definition}\nHis posts here cover: ${(topicsByLane.get(lane.name) ?? []).slice(0, 10).join("; ")}`,
      )
      .join("\n\n"),
    schemaName: "linkedin_post_queries",
    schema: querySchema as unknown as Record<string, unknown>,
    temperature: 0.2,
    effort: "low",
  });
  const reply = z
    .object({ queries: z.array(z.object({ lane: z.string(), query: z.string() })) })
    .safeParse(result.data);
  return {
    queries: reply.success ? reply.data.queries.filter((entry) => entry.query.trim()) : [],
    cost: result.usage ? costOf(result.usage, result.model) : undefined,
  };
}

/**
 * Finds LinkedIn competitors by their posts and holds the shortlist for
 * approval. Spends Apify credit: only from an explicit request.
 */
export async function findLinkedInCompetitors(): Promise<{
  id: string | null;
  queries: Array<{ lane: string; query: string }>;
  candidates: CandidateEvidence[];
  rejected: CandidateEvidence[];
  cost: GenerationCost | undefined;
}> {
  const owner = OWNER_ACCOUNTS.linkedin.handle.toLowerCase();
  const [lanes, ownPosts] = await Promise.all([
    readTaxonomy("linkedin", OWNER_ACCOUNTS.linkedin.handle).then((value) => value ?? []),
    readPosts("linkedin", OWNER_ACCOUNTS.linkedin.handle, 400),
  ]);
  if (!lanes.length) throw new Error("LinkedIn has no lanes yet.");
  const analyses = await readAnalyses([OWNER_ACCOUNTS.linkedin.handle]);

  // His subjects per lane, and the formats he writes most.
  const topicsByLane = new Map<string, string[]>();
  const formats = new Map<string, number>();
  for (const post of ownPosts) {
    const analysis = analyses.get(post.postId);
    if (!analysis || !post.contentLane) continue;
    topicsByLane.set(post.contentLane, [
      ...(topicsByLane.get(post.contentLane) ?? []),
      analysis.subject !== "none" ? `${analysis.subject}: ${analysis.topic}` : analysis.topic,
    ]);
    formats.set(analysis.format, (formats.get(analysis.format) ?? 0) + 1);
  }
  const hisFormats = new Set(
    [...formats]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([format]) => format),
  );

  // 1-2. Search posts on his subjects; the authors are the candidates.
  const { queries, cost: queryCost } = await searchQueries(lanes, topicsByLane);
  let cost = queryCost;
  const { datasetId } = await runActor(POST_SEARCH_ACTOR, {
    searchQueries: queries.map((entry) => entry.query),
    maxPosts: POSTS_PER_QUERY,
    postedLimit: "month",
    sortBy: "relevance",
  });
  const found = await datasetItems<SearchedPost>(datasetId, 1000);
  const byAuthor = new Map<string, { name: string; url: string; posts: number }>();
  for (const post of found) {
    const handle = post.author?.publicIdentifier?.toLowerCase();
    // People only: a company page is not a creator to benchmark against.
    if (!handle || handle === owner || post.author?.type === "company") continue;
    if (!post.author?.linkedinUrl?.includes("/in/")) continue;
    const entry = byAuthor.get(handle) ?? {
      name: post.author.name ?? handle,
      url: post.author.linkedinUrl,
      posts: 0,
    };
    entry.posts += 1;
    byAuthor.set(handle, entry);
  }
  const shortlist = [...byAuthor].sort((a, b) => b[1].posts - a[1].posts).slice(0, CANDIDATES);
  if (!shortlist.length) {
    return { id: null, queries, candidates: [], rejected: [], cost };
  }

  // 3. Their own recent posts, read and analysed like his.
  const run = await runActor(LINKEDIN_POSTS_ACTOR, {
    targetUrls: shortlist.map(([, entry]) => entry.url),
    maxPosts: POSTS_PER_CANDIDATE,
    scrapeReactions: false,
    scrapeComments: false,
  });
  const raw = await datasetItems<Parameters<typeof normalizeLinkedInPosts>[0][number]>(
    run.datasetId,
    1000,
  );

  const evidence: CandidateEvidence[] = [];
  const postsByHandle = new Map<string, PostRecord[]>();
  for (const [handle, entry] of shortlist) {
    const theirs = normalizeLinkedInPosts(
      raw.filter((post) => authorOf(post)?.toLowerCase() === handle),
    )
      .filter((post) => post.caption.trim())
      .slice(0, POSTS_PER_CANDIDATE);
    if (theirs.length < 3) continue;
    postsByHandle.set(handle, theirs);
    const analysed = await analysePosts(handle, theirs);
    cost = addCosts(cost, analysed.cost);
    const filed = await assignToLanes(handle, theirs, lanes, { store: false, cheap: true });
    cost = addCosts(cost, filed.cost);
    const theirAnalyses = await readAnalyses([handle]);

    const inLanes = filed.assignments.filter((row) => row.lane !== "other");
    const laneCounts: Record<string, number> = {};
    for (const row of inLanes) laneCounts[row.lane] = (laneCounts[row.lane] ?? 0) + 1;
    const overlap = theirs.length ? inLanes.length / theirs.length : 0;
    const formatMatch = theirs.length
      ? theirs.filter((post) => hisFormats.has(theirAnalyses.get(post.postId)?.format ?? ""))
          .length / theirs.length
      : 0;
    const score =
      overlap * 0.6 + (Object.keys(laneCounts).length / lanes.length) * 0.2 + formatMatch * 0.2;
    evidence.push({
      handle,
      name: entry.name,
      profileUrl: entry.url,
      matchedPosts: entry.posts,
      postsRead: theirs.length,
      overlap: Number(overlap.toFixed(2)),
      lanes: laneCounts,
      formatMatch: Number(formatMatch.toFixed(2)),
      medianEngagement: Math.round(
        median(theirs.map((post) => post.likes + post.comments + post.shares)),
      ),
      score: Number(score.toFixed(2)),
      examples: theirs.slice(0, 3).map((post) => post.caption.split("\n")[0]!.slice(0, 100)),
    });
  }

  const candidates = evidence
    .filter((candidate) => candidate.overlap >= MIN_OVERLAP)
    .sort((a, b) => b.score - a.score);
  const rejected = evidence.filter((candidate) => candidate.overlap < MIN_OVERLAP);

  let id: string | null = null;
  if (hasDurableStore()) {
    const { data } = await db()
      .from("content_proposals")
      .insert({
        platform: "linkedin",
        kind: "competitors",
        proposal: {
          queries,
          candidates,
          rejected,
          posts: Object.fromEntries(postsByHandle),
        },
      })
      .select("id")
      .single();
    id = (data as { id?: string } | null)?.id ?? null;
  }
  return { id, queries, candidates, rejected, cost };
}
