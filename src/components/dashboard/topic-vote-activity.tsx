import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { topicFeedbackQueryOptions } from "@/lib/analytics.functions";
import type { PlatformId } from "@/lib/analytics-types";
import { Card, CardContent } from "@/components/ui/card";

const dateInIndia = (value: string | Date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(value));
const kinds = { source: "News topic", trend: "Rising post", idea: "Script idea" };

export function TopicVoteActivity({ platform }: { platform: PlatformId }) {
  const { data, isPending, isError } = useQuery(topicFeedbackQueryOptions(platform));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const date = selectedDate ?? dateInIndia(new Date());
  const votes = (data?.activity ?? []).filter((vote) => dateInIndia(vote.createdAt) === date);
  const categories = [...new Set(votes.map((vote) => vote.lane || "Uncategorised"))].sort();
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Tick and cross activity</h3>
          <label className="flex items-center gap-2 text-xs">
            Date (IST)
            <input type="date" aria-label="Feedback date in India time" value={date}
              onChange={(event) => setSelectedDate(event.target.value || null)}
              className="rounded-md border bg-background px-2 py-1.5 text-sm" />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">Latest saved choice per item, grouped by its last vote date. Includes news topics, rising posts and script ideas. Changed votes replace earlier choices; cleared votes disappear. Up to 2,000 latest saved items are available.</p>
        {isError ? <p role="alert" className="text-sm text-destructive">Could not load feedback. Please try again.</p> : isPending ?
          <p className="text-sm text-muted-foreground">Loading feedback…</p> : <>
          <p className="text-sm font-medium" aria-live="polite">{votes.filter((v) => v.verdict === "like").length} ticked · {votes.filter((v) => v.verdict === "dislike").length} crossed · {votes.length} items</p>
          {!votes.length ? <p className="text-sm text-muted-foreground">No saved choices for this date.</p> : <>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => {
                const rows = votes.filter((v) => (v.lane || "Uncategorised") === category);
                return <span key={category} className="rounded-md bg-muted px-2 py-1 text-xs">{category}: {rows.filter((v) => v.verdict === "like").length} ticked, {rows.filter((v) => v.verdict === "dislike").length} crossed</span>;
              })}
            </div>
            <details>
              <summary className="cursor-pointer text-sm font-medium">View topics and dates</summary>
              <ul className="mt-3 max-h-96 divide-y overflow-auto">
                {votes.map((vote) => <li key={`${vote.kind}:${vote.itemId}`} className="space-y-1 py-3 text-sm">
                  <p><span className={vote.verdict === "like" ? "font-medium text-emerald-700" : "font-medium text-destructive"}>{vote.verdict === "like" ? "✓ Ticked" : "× Crossed"}</span> · {vote.text}</p>
                  <p className="text-xs text-muted-foreground">{vote.lane || "Uncategorised"} · {kinds[vote.kind]} · {new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(vote.createdAt))} IST</p>
                </li>)}
              </ul>
            </details>
          </>}
        </>}
      </CardContent>
    </Card>
  );
}
