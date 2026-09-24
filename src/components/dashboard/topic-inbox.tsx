import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Flame, Loader2, Newspaper, RefreshCw, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { SectionHeading } from "@/components/dashboard/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  analysisQueryOptions,
  generateOneIdea,
  refreshTopics,
  topicInboxQueryOptions,
} from "@/lib/analytics.functions";
import { dateTime } from "@/lib/format";
import { PLATFORM_META } from "@/lib/platform-meta";
import { ageDays, TRENDING_COVERAGE } from "@/lib/sources";
import { cn } from "@/lib/utils";
import type { PlatformId } from "@/lib/analytics-types";

/** Rows shown before "show more" — enough to choose from without a wall of headlines. */
const PAGE = 8;

/**
 * Topics in the news — real stories for this account's lanes, fetched from a
 * live news search.
 *
 * Nothing in this list is generated. Every row is an article that existed when
 * it was fetched, with its outlet and date, and the headline links to it. The
 * one action that spends anything — "Write script" — is a button per story, so
 * a model call only ever happens because someone chose that story.
 *
 * Client-side query, like the rest of the AI layer: the inbox is not part of
 * the server render, so SSR and hydration always agree on an empty first frame.
 */
export function TopicInbox({ platform }: { platform: PlatformId }) {
  const meta = PLATFORM_META[platform];
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(topicInboxQueryOptions(platform));
  const [lane, setLane] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [writtenFor, setWrittenFor] = useState<string | null>(null);

  const refresh = useMutation({
    mutationFn: () => refreshTopics({ data: { platform, force: true } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: topicInboxQueryOptions(platform).queryKey }),
  });

  const write = useMutation({
    mutationFn: (sourceId: string) => generateOneIdea({ data: { platform, sourceId } }),
    onSuccess: (result, sourceId) => {
      if (result.analysis) {
        queryClient.setQueryData(analysisQueryOptions(platform).queryKey, result.analysis);
      }
      if (result.idea) setWrittenFor(sourceId);
      void queryClient.invalidateQueries({ queryKey: topicInboxQueryOptions(platform).queryKey });
    },
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const lanes = useMemo(
    () => [
      ...new Set(items.map((item) => item.lane).filter((value): value is string => Boolean(value))),
    ],
    [items],
  );
  const filtered = lane ? items.filter((item) => item.lane === lane) : items;
  const visible = expanded ? filtered : filtered.slice(0, PAGE);
  const trending = items.filter((item) => item.coverage >= TRENDING_COVERAGE).length;

  const noun = platform === "instagram" ? "reel" : "post";

  return (
    <>
      <SectionHeading
        title="Topics in the news"
        note="Fetched from a live news search for your lanes — nothing here is generated"
      />
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">
              {isLoading
                ? "Loading stories…"
                : items.length
                  ? `${items.length} stories from the last two weeks${trending ? `, ${trending} carried by more than one outlet` : ""}.`
                  : "No stories stored yet."}
              {data?.lastFetchedAt ? ` Last fetched ${dateTime(data.lastFetchedAt)}.` : ""}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto gap-1.5"
              disabled={refresh.isPending}
              onClick={() => refresh.mutate()}
            >
              <RefreshCw
                className={cn("size-3.5", refresh.isPending && "animate-spin")}
                aria-hidden
              />
              {refresh.isPending ? "Fetching…" : "Refresh topics"}
            </Button>
          </div>

          {refresh.data && !refresh.data.ran && refresh.data.reason ? (
            <p className="text-xs text-muted-foreground">{refresh.data.reason}</p>
          ) : null}
          {refresh.data?.reason && refresh.data.ran ? (
            <p className="text-xs text-destructive">{refresh.data.reason}</p>
          ) : null}
          {refresh.data?.failures.length ? (
            <p className="text-xs text-destructive">
              Some searches failed: {refresh.data.failures.join("; ")}
            </p>
          ) : null}

          {lanes.length > 1 ? (
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by lane">
              {[null, ...lanes].map((value) => (
                <button
                  key={value ?? "all"}
                  type="button"
                  role="tab"
                  aria-selected={lane === value}
                  onClick={() => {
                    setLane(value);
                    setExpanded(false);
                  }}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                    lane === value
                      ? "border-foreground/30 bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {value ?? "All lanes"}
                </button>
              ))}
            </div>
          ) : null}

          {visible.length ? (
            <ul className="divide-y">
              {visible.map((item) => {
                const age = ageDays(item.publishedAt);
                const pending = write.isPending && write.variables === item.id;
                const justWritten = writtenFor === item.id;
                return (
                  <li
                    key={item.id}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="group inline-flex items-start gap-1.5 text-sm font-medium leading-snug hover:underline"
                      >
                        <Newspaper
                          className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <span>{item.title}</span>
                        <ExternalLink
                          className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                          aria-hidden
                        />
                      </a>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-5 text-xs text-muted-foreground">
                        {item.publisher ? (
                          <span className="font-medium">{item.publisher}</span>
                        ) : null}
                        {age != null ? <span>{age === 0 ? "today" : `${age}d ago`}</span> : null}
                        {item.lane ? <span>· {item.lane}</span> : null}
                        {item.coverage >= TRENDING_COVERAGE ? (
                          <Badge variant="secondary" className="gap-1 font-normal">
                            <Flame className="size-3" style={{ color: meta.color }} aria-hidden />
                            {item.coverage} outlets
                          </Badge>
                        ) : null}
                      </p>
                    </div>
                    <div className="shrink-0 pl-5 sm:pl-0">
                      {item.used || justWritten ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                          <Check className="size-3.5" aria-hidden />
                          {justWritten ? `Written — first under "Next ${noun}"` : "Already an idea"}
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={write.isPending}
                          onClick={() => write.mutate(item.id)}
                          title="Uses one AI call"
                        >
                          {pending ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Sparkles className="size-3.5" aria-hidden />
                          )}
                          {pending ? "Writing…" : "Write script"}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : !isLoading ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {data && !data.storable
                ? "Stories can't be stored until database migration 0010 has been applied. Run it in Supabase, then refresh."
                : "Press Refresh topics to fetch this fortnight's stories for your lanes. It's free — a public news search."}
            </p>
          ) : null}

          {filtered.length > PAGE ? (
            <Button variant="ghost" size="sm" onClick={() => setExpanded((value) => !value)}>
              {expanded ? "Show fewer" : `Show all ${filtered.length}`}
            </Button>
          ) : null}

          {write.data && !write.data.idea ? (
            <p className="text-xs text-destructive">{write.data.reason}</p>
          ) : null}
          {write.error ? (
            <p className="text-xs text-destructive">
              {write.error instanceof Error
                ? write.error.message
                : "Couldn't write a script for that story."}
            </p>
          ) : null}

          <p className="text-[11px] text-muted-foreground">
            &ldquo;Write script&rdquo; uses one AI call and builds a {noun} on that story in this
            account&rsquo;s proven structure. Refreshing is free.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
