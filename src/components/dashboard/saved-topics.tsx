import { useQueries } from "@tanstack/react-query";
import { ExternalLink, Flame, Newspaper } from "lucide-react";
import { useMemo, useState } from "react";

import { SaveTopicButton } from "@/components/dashboard/save-topic-button";
import { SectionHeading } from "@/components/dashboard/section-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { savedTopicsQueryOptions } from "@/lib/analytics.functions";
import { dateTime } from "@/lib/format";
import { PLATFORM_META } from "@/lib/platform-meta";
import { cn } from "@/lib/utils";
import type { PlatformId } from "@/lib/analytics-types";
import type { SavedTopic } from "@/lib/saved-topics";

const PLATFORMS: PlatformId[] = ["instagram", "linkedin"];

/**
 * The Saved screen — the team's shared shortlist.
 *
 * Everything the team bookmarked from "Topics in the news" and "Rising on
 * <platform>", newest first, across both platforms. The lane separator is the
 * same tab row as the news inbox, deliberately: a team that learned to filter
 * by lane there should find the same control here. Every row keeps its own
 * save button, so a topic can be taken off the shortlist from the one place
 * built to hold it.
 */
export function SavedTopics() {
  const results = useQueries({
    queries: PLATFORMS.map((platform) => savedTopicsQueryOptions(platform)),
  });
  const isLoading = results.some((result) => result.isLoading);

  const items = useMemo(() => {
    const all = results.flatMap((result) => result.data?.saved ?? []);
    return [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [results]);

  const [lane, setLane] = useState<string | null>(null);
  const lanes = useMemo(
    () => [
      ...new Set(items.map((item) => item.lane).filter((value): value is string => Boolean(value))),
    ],
    [items],
  );
  const filtered = lane ? items.filter((item) => item.lane === lane) : items;

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Topics the team saved from the news inbox and the rising-posts lists. A shared shortlist —
        anyone can add to it, and it stays here until someone takes it off. Nothing here is
        generated and saving spends nothing.
      </p>

      <SectionHeading
        title="Saved topics"
        note={
          isLoading
            ? "Loading…"
            : items.length
              ? `${items.length} saved across Instagram and LinkedIn`
              : "Nothing saved yet"
        }
      />

      <Card>
        <CardContent className="space-y-4 p-5">
          {lanes.length > 1 ? (
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by lane">
              {[null, ...lanes].map((value) => (
                <button
                  key={value ?? "all"}
                  type="button"
                  role="tab"
                  aria-selected={lane === value}
                  onClick={() => setLane(value)}
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

          {filtered.length ? (
            <ul className="divide-y">
              {filtered.map((item) => (
                <SavedRow key={`${item.platform}:${item.kind}:${item.itemId}`} item={item} />
              ))}
            </ul>
          ) : !isLoading ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {items.length
                ? "No saved topics in this lane."
                : "Press Save on a story in Topics in the news, or on a post in Rising on Instagram, and it will appear here."}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function SavedRow({ item }: { item: SavedTopic }) {
  const meta = PLATFORM_META[item.platform];
  const Icon = item.kind === "trend" ? Flame : Newspaper;

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="min-w-0 flex-1">
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            className="group inline-flex items-start gap-1.5 text-sm font-medium leading-snug hover:underline"
          >
            <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span>{item.title}</span>
            <ExternalLink
              className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          </a>
        ) : (
          <span className="inline-flex items-start gap-1.5 text-sm font-medium leading-snug">
            <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span>{item.title}</span>
          </span>
        )}
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-5 text-xs text-muted-foreground">
          <span
            className="inline-flex items-center gap-1 font-medium"
            style={{ color: meta.color }}
          >
            <meta.icon className="size-3" aria-hidden />
            {meta.label}
          </span>
          <span>· {item.kind === "trend" ? "Rising post" : "News story"}</span>
          {item.sourceLabel ? <span>· {item.sourceLabel}</span> : null}
          {item.lane ? <span>· {item.lane}</span> : null}
          <span>· saved {dateTime(item.createdAt)}</span>
          {item.actor ? <span>by {item.actor}</span> : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-5 sm:pl-0">
        <Badge variant="outline" className="font-normal capitalize">
          {item.lane ?? "no lane"}
        </Badge>
        <SaveTopicButton
          platform={item.platform}
          kind={item.kind}
          itemId={item.itemId}
          title={item.title}
          url={item.url}
          sourceLabel={item.sourceLabel}
          lane={item.lane}
        />
      </div>
    </li>
  );
}
