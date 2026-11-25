// What Pro sends back to Studio for a linked client (Studio spec §7.6, Phase 5):
// how each of the client's confirmed content lanes performs, and which live
// Instagram post each exported Studio post became.
//
// Pure, so both are tested without a network, a database or a model. The
// shapes match Studio's bridge contract (Studio: src/lib/pro-bridge.ts).
import { median, organicPosts, type PostRecord } from "@/lib/analytics-types";

/** Under this many posts, a lane's median is a hint, not a result (as THIN_LANE). */
const THIN_LANE = 3;

/** How far back lane performance is measured. */
export const LANE_WINDOW_DAYS = 90;

/** How far back exported Studio posts are looked for on Instagram. */
export const MATCH_WINDOW_DAYS = 90;

/** How close a live caption must be to the exported one to count as that post. */
export const MATCH_THRESHOLD = 0.8;

export interface StudioLane {
  name: string;
  definition: string;
  status: "suggested" | "confirmed" | "retired";
}

/** The lanes Pro files a client's posts into: the ones a manager confirmed. */
export function confirmedLanes(lanes: StudioLane[]): Array<{ name: string; definition: string }> {
  return lanes
    .filter((lane) => lane.status === "confirmed")
    .map(({ name, definition }) => ({ name, definition }));
}

/** True when two vocabularies name the same lanes with the same definitions. */
export function sameVocabulary(
  a: Array<{ name: string; definition: string }>,
  b: Array<{ name: string; definition: string }>,
): boolean {
  const key = (lanes: Array<{ name: string; definition: string }>) =>
    lanes
      .map((lane) => `${lane.name.trim().toLowerCase()}\u0000${lane.definition.trim()}`)
      .sort()
      .join("\u0001");
  return key(a) === key(b);
}

/** Suggestions in the form Studio accepts: named, defined, never "other", at most 15. */
export function laneSuggestions(
  lanes: Array<{ name: string; definition: string }>,
): Array<{ name: string; definition: string }> {
  const seen = new Set<string>();
  const out: Array<{ name: string; definition: string }> = [];
  for (const lane of lanes) {
    const name = lane.name.trim().slice(0, 60).trim();
    const key = name.toLowerCase();
    if (!name || key === "other" || seen.has(key)) continue;
    seen.add(key);
    out.push({ name, definition: lane.definition.trim().slice(0, 300) });
  }
  return out.slice(0, 15);
}

/**
 * A static post publishes no view count, so a client's lanes are compared on
 * what every post has: likes plus comments.
 */
export function interactionsOf(post: PostRecord): number {
  return post.likes + post.comments;
}

const DAY_MS = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface LaneFigures {
  lane: string;
  postCount: number;
  shareOfOutputPct: number;
  shareOfPerformancePct: number;
  medianVsMedian: number;
  medianInteractions: number;
  directional: boolean;
}

export interface LaneSnapshot {
  platform: "instagram";
  handle: string;
  windowFrom: string;
  windowTo: string;
  basis: "interactions";
  postCount: number;
  lanes: LaneFigures[];
  source: string;
  computedAt: string;
}

/**
 * How each confirmed lane did over the last LANE_WINDOW_DAYS days.
 *
 * Every post in the window counts towards the account's typical post and the
 * shares, including posts filed as "other"; only confirmed lanes get a row,
 * because those are the only names Studio plans in. Null when no post in the
 * window carries a confirmed lane: an empty snapshot would read as "nothing
 * works" rather than "not measured yet".
 */
export function laneSnapshot(input: {
  handle: string;
  posts: PostRecord[];
  lanes: Array<{ name: string }>;
  now: Date;
}): LaneSnapshot | null {
  const to = input.now.getTime();
  const from = to - LANE_WINDOW_DAYS * DAY_MS;
  const inWindow = organicPosts(input.posts).filter((post) => {
    const at = Date.parse(post.publishedAt);
    return Number.isFinite(at) && at >= from && at <= to;
  });
  const labelled = inWindow.filter((post) => post.contentLane);
  const names = new Map(input.lanes.map((lane) => [lane.name.trim().toLowerCase(), lane.name]));
  const filed = labelled.filter((post) => names.has(post.contentLane!.trim().toLowerCase()));
  if (!filed.length) return null;

  const baseline = median(labelled.map(interactionsOf)) || 1;
  const total = labelled.reduce((sum, post) => sum + interactionsOf(post), 0);
  const byLane = new Map<string, PostRecord[]>();
  for (const post of filed) {
    const name = names.get(post.contentLane!.trim().toLowerCase())!;
    byLane.set(name, [...(byLane.get(name) ?? []), post]);
  }
  const lanes = [...byLane.entries()]
    .map(([lane, group]): LaneFigures => {
      const interactions = group.reduce((sum, post) => sum + interactionsOf(post), 0);
      return {
        lane,
        postCount: group.length,
        shareOfOutputPct: Math.round((group.length / labelled.length) * 100),
        shareOfPerformancePct: total > 0 ? Math.round((interactions / total) * 100) : 0,
        medianVsMedian: Number((median(group.map(interactionsOf)) / baseline).toFixed(2)),
        medianInteractions: Math.round(median(group.map(interactionsOf))),
        directional: group.length < THIN_LANE,
      };
    })
    .sort((a, b) => b.medianVsMedian - a.medianVsMedian || a.lane.localeCompare(b.lane));

  return {
    platform: "instagram",
    handle: input.handle,
    windowFrom: isoDay(from),
    windowTo: isoDay(to),
    basis: "interactions",
    postCount: inWindow.length,
    lanes,
    source: "Social Pulse Pro",
    computedAt: input.now.toISOString(),
  };
}

