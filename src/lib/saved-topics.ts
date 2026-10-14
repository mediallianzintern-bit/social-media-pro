import type { PlatformId } from "@/lib/analytics-types";

/**
 * A topic someone bookmarked to come back to later.
 *
 * Two kinds land here: a news story from "Topics in the news" (`source`) and a
 * breakout post from "Rising on <platform>" (`trend`) — the same two lists that
 * carry the save button. The row keeps its own snapshot (title, link, label,
 * lane) rather than a foreign key, because a saved story ages out of the news
 * inbox and a saved post leaves the trend window, yet the bookmark has to keep
 * showing after the thing it points at has scrolled away. Same reasoning as the
 * vote rows in topic_feedback.
 *
 * Shared across the team per platform, not per person: the whole point is a
 * shared shortlist the team builds together, so a save by one person is visible
 * to the next. `actor` records who saved it, for the by-line only.
 */
export type SavedKind = "source" | "trend";

export interface SavedTopic {
  kind: SavedKind;
  itemId: string;
  platform: PlatformId;
  /** The headline (news) or opening line (rising post). */
  title: string;
  url: string | null;
  /** The outlet (news) or @handle (rising post) — who it came from. */
  sourceLabel: string | null;
  lane: string | null;
  /** Who saved it, from the verified session. */
  actor: string | null;
  createdAt: string;
}

/** The identity of a saved item within a platform — kind plus id. */
export function savedKey(kind: SavedKind, itemId: string): string {
  return `${kind}:${itemId}`;
}
