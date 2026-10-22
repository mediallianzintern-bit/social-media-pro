// The competitors to show and analyse: only accounts still on the tracked list.
//
// Stored snapshots keep every account ever scraped as a competitor, so reading
// them directly kept showing an account after it was taken off the list (Nas
// Daily, replaced by Case Studied on 22 Oct 2026). The tracked list is the
// configured competitors plus the discovered watchlist, the same list Sync
// scrapes (apify/accounts.ts mergeCompetitors).
import { mergeCompetitors } from "./apify/accounts";
import { competitorSnapshots, readWatchlist } from "./store";
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
