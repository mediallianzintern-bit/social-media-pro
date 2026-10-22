import { AlertTriangle } from "lucide-react";

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
import { compactNumber } from "@/lib/format";
import { THIN_LANE, type LanePerformance, type PlatformData } from "@/lib/analytics-types";

type Learning = NonNullable<PlatformData["learning"]>;

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

export function LearningPanel({ learning }: { learning: Learning }) {
  const { lanes, taxonomyStale } = learning;
  // "Did the suggestions work?" was shown here. Hidden on 22 Oct 2026: it
  // graded reels a week in on save rate, and the Filmed reels page now shows
  // how each filmed reel did, in more depth. The outcome scores are still
  // captured on every sync for predictions, the client report and reactions.
  if (!lanes.length) return null;

  return (
    <div className="space-y-4">
      <LanesTable lanes={lanes} stale={taxonomyStale} goalByLane={learning.goalByLane ?? []} />
    </div>
  );
}
