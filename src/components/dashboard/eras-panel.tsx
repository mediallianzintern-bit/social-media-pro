import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Flag, Loader2, X } from "lucide-react";
import { useState } from "react";

import { PLATFORM_META } from "@/lib/platform-meta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeading } from "@/components/dashboard/section-heading";
import { Input } from "@/components/ui/input";
import { confirmEra, erasQueryOptions, removeEra } from "@/lib/analytics.functions";
import type { PlatformId } from "@/lib/analytics-types";
import type { EraBoundary } from "@/lib/eras";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/**
 * Addendum D — when this account changed what it was doing.
 *
 * Every comparison the dashboard makes is against this account's own history,
 * and that is only fair within one strategy. The panel exists to let a person
 * say where the strategies divide, because the data cannot: a detector reads
 * output and sees the CONSEQUENCES of a decision, days or weeks after someone
 * made it, and cannot tell a deliberate pivot from a quiet month.
 *
 * So detection PROPOSES and a person CONFIRMS, and the two stay visibly
 * distinct afterwards. The proposal shows the arithmetic that produced it —
 * which lane gave way to which, how the format mix and posting rate moved —
 * so it can be disagreed with on the evidence rather than accepted on trust.
 */
export function ErasPanel({ platform }: { platform: PlatformId }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(erasQueryOptions(platform));
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  // The dashboard too: every page's "Since strategy change" reads its copy.
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: erasQueryOptions(platform).queryKey }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    ]);

  const accept = useMutation({
    mutationFn: (boundary: EraBoundary) =>
      confirmEra({
        data: {
          platform,
          startsAt: boundary.startsAt,
          label: labels[boundary.startsAt]?.trim() || `Era from ${boundary.startsAt}`,
          note: boundary.reason,
          origin: "detected",
          detection: {
            score: boundary.score,
            reason: boundary.reason,
            evidence: boundary.evidence,
          },
        },
      }),
    onSuccess: invalidate,
    onError: (error) => setFailure(String(error)),
  });

  // A date set by hand (19 Nov 2026): a change the data has not shown yet, or
  // one on an account where nothing was detected, such as LinkedIn.
  const [manualDate, setManualDate] = useState("");
  const [manualLabel, setManualLabel] = useState("");
  const setByHand = useMutation({
    mutationFn: () =>
      confirmEra({
        data: {
          platform,
          startsAt: manualDate,
          label: manualLabel.trim() || `Era from ${manualDate}`,
          origin: "manual",
        },
      }),
    onSuccess: () => {
      setManualDate("");
      setManualLabel("");
      void invalidate();
    },
    onError: (error) => setFailure(String(error)),
  });

  const drop = useMutation({
    mutationFn: (id: string) => removeEra({ data: { id } }),
    onSuccess: invalidate,
    onError: (error) => setFailure(String(error)),
  });

  const eras = data?.eras ?? [];
  const proposed = data?.proposed ?? [];

  return (
    <>
      <SectionHeading title={PLATFORM_META[platform].label} />
      <Card>
        <CardContent className="space-y-4 p-5">
          <p className="text-sm text-muted-foreground">
            The account is compared with its own past only since its last strategy change, so the
            comparison stays fair.
          </p>

          {eras.length ? (
            <ul className="divide-y">
              {eras.map((era) => (
                <li key={era.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <Flag className="size-3.5 text-muted-foreground" aria-hidden />
                  <span className="text-sm font-medium">
                    Strategy change on {day(era.startsAt)}
                  </span>
                  <Badge variant="outline" className="font-normal text-muted-foreground">
                    {era.origin === "detected" ? "found in the data, confirmed" : "set by hand"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-auto px-2 py-1 text-xs text-muted-foreground"
                    onClick={() => drop.mutate(era.id)}
                    disabled={drop.isPending}
                  >
                    <X className="size-3" aria-hidden />
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          {proposed.length ? (
            <div className="space-y-3 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">
                {proposed.length} possible change{proposed.length === 1 ? "" : "s"} found in the
                data. Confirm one only if it matches a decision you actually made.
              </p>
              {proposed.map((boundary) => (
                <div key={boundary.startsAt} className="space-y-2 rounded-md border p-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium">{day(boundary.startsAt)}</span>
                    <span className="text-xs text-muted-foreground">{boundary.reason}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Lane mix moved {Math.round(boundary.evidence.laneShift * 100)}%, format mix{" "}
                    {Math.round(boundary.evidence.formatShift * 100)}%, posting{" "}
                    {boundary.evidence.cadence[0]} → {boundary.evidence.cadence[1]} a week.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      value={labels[boundary.startsAt] ?? ""}
                      onChange={(event) =>
                        setLabels((current) => ({
                          ...current,
                          [boundary.startsAt]: event.target.value,
                        }))
                      }
                      placeholder="What changed? e.g. Moved to marketing stunts"
                      className="h-8 max-w-xs text-sm"
                    />
                    <Button
                      size="sm"
                      onClick={() => accept.mutate(boundary)}
                      disabled={accept.isPending}
                    >
                      {accept.isPending ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Check className="size-3.5" aria-hidden />
                      )}
                      Confirm era
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">
              {eras.length
                ? "Changed strategy again? Set the date by hand."
                : `No strategy change set for ${PLATFORM_META[platform].label} yet. Set the date it changed by hand.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                type="date"
                value={manualDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(event) => setManualDate(event.target.value)}
                className="h-9 w-40 text-sm"
                aria-label={`${PLATFORM_META[platform].label} strategy change date`}
              />
              <Input
                value={manualLabel}
                onChange={(event) => setManualLabel(event.target.value)}
                placeholder="What changed? e.g. Started writing articles"
                className="h-9 max-w-xs text-sm"
              />
              <Button
                size="sm"
                className="h-9"
                onClick={() => setByHand.mutate()}
                disabled={!manualDate || setByHand.isPending}
              >
                {setByHand.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Check className="size-3.5" aria-hidden />
                )}
                Set date
              </Button>
            </div>
          </div>

          {failure ? <p className="text-xs text-destructive">{failure}</p> : null}
        </CardContent>
      </Card>
    </>
  );
}