// ——— Publication matching ————————————————————————————————————————————————

/** One post as Studio exported it (GET /api/pro/exports). */
export interface ExportedPost {
  postId: string;
  slotDate: string;
  exportedAt: string;
  caption: string;
  hashtags: string[];
  publication: { platformPostId: string; url: string; publishedAt: string } | null;
  /** The lane Studio planned the post in. */
  lane?: string | null | undefined;
  /**
   * Its 14-day result, once Pro has sent one (Studio bridge version 2);
   * undefined from a Studio that predates results.
   */
  outcome?: { measuredAt: string; lessonCostUsd: number } | null | undefined;
}

export interface PublicationMatch {
  postId: string;
  platform: "instagram";
  platformPostId: string;
  url: string;
  publishedAt: string;
  matchedBy: "caption";
  score: number;
}

/** A caption's words, without hashtags, mentions, links, emoji or punctuation. */
export function captionWords(caption: string): string[] {
  return caption
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#@][\p{L}\p{N}_.]+/gu, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * How alike two captions are, 0 to 1: the share of words they have in common
 * (Dice over word counts). Hashtags are left out because managers add and drop
 * them when posting; the words are what Studio wrote.
 */
export function captionSimilarity(a: string, b: string): number {
  const left = captionWords(a);
  const right = captionWords(b);
  if (!left.length || !right.length) return 0;
  const counts = new Map<string, number>();
  for (const word of left) counts.set(word, (counts.get(word) ?? 0) + 1);
  let shared = 0;
  for (const word of right) {
    const n = counts.get(word) ?? 0;
    if (n > 0) {
      shared += 1;
      counts.set(word, n - 1);
    }
  }
  return (2 * shared) / (left.length + right.length);
}

/**
 * Which live post each exported Studio post became. One to one: each side is
 * used at most once, best pairs first. A post already matched in Studio, or a
 * live post already matched to one, is left alone. A live post published more
 * than a day before the export cannot be it, and nothing below
 * MATCH_THRESHOLD is guessed at.
 */
export function matchPublications(
  exported: ExportedPost[],
  posts: PostRecord[],
): PublicationMatch[] {
  const taken = new Set(
    exported.flatMap((post) => (post.publication ? [post.publication.platformPostId] : [])),
  );
  const pending = exported.filter((post) => !post.publication && captionWords(post.caption).length);
  const live = posts.filter(
    (post) =>
      !taken.has(post.postId) && post.url && /^https:\/\/(www\.)?instagram\.com\//.test(post.url),
  );

  const pairs: Array<{ exported: ExportedPost; post: PostRecord; score: number }> = [];
  for (const item of pending) {
    const earliest = Date.parse(item.exportedAt) - DAY_MS;
    for (const post of live) {
      const at = Date.parse(post.publishedAt);
      if (!Number.isFinite(at) || at < earliest) continue;
      const score = captionSimilarity(item.caption, post.caption);
      if (score >= MATCH_THRESHOLD) pairs.push({ exported: item, post, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score || a.exported.postId.localeCompare(b.exported.postId));

  const usedExported = new Set<string>();
  const usedLive = new Set<string>();
  const matches: PublicationMatch[] = [];
  for (const pair of pairs) {
    if (usedExported.has(pair.exported.postId) || usedLive.has(pair.post.postId)) continue;
    usedExported.add(pair.exported.postId);
    usedLive.add(pair.post.postId);
    matches.push({
      postId: pair.exported.postId,
      platform: "instagram",
      platformPostId: pair.post.postId,
      url: pair.post.url!,
      publishedAt: new Date(pair.post.publishedAt).toISOString(),
      matchedBy: "caption",
      score: Number(pair.score.toFixed(3)),
    });
  }
  return matches;
}
