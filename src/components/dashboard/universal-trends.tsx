// The Trends page (6 Nov 2026): what is new across everything Pritesh Sir
// talks about, for both platforms. Each story can be added to Instagram or
// LinkedIn in one of that platform's lanes, and written there in his voice.
// Fetching is free (news searches); only "Add and write" makes a model call.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Check,
  ExternalLink,
  FileText,
  Flame,
  Loader2,
  Pin,
  Plus,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { IdeaScriptDialog } from "@/components/dashboard/idea-script-dialog";
import { SectionHeading } from "@/components/dashboard/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  ageLabel,
  BREAKING_HOURS,
  byUrgency,
  hoursOld,
  NEW_HOURS,
  suggestLane,
  TREND_CATEGORIES,
  TREND_CATEGORY_LABEL,
  type AddedOn,
  type TrendItem,
} from "@/lib/universal-trends";
import {
  addTrend,
  fetchTrendsNow,
  getTrendIdea,
  universalTrendsQueryOptions,
} from "@/lib/universal-trends.functions";
import { cn } from "@/lib/utils";

/** Rows shown before "Show more". */
const PAGE = 15;

/** Opening the page fetches again when the list is older than this. Free. */
const STALE_MINUTES = 60;

type Sort = "urgent" | "newest" | "outlets";

/** How far back the list reaches, in hours. */
type Within = 24 | 72 | 168 | 336;
const WINDOW_LABEL: Record<Within, string> = {
  24: "24 hours",
  72: "3 days",
  168: "7 days",
  336: "14 days",
};
const SORT_LABEL: Record<Sort, string> = {
  urgent: "Most urgent",
  newest: "Newest",
  outlets: "Most outlets",
};

const PLATFORMS: PlatformId[] = ["instagram", "linkedin"];

