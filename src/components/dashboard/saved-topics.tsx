import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  FileText,
  Flame,
  Loader2,
  Newspaper,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

import { AiIdeaCards } from "@/components/dashboard/ai-idea-cards";
import { SaveTopicButton } from "@/components/dashboard/save-topic-button";
import { SectionHeading } from "@/components/dashboard/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  analysisQueryOptions,
  generateOneIdea,
  getScriptForSource,
  savedTopicsQueryOptions,
  topicInboxQueryOptions,
} from "@/lib/analytics.functions";
import { dateTime } from "@/lib/format";
import { PLATFORM_META } from "@/lib/platform-meta";
import { isAiToolWorkflowLane } from "@/lib/tool-workflow";
import { cn } from "@/lib/utils";
import type { ContentIdea } from "@/lib/ai-types";
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
      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-5 sm:pl-0">
        {item.kind === "source" ? <ScriptActions item={item} /> : null}
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

/**
 * "Write script" for a saved news story — the same action, and the same AI
 * call, as the button in Topics in the news, so a story the team saved can be
 * scripted from the shortlist without hunting for it in the inbox.
 *
 * It first asks whether this story already has a script. If it does, the
 * button reads "View script" and opens it in the same drawer the inbox uses,
 * rather than offering to spend a second call on a story already written.
 * AI tool workflow stories also get "Regenerate", as they do in the inbox.
 *
 * News stories only. A saved rising post is a competitor's post, not a story
 * in source_items, and the script writer builds on stories; rising posts are
 * answered through "React to this" instead.
 */
function ScriptActions({ item }: { item: SavedTopic }) {
  const queryClient = useQueryClient();
  const { platform, itemId: sourceId } = item;
  const scriptKey = ["script-for-source", platform, sourceId] as const;
  const [viewing, setViewing] = useState<ContentIdea | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data: existing, isLoading } = useQuery({
    queryKey: scriptKey,
    queryFn: () => getScriptForSource({ data: { platform, sourceId } }),
    staleTime: 60 * 1000,
  });

  const write = useMutation({
    mutationFn: (regenerate: boolean) =>
      generateOneIdea({ data: { platform, sourceId, ...(regenerate ? { regenerate } : {}) } }),
    onMutate: () => setMessage(null),
    onSuccess: (result) => {
      if (result.analysis) {
        queryClient.setQueryData(analysisQueryOptions(platform).queryKey, result.analysis);
      }
      if (result.idea) {
        queryClient.setQueryData(scriptKey, result.idea);
        setViewing(result.idea);
      } else {
        setMessage(result.reason ?? "No script was written for this story.");
      }
      void queryClient.invalidateQueries({ queryKey: topicInboxQueryOptions(platform).queryKey });
    },
    onError: (error) =>
      setMessage(
        error instanceof Error ? error.message : "Could not write a script for this story.",
      ),
  });

  const regenerating = write.isPending && write.variables === true;

  return (
    <>
      {isLoading ? (
        <Button size="sm" variant="outline" className="gap-1.5" disabled>
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Checking…
        </Button>
      ) : existing ? (
        <>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={write.isPending}
            onClick={() => setViewing(existing)}
          >
            <FileText className="size-3.5" aria-hidden />
            View script
          </Button>
          {platform === "instagram" && isAiToolWorkflowLane(item.lane) ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={write.isPending}
              onClick={() => write.mutate(true)}
              title="Uses one AI call to write a new version with the current workflow rules"
            >
              <RefreshCw className={cn("size-3.5", regenerating && "animate-spin")} aria-hidden />
              {regenerating ? "Regenerating…" : "Regenerate script"}
            </Button>
          ) : null}
        </>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={write.isPending}
          onClick={() => write.mutate(false)}
          title="Uses AI calls: writes a script on this story in the account's proven structure"
        >
          {write.isPending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-3.5" aria-hidden />
          )}
          {write.isPending ? "Writing…" : "Write script"}
        </Button>
      )}
      {message ? <span className="w-full text-xs text-destructive">{message}</span> : null}

      {viewing ? (
        <AiIdeaCards
          key={viewing.id}
          ideas={[viewing]}
          platform={platform}
          initialOpenId={viewing.id}
          panelOnly
          onClose={() => setViewing(null)}
        />
      ) : null}
    </>
  );
}
