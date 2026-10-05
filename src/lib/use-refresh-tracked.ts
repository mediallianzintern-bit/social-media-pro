// Fetching newer posts from the accounts this dashboard tracks, on demand.
//
// Two panels are built on the same stored posts — "Rising on <platform>" and
// the reaction hook's "Clips worth reacting to" — and both go stale between
// syncs. Rather than wait for the next scheduled run, each offers a refresh
// that pulls the latest posts for the tracked accounts and re-scores what is
// on screen.
//
// The refresh is narrowed to ONE platform deliberately: a full sync would also
// buy the other one, and on LinkedIn that spends runs from a fifty-run free
// allowance for a panel nobody is looking at.
//
// This DOES spend Apify credit, which is why it is a button and never
// automatic. Every caller labels it as such before the click.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { QueryKey } from "@tanstack/react-query";

import { dashboardQueryOptions, syncNow } from "@/lib/analytics.functions";
import type { PlatformId } from "@/lib/analytics-types";

export interface RefreshState {
  mutate: () => void;
  isPending: boolean;
  /** What happened, in the user's own numbers. Null before the first click. */
  message: string | null;
  failed: boolean;
}

/**
 * @param also Query keys this panel reads, invalidated once the sync lands.
 *   The dashboard's own query is always included.
 */
export function useRefreshTracked(platform: PlatformId, also: QueryKey[] = []): RefreshState {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const mutation = useMutation({
    mutationFn: () => syncNow({ data: { trigger: "manual", platforms: [platform] } }),
    onSuccess: async (result) => {
      const outcome = result.outcomes.find((entry) => entry.platform === platform);
      if (!outcome || outcome.status === "error") {
        setFailed(true);
        setMessage(outcome?.error ?? "The refresh did not complete.");
      } else if (outcome.status === "skipped") {
        setFailed(false);
        setMessage(outcome.reason ?? "Skipped.");
      } else {
        setFailed(false);
        setMessage(
          `Fetched ${outcome.postsIngested ?? 0} posts just now. The list below is re-scored against them.`,
        );
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: dashboardQueryOptions.queryKey }),
        ...also.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ]);
    },
    onError: (error) => {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : String(error));
    },
  });

  return { mutate: () => mutation.mutate(), isPending: mutation.isPending, message, failed };
}
