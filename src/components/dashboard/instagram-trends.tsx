import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, Filter, Flame, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";

import { SectionHeading } from "@/components/dashboard/section-heading";
import { VoteButtons } from "@/components/dashboard/vote-buttons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  dashboardQueryOptions,
  instagramTrendsQueryOptions,
  syncNow,
} from "@/lib/analytics.functions";
import { PLATFORM_META } from "@/lib/platform-meta";
import { cn } from "@/lib/utils";
import type { PlatformId } from "@/lib/analytics-types";

/**
 * "Rising on <platform>" — what is outperforming in this account's own niche.
 *
 * Works on either platform. The breakout is measured on views where the
 * platform publishes them and on interactions where it does not, which is what
 * lets LinkedIn use it at all — see instagramTrends().
 *
 * Every row is a real post by a tracked competitor that beat THAT ACCOUNT'S
 * own median, linked to its permalink. Nothing here is generated, and nothing
 * new is fetched to build it: the posts arrive with the ordinary sync.
 *
 * The rejected list is shown deliberately. The loudest breakouts in this niche
 * are meme humour — one at over 300× its account's median — and a filter that
 * silently removes the biggest numbers on the page is a filter nobody will
 * trust. Showing what was dropped, and why, is what makes the gate arguable.
 */
export function InstagramTrends({ platform }: { platform: PlatformId }) {
  const { data, isLoading } = useQuery(instagramTrendsQueryOptions(platform));
  const refresh = useRefreshRising(platform);
  const [showRejected, setShowRejected] = useState(false);
  const meta = PLATFORM_META[platform];
  const accent = meta.color;
  // LinkedIn publishes no view count, so the catcher measures interactions
  // there. Saying "views" over an interaction count would be a quiet lie.
  const metricNoun = data?.metric === "interactions" ? "interactions" : "views";

  const trends = data?.trends ?? [];
  const rejected = data?.rejected ?? [];

  // Nothing to say before the first sync has stored competitor posts.
  if (!isLoading && !trends.length && !rejected.length && !data?.scanned.length) return null;

  return (
    <>
      <SectionHeading
        title={`Rising on ${meta.label}`}
        note="Posts beating their own account's median, from the competitors you track — with the post itself as the source"
        action={
          <Button
            size="sm"
            variant="ghost"
            className="h-auto gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            title={`Scrapes the latest posts from every tracked ${meta.label} account on Apify, which spends credit`}
          >
            {refresh.isPending ? (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-3" aria-hidden />
            )}
            {refresh.isPending ? "Fetching new posts…" : "Refresh"}
          </Button>
        }
      />
      <Card>
        <CardContent className="space-y-4 p-5">
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Scoring competitor posts…"
              : data?.scanned.length
                ? `Scanned ${data.scanned.length} tracked accounts on ${metricNoun}. Each post is scored against that account's own median, so a big post counts as a breakout on a small account and not on a large one.`
                : "No competitor posts stored yet."}
          </p>

          {refresh.message ? (
            <p
              className={cn(
                "rounded-md border px-3 py-2 text-xs",
                refresh.failed ? "border-destructive/30 text-destructive" : "text-muted-foreground",
              )}
            >
              {refresh.message}
            </p>
          ) : null}

          {data?.scanned.length ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Watching {data.scanned.map((account) => `@${account.handle}`).join(", ")}.
            </p>
          ) : null}

          {data?.reason ? <p className="text-xs text-muted-foreground">{data.reason}</p> : null}

          {trends.length ? (
            <ul className="divide-y">
              {trends.map((trend) => (
                <li key={trend.postId} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="gap-1 font-semibold tabular-nums"
                      title={`${metricNoun} as a multiple of that account's own median`}
                    >
                      <Flame className="size-3" style={{ color: accent }} aria-hidden />
                      {trend.vsAccountMedian}×
                    </Badge>
                    <span className="text-xs font-medium text-muted-foreground">
                      @{trend.handle}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {trend.ageDays === 0 ? "today" : `${trend.ageDays}d ago`}
                    </span>
                    {trend.lane ? (
                      <Badge variant="outline" className="font-normal capitalize">
                        {trend.lane}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="font-normal text-muted-foreground">
                        no clear lane
                      </Badge>
                    )}
                    <VoteButtons
                      platform={platform}
                      kind="trend"
                      itemId={trend.postId}
                      text={trend.caption || trend.hook}
                      lane={trend.lane}
                      className="ml-auto"
                    />
                  </div>

                  <p className="mt-1.5 text-sm leading-snug">{trend.hook}</p>

                  <p className="mt-1 text-xs text-muted-foreground">{trend.reason}</p>

                  {trend.url ? (
                    <a
                      href={trend.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
                      style={{ color: accent }}
                    >
                      <meta.icon className="size-3" aria-hidden />
                      See the post
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {rejected.length ? (
            <div className="border-t pt-3">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => setShowRejected((open) => !open)}
              >
                <Filter className="size-3.5" aria-hidden />
                {rejected.length} breakout{rejected.length === 1 ? "" : "s"} filtered out
                <ChevronDown
                  className={cn("size-3.5 transition-transform", showRejected && "rotate-180")}
                  aria-hidden
                />
              </Button>

              {showRejected ? (
                <ul className="mt-2 space-y-2">
                  {rejected.map((trend) => (
                    <li
                      key={trend.postId}
                      className="flex flex-wrap items-baseline gap-x-2 text-xs"
                    >
                      <span className="font-semibold tabular-nums text-muted-foreground">
                        {trend.vsAccountMedian}×
                      </span>
                      <span className="text-muted-foreground">@{trend.handle}</span>
                      <span className="min-w-0 flex-1 truncate">{trend.hook}</span>
                      <span className="text-muted-foreground">— {trend.reason}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}

/**
 * Fetches fresh posts for this platform's tracked accounts — competitors and
 * trend sources alike — and re-scores the list.
 *
 * Narrowed to this one platform on purpose: a full sync would also buy the
 * other platform, and on LinkedIn that spends runs from a fifty-run free
 * allowance on a panel that is not showing LinkedIn. The sync also refreshes
 * the news topics (free) and captures any matured outcomes, as every sync
 * does.
 */
function useRefreshRising(platform: PlatformId) {
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
        queryClient.invalidateQueries({ queryKey: instagramTrendsQueryOptions(platform).queryKey }),
        queryClient.invalidateQueries({ queryKey: dashboardQueryOptions.queryKey }),
        queryClient.invalidateQueries({ queryKey: ["topic-inbox", platform] }),
      ]);
    },
    onError: (error) => {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : String(error));
    },
  });

  return { mutate: () => mutation.mutate(), isPending: mutation.isPending, message, failed };
}
