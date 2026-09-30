import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { topicFeedbackQueryOptions, voteTopic } from "@/lib/analytics.functions";
import type { PlatformId } from "@/lib/analytics-types";
import { voteKey, type TopicKind, type Verdict } from "@/lib/preferences";
import { cn } from "@/lib/utils";

type FeedbackData = Awaited<ReturnType<ReturnType<typeof topicFeedbackQueryOptions>["queryFn"]>>;

/**
 * T67 — tick or cross one topic, and teach the system the team's taste.
 *
 * Clicking the chosen mark again clears it, so a vote is never a trap. The
 * change shows at once (optimistically) and then the lists that depend on it
 * are re-read, so a tick visibly lifts related topics and a cross removes the
 * item — the feedback a person needs to trust that clicking does something.
 */
export function VoteButtons({
  platform,
  kind,
  itemId,
  text,
  lane,
  className,
}: {
  platform: PlatformId;
  kind: TopicKind;
  itemId: string;
  /** What is being judged — the headline, caption or hook. The model learns from these words. */
  text: string;
  lane: string | null;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const options = topicFeedbackQueryOptions(platform);
  const { data } = useQuery(options);
  const current =
    data?.votes.find((vote) => voteKey(vote.kind, vote.itemId) === voteKey(kind, itemId))
      ?.verdict ?? null;

  const mutation = useMutation({
    mutationFn: (verdict: Verdict | null) =>
      voteTopic({ data: { platform, kind, itemId, verdict, text: text.slice(0, 2000), lane } }),
    onMutate: async (verdict) => {
      await queryClient.cancelQueries({ queryKey: options.queryKey });
      const previous = queryClient.getQueryData<FeedbackData>(options.queryKey);
      queryClient.setQueryData<FeedbackData>(options.queryKey, (old) => {
        if (!old) return old;
        const others = old.votes.filter(
          (vote) => voteKey(vote.kind, vote.itemId) !== voteKey(kind, itemId),
        );
        return { ...old, votes: verdict ? [{ kind, itemId, verdict }, ...others] : others };
      });
      return { previous };
    },
    onError: (_error, _verdict, context) => {
      if (context?.previous) queryClient.setQueryData(options.queryKey, context.previous);
    },
    onSettled: async () => {
      // Everything a vote can reorder. The inbox and the rising list rank by
      // it; the summary card reports it.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: options.queryKey }),
        queryClient.invalidateQueries({ queryKey: ["topic-inbox", platform] }),
        queryClient.invalidateQueries({ queryKey: ["instagram-trends", platform] }),
      ]);
    },
  });

  const cast = (verdict: Verdict) => mutation.mutate(current === verdict ? null : verdict);

  return (
    <div className={cn("inline-flex items-center gap-0.5", className)}>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={cn(
          "size-7 text-muted-foreground hover:text-emerald-700",
          current === "like" &&
            "bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/15 dark:text-emerald-400",
        )}
        aria-pressed={current === "like"}
        aria-label={current === "like" ? "Liked — click to clear" : "More topics like this"}
        title={current === "like" ? "Liked — click to clear" : "More topics like this"}
        disabled={mutation.isPending}
        onClick={() => cast("like")}
      >
        <Check className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={cn(
          "size-7 text-muted-foreground hover:text-destructive",
          current === "dislike" && "bg-destructive/10 text-destructive hover:bg-destructive/15",
        )}
        aria-pressed={current === "dislike"}
        aria-label={current === "dislike" ? "Rejected — click to clear" : "Fewer topics like this"}
        title={current === "dislike" ? "Rejected — click to clear" : "Fewer topics like this"}
        disabled={mutation.isPending}
        onClick={() => cast("dislike")}
      >
        <X className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
