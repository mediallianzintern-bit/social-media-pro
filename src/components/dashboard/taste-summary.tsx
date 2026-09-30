import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { topicFeedbackQueryOptions } from "@/lib/analytics.functions";
import type { PlatformId } from "@/lib/analytics-types";

/**
 * T67 — what the ticks and crosses have taught the system so far.
 *
 * Shown because a preference that silently reorders every list is one nobody
 * can correct. If a single careless cross has started fading a whole subject,
 * this is where it shows up, and the fix is to clear that vote.
 */
export function TasteSummary({ platform }: { platform: PlatformId }) {
  const { data } = useQuery(topicFeedbackQueryOptions(platform));
  const summary = data?.summary;

  if (!summary) return null;

  if (!summary.totalVotes) {
    return (
      <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
        Tick <Check className="inline size-3 text-emerald-600" aria-label="tick" /> or cross{" "}
        <X className="inline size-3 text-destructive" aria-label="cross" /> any topic, rising post
        or reel idea below. The system learns from those votes: ticked subjects start appearing more
        often, and crossed ones fade out once a pattern forms.
      </p>
    );
  }

  const pill = (entry: { key: string; votes: number }, tone: "up" | "down") => (
    <Badge
      key={entry.key}
      variant="outline"
      className={
        tone === "up"
          ? "border-emerald-600/30 font-normal text-emerald-800 dark:text-emerald-300"
          : "border-destructive/30 font-normal text-destructive"
      }
      title={`${entry.votes} vote${entry.votes === 1 ? "" : "s"}`}
    >
      {entry.key}
    </Badge>
  );

  const liked = [...summary.likedLanes, ...summary.likedWords];
  const disliked = [...summary.dislikedLanes, ...summary.dislikedWords];

  return (
    <Card>
      <CardContent className="space-y-2.5 p-4">
        <p className="text-xs text-muted-foreground">
          Learned from {summary.totalVotes} vote{summary.totalVotes === 1 ? "" : "s"}. Older votes
          count for less — half after 45 days — so the team&rsquo;s taste can change.
        </p>
        {liked.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <Check className="size-3.5" aria-hidden /> More of
            </span>
            {summary.likedLanes.map((entry) => pill(entry, "up"))}
            {summary.likedWords.map((entry) => pill(entry, "up"))}
          </div>
        ) : null}
        {disliked.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-xs font-medium text-destructive">
              <X className="size-3.5" aria-hidden /> Less of
            </span>
            {summary.dislikedLanes.map((entry) => pill(entry, "down"))}
            {summary.dislikedWords.map((entry) => pill(entry, "down"))}
          </div>
        ) : null}
        {!liked.length && !disliked.length ? (
          <p className="text-xs text-muted-foreground">
            Not enough agreement yet to call a pattern — a subject is learned once it appears in at
            least two voted topics.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
