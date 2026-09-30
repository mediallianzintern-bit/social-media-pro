import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { deriveLanes, dashboardQueryOptions } from "@/lib/analytics.functions";
import type { PlatformId } from "@/lib/analytics-types";

/**
 * The way in for an account that has posts but no lanes.
 *
 * Lanes were created in exactly one place — inside a full analysis run — while
 * three separate panels read them: this scorecard, the news topic search and the
 * trend catcher's relevance gate. So an account without them had all three dark
 * and no control anywhere that could light them, which is how LinkedIn sat with
 * seventeen stored posts and an empty Content lanes section.
 *
 * Shown in place of the table rather than instead of the whole section: a
 * missing panel says nothing, and the thing a person needs here is the reason
 * plus the button, in the spot where they went looking for the lanes.
 */
export function DeriveLanes({
  platform,
  mode = "empty",
}: {
  platform: PlatformId;
  /**
   * "empty" is the full explanatory card shown when an account has no lanes.
   * "refresh" is the same action as a single control beside the lane table,
   * for an account whose lanes exist but have gone stale — the taxonomy is
   * derived once and then reused forever, so an account that changes what it
   * posts keeps being scored against the subjects it used to cover.
   */
  mode?: "empty" | "refresh";
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deriveLanes({ data: { platform, rebuild: mode === "refresh" } }),
    onSuccess: async () => {
      // The lane scorecard is computed server-side from the stored posts, so
      // the newly written lanes only appear once the dashboard is re-read.
      await queryClient.invalidateQueries({ queryKey: dashboardQueryOptions.queryKey });
      await queryClient.invalidateQueries({ queryKey: ["topic-inbox", platform] });
      await queryClient.invalidateQueries({ queryKey: ["instagram-trends", platform] });
    },
  });

  const failure = mutation.data?.reason ?? (mutation.error ? String(mutation.error) : null);

  if (mode === "refresh") {
    return (
      <div className="flex items-baseline gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-auto gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          title="Derive the lanes again from what this account publishes now, and re-file every post against them"
        >
          {mutation.isPending ? (
            <Loader2 className="size-3 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-3" aria-hidden />
          )}
          {mutation.isPending ? "Rebuilding lanes…" : "Rebuild lanes"}
        </Button>
        {failure ? <span className="text-xs text-destructive">{failure}</span> : null}
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <p className="text-sm font-medium">No content lanes yet</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Lanes are the recurring subjects this account actually publishes, read from its own
          captions. The lane scorecard, the news topics and the rising-posts gate all need them, so
          all three stay empty until they exist.
        </p>
        <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-3.5" aria-hidden />
          )}
          {mutation.isPending ? "Reading your posts…" : "Derive content lanes"}
        </Button>
        {failure ? <p className="text-xs text-destructive">{failure}</p> : null}
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          One AI call to name the lanes, plus one per 25 posts to file them. It runs on the posts
          already stored — nothing is scraped, and no Apify credit is spent.
        </p>
      </CardContent>
    </Card>
  );
}
