import { UserPlus } from "lucide-react";

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
import { compactNumber, percent } from "@/lib/format";
import type { CompetitorRecord } from "@/lib/analytics-types";

export interface BenchmarkRow extends CompetitorRecord {
  isYou?: boolean;
  /** Computed verdict against the owner row. */
  gap?: { label: string; tone: "good" | "bad" | "warn" | "neutral" };
}

const TONE_CLASS: Record<"good" | "bad" | "warn" | "neutral", string> = {
  good: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  bad: "bg-destructive/10 text-destructive",
  warn: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  neutral: "bg-muted text-muted-foreground",
};

/**
 * Head-to-head against tracked rivals. Every cell is scraped on the same
 * schedule with the same actors as the owner account, so the numbers are
 * directly comparable rather than assembled from different sources.
 */
export function CompetitorTable({
  rows,
  viewsLabel,
  envVar,
}: {
  rows: BenchmarkRow[];
  viewsLabel: string;
  envVar: string;
}) {
  const hasRivals = rows.some((row) => !row.isYou);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Competitor benchmarking</CardTitle>
        <CardDescription>
          Rivals are scraped with the same actors on the same schedule, so these columns are
          like-for-like.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasRivals ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">Account</TableHead>
                  <TableHead className="text-right">Followers</TableHead>
                  <TableHead className="text-right">Posts / wk</TableHead>
                  <TableHead className="text-right">Med. views</TableHead>
                  <TableHead className="text-right">Med. interactions</TableHead>
                  <TableHead className="text-right">Eng. rate</TableHead>
                  <TableHead>Gap vs you</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.handle} className={cn(row.isYou && "bg-muted/40 font-medium")}>
                    <TableCell className="whitespace-nowrap">
                      <span className="font-medium">{row.displayName || row.handle}</span>
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        {row.isYou ? "You" : `@${row.handle}`}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {compactNumber(row.followers)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.postsPerWeek ? row.postsPerWeek.toFixed(1) : "—"}
                    </TableCell>
                    {/* Views cannot be compared across accounts.
                        The owner's come from Graph (the platform's own count);
                        competitors' are scraped from public pages, and no Graph
                        figure can ever exist for them. On this account the two
                        differ by a median of 2.28x, so showing them in one
                        column would hand the owner a 2x advantage that is
                        purely a measurement artefact. The owner's own views are
                        reported in full on their posts table, where nothing is
                        being compared. */}
                    <TableCell
                      className="text-right text-xs tabular-nums text-muted-foreground"
                      title={
                        row.isYou
                          ? "Your views come from Instagram's own API; competitors' are scraped from public pages. The two measure different things, so they are not compared here."
                          : "Only scraped views exist for other accounts, and yours come from Instagram's own API — the two are not like-for-like."
                      }
                    >
                      not comparable
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.medianEngagements ? compactNumber(row.medianEngagements) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.engagementRate ? percent(row.engagementRate, 2) : "—"}
                    </TableCell>
                    <TableCell>
                      {row.gap ? (
                        <Badge
                          variant="secondary"
                          className={cn("font-medium", TONE_CLASS[row.gap.tone])}
                        >
                          {row.gap.label}
                        </Badge>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <UserPlus className="mx-auto size-5 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-sm font-medium">No competitors tracked yet</p>
            <p className="mx-auto mt-1 max-w-lg text-xs leading-relaxed text-muted-foreground">
              Add handles to <code className="rounded bg-muted px-1 py-0.5">{envVar}</code> in{" "}
              <code className="rounded bg-muted px-1 py-0.5">.env</code> as a comma-separated list,
              restart, and press Sync. Each handle is scraped every sync and billed by Apify, so the
              list is opt-in.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
