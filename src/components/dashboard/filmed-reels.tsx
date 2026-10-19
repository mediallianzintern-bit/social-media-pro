// The Filmed reels page: every script the team marked filmed, where each one
// has got to, and what the system has learned from them so far.
//
// Each row opens the same drawer as everywhere else, where Analyse and Review
// live. This page spends nothing: it reads stored rows and synced posts, and
// gives any reel still waiting one more free look.
import { useQueries, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Loader2, Search, TrendingUp, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

import { AiIdeaCards } from "@/components/dashboard/ai-idea-cards";
import { Patterns } from "@/components/dashboard/filmed-panel";
import { SectionHeading } from "@/components/dashboard/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ContentIdea } from "@/lib/ai-types";
import type { PlatformId } from "@/lib/analytics-types";
import { dateTime, shortDate } from "@/lib/format";
import { PLATFORM_META } from "@/lib/platform-meta";
import { REEL_USAGE_LABEL, VIRAL_RATIO, type ReelLearning } from "@/lib/reel-learning-types";
import { filmedReelsQueryOptions, reelPatternsQueryOptions } from "@/lib/reel-learning.functions";

const PLATFORMS: PlatformId[] = ["instagram", "linkedin"];

type Stage = "waiting" | "found" | "analysed" | "review_ready" | "reviewed";

function stageOf(learning: ReelLearning): Stage {
  if (learning.review) return "reviewed";
  if (!learning.shortcode) return "waiting";
  if (!learning.comparison) return "found";
  const ready = learning.reviewableAt ? Date.now() >= Date.parse(learning.reviewableAt) : false;
  return ready ? "review_ready" : "analysed";
}

const STAGE_LABEL: Record<Stage, string> = {
  waiting: "Waiting for the reel",
  found: "Reel found · Analyse next",
  analysed: "Analysed · results after a week",
  review_ready: "Ready to review",
  reviewed: "Reviewed",
};

const STAGE_TONE: Record<Stage, string> = {
  waiting: "text-muted-foreground",
  found: "border-sky-300 text-sky-800 dark:border-sky-800 dark:text-sky-300",
  analysed: "text-muted-foreground",
  review_ready: "border-amber-300 text-amber-800 dark:border-amber-800 dark:text-amber-300",
  reviewed: "border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-300",
};

function Result({ learning }: { learning: ReelLearning }) {
  if (!learning.review) return null;
  const ratio = learning.review.primaryRatio;
  if (ratio >= VIRAL_RATIO) {
    return (
      <Badge className="gap-1 bg-violet-600 hover:bg-violet-600">
        <TrendingUp className="size-3" aria-hidden /> Viral · {ratio.toFixed(2)}×
      </Badge>
    );
  }
  return learning.worked ? (
    <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
      <CheckCircle2 className="size-3" aria-hidden /> Worked · {ratio.toFixed(2)}×
    </Badge>
  ) : (
    <Badge variant="destructive" className="gap-1">
      <XCircle className="size-3" aria-hidden /> Did not work · {ratio.toFixed(2)}×
    </Badge>
  );
}

export function FilmedReels() {
  const results = useQueries({
    queries: PLATFORMS.map((platform) => filmedReelsQueryOptions(platform)),
  });
  const isLoading = results.some((result) => result.isLoading);
  const items = useMemo(
    () =>
      results
        .flatMap((result) => result.data ?? [])
        .sort((a, b) => b.learning.filmedAt.localeCompare(a.learning.filmedAt)),
    [results],
  );
  const { data: patterns } = useQuery(reelPatternsQueryOptions("instagram"));
  const [viewing, setViewing] = useState<{ idea: ContentIdea; platform: PlatformId } | null>(null);

  const count = (stage: Stage) => items.filter((item) => stageOf(item.learning) === stage).length;
  const worked = items.filter((item) => item.learning.worked).length;
  const viral = items.filter(
    (item) => (item.learning.review?.primaryRatio ?? 0) >= VIRAL_RATIO,
  ).length;

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Every script the team marked filmed. The live reel is found by its topic on each Sync; open
        one to Analyse what was used and, after a week, Review how it did. What the reviews teach
        goes into every new script.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Filmed", value: items.length },
          { label: "Waiting for reel", value: count("waiting") },
          { label: "To analyse", value: count("found") },
          { label: "Ready to review", value: count("review_ready") },
          { label: "Reviewed", value: count("reviewed") },
          { label: "Worked / viral", value: `${worked} / ${viral}` },
        ].map((tile) => (
          <div key={tile.label} className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">{tile.label}</p>
            <p className="text-xl font-bold tabular-nums">{isLoading ? "…" : tile.value}</p>
          </div>
        ))}
      </div>

      <SectionHeading title="What the system has learned" />
      {patterns?.length ? (
        <Card>
          <CardContent className="p-5">
            <Patterns platform="instagram" />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nothing yet. Patterns appear once filmed reels have been reviewed, a week after they go
          live. Each review adds to them.
        </p>
      )}

      <SectionHeading
        title="Filmed reels"
        note={isLoading ? "Loading…" : `${items.length} filmed`}
      />
      <Card>
        <CardContent className="divide-y p-0">
          {isLoading ? (
            <p className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
            </p>
          ) : !items.length ? (
            <p className="p-5 text-sm text-muted-foreground">
              Nothing filmed yet. Press I filmed this on a script once it is shot.
            </p>
          ) : (
            items.map(({ learning, idea }) => {
              const stage = stageOf(learning);
              return (
                <div key={learning.ideaId} className="flex flex-wrap items-start gap-3 p-4">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="font-medium leading-snug">
                      {idea?.title ?? "A script no longer stored"}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span style={{ color: PLATFORM_META[learning.platform].color }}>
                        {PLATFORM_META[learning.platform].label}
                      </span>
                      {idea?.contentLane ? <span>· {idea.contentLane}</span> : null}
                      <span>
                        · filmed {dateTime(learning.filmedAt)}
                        {learning.filmedBy ? ` by ${learning.filmedBy}` : ""}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={`font-normal ${STAGE_TONE[stage]}`}>
                        {stage === "waiting" ? (
                          <Search className="mr-1 size-3" aria-hidden />
                        ) : null}
                        {STAGE_LABEL[stage]}
                        {stage === "analysed" && learning.reviewableAt
                          ? ` (${shortDate(learning.reviewableAt)})`
                          : ""}
                      </Badge>
                      {learning.usage ? (
                        <Badge variant="secondary" className="font-normal">
                          {REEL_USAGE_LABEL[learning.usage]}
                        </Badge>
                      ) : null}
                      <Result learning={learning} />
                      {learning.reelUrl ? (
                        <a
                          href={learning.reelUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                        >
                          Reel
                          {learning.publishedAt
                            ? `, posted ${shortDate(learning.publishedAt)}`
                            : ""}
                          <ExternalLink className="size-3" aria-hidden />
                        </a>
                      ) : null}
                    </div>
                    {learning.review ? (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {learning.review.summary}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!idea}
                    onClick={() => idea && setViewing({ idea, platform: learning.platform })}
                  >
                    Open
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {viewing ? (
        <AiIdeaCards
          key={viewing.idea.id}
          ideas={[viewing.idea]}
          platform={viewing.platform}
          initialOpenId={viewing.idea.id}
          panelOnly
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
}