export function UniversalTrends() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery(universalTrendsQueryOptions);
  const [category, setCategory] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [within, setWithin] = useState<Within>(336);
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<ContentIdea | null>(null);
  const [sort, setSort] = useState<Sort>("urgent");

  const fetchNow = useMutation({
    mutationFn: () => fetchTrendsNow(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: universalTrendsQueryOptions.queryKey }),
  });

  // The latest news without a click: opening the page fetches again when the
  // stored list is over an hour old. Free, and only once per visit.
  const autoFetched = useRef(false);
  useEffect(() => {
    if (!data || autoFetched.current || fetchNow.isPending) return;
    const age = data.lastFetched ? Date.now() - new Date(data.lastFetched).getTime() : Infinity;
    if (age > STALE_MINUTES * 60_000) {
      autoFetched.current = true;
      fetchNow.mutate();
    }
  }, [data, fetchNow]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const pinned = data?.pinned ?? [];
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) map.set(item.category, (map.get(item.category) ?? 0) + 1);
    return map;
  }, [items]);
  const filtered = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const inCategory = items.filter(
      (item) =>
        (!category || item.category === category) &&
        hoursOld(item.publishedAt) <= within &&
        words.every((word) => `${item.title} ${item.publisher ?? ""}`.toLowerCase().includes(word)),
    );
    if (sort === "newest") {
      return [...inCategory].sort((a, b) => hoursOld(a.publishedAt) - hoursOld(b.publishedAt));
    }
    if (sort === "outlets") {
      return [...inCategory].sort(
        (a, b) => b.coverage - a.coverage || hoursOld(a.publishedAt) - hoursOld(b.publishedAt),
      );
    }
    return byUrgency(inCategory);
  }, [items, category, sort, within, search]);
  const fresh = filtered.filter((item) => hoursOld(item.publishedAt) <= NEW_HOURS).length;
  const visible = filtered.slice(0, shown);
  const trending = filtered.filter((item) => item.coverage >= TRENDING_COVERAGE).length;
  const about = TREND_CATEGORIES.find((entry) => entry.id === category)?.about;

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        The latest news across everything Pritesh Sir talks about: marketing, ad platforms, brands,
        campaigns, stunts, AI launches, frontier AI, AI in marketing, and companies building on AI,
        most urgent first. Its own searches, not limited by any lane, refreshed when you open the
        page if the list is over an hour old. Add a story to Instagram or LinkedIn in one of its
        lanes, and it is written there in his voice, researched and fact-checked like any other
        story. Fetching is free; only{" "}
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
            {fetchNow.isPending ? "Fetching the latest…" : "Fetch trends"}
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

      {pinned.length ? (
        <Card>
          <CardContent className="space-y-2 p-5">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Pin className="size-3.5" aria-hidden />
                Added from Trends
                <span className="font-normal text-muted-foreground">· {pinned.length}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Stories already added to a platform in the last two weeks. They stay here whatever
                the next fetch does, so one written for LinkedIn can still be added to Instagram,
                and the other way round.
              </p>
            </div>
            <ul className="divide-y">
              {pinned.map((item) => (
                <TrendRow
                  key={`pinned-${item.url}`}
                  item={item}
                  lanes={data!.lanes}
                  onWritten={(idea) => setViewing(idea)}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setShown(PAGE);
                }}
                placeholder="Search headlines, e.g. Andromeda"
                aria-label="Search trends"
                className="h-9 sm:max-w-xs"
              />
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Published within">
                {(Object.keys(WINDOW_LABEL).map(Number) as Within[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={within === value}
                    onClick={() => {
                      setWithin(value);
                      setShown(PAGE);
                    }}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs transition-colors",
                      within === value
                        ? "bg-muted font-semibold text-foreground"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {WINDOW_LABEL[value]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by category">
              {[null, ...TREND_CATEGORIES.map((entry) => entry.id)].map((value) => (
                <button
                  key={value ?? "all"}
                  type="button"
                  role="tab"
                  aria-selected={category === value}
                  onClick={() => {
                    setCategory(value);
                    setShown(PAGE);
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
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {about ? `${about}. ` : ""}
                {fresh ? `${fresh} from the last 24 hours. ` : ""}
                {trending ? `${trending} trending (carried by two or more outlets).` : ""}
              </p>
              <div className="flex shrink-0 gap-1" role="radiogroup" aria-label="Sort">
                {(Object.keys(SORT_LABEL) as Sort[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={sort === value}
                    onClick={() => setSort(value)}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-xs transition-colors",
                      sort === value
                        ? "bg-muted font-semibold text-foreground"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {SORT_LABEL[value]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Loading trends…
            </p>
          ) : items.length && !filtered.length ? (
            <p className="text-sm text-muted-foreground">
              Nothing matches{search.trim() ? ` "${search.trim()}"` : ""} in the last{" "}
              {WINDOW_LABEL[within]}
              {category ? ` in ${TREND_CATEGORY_LABEL[category]}` : ""}.
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
                  key={item.url}
                  item={item}
                  lanes={data!.lanes}
                  onWritten={(idea) => setViewing(idea)}
                />
              ))}
            </ul>
          )}

          {filtered.length > shown ? (
            <Button variant="ghost" size="sm" onClick={() => setShown((value) => value + 30)}>
              Show 30 more ({filtered.length - shown} left)
            </Button>
          ) : shown > PAGE ? (
            <Button variant="ghost" size="sm" onClick={() => setShown(PAGE)}>
              Show fewer
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
          {hoursOld(item.publishedAt) <= BREAKING_HOURS && item.coverage >= TRENDING_COVERAGE ? (
            <Badge className="gap-1 bg-red-600 font-semibold text-white hover:bg-red-600">
              <Zap className="size-3" aria-hidden />
              Breaking
            </Badge>
          ) : hoursOld(item.publishedAt) <= NEW_HOURS ? (
            <Badge
              variant="outline"
              className="border-emerald-500/40 font-semibold text-emerald-700 dark:text-emerald-400"
            >
              New
            </Badge>
          ) : null}
          <span>{item.publisher ?? "News"}</span>
          {item.publishedAt ? (
            <span title={dateTime(item.publishedAt)}>{ageLabel(item.publishedAt)}</span>
          ) : null}
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
          {item.kept ? <span>· no longer in the latest fetch</span> : null}
        </p>
        {item.added && Object.keys(item.added).length ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {PLATFORMS.map((platform) => {
              const on = item.added?.[platform];
              return on ? (
                <AddedBadge key={platform} platform={platform} on={on} onOpen={onWritten} />
              ) : null;
            })}
          </div>
        ) : null}
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
  const already = item.added?.[platform]?.lane;
  const chosen =
    lane ??
    (already && lanes.includes(already) ? already : null) ??
    suggestLane(item.category, lanes) ??
    lanes[0] ??
    null;
  const noun = platform === "instagram" ? "reel script" : "post";

  const add = useMutation({
    mutationFn: (write: boolean) =>
      addTrend({
        data: {
          ...(item.kept ? { sourceId: item.id } : { trendId: item.id }),
          platform,
          lane: chosen!,
          write,
        },
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: topicInboxQueryOptions(platform).queryKey });
      // The story moves to Added from Trends, with what was written.
      void queryClient.invalidateQueries({ queryKey: universalTrendsQueryOptions.queryKey });
      if (result.idea) {
        void queryClient.invalidateQueries({ queryKey: analysisQueryOptions(platform).queryKey });
        setOpen(false);
        onWritten(result.idea);
      }
    },
  });
  const added = (add.isSuccess && !add.data.reason) || Boolean(item.added?.[platform]);

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
            {add.isSuccess && !add.data.reason && !add.data.idea ? (
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

/** Where a story already went, and the post or script written there, to open again. */
function AddedBadge({
  platform,
  on,
  onOpen,
}: {
  platform: PlatformId;
  on: AddedOn;
  onOpen: (idea: ContentIdea) => void;
}) {
  const meta = PLATFORM_META[platform];
  const open = useMutation({
    mutationFn: (ideaId: string) => getTrendIdea({ data: { ideaId } }),
    onSuccess: (idea) => onOpen(idea),
  });
  const noun = platform === "instagram" ? "script" : "post";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
      <Badge
        variant="outline"
        className="gap-1 border-emerald-500/40 font-medium text-emerald-700 dark:text-emerald-400"
      >
        <Check className="size-3" aria-hidden />
        On {meta.label}
        {on.lane ? ` · ${on.lane}` : ""}
      </Badge>
      {on.ideaId ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-1.5 text-xs"
          disabled={open.isPending}
          onClick={() => open.mutate(on.ideaId!)}
        >
          {open.isPending ? (
            <Loader2 className="size-3 animate-spin" aria-hidden />
          ) : (
            <FileText className="size-3" aria-hidden />
          )}
          Open {meta.label} {noun}
        </Button>
      ) : (
        <span className="text-muted-foreground">in topics, not written yet</span>
      )}
      {open.error ? (
        <span className="text-destructive">
          {open.error instanceof Error ? open.error.message : "Could not open it."}
        </span>
      ) : null}
    </span>
  );
}
