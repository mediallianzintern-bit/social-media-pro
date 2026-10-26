// Finding new creators by itself: AI tool workflows, phase 3.
//
// Once a week, for each creator-fed lane with a learned pattern:
//   1. search Instagram with the pattern's own search terms (Apify: the only
//      paid step, under a monthly cap; see budget below),
//   2. read each account found through Instagram's own API (free) and judge
//      it on its recent posts against the pattern (lib/creator-finder.ts),
//   3. add the ones that clearly make this content to watched_creators as
//      role 'found', a few per run.
// Found creators are re-judged on every sync (retireDrifted) and paused when
// they drift off the subject or go quiet. Reference creators are never retired
// by the system: they are the team's choice.
//
// Budget: CREATOR_SEARCH_MONTHLY_USD. Unset or 0 means the finder is off.
// Every run's cost is recorded in creator_search_runs (0023), and a run that
// would take the month past the cap does not start.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  judgeCreator,
  MAX_ADDED_PER_RUN,
  MAX_CHECKED_PER_RUN,
  RESULTS_PER_SEARCH,
  SEARCH_EVERY_DAYS,
  SEARCHES_PER_RUN,
  searchCostUsd,
} from "@/lib/creator-finder";
import type { CreatorPattern } from "@/lib/creator-pattern";
import type { CreatorPost } from "@/lib/creator-reels";
import type { PlatformId } from "@/lib/analytics-types";

import { competitorsFor, OWNER_ACCOUNTS, trendSourcesFor } from "./apify/accounts";
import { apifyToken } from "./apify/client";
import { searchInstagram } from "./apify/search";
import { readPattern } from "./creator-pattern";
import { fetchCreatorPosts } from "./creators";
import { hasDurableStore, readWatchlist } from "./store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

/** The monthly cap on creator searches, in dollars. 0 means off. */
export function monthlyBudgetUsd(): number {
  const value = Number(process.env["CREATOR_SEARCH_MONTHLY_USD"]?.trim() ?? "");
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function monthStart(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export interface SearchRun {
  lane: string;
  ranAt: string;
  terms: string[];
  candidates: number;
  checked: number;
  added: number;
  costUsd: number;
  note: string | null;
}

/** Recent search runs, newest first. Empty before 0023. */
export async function readSearchRuns(platform: PlatformId, limit = 20): Promise<SearchRun[]> {
  if (!hasDurableStore()) return [];
  const { data, error } = await db()
    .from("creator_search_runs")
    .select("lane,ran_at,terms,candidates,checked,added,cost_usd,note")
    .eq("platform", platform)
    .order("ran_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    lane: String(row["lane"]),
    ranAt: String(row["ran_at"]),
    terms: (row["terms"] as string[]) ?? [],
    candidates: Number(row["candidates"] ?? 0),
    checked: Number(row["checked"] ?? 0),
    added: Number(row["added"] ?? 0),
    costUsd: Number(row["cost_usd"] ?? 0),
    note: (row["note"] as string | null) ?? null,
  }));
}

/** Dollars spent on searches since the start of this month. */
export async function spentThisMonth(platform: PlatformId): Promise<number> {
  if (!hasDurableStore()) return 0;
  const { data, error } = await db()
    .from("creator_search_runs")
    .select("cost_usd")
    .eq("platform", platform)
    .gte("ran_at", monthStart());
  if (error) return 0;
  return ((data ?? []) as Array<{ cost_usd: number | string }>).reduce(
    (sum, row) => sum + Number(row.cost_usd ?? 0),
    0,
  );
}

async function recordRun(platform: PlatformId, run: Omit<SearchRun, "ranAt">): Promise<void> {
  const { error } = await db().from("creator_search_runs").insert({
    platform,
    lane: run.lane,
    terms: run.terms,
    candidates: run.candidates,
    checked: run.checked,
    added: run.added,
    cost_usd: run.costUsd,
    note: run.note,
  });
  if (error) console.error(`[finder:${platform}] could not record the run:`, error.message);
}

/** Every handle the finder must never add: watched (any state), owner, competitors, trend sources. */
async function knownHandles(platform: PlatformId): Promise<string[]> {
  const { data } = await db().from("watched_creators").select("handle").eq("platform", platform);
  const watchlist = await readWatchlist(platform).catch(() => [] as string[]);
  return [
    ...((data ?? []) as Array<{ handle: string }>).map((row) => row.handle),
    OWNER_ACCOUNTS[platform].handle,
    ...competitorsFor(platform).map((account) => account.handle),
    ...trendSourcesFor(platform).map((account) => account.handle),
    ...watchlist,
  ];
}

export interface FindResult {
  ran: boolean;
  reason?: string;
  runs: SearchRun[];
}

/**
 * One search pass for every creator-fed lane that has a pattern. Paid, under
 * the monthly cap; `force` skips only the once-a-week spacing, never the cap.
 */
