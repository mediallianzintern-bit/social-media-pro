// The competitor table, the contested lanes and the open lanes, decided in
// code from the lane benchmark (2 Nov 2026).
//
// The model used to write them, and they could not be trusted: its verdict
// labels were the colour names ("good", "warn", "bad") with no threshold
// behind them, so 1.01x and 1.44x were both "warn"; it called the owner
// "leading" a lane where he only beat the middle competitor (Lily Ray ran
// 8.0 per 1,000 followers to his 1.16); it dropped every competitor row on
// one run; and lanes stayed "open" after competitors started posting in them.
// Every row here is arithmetic on the same figures the model is given, with
// fixed thresholds, so the table says the same thing on every run. The model
// now writes only the headline and the takeaways.
//
// Client-safe and pure.
import type { LanePerformance } from "@/lib/analytics-types";
import type { LaneBenchmarkRow } from "@/lib/lane-benchmark";

/** At or above this many times its own typical post, with enough posts, a lane is strong. */
export const STRONG_AT = 1.3;
/** Below this many times its own typical post, a lane is weak. */
export const WEAK_BELOW = 0.8;
/** Fewer posts than this in a lane, and it is too few to call either way. */
export const MIN_POSTS = 6;

export type VerdictTone = "good" | "bad" | "warn" | "neutral";

export interface LaneVerdict {
  handle: string;
  lane: string;
  gap: string;
  tone: VerdictTone;
  reasoning: string;
}

interface Account {
  handle: string;
  displayName: string;
  followers: number;
  lanes?: LanePerformance[] | undefined;
}

const times = (value: number) => `${Number(value.toFixed(2))}x`;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** A lane against the account's own typical post, by fixed thresholds. */
export function laneLabel(multiple: number, posts: number): { label: string; tone: VerdictTone } {
  if (posts < MIN_POSTS) return { label: "Too few posts", tone: "neutral" };
  if (multiple >= STRONG_AT) return { label: "Strong", tone: "good" };
  if (multiple < WEAK_BELOW) return { label: "Weak", tone: "bad" };
  return { label: "Typical", tone: "warn" };
}

/** The lane an account publishes in most, its tie broken by how well it does there. */
function mainLane(account: Account): LanePerformance | null {
  return (
    [...(account.lanes ?? [])]
      .filter((lane) => lane.lane !== "other" && lane.postCount > 0)
      .sort((a, b) => b.postCount - a.postCount || b.medianVsMedian - a.medianVsMedian)[0] ?? null
  );
}

/**
 * One row per lane the owner publishes in (ahead of or behind the middle
 * competitor, on engagement per 1,000 followers), then one per competitor (its
 * main lane against its own typical post), plus the contested and open lanes.
 */
