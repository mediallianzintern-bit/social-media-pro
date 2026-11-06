// The Trends page (6 Nov 2026): what is new across everything Pritesh Sir
// talks about, for both platforms. Each story can be added to Instagram or
// LinkedIn in one of that platform's lanes, and written there in his voice.
// Fetching is free (news searches); only "Add and write" makes a model call.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, ExternalLink, Flame, Loader2, Plus, RefreshCw, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { IdeaScriptDialog } from "@/components/dashboard/idea-script-dialog";
import { SectionHeading } from "@/components/dashboard/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { analysisQueryOptions, topicInboxQueryOptions } from "@/lib/analytics.functions";
import type { PlatformId } from "@/lib/analytics-types";
import type { ContentIdea } from "@/lib/ai-types";
import { dateTime } from "@/lib/format";
import { PLATFORM_META } from "@/lib/platform-meta";
import { TRENDING_COVERAGE } from "@/lib/sources";
import {
  suggestLane,
  TREND_CATEGORIES,
  TREND_CATEGORY_LABEL,
  type TrendItem,
} from "@/lib/universal-trends";
import {
  addTrend,
  fetchTrendsNow,
  universalTrendsQueryOptions,
} from "@/lib/universal-trends.functions";
import { cn } from "@/lib/utils";

/** Rows shown before "Show more". */
const PAGE = 15;

const PLATFORMS: PlatformId[] = ["instagram", "linkedin"];

