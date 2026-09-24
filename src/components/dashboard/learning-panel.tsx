import { AlertTriangle, Check, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { compactNumber, shortDate } from "@/lib/format";
import { HOOK_LABEL } from "@/lib/script-features";
import { BLOCK_MIN_MEASURED } from "@/lib/loop";
import {
  THIN_LANE,
  type LanePerformance,
  type PlatformData,
  type ScriptPatternScore,
  type SuggestionFeedback,
} from "@/lib/analytics-types";

type Learning = NonNullable<PlatformData["learning"]>;

const pct = (value: number) => `${(value * 100).toFixed(0)}%`;

/** Colours a multiple of the account's own median: 1.0 is par. */
function multipleClass(value: number): string {
  if (value >= 1.25) return "text-emerald-700 dark:text-emerald-400";
  if (value <= 0.8) return "text-destructive";
  return "";
}

/**
 * Content lanes — what the account publishes, scored against itself.
 *
 * The column that matters is output against performance. A lane can be most of
 * what an account makes and still be its weakest work, and that is invisible
 * from volume or from totals; only the two shares side by side show it.
 */
/**
 * A lane's multiple on the metric the client is actually judged on.
 *
 * Coloured against 1.0 like the reach column, but the two are allowed to
 * disagree loudly — that disagreement IS the information. A lane sitting red on
 * reach and green here is not a contradiction to be smoothed over; it is a lane
 * that few people see and the ones who do act on, which is exactly the case the
 * reel suggestions are built to find.
 *
 * `sample` hedges the figure rather than the lane. A multiple built on two
 * measured posts inside a thirteen-post lane would otherwise print with the
 * same authority as one built on all thirteen, because the lane-level thin
 * flag never fires.
 */
function GoalCell({ read }: { read: GoalByLane[number] | undefined }) {
  if (!read || read.multiple == null) {
    return (
      <TableCell className="text-right tabular-nums text-muted-foreground">
        <span title="Not measured for this lane">&mdash;</span>
      </TableCell>
    );
  }

  const thin = read.sample != null && read.sample < THIN_LANE;
  return (
    <TableCell
      className={cn("text-right font-medium tabular-nums", !thin && multipleClass(read.multiple))}
    >
      {read.multiple.toFixed(2)}×
      {thin ? (
        <AlertTriangle
          className="ml-1.5 inline size-3 text-amber-600"
          aria-label={`Based on ${read.sample} post(s) with ${read.metric} data`}
        />
      ) : null}
    </TableCell>
  );
}

type GoalByLane = NonNullable<Learning["goalByLane"]>;

function LanesTable({
  lanes,
  stale,
  goalByLane,
}: {
  lanes: LanePerformance[];
  stale: boolean;
  goalByLane: GoalByLane;
}) {
  const goalFor = new Map(goalByLane.map((entry) => [entry.lane, entry]));
  // Every lane reports the same goal metric, so the header can name it once
  // rather than repeating it in every cell.
  const goalMetric = goalByLane.find((entry) => entry.metric)?.metric ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Content lanes</CardTitle>
        <CardDescription>
          Every figure is relative to this account&apos;s own median, so a lane that reads 1.8× is
          doing nearly twice its typical numbers. Where share of output runs well ahead of share of
          performance, that lane is absorbing effort it isn&apos;t repaying.
          {goalMetric ? (
            <>
              {" "}
              <strong className="font-medium text-foreground">
                Reach and {goalMetric} can disagree, and {goalMetric} is the one this account is
                judged on
              </strong>{" "}
              — a lane can be seen by few people and still be the one worth making, which is why the
              reel suggestions are ordered by that column and not by reach.
            </>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[160px]">Lane</TableHead>
                <TableHead className="text-right">Posts</TableHead>
                <TableHead className="text-right">Reach vs median</TableHead>
                {goalMetric ? (
                  <TableHead className="text-right whitespace-nowrap">
                    {/* first-letter, not capitalize: "Save rate", not "Save Rate". */}
                    <span className="inline-block first-letter:uppercase">{goalMetric}</span> vs
                    median
                    <span className="ml-1 font-normal text-muted-foreground">(the goal)</span>
                  </TableHead>
                ) : null}
                <TableHead className="text-right">Share of output</TableHead>
                <TableHead className="text-right">Share of performance</TableHead>
                <TableHead className="text-right">Med. saves</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lanes.map((lane) => {
                const drag = (lane.shareOfOutputPct - lane.shareOfPerformancePct) / 100;
                return (
                  <TableRow key={lane.lane}>
                    <TableCell className="whitespace-nowrap font-medium capitalize">
                      {lane.lane}
                      {lane.directional ? (
                        <AlertTriangle
                          className="ml-1.5 inline size-3 text-amber-600"
                          aria-label={`Fewer than ${THIN_LANE} posts`}
                        />
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{lane.postCount}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular-nums",
                        multipleClass(lane.medianVsMedian),
                      )}
                    >
                      {lane.medianVsMedian.toFixed(2)}×
                    </TableCell>
                    {goalMetric ? <GoalCell read={goalFor.get(lane.lane)} /> : null}
                    <TableCell className="text-right tabular-nums">
                      {lane.shareOfOutputPct}%
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        // Only flagged when the gap is wide enough to act on.
                        drag > 0.15 && "text-destructive",
                        drag < -0.15 && "text-emerald-700 dark:text-emerald-400",
                      )}
                    >
                      {lane.shareOfPerformancePct}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {lane.medianSaves === undefined ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        compactNumber(lane.medianSaves)
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {lanes.some((lane) => lane.directional) ||
        goalByLane.some((entry) => entry.sample != null && entry.sample < THIN_LANE) ? (
          <p className="border-l-2 border-amber-500/50 pl-3 text-xs leading-relaxed text-muted-foreground">
            A <AlertTriangle className="inline size-3 text-amber-600" aria-hidden /> on the lane
            name means fewer than {THIN_LANE} posts in it. On a figure, it means that figure rests
            on fewer than {THIN_LANE} posts that actually carried the metric — which can happen in a
            lane wide enough to look solid. Either way one post moves the median a long way, so read
            it as a direction to test, not a result.
          </p>
        ) : null}
        {stale ? (
          <p className="border-l-2 border-border pl-3 text-xs leading-relaxed text-muted-foreground">
            A growing share of posts fit none of these lanes, which usually means the account&apos;s
            content has moved on. The vocabulary is deliberately not rebuilt automatically —
            renaming lanes would break every comparison already made against them.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * The scorecard: did this system's own advice actually work?
 *
 * The only place in the dashboard reporting on itself. Everything else observes
 * the account; this measures whether acting on the suggestions beat what the
 * account would have done anyway — on the metric the suggestions were CHOSEN
 * for. Grading them on views while choosing them for saves was the loop's
 * original bug, and the header names the graded metric so it can't recur
 * unnoticed.
 */
function Scorecard({ feedback }: { feedback: SuggestionFeedback }) {
  const hits = feedback.outcomes.filter((outcome) => outcome.hit).length;
  const features: Array<{ key: ScriptPatternScore["feature"]; title: string }> = [
    { key: "hookType", title: "Opening" },
    { key: "lengthBucket", title: "Length" },
    { key: "ctaType", title: "Ending" },
    { key: "format", title: "Format" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-muted-foreground" aria-hidden />
          Did the suggestions work?
        </CardTitle>
        <CardDescription>
          {feedback.measured} published post{feedback.measured === 1 ? "" : "s"} came from a
          suggestion, each graded a week after publishing on <strong>{feedback.gradedOn}</strong>{" "}
          against this account&rsquo;s own median.
          {feedback.awaitingData > 0
            ? ` ${feedback.awaitingData} more ${feedback.awaitingData === 1 ? "is" : "are"} linked and waiting for its week to finish.`
            : ""}
          {feedback.excludedPinned > 0
            ? ` ${feedback.excludedPinned} pinned ${feedback.excludedPinned === 1 ? "post is" : "posts are"} excluded — a pinned post collects views the rest of the feed never sees, and counting it here would flatter this score.`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-6">
          {/* Spec §7's headline number, first because it answers the question
              the card asks. Scores are multiples of the account's own median,
              so the account's typical post is 1.00× by construction. */}
          <div>
            <p className="text-xs font-medium text-muted-foreground">Filmed vs your median</p>
            <p
              className={cn(
                "mt-1 text-2xl font-semibold tabular-nums",
                multipleClass(feedback.overall.medianScore),
              )}
            >
              {feedback.overall.medianScore.toFixed(2)}×
            </p>
            <p className="text-xs text-muted-foreground">
              {feedback.overall.beatsMedian ? "above" : "below"} your typical post on{" "}
              {feedback.gradedOn} (1.00×) · reach {feedback.overall.medianReach.toFixed(2)}×
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Hits</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {hits} / {feedback.measured}
            </p>
          </div>
          {feedback.byLane.length ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Strongest lane</p>
              <p className="mt-1 text-2xl font-semibold capitalize tabular-nums">
                {feedback.byLane[0]?.lane}
              </p>
              <p className="text-xs text-muted-foreground">
                {feedback.byLane[0]?.medianScore.toFixed(2)}× median {feedback.gradedOn}
              </p>
            </div>
          ) : null}
        </div>

        {feedback.blocked.length ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-destructive">
              Blocked for now
            </p>
            <ul className="space-y-1 text-sm">
              {feedback.blocked.map((entry) => (
                <li key={`${entry.kind}:${entry.value}`} className="flex flex-wrap gap-x-2">
                  <span className="font-medium capitalize">
                    {entry.kind === "hookType"
                      ? (HOOK_LABEL[entry.value as keyof typeof HOOK_LABEL] ?? entry.value)
                      : entry.value}
                  </span>
                  <span className="text-muted-foreground">
                    {entry.kind === "hookType" ? "opening" : entry.kind} · {entry.hits} of{" "}
                    {entry.measured} hit · back in rotation {shortDate(entry.expiresAt)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              A pattern is blocked after {BLOCK_MIN_MEASURED} measured tries with at most one hit.
              Blocked lanes are removed from what the next generation may choose, and any idea using
              a blocked trait or opening is discarded before it is saved.
            </p>
          </div>
        ) : null}

        {feedback.byLane.length ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              By lane
            </p>
            <ul className="space-y-1.5">
              {feedback.byLane.map((lane) => (
                <li key={lane.lane} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate capitalize">{lane.lane}</span>
                  <span className="text-xs text-muted-foreground">
                    {lane.count} post{lane.count === 1 ? "" : "s"}
                  </span>
                  <span
                    className={cn(
                      "w-14 text-right font-medium tabular-nums",
                      multipleClass(lane.medianScore),
                    )}
                  >
                    {lane.medianScore.toFixed(2)}×
                  </span>
                  <Badge variant="secondary" className="w-16 justify-center font-normal">
                    {pct(lane.hitRate)} hit
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Which script shapes win
          </p>
          {feedback.byScript.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {features.map(({ key, title }) => {
                const rows = feedback.byScript.filter((row) => row.feature === key);
                if (!rows.length) return null;
                return (
                  <div key={key}>
                    <p className="mb-1 text-xs text-muted-foreground">{title}</p>
                    <ul className="space-y-1">
                      {rows.map((row) => (
                        <li key={row.value} className="flex items-center gap-2 text-sm">
                          <span className="min-w-0 flex-1 truncate">{row.label}</span>
                          <span className="text-xs text-muted-foreground">×{row.count}</span>
                          <span
                            className={cn(
                              "w-12 text-right font-medium tabular-nums",
                              multipleClass(row.medianScore),
                            )}
                          >
                            {row.medianScore.toFixed(2)}×
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Needs at least two filmed scripts sharing a shape before it can say which shape wins.
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Every suggestion filmed
          </p>
          <ul className="space-y-2">
            {feedback.outcomes.map((outcome, index) => (
              <li
                key={`${outcome.publishedAt}-${index}`}
                className="flex items-start gap-2 text-sm"
              >
                {outcome.hit ? (
                  <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden />
                ) : (
                  <X className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{outcome.hook}</span>
                  <span className="block text-xs text-muted-foreground">
                    {outcome.publishedAt} · {outcome.winningTrait}
                    {outcome.features
                      ? ` · ${HOOK_LABEL[outcome.features.hookType].toLowerCase()}`
                      : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span
                    className={cn("block font-medium tabular-nums", multipleClass(outcome.score))}
                  >
                    {outcome.score.toFixed(2)}×
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {outcome.gradedOn}
                    {outcome.goalVsMedian != null ? ` · reach ${outcome.vsMedian.toFixed(1)}×` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="border-l-2 border-border pl-3 text-xs leading-relaxed text-muted-foreground">
          Every figure here is computed in code, not by the model — the point of measuring the
          advice is defeated if the thing being measured also does the measuring.
        </p>
      </CardContent>
    </Card>
  );
}

export function LearningPanel({ learning }: { learning: Learning }) {
  const { lanes, suggestions, taxonomyStale } = learning;
  if (!lanes.length && !suggestions) return null;

  return (
    <div className="space-y-4">
      {lanes.length ? (
        <LanesTable lanes={lanes} stale={taxonomyStale} goalByLane={learning.goalByLane ?? []} />
      ) : null}
      {suggestions && suggestions.measured > 0 ? <Scorecard feedback={suggestions} /> : null}
    </div>
  );
}
