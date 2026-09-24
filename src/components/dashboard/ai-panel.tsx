import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Flame,
  HelpCircle,
  ListChecks,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";

import { AiIdeaCards } from "@/components/dashboard/ai-idea-cards";
import { SectionHeading } from "@/components/dashboard/section-heading";
import { TopicInbox } from "@/components/dashboard/topic-inbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { dateTime } from "@/lib/format";
import { analysisQueryOptions, generateAnalysis } from "@/lib/analytics.functions";
import { PLATFORM_META } from "@/lib/platform-meta";
import type { CompetitorAnalysis, FeedRead, GapTone, TeamTakeaway } from "@/lib/ai-types";
import type { PlatformId } from "@/lib/analytics-types";

const TONE_CLASS: Record<GapTone, string> = {
  good: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  bad: "bg-destructive/10 text-destructive",
  warn: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  neutral: "bg-muted text-muted-foreground",
};

/**
 * A read that came from a live external feed rather than from measured data.
 *
 * Labelled as such on purpose. Everything else in this panel is grounded in
 * this account's own posts; these two sections are the outside world, and every
 * term shown here was copied verbatim from a feed rather than recalled by the
 * model. The queries are printed so a surprising pick can be traced back to
 * what was actually searched.
 */
function FeedCard({
  read,
  title,
  description,
  icon: Icon,
  color,
}: {
  read: FeedRead;
  title: string;
  description: string;
  icon: typeof Flame;
  color: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4" style={{ color }} aria-hidden />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed">{read.headline}</p>

        {read.picks?.length ? (
          <ul className="space-y-2.5">
            {(read.picks ?? []).map((pick) => (
              <li key={pick.term} className="rounded-lg border bg-muted/40 p-3">
                <span className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium">{pick.term}</span>
                  {pick.lane ? (
                    <Badge variant="secondary" className="bg-muted font-normal capitalize">
                      {pick.lane}
                    </Badge>
                  ) : null}
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                  {pick.whyRelevant}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{read.note}</p>
        )}

        <p className="text-xs text-muted-foreground/70">
          {read.candidatesFound} candidates from {read.queries.join(", ")}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * The four takeaways, shared by the analyst and competitive reads.
 *
 * Deliberately the same shape in both places: a team that learns to read this
 * block once should not have to learn a second layout for the other panel.
 */
function TeamTakeaways({ items, color }: { items: TeamTakeaway[] | undefined; color: string }) {
  if (!items?.length) return null;

  return (
    <section className="rounded-lg border bg-muted/40 p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <ListChecks className="size-3.5" style={{ color }} aria-hidden />
        What this means for the team
      </h3>
      {/* list-none because the numbers are drawn as badges below; leaving the
          browser's own markers on would number every row twice. */}
      <ol className="list-none space-y-3 p-0">
        {items.map((entry, index) => (
          <li key={entry.takeaway} className="flex gap-3">
            <span
              className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ backgroundColor: color }}
            >
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium leading-snug">{entry.takeaway}</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                {entry.soWhat}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Coerces a cached competitive read into the current shape.
 *
 * ai_analyses stores whatever the schema looked like when it was written, and
 * that schema has changed — an analysis cached before lanes existed carries
 * `opportunities`/`ownerStrengths` where this component now expects
 * `contestedLanes`/`openLanes`. Rendering it straight threw on `.map` of
 * undefined and took the whole panel down.
 *
 * `opportunities` maps cleanly onto openLanes: both mean "a gap worth aiming
 * at". `ownerStrengths` is deliberately NOT mapped onto contestedLanes — those
 * mean opposite things (lanes the OWNER wins versus lanes RIVALS already own),
 * and filing one under the other would put text beneath a heading that inverts
 * it. Losing a stale field is better than mislabelling it.
 */
function normalizeCompetitors(raw: CompetitorAnalysis | null): CompetitorAnalysis | null {
  if (!raw) return null;
  const legacy = raw as Partial<CompetitorAnalysis> & { opportunities?: string[] };

  return {
    headline: raw.headline ?? "",
    // Absent on every analysis cached before takeaways existed.
    teamTakeaways: legacy.teamTakeaways ?? [],
    contestedLanes: legacy.contestedLanes ?? [],
    openLanes: legacy.openLanes ?? legacy.opportunities ?? [],
    verdicts: legacy.verdicts ?? [],
  };
}

/**
 * The AI layer, kept visually distinct from the measured sections above it.
 *
 * Generation is a button, not a page load: each run costs money and the answer
 * only changes when the underlying posts do. The cached result carries the
 * timestamp and model it came from, so nobody mistakes a week-old read for a
 * current one.
 */
export function AiPanel({ platform }: { platform: PlatformId }) {
  const queryClient = useQueryClient();
  const meta = PLATFORM_META[platform];
  const { data: analysis, isLoading } = useQuery(analysisQueryOptions(platform));

  const mutation = useMutation({
    mutationFn: (rediscover: boolean) => generateAnalysis({ data: { platform, rediscover } }),
    onSuccess: (result) => {
      queryClient.setQueryData(analysisQueryOptions(platform).queryKey, result);
      // Discovery writes new competitor snapshots, so the benchmark table above
      // is now stale.
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const { mutate, isPending } = mutation;
  const discovery = analysis?.discovery;
  const competitors = normalizeCompetitors(analysis?.competitors ?? null);
  const analyst = analysis?.analyst ?? null;
  const reflection = analysis?.reflection ?? null;
  const trends = analysis?.trends ?? null;
  const questions = analysis?.audienceQuestions ?? null;
  const error =
    analysis?.error ?? (mutation.error instanceof Error ? mutation.error.message : null);

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-3 pt-2">
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Sparkles className="size-3.5" aria-hidden />
          AI analysis
        </h2>
        {analysis?.generatedAt && !analysis.error ? (
          <span className="text-xs text-muted-foreground/70">
            {dateTime(analysis.generatedAt)} · {analysis.model}
          </span>
        ) : null}
        <span aria-hidden className="h-px min-w-8 flex-1 bg-border" />
        {analysis ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs"
            disabled={isPending || isLoading}
            onClick={() => mutate(true)}
            title="Search for competitors again and rebuild the whole analysis"
          >
            <Search className="size-3.5" aria-hidden />
            Re-find competitors
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
          disabled={isPending || isLoading}
          onClick={() => mutate(false)}
        >
          <Sparkles className={cn("size-3.5", isPending && "animate-pulse")} aria-hidden />
          {isPending ? "Analysing…" : analysis ? "Regenerate" : "Generate"}
        </Button>
      </div>

      {error ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-destructive" aria-hidden />
              Analysis failed
            </CardTitle>
            <CardDescription className="whitespace-pre-wrap">{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {!analysis && !isPending ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Sparkles className="mx-auto size-5 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-sm font-medium">No analysis generated yet</p>
            <p className="mx-auto mt-1 max-w-lg text-xs leading-relaxed text-muted-foreground">
              Press Generate. With no competitors tracked yet, it will first search Instagram for
              accounts in the same niche, scrape them, and pick the most comparable &mdash; then
              write the competitive read and content ideas from that. Every figure it cites comes
              from scraped data; it is not allowed to compute or invent metrics.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {discovery ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="size-4" style={{ color: meta.color }} aria-hidden />
              How these competitors were found
            </CardTitle>
            <CardDescription>{discovery.niche}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-1.5">
              {discovery.searchQueries.map((query) => (
                <Badge key={query} variant="outline" className="font-normal">
                  {query}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {discovery.candidatesFound} accounts returned by search · {discovery.selected.length}{" "}
              selected as comparable
            </p>
            {discovery.selected.length ? (
              <ul className="divide-y">
                {discovery.selected.map((account) => (
                  <li key={account.handle} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <a
                        href={`https://www.instagram.com/${account.handle}/`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-sm font-medium underline underline-offset-4"
                      >
                        @{account.handle}
                      </a>
                      <span className="text-xs text-muted-foreground">{account.lane}</span>
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {account.followers.toLocaleString("en-US")} followers
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {account.whyComparable}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
            {discovery.note ? (
              <p className="border-l-2 border-border pl-3 text-xs leading-relaxed text-muted-foreground">
                {discovery.note}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {analyst ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4" style={{ color: meta.color }} aria-hidden />
              Your own performance
            </CardTitle>
            <CardDescription>
              Read from this account&apos;s measured figures alone — saves, shares and watch time
              are real here. No comparison to anyone else.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm leading-relaxed">{analyst.headline}</p>

            <TeamTakeaways items={analyst.teamTakeaways} color={meta.color} />

            <div className="grid gap-5 md:grid-cols-2">
              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Working
                </h3>
                <ul className="space-y-1.5">
                  {analyst.strengths.map((item) => (
                    <li key={item} className="flex gap-2 text-sm leading-relaxed">
                      <TrendingUp
                        className="mt-0.5 size-3.5 shrink-0"
                        style={{ color: meta.color }}
                        aria-hidden
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Not working
                </h3>
                <ul className="space-y-1.5">
                  {analyst.weaknesses.map((item) => (
                    <li key={item} className="flex gap-2 text-sm leading-relaxed">
                      <AlertTriangle
                        className="mt-0.5 size-3.5 shrink-0 text-amber-600"
                        aria-hidden
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
            {analyst.laneNotes.length ? (
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Lane by lane
                </h3>
                <ul className="space-y-2">
                  {analyst.laneNotes.map((note) => (
                    <li key={note.lane} className="text-sm">
                      <span className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium capitalize">{note.lane}</span>
                        <Badge
                          variant="secondary"
                          className={cn("font-medium", TONE_CLASS[note.tone])}
                        >
                          {note.verdict}
                        </Badge>
                      </span>
                      <span className="mt-0.5 block leading-relaxed text-muted-foreground">
                        {note.reasoning}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {reflection ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="size-4" style={{ color: meta.color }} aria-hidden />
              What past suggestions taught us
            </CardTitle>
            <CardDescription>
              Drawn only from suggestions that were actually filmed and measured. Qualitative by
              design — how confident to be is a separate, statistical question.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-relaxed">{reflection.overall}</p>
            {reflection.lessons?.length ? (
              <ul className="space-y-3">
                {(reflection.lessons ?? []).map((lesson) => (
                  <li key={lesson.lane} className="rounded-lg border bg-muted/40 p-3">
                    <span className="flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-medium capitalize">{lesson.lane}</span>
                      {!lesson.confirmed ? (
                        <Badge variant="secondary" className="bg-muted font-normal">
                          one or two posts — a hint
                        </Badge>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed">{lesson.lesson}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {lesson.evidence}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {competitors ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="size-4" style={{ color: meta.color }} aria-hidden />
                Competitive read
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-sm leading-relaxed">{competitors.headline}</p>

              <TeamTakeaways items={competitors.teamTakeaways} color={meta.color} />

              <div className="grid gap-5 md:grid-cols-2">
                {/* An empty list under a heading reads as a broken panel rather
                    than as "nothing here" — which is exactly what a cached
                    analysis written before this field existed produces. */}
                {competitors.contestedLanes.length ? (
                  <section>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Contested lanes
                    </h3>
                    <ul className="space-y-1.5">
                      {competitors.contestedLanes.map((item: string) => (
                        <li key={item} className="flex gap-2 text-sm leading-relaxed">
                          <TrendingUp
                            className="mt-0.5 size-3.5 shrink-0"
                            style={{ color: meta.color }}
                            aria-hidden
                          />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {competitors.openLanes.length ? (
                  <section>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Open lanes
                    </h3>
                    <ul className="space-y-1.5">
                      {competitors.openLanes.map((item: string) => (
                        <li key={item} className="flex gap-2 text-sm leading-relaxed">
                          <Target
                            className="mt-0.5 size-3.5 shrink-0"
                            style={{ color: meta.color }}
                            aria-hidden
                          />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>

              {competitors.verdicts.length ? (
                <section>
                  <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Account by account
                  </h3>
                  <ul className="divide-y">
                    {competitors.verdicts.map((verdict) => (
                      <li key={verdict.handle} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{verdict.handle}</span>
                          <span className="text-xs text-muted-foreground">{verdict.lane}</span>
                          <Badge
                            variant="secondary"
                            className={cn("ml-auto font-medium", TONE_CLASS[verdict.tone])}
                          >
                            {verdict.gap}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {verdict.reasoning}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}

      {trends ? (
        <FeedCard
          read={trends}
          title="Rising in this niche"
          description="Selected from a live search-trend feed, not from the model's memory. A reason to publish something now — never a reason to publish something off-voice."
          icon={Flame}
          color={meta.color}
        />
      ) : null}

      {questions ? (
        <FeedCard
          read={questions}
          title="What people are asking"
          description="Real questions pulled from a live feed. Demonstrated demand for an answer — it says nothing about what this account's own audience rewards."
          icon={HelpCircle}
          color={meta.color}
        />
      ) : null}

      {/* Real stories first: this is where a topic comes from, so it sits
          directly above the ideas built on it. */}
      <TopicInbox platform={platform} />

      {/* These carry a real subject and a full shot list, so this is where the
          "next reel to make" label belongs — not on the rule-based plays below,
          which can only describe a pattern. */}
      {analysis?.ideas?.length ? (
        <>
          <SectionHeading
            title={platform === "instagram" ? "Next reel to make" : "Next post to write"}
            note={
              // Only claim "a real story" when these ideas actually carry a
              // fetched source. Ideas written before sources existed would
              // otherwise inherit a provenance they never had.
              `${
                analysis.ideas.some((idea) => idea.source?.verified)
                  ? "Built on a real story, in your proven structure"
                  : "Written from your own measured performance"
              } — ${platform === "instagram" ? "full shot list" : "the full post"} inside each one`
            }
          />
          {analysis.dropped?.length ? (
            <p className="-mt-2 mb-3 text-xs text-muted-foreground">
              {analysis.dropped.length} idea{analysis.dropped.length === 1 ? " was" : "s were"}{" "}
              discarded for using a pattern the loop has blocked: {analysis.dropped.join("; ")}
            </p>
          ) : null}
          <AiIdeaCards
            ideas={analysis.ideas}
            platform={platform}
            generatedAt={analysis.generatedAt}
            model={analysis.model}
          />
        </>
      ) : null}
    </>
  );
}
