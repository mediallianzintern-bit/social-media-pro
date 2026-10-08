import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Clapperboard,
  ExternalLink,
  Filter,
  Flame,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { SectionHeading } from "@/components/dashboard/section-heading";
import { VoteButtons } from "@/components/dashboard/vote-buttons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  instagramTrendsQueryOptions,
  saveReactionClip,
  topicFeedbackQueryOptions,
} from "@/lib/analytics.functions";
import { useRefreshTracked } from "@/lib/use-refresh-tracked";
import { PLATFORM_META } from "@/lib/platform-meta";
import { cn } from "@/lib/utils";
import type { PlatformId } from "@/lib/analytics-types";
import { voteKey } from "@/lib/preferences";

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
  // A rising post may only be reacted to once it has been TICKED. The tick is
  // the team saying "this is one worth answering"; "React to this" then carries
  // the clip into the Reaction hooks screen. Read the same feedback the tick
  // writes, so the gate reflects the live vote.
  const { data: feedback } = useQuery(topicFeedbackQueryOptions(platform));
  const likedTrend = (postId: string) =>
    feedback?.votes.some(
      (vote) =>
        voteKey(vote.kind, vote.itemId) === voteKey("trend", postId) && vote.verdict === "like",
    ) ?? false;
  const refresh = useRefreshTracked(platform, [
    instagramTrendsQueryOptions(platform).queryKey,
    ["topic-inbox", platform],
  ]);
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

                  {trend.url && platform === "instagram" ? (
                    <ReactToThisButton
                      url={trend.url}
                      handle={trend.handle}
                      hook={trend.hook}
                      // Only a true view count is passed as "views".
                      views={data?.metric === "views" ? trend.value : null}
                      liked={likedTrend(trend.postId)}
                    />
                  ) : null}
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
 * Addendum E.5 — takes a rising post into the Reaction hooks screen.
 *
 * Gated on the tick: the ✓ is the team saying this one is worth answering, so
 * until it is set the control is visible but not usable.
 *
 * Pressing it STORES the clip and then opens Reaction hooks, where it appears
 * under Source clips. It used to only pre-fill the form there, which left the
 * screen reading "0 stored" until someone also pressed Save clip — the step was
 * invisible and the clip looked lost. One database write; no scrape, no AI, no
 * spend. The link, handle and views come from the post itself, so the source
 * the script credits is the one that actually broke out, never a retyped link.
 *
 * Re-pressing is safe: the server normalises the URL and updates the existing
 * row rather than adding a second copy.
 */
function ReactToThisButton({
  url,
  handle,
  hook,
  views,
  liked,
}: {
  url: string;
  handle: string;
  /** The post's opening line — the claim the expert will answer. */
  hook: string;
  views: number | null;
  liked: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () =>
      saveReactionClip({
        data: {
          platform: "instagram",
          sourceUrl: url,
          sourceCreatorHandle: handle,
          // The team sets the real clip type on the card; "other" is the
          // honest default rather than a guess that changes the rights rule.
          sourceType: "other",
          // The rising post's opening line IS the claim being answered, so it
          // is stored as one. Without it the clip arrives with no transcript
          // and no claim, and "Write reaction script" sits greyed out with
          // nothing on the card explaining why.
          ...(hook.trim() ? { extractedClaim: hook.trim().slice(0, 1000) } : {}),
          ...(views != null ? { sourcePublicViews: views } : {}),
          foundBy: "trend_listener",
        },
      }),
    onSuccess: async (result) => {
      if ("reason" in result) {
        setFailure(result.reason);
        return;
      }
      setFailure(null);
      await queryClient.invalidateQueries({ queryKey: ["reactions", "instagram"] });
      await navigate({ to: "/reactions" });
    },
    onError: (error) => setFailure(error instanceof Error ? error.message : String(error)),
  });

  return (
    <>
      <button
        type="button"
        disabled={!liked || add.isPending}
        onClick={() => add.mutate()}
        className={cn(
          "mr-3 mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium",
          liked
            ? "text-muted-foreground hover:text-foreground hover:underline"
            : "cursor-not-allowed text-muted-foreground/50",
        )}
        title={
          liked
            ? "Stores this clip and opens it in Reaction hooks"
            : "Tick this post (the ✓) to react to it"
        }
      >
        {add.isPending ? (
          <Loader2 className="size-3 animate-spin" aria-hidden />
        ) : (
          <Clapperboard className="size-3" aria-hidden />
        )}
        {add.isPending ? "Adding…" : "React to this"}
      </button>
      {failure ? <span className="mr-3 text-xs text-destructive">{failure}</span> : null}
    </>
  );
}