export function laneVerdicts(
  owner: Account,
  rivals: Account[],
  benchmark: LaneBenchmarkRow[],
): { verdicts: LaneVerdict[]; contestedLanes: string[]; openLanes: string[] } {
  const nameOf = new Map(rivals.map((rival) => [rival.handle, rival.displayName]));
  const verdicts: LaneVerdict[] = [];
  const contestedLanes: string[] = [];
  const openLanes: string[] = [];

  for (const row of benchmark) {
    const leader = row.leader
      ? `; the best of them, ${nameOf.get(row.leader.handle) ?? row.leader.handle}, ${row.leader.per1k}`
      : "";
    if (row.standing === "competitors-only") {
      openLanes.push(
        `${row.lane}: a gap. ${plural(row.competitorsPublishing, "competitor")} publish here (${plural(row.competitorPosts, "post")}, the middle one at ${row.competitorsPer1k} per 1,000 followers) and ${owner.displayName} has not posted in it.`,
      );
      continue;
    }
    if (row.standing === "owner-only") {
      openLanes.push(
        `${row.lane}: only ${owner.displayName} publishes here, at ${row.ownerPer1k} engagement per 1,000 followers across ${plural(row.ownerPosts, "post")}.`,
      );
      verdicts.push({
        handle: owner.handle,
        lane: row.lane,
        gap: row.ownerPosts < 3 ? "Too few posts" : "Only him here",
        tone: row.ownerPosts < 3 ? "neutral" : "good",
        reasoning: `${owner.displayName}: ${row.ownerPer1k} engagement per 1,000 followers across ${plural(row.ownerPosts, "post")}. No competitor publishes in this lane.`,
      });
      continue;
    }
    const ahead = row.standing === "ahead";
    contestedLanes.push(
      `${row.lane}: ${ahead ? "ahead of" : "behind"} the middle competitor, ${row.ownerPer1k} against ${row.competitorsPer1k} per 1,000 followers (${plural(row.competitorsPublishing, "competitor")} publishing${leader}).`,
    );
    verdicts.push({
      handle: owner.handle,
      lane: row.lane,
      gap:
        row.ownerPosts < 3 ? "Too few posts" : ahead ? "Ahead of the middle" : "Behind the middle",
      tone: row.ownerPosts < 3 ? "neutral" : ahead ? "good" : "bad",
      reasoning: `${owner.displayName}: ${row.ownerPer1k} engagement per 1,000 followers across ${plural(row.ownerPosts, "post")}; the middle competitor here: ${row.competitorsPer1k}${leader}.`,
    });
  }

  for (const rival of rivals) {
    const lane = mainLane(rival);
    if (!lane) {
      verdicts.push({
        handle: rival.handle,
        lane: "No lane yet",
        gap: "Too few posts",
        tone: "neutral",
        reasoning: `${rival.displayName}: none of their stored posts is labelled with one of the lanes yet.`,
      });
      continue;
    }
    const { label, tone } = laneLabel(lane.medianVsMedian, lane.postCount);
    const row = benchmark.find((entry) => entry.lane === lane.lane);
    const theirRate =
      rival.followers > 0
        ? Number(((lane.medianInteractions / rival.followers) * 1000).toFixed(2))
        : null;
    const compared =
      theirRate !== null && row?.ownerPer1k != null
        ? ` ${theirRate} engagement per 1,000 followers here, against ${owner.displayName}'s ${row.ownerPer1k}.`
        : "";
    verdicts.push({
      handle: rival.handle,
      lane: lane.lane,
      gap: label,
      tone,
      reasoning: `${rival.displayName}: ${times(lane.medianVsMedian)} their own typical post across ${plural(lane.postCount, "post")} in this lane${lane.postCount < MIN_POSTS ? `, too few to call (${MIN_POSTS} needed)` : ""}.${compared}`,
    });
  }

  return { verdicts, contestedLanes, openLanes };
}

const list = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/**
 * The headline, from the same figures: where the owner leads (above every
 * competitor), where he is only above the middle one (and who is ahead), and
 * where he is behind. The model wrote "leading" for a lane where one
 * competitor ran seven times his rate, even when told not to; arithmetic does
 * not make that mistake.
 */
export function benchmarkHeadline(
  owner: Account,
  rivals: Account[],
  benchmark: LaneBenchmarkRow[],
): string {
  const nameOf = new Map(rivals.map((rival) => [rival.handle, rival.displayName]));
  const contested = benchmark.filter(
    (row) => row.standing === "ahead" || row.standing === "behind",
  );
  const leads = contested.filter(
    (row) => row.standing === "ahead" && (row.ownerPer1k ?? 0) >= (row.leader?.per1k ?? 0),
  );
  const middle = contested.filter((row) => row.standing === "ahead" && !leads.includes(row));
  const behind = contested.filter((row) => row.standing === "behind");
  const parts: string[] = [];
  if (leads.length) parts.push(`leads ${list(leads.map((row) => row.lane))}`);
  if (middle.length) {
    parts.push(
      `is above the middle competitor but not the best in ${list(
        middle.map(
          (row) =>
            `${row.lane} (${nameOf.get(row.leader!.handle) ?? row.leader!.handle} ${row.leader!.per1k} to his ${row.ownerPer1k})`,
        ),
      )}`,
    );
  }
  if (behind.length) {
    parts.push(
      `is behind the middle competitor in ${list(
        behind.map((row) => `${row.lane} (${row.ownerPer1k} against ${row.competitorsPer1k})`),
      )}`,
    );
  }
  if (!parts.length) {
    return `${owner.displayName} shares no lane with the tracked competitors yet, so there is nothing to compare.`;
  }
  return `On engagement per 1,000 followers, ${owner.displayName} ${list(parts)}.`;
}
