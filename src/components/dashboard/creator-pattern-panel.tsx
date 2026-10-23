// What the system learned a creator-fed lane looks like (AI tool workflows,
// phase 2), shown so the team can check it: the terms, the counts behind each,
// how strict the pass mark is, and the searches it would use to find creators.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  creatorPatternsQueryOptions,
  rebuildCreatorPatterns,
  type CreatorLanePattern,
} from "@/lib/creator-pattern.functions";
import type { PatternTerm } from "@/lib/creator-pattern";
import { dateTime } from "@/lib/format";

const pct = (share: number, digits = 0) => `${(share * 100).toFixed(digits)}%`;

function Terms({ terms, label }: { terms: PatternTerm[]; label: string }) {
  if (!terms.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {terms.map((term) => (
          <Badge
            key={term.term}
            variant="outline"
            className="font-normal"
            title={`In ${term.reels} creator posts by ${term.creators} creators; in ${term.background} background items`}
          >
            {term.term}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function LanePattern({ entry }: { entry: CreatorLanePattern }) {
  const { pattern } = entry;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{entry.lane}: learned pattern</CardTitle>
        <CardDescription>
          Learned from {entry.creators.length} watched creators (
          {entry.creators.map((creator) => `@${creator.handle}`).join(", ")}), against ordinary
          news, Pritesh&rsquo;s other lanes and the competitors&rsquo; captions. A reel is shown in
          the lane only when it beats its creator&rsquo;s normal and fits this pattern. No word in
          it is written in the code: hover a term for the counts behind it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pattern ? (
          <>
            <div className="grid gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Built</p>
                <p className="font-medium">{dateTime(pattern.builtAt)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Learned from</p>
                <p className="font-medium">
                  {pattern.stats.creatorPosts} posts by {pattern.stats.creators} creators
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Creators&rsquo; posts that fit</p>
                <p className="font-medium">{pct(pattern.stats.creatorPass)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Background that fits</p>
                <p className="font-medium">
                  {pct(pattern.stats.backgroundPass, 1)} of {pattern.stats.background}
                </p>
              </div>
            </div>
            <Terms
              label="Words"
              terms={pattern.terms.filter((term) => term.kind === "word").slice(0, 30)}
            />
            <Terms
              label="Phrases"
              terms={pattern.terms.filter((term) => term.kind === "phrase").slice(0, 15)}
            />
            <Terms
              label="Hashtags"
              terms={pattern.terms.filter((term) => term.kind === "hashtag").slice(0, 15)}
            />
            {pattern.searchTerms.length ? (
              <p className="text-xs text-muted-foreground">
                Searches it would use to find new creators (phase 3):{" "}
                <span className="text-foreground">{pattern.searchTerms.join(" · ")}</span>
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not learned yet. It is built on the next Sync or Refresh topics, or with Rebuild pattern
            below, once the creators have enough posts to learn from.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function CreatorPatternPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(creatorPatternsQueryOptions("instagram"));
  const rebuild = useMutation({
    mutationFn: () => rebuildCreatorPatterns({ data: "instagram" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["creator-patterns"] });
      void queryClient.invalidateQueries({ queryKey: ["topic-inbox"] });
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading patterns…</p>;
  if (!data?.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No creators are watched yet. They are listed in the watched_creators table (migration 0021).
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((entry) => (
        <LanePattern key={entry.lane} entry={entry} />
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={rebuild.isPending}
          onClick={() => rebuild.mutate()}
        >
          {rebuild.isPending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-3.5" aria-hidden />
          )}
          {rebuild.isPending ? "Relearning…" : "Rebuild pattern"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Free. Rereads the creators&rsquo; latest posts, relearns the pattern and refreshes their
          reels. It also rebuilds itself every 30 days.
        </p>
        {rebuild.data ? (
          <p className="text-xs text-muted-foreground">
            Read {rebuild.data.read} of {rebuild.data.creators} creators; {rebuild.data.standouts}{" "}
            reels now in the lane.
            {rebuild.data.failures.length ? ` Skipped: ${rebuild.data.failures.join("; ")}` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}