export function UniversalTrends() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery(universalTrendsQueryOptions);
  const [category, setCategory] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [viewing, setViewing] = useState<ContentIdea | null>(null);

  const fetchNow = useMutation({
    mutationFn: () => fetchTrendsNow(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: universalTrendsQueryOptions.queryKey }),
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) map.set(item.category, (map.get(item.category) ?? 0) + 1);
    return map;
  }, [items]);
  const filtered = category ? items.filter((item) => item.category === category) : items;
  const visible = expanded ? filtered : filtered.slice(0, PAGE);
  const trending = filtered.filter((item) => item.coverage >= TRENDING_COVERAGE).length;
  const about = TREND_CATEGORIES.find((entry) => entry.id === category)?.about;

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        What is new across everything Pritesh Sir talks about: marketing, ad platforms, brands,
        campaigns, stunts, AI launches, frontier AI, AI in marketing, and companies building on AI.
        Add a story to Instagram or LinkedIn in one of its lanes, and it is written there in his
        voice, researched and fact-checked like any other story. Fetching is free; only{" "}
        <span className="font-medium text-foreground">Add and write</span> uses AI.
      </p>

      <SectionHeading
        title="Trends"
        note={
          isLoading
            ? "Loading…"
            : data?.lastFetched
              ? `${items.length} stories · fetched ${dateTime(data.lastFetched)}`
              : "Not fetched yet"
        }
        action={
          <Button
            size="sm"
            variant="outline"
            disabled={fetchNow.isPending}
            onClick={() => fetchNow.mutate()}
          >
            {fetchNow.isPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden />
            )}
            {fetchNow.isPending ? "Fetching… about a minute" : "Fetch trends"}
          </Button>
        }
      />

      {fetchNow.data && !fetchNow.data.ran && fetchNow.data.reason ? (
        <p className="text-xs text-muted-foreground">{fetchNow.data.reason}</p>
      ) : null}
      {fetchNow.data?.failures.length ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {fetchNow.data.failures.length} of the searches failed; the rest were stored.
        </p>
      ) : null}
      {fetchNow.error || error ? (
        <p className="text-xs text-destructive">
          {(fetchNow.error ?? error) instanceof Error
            ? (fetchNow.error ?? error)!.message
            : "Something went wrong."}
        </p>
      ) : null}

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by category">
              {[null, ...TREND_CATEGORIES.map((entry) => entry.id)].map((value) => (
                <button
                  key={value ?? "all"}
                  type="button"
                  role="tab"
                  aria-selected={category === value}
                  onClick={() => {
                    setCategory(value);
                    setExpanded(false);
                  }}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                    category === value
                      ? "border-foreground/30 bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {value ? TREND_CATEGORY_LABEL[value] : "All"}
                  <span className="ml-1 opacity-60">
                    {value ? (counts.get(value) ?? 0) : items.length}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {about ? `${about}. ` : ""}
              {trending ? `${trending} trending (carried by two or more outlets).` : ""}
            </p>
          </div>

          {isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Loading trends…
            </p>
          ) : !items.length ? (
            <p className="text-sm text-muted-foreground">
              No trends yet. Press <span className="font-medium">Fetch trends</span> to search every
              category now.
            </p>
          ) : (
            <ul className="divide-y">
              {visible.map((item) => (
                <TrendRow
                  key={item.id}
                  item={item}
                  lanes={data!.lanes}
                  onWritten={(idea) => setViewing(idea)}
                />
              ))}
            </ul>
          )}

          {filtered.length > PAGE ? (
            <Button variant="ghost" size="sm" onClick={() => setExpanded((value) => !value)}>
              {expanded ? "Show fewer" : `Show all ${filtered.length}`}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {viewing ? (
        <IdeaScriptDialog
          idea={viewing}
          open
          onOpenChange={(next) => {
            if (!next) setViewing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function TrendRow({
  item,
  lanes,
  onWritten,
}: {
  item: TrendItem;
  lanes: { instagram: string[]; linkedin: string[] };
  onWritten: (idea: ContentIdea) => void;
}) {
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="min-w-0 flex-1">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer noopener"
          className="group inline-flex items-start gap-1.5 text-sm font-medium leading-snug hover:underline"
        >
          {item.title}
          <ExternalLink
            className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        </a>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{item.publisher ?? "News"}</span>
          {item.publishedAt ? <span>{dateTime(item.publishedAt)}</span> : null}
          <Badge variant="secondary" className="font-medium">
            {TREND_CATEGORY_LABEL[item.category] ?? item.category}
          </Badge>
          {item.coverage >= TRENDING_COVERAGE ? (
            <Badge
              variant="outline"
              className="gap-1 border-orange-500/40 font-medium text-orange-700 dark:text-orange-400"
            >
              <Flame className="size-3" aria-hidden />
              Trending · {item.coverage} outlets
            </Badge>
          ) : null}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {PLATFORMS.map((platform) => (
          <AddToPlatform
            key={platform}
            item={item}
            platform={platform}
            lanes={lanes[platform]}
            onWritten={onWritten}
          />
        ))}
      </div>
    </li>
  );
}

function AddToPlatform({
  item,
  platform,
  lanes,
  onWritten,
}: {
  item: TrendItem;
  platform: PlatformId;
  lanes: string[];
  onWritten: (idea: ContentIdea) => void;
}) {
  const meta = PLATFORM_META[platform];
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [lane, setLane] = useState<string | null>(null);
  const chosen = lane ?? suggestLane(item.category, lanes) ?? lanes[0] ?? null;
  const noun = platform === "instagram" ? "reel script" : "post";

  const add = useMutation({
    mutationFn: (write: boolean) =>
      addTrend({ data: { trendId: item.id, platform, lane: chosen!, write } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: topicInboxQueryOptions(platform).queryKey });
      if (result.idea) {
        void queryClient.invalidateQueries({ queryKey: analysisQueryOptions(platform).queryKey });
        setOpen(false);
        onWritten(result.idea);
      }
    },
  });
  const added = add.isSuccess && !add.data.reason;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
          {added ? (
            <Check className="size-3.5 text-emerald-600" aria-hidden />
          ) : (
            <Plus className="size-3.5" aria-hidden />
          )}
          {meta.label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 text-sm">
        <p className="font-semibold">Add to {meta.label}</p>
        {lanes.length ? (
          <>
            <label className="block space-y-1.5">
              <span className="text-xs text-muted-foreground">Lane</span>
              <Select {...(chosen ? { value: chosen } : {})} onValueChange={setLane}>
                <SelectTrigger className="h-9" aria-label={`${meta.label} lane`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {lanes.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={add.isPending}
                onClick={() => add.mutate(false)}
              >
                {add.isPending && add.variables === false ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Plus className="size-3.5" aria-hidden />
                )}
                Add to topics only
              </Button>
              <Button size="sm" disabled={add.isPending} onClick={() => add.mutate(true)}>
                {add.isPending && add.variables === true ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="size-3.5" aria-hidden />
                )}
                {add.isPending && add.variables === true
                  ? `Writing the ${noun}… up to 3 minutes`
                  : `Add and write the ${noun}`}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Writing uses AI (a few cents) and follows Pritesh Sir&apos;s {meta.label} voice.
            </p>
            {added && !add.data.idea ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                Added to {meta.label}&apos;s topics in {chosen}.{" "}
                <Link
                  to={platform === "instagram" ? "/instagram" : "/linkedin"}
                  className="underline"
                >
                  Open {meta.label}
                </Link>
              </p>
            ) : null}
            {add.data?.reason ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">{add.data.reason}</p>
            ) : null}
            {add.error ? (
              <p className="text-xs text-destructive">
                {add.error instanceof Error ? add.error.message : "Could not add it."}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {meta.label} has no content lanes yet. Set them up on the {meta.label} page first.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
