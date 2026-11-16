// How many people followed and unfollowed his Instagram in a period, from
// Instagram's own count (16 Nov 2026).
//
// The follower total only shows the net change between two syncs: -29 could
// be 0 new and 29 lost, or 100 new and 129 lost. Instagram counts each side
// itself (follows_and_unfollows, broken down by follow_type: FOLLOWER is a
// follow, NON_FOLLOWER an unfollow or a closed account). Read live for the
// period on the page, in windows of at most 30 days (Graph's cap). Instagram
// keeps about a year of it, so a longer period starts a year back.
//
// Free: Instagram's API. Never fatal: null when Graph is not set up or
// returns nothing.
import type { FollowFlow } from "@/lib/follow-flow";

import { graphOptional, hasInstagramGraph, igAccountId } from "./client";

const DAY_MS = 86_400_000;
/** Graph refuses a window longer than 30 days. */
const WINDOW_DAYS = 30;
/** How far back Instagram still answers (an empty reply at about two years). */
export const FOLLOW_FLOW_DAYS = 365;

interface FlowResponse {
  data?: Array<{
    total_value?: {
      breakdowns?: Array<{
        results?: Array<{ dimension_values: string[]; value: number }>;
      }>;
    };
  }>;
}

/** Start inclusive, end exclusive, as YYYY-MM-DD; a null start is all time. */
export async function fetchFollowFlow(
  period: { start: string | null; end: string },
  now = Date.now(),
): Promise<FollowFlow | null> {
  if (!hasInstagramGraph()) return null;
  const igId = igAccountId()!;
  const earliest = now - FOLLOW_FLOW_DAYS * DAY_MS;
  const askedStart = period.start ? Date.parse(`${period.start}T00:00:00Z`) : earliest;
  const start = Math.max(askedStart, earliest);
  const end = Math.min(Date.parse(`${period.end}T00:00:00Z`), now);
  if (!(end > start)) return null;

  const windows: Array<[number, number]> = [];
  for (let from = start; from < end; from += WINDOW_DAYS * DAY_MS) {
    windows.push([from, Math.min(from + WINDOW_DAYS * DAY_MS, end)]);
  }
  const replies = await Promise.all(
    windows.map(([from, to]) =>
      graphOptional<FlowResponse>(`${igId}/insights`, {
        metric: "follows_and_unfollows",
        period: "day",
        metric_type: "total_value",
        breakdown: "follow_type",
        since: String(Math.floor(from / 1000)),
        until: String(Math.floor(to / 1000)),
      }),
    ),
  );
  if (replies.every((reply) => !reply)) return null;

  let followed = 0;
  let unfollowed = 0;
  for (const reply of replies) {
    const results = reply?.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
    for (const row of results) {
      if (row.dimension_values[0] === "FOLLOWER") followed += row.value;
      if (row.dimension_values[0] === "NON_FOLLOWER") unfollowed += row.value;
    }
  }
  return {
    followed,
    unfollowed,
    from: new Date(start).toISOString().slice(0, 10),
    capped: !period.start || askedStart < earliest,
  };
}
