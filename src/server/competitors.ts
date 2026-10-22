// The competitors to show and analyse: only accounts still on the tracked list.
//
// Stored snapshots keep every account ever scraped as a competitor, so reading
// them directly kept showing an account after it was taken off the list (Nas
// Daily, replaced by Case Studied on 22 Oct 2026). The tracked list is the
// configured competitors plus the discovered watchlist, the same list Sync
// scrapes (apify/accounts.ts mergeCompetitors).
import { mergeCompetitors } from "./apify/accounts";
import { competitorSnapshots, readWatchlist } from "./store";
import type { CompetitorAnalysis } from "@/lib/ai-types";
import type { PlatformId } from "@/lib/analytics-types";

export async function trackedCompetitorSnapshots(platform: PlatformId) {
  const [snapshots, watchlist] = await Promise.all([
    competitorSnapshots(platform),
    readWatchlist(platform).catch(() => null),
  ]);
  const tracked = new Set(
    mergeCompetitors(platform, watchlist ?? []).map((account) => account.handle.toLowerCase()),
  );
  // With no list to go by (unreadable, or none set up), every stored competitor
  // is shown as before, rather than an empty table.
  if (watchlist === null || !tracked.size) return snapshots;
  return snapshots.filter((snapshot) => tracked.has(snapshot.handle.toLowerCase()));
}

/**
 * A saved competitor read with every account no longer tracked taken out: its
 * row in "Account by account", and any line or takeaway that names it by
 * handle or display name. The read is AI output saved at the last full
 * analysis, so without this an account removed since then stays on screen
 * until the analysis is run again. Free: no model call, nothing rewritten.
 */
export async function withoutUntracked(
  platform: PlatformId,
  read: CompetitorAnalysis | null,
): Promise<CompetitorAnalysis | null> {
  if (!read) return read;
  const [stored, tracked] = await Promise.all([
    competitorSnapshots(platform).catch(() => []),
    trackedCompetitorSnapshots(platform).catch(() => null),
  ]);
  if (!tracked) return read;
  const keep = new Set(tracked.map((snapshot) => snapshot.handle.toLowerCase()));
  const gone = stored.filter((snapshot) => !keep.has(snapshot.handle.toLowerCase()));
  if (!gone.length) return read;

  const names = gone
    .flatMap((snapshot) => [snapshot.handle, snapshot.displayName])
    .map((name) => name?.trim().toLowerCase())
    .filter((name): name is string => Boolean(name && name.length >= 3));
  const mentions = (text: string) => names.some((name) => text.toLowerCase().includes(name));
  const goneHandles = new Set(gone.map((snapshot) => snapshot.handle.toLowerCase()));

  return {
    ...read,
    headline: read.headline
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => !mentions(sentence))
      .join(" "),
    teamTakeaways: read.teamTakeaways.filter((takeaway) => !mentions(JSON.stringify(takeaway))),
    contestedLanes: read.contestedLanes.filter((line) => !mentions(line)),
    openLanes: read.openLanes.filter((line) => !mentions(line)),
    verdicts: read.verdicts.filter((verdict) => !goneHandles.has(verdict.handle.toLowerCase())),
  };
}