export async function findCreators(
  platform: PlatformId,
  options: { force?: boolean } = {},
): Promise<FindResult> {
  if (platform !== "instagram") return { ran: false, reason: "Instagram only.", runs: [] };
  const budget = monthlyBudgetUsd();
  if (!budget) {
    return {
      ran: false,
      reason:
        "Creator search is off: set CREATOR_SEARCH_MONTHLY_USD to a monthly cap to turn it on.",
      runs: [],
    };
  }
  if (!apifyToken()) return { ran: false, reason: "APIFY_TOKEN is not set.", runs: [] };

  const previous = await readSearchRuns(platform, 1);
  const last = previous[0] ? Date.parse(previous[0].ranAt) : 0;
  if (!options.force && Date.now() - last < SEARCH_EVERY_DAYS * 86_400_000) {
    return { ran: false, reason: `Searched less than ${SEARCH_EVERY_DAYS} days ago.`, runs: [] };
  }

  const { data } = await db()
    .from("watched_creators")
    .select("lane")
    .eq("platform", platform)
    .eq("active", true);
  const lanes = [...new Set(((data ?? []) as Array<{ lane: string }>).map((row) => row.lane))];
  const runs: SearchRun[] = [];

  for (const lane of lanes) {
    const pattern = await readPattern(platform, lane);
    if (!pattern?.searchTerms.length) continue;
    const terms = pattern.searchTerms.slice(0, SEARCHES_PER_RUN);
    const cost = searchCostUsd(terms.length);
    const spent = await spentThisMonth(platform);
    if (spent + cost > budget) {
      return {
        ran: runs.length > 0,
        reason: `The monthly cap of $${budget.toFixed(2)} would be passed ($${spent.toFixed(2)} spent, this run about $${cost.toFixed(2)}).`,
        runs,
      };
    }
    runs.push(await searchLane(platform, lane, pattern, terms, cost));
  }
  return runs.length
    ? { ran: true, runs }
    : { ran: false, reason: "No lane has a learned pattern with search terms yet.", runs };
}

async function searchLane(
  platform: PlatformId,
  lane: string,
  pattern: CreatorPattern,
  terms: string[],
  cost: number,
): Promise<SearchRun> {
  const candidates = await searchInstagram(terms, await knownHandles(platform), RESULTS_PER_SEARCH);
  let checked = 0;
  let added = 0;
  const notes: string[] = [];
  for (const candidate of candidates.slice(0, MAX_CHECKED_PER_RUN)) {
    if (added >= MAX_ADDED_PER_RUN) break;
    let posts: CreatorPost[];
    try {
      // Free, but only for Business and Creator accounts; personal ones are skipped.
      posts = await fetchCreatorPosts(candidate.handle);
    } catch {
      continue;
    }
    checked += 1;
    const verdict = judgeCreator(posts, pattern);
    if (!verdict.add) continue;
    const { error } = await db()
      .from("watched_creators")
      .insert({
        platform,
        handle: candidate.handle,
        lane,
        role: "found",
        fit: Number(verdict.fitShare.toFixed(3)),
        found_by: candidate.matchedQuery,
        last_checked: new Date().toISOString(),
        note: `Found by searching "${candidate.matchedQuery}": ${verdict.reason}`,
      });
    if (error) continue;
    added += 1;
    notes.push(`@${candidate.handle}`);
  }
  const run = {
    lane,
    terms,
    candidates: candidates.length,
    checked,
    added,
    costUsd: cost,
    note: added ? `Added ${notes.join(", ")}` : null,
  };
  await recordRun(platform, run);
  console.info(
    `[finder:${platform}] ${lane}: ${candidates.length} accounts found, ${checked} checked, ${added} added ($${cost.toFixed(2)})`,
  );
  return { ...run, ranAt: new Date().toISOString() };
}

/**
 * Re-judges the found creators on the posts a sync has just read, records each
 * one's fit, and pauses those that drifted off the subject or went quiet. Free.
 * Reference creators get their fit recorded but are never paused here.
 */
export async function retireDrifted(
  platform: PlatformId,
  pattern: CreatorPattern,
  read: Array<{ handle: string; role: "reference" | "found"; posts: CreatorPost[] }>,
): Promise<string[]> {
  if (!hasDurableStore()) return [];
  const retired: string[] = [];
  for (const { handle, role, posts } of read) {
    const verdict = judgeCreator(posts, pattern);
    const retire = role === "found" && verdict.retire;
    const { error } = await db()
      .from("watched_creators")
      .update({
        fit: Number(verdict.fitShare.toFixed(3)),
        last_checked: new Date().toISOString(),
        ...(retire ? { active: false, retired_reason: verdict.reason } : {}),
      })
      .eq("platform", platform)
      .eq("handle", handle);
    if (!error && retire) retired.push(`@${handle}: ${verdict.reason}`);
  }
  if (retired.length) console.info(`[finder:${platform}] retired ${retired.join("; ")}`);
  return retired;
}
