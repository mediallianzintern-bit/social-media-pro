// Review ideas, one card at a time (13 Nov 2026, UI review, the mockup's
// "Phone, Review ideas"): the idea's opening line, why it was suggested, and
// two big buttons. Approve and Dismiss are the same decisions the full script
// drawer records, so the learning hears about them either way; "Read the full
// reasoning" opens that drawer for everything else.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Loader2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { AiIdeaCards } from "@/components/dashboard/ai-idea-cards";
import { IdeasTabs } from "@/components/dashboard/ideas-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { withChosenHook } from "@/lib/hook-variants";
import { analysisQueryOptions, dismissIdea } from "@/lib/analytics.functions";
import { PLATFORM_META } from "@/lib/platform-meta";
import { judgeScript, scriptVerdictsQueryOptions } from "@/lib/script-feedback.functions";
import { useWaitingIdeas, type WaitingIdea } from "@/lib/use-waiting-ideas";

export const Route = createFileRoute("/_app/ideas")({ component: IdeasPage });

function IdeasPage() {
  const { waiting, loading } = useWaitingIdeas();
  const queryClient = useQueryClient();
  // The queue is taken once, so deciding an idea moves to the next one
  // instead of reshuffling what is left under the reader.
  const [queue, setQueue] = useState<WaitingIdea[] | null>(null);
  const list = queue ?? waiting;
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [reading, setReading] = useState<WaitingIdea | null>(null);

  const open = useMemo(() => list.filter((entry) => !done.has(entry.idea.id)), [list, done]);
  const current = open.length ? open[index % open.length] : null;
  const position = list.length - open.length + 1;

  const settle = (entry: WaitingIdea) => {
    if (!queue) setQueue(waiting);
    setDone((previous) => new Set(previous).add(entry.idea.id));
    void queryClient.invalidateQueries({
      queryKey: scriptVerdictsQueryOptions(entry.platform).queryKey,
    });
    void queryClient.invalidateQueries({
      queryKey: analysisQueryOptions(entry.platform).queryKey,
    });
  };

  const approve = useMutation({
    mutationFn: (entry: WaitingIdea) =>
      judgeScript({
        data: {
          platform: entry.platform,
          ideaId: entry.idea.id,
          verdict: "approve",
          reasons: [],
          note: null,
        },
      }),
    onSuccess: (_result, entry) => settle(entry),
  });
  const dismiss = useMutation({
    mutationFn: (entry: WaitingIdea) => dismissIdea({ data: { ideaId: entry.idea.id } }),
    onSuccess: (_result, entry) => settle(entry),
  });
  const busy = approve.isPending || dismiss.isPending;
  const error = approve.error ?? dismiss.error;

  return (
    <div className="space-y-6">
      <IdeasTabs />
      {loading && !list.length ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading ideas…
        </p>
      ) : !current ? (
        <Card className="mx-auto w-full max-w-xl">
          <CardContent className="space-y-3 p-6 text-center">
            <p className="text-lg font-semibold">Nothing waiting for review</p>
            <p className="text-sm text-muted-foreground">
              New ideas appear here as they are written. Find a story to write about in Trends.
            </p>
            <Button asChild className="h-11">
              <Link to="/trends">Open Trends</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="mx-auto w-full max-w-xl space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Button asChild variant="outline" size="icon" className="size-11 rounded-full">
              <Link to="/" aria-label="Back to Home">
                <ArrowLeft className="size-4" aria-hidden />
              </Link>
            </Button>
            <p className="text-base font-semibold" aria-live="polite">
              Idea {position} of {list.length}
            </p>
            <Button
              variant="link"
              className="h-11 px-2 text-sm underline"
              disabled={busy || open.length < 2}
              onClick={() => setIndex((value) => value + 1)}
            >
              Skip
            </Button>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={list.length}
            aria-valuenow={position - 1}
            aria-label="Ideas reviewed"
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${((position - 1) / Math.max(1, list.length)) * 100}%` }}
            />
          </div>

          <IdeaCard entry={current} onRead={() => setReading(current)} />

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error instanceof Error ? error.message : "That could not be saved. Try again."}
            </p>
          ) : null}

          <div className="grid grid-cols-[1fr_2fr] gap-3">
            <Button
              variant="outline"
              className="h-14 gap-2 text-base"
              disabled={busy}
              onClick={() => dismiss.mutate(current)}
            >
              {dismiss.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <X className="size-4" aria-hidden />
              )}
              Dismiss
            </Button>
            <Button
              className="h-14 gap-2 text-base"
              disabled={busy}
              onClick={() => approve.mutate(current)}
            >
              {approve.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Check className="size-4" aria-hidden />
              )}
              Approve
            </Button>
          </div>
          <p className="text-center text-[13px] text-muted-foreground">
            Approving teaches the writer what you want more of. Dismiss hides the idea.
          </p>
        </div>
      )}

      {reading ? (
        <AiIdeaCards
          key={reading.idea.id}
          ideas={[reading.idea]}
          platform={reading.platform}
          initialOpenId={reading.idea.id}
          panelOnly
          onClose={() => setReading(null)}
        />
      ) : null}
    </div>
  );
}

function IdeaCard({ entry, onRead }: { entry: WaitingIdea; onRead: () => void }) {
  const idea = withChosenHook(entry.idea);
  const meta = PLATFORM_META[entry.platform];
  const opening = (idea.post?.body ?? idea.hook ?? "").split("\n").slice(0, 2).join(" ");
  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="px-3 py-1 text-[13px] font-semibold"
            style={{ borderColor: meta.color, color: meta.color }}
          >
            {meta.label}
          </Badge>
          {idea.contentLane ? (
            <Badge variant="secondary" className="px-3 py-1 text-[13px] font-normal">
              {idea.contentLane}
            </Badge>
          ) : null}
        </div>
        <p className="text-[13px] text-muted-foreground">{idea.title}</p>
        <p className="text-2xl leading-snug font-bold">{opening || idea.title}</p>
        {idea.whyNow ? (
          <div className="rounded-lg bg-muted/60 p-4">
            <p className="text-[13px] font-semibold text-muted-foreground">Why this idea</p>
            <p className="mt-1 text-sm leading-relaxed">{idea.whyNow}</p>
          </div>
        ) : null}
        <Button variant="link" className="h-11 px-0 text-sm underline" onClick={onRead}>
          Read the full script and reasoning
        </Button>
      </CardContent>
    </Card>
  );
}
