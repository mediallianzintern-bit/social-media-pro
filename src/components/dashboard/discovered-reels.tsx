import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Clapperboard,
  ExternalLink,
  Eye,
  Layers,
  Loader2,
  Search,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { CollapseToggle } from "@/components/dashboard/collapse-toggle";
import { SaveTopicButton } from "@/components/dashboard/save-topic-button";
import { SectionHeading } from "@/components/dashboard/section-heading";
import { VoteButtons } from "@/components/dashboard/vote-buttons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  discoveredReelsQueryOptions,
  saveReactionClip,
  searchEveryLane,
  searchForReels,
} from "@/lib/analytics.functions";
import { RUNNING_LOW, WEAK_FIT, type DiscoveredRow } from "@/lib/discovered";
import { compactNumber } from "@/lib/format";
import { PLATFORM_META } from "@/lib/platform-meta";
import { cn } from "@/lib/utils";
import type { PlatformId } from "@/lib/analytics-types";

/** Rows shown before "show all" — enough to choose from without a wall. */
const PAGE = 6;

/**
 * "Working in your lanes" — reels from creators nobody is tracking.
 *
 * The companion to "Rising on <platform>", and the opposite way round. There,
 * the accounts are chosen and the lane only ranks what they posted. Here any
 * account may appear and the LANE IS THE GATE: a reel is only shown when its
 * caption matches one of this creator's own lanes, with the matching words
 * printed on the row so a bad match can be argued with rather than trusted.
 *
 * Nothing here is fetched on load. Searching is one Apify run behind an
 * explicit button, and the stored pool only ever grows — so crossing the reels
 * the team does not want hides them without emptying the list.
 */
export function DiscoveredReels({ platform }: { platform: PlatformId }) {
  const queryClient = useQueryClient();
  const meta = PLATFORM_META[platform];
  const { data, isLoading } = useQuery(discoveredReelsQueryOptions(platform));
  const [lane, setLane] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: discoveredReelsQueryOptions(platform).queryKey });

  const search = useMutation({
    mutationFn: () => searchForReels({ data: platform }),
    onSuccess: refresh,
  });

  // One run per lane. Its own button, with the price on it, because this is
  // the expensive action on a plan where runs are the scarce thing.
  const sweep = useMutation({
    mutationFn: () => searchEveryLane({ data: platform }),
    onSuccess: refresh,
  });
  const busy = search.isPending || sweep.isPending;

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const lanes = useMemo(
    () => [...new Set(rows.map((row) => row.lane).filter((value): value is string => !!value))],
    [rows],
  );
  const filtered = lane ? rows.filter((row) => row.lane === lane) : rows;
  const visible = expanded ? filtered : filtered.slice(0, PAGE);

  // The lane closest to running dry, which is what the prompt to search again
  // is actually about. With one search per press, saying which lane needs it
  // is the difference between a useful button and a slot machine.
  const coverage = data?.byLane ?? [];
  const laneCount = Math.max(1, coverage.length);
  const thin = coverage.filter((entry) => entry.shown < RUNNING_LOW);

  // Instagram only for now: the search actor is Instagram's.
  if (platform !== "instagram") return null;
  if (!isLoading && !rows.length && !data?.hidden.length && !search.data) return null;

  const outcome = search.data;
  const sweepOutcome = sweep.data;

  return (
    <>
      <SectionHeading
        title="Working in your lanes"
        note="Reels from creators you don't track, kept only when they match one of your lanes"
        action={
          <CollapseToggle
            collapsed={collapsed}
            onToggle={() => setCollapsed((value) => !value)}
            showLabel={`Show${rows.length ? ` ${rows.length} reels` : ""}`}
          />
        }
      />
      {collapsed ? null : (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground">
                {isLoading
                  ? "Loading…"
                  : rows.length
                    ? `${rows.length} reels found by searching your lanes.`
                    : "No reels found yet — press Search for reels."}
              </p>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={busy}
                  onClick={() => search.mutate()}
                  title="Runs one Instagram search, in whichever of your lanes is holding the fewest reels. One Apify run."
                >
                  {search.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Search className="size-3.5" aria-hidden />
                  )}
                  {search.isPending ? "Searching…" : "Search thinnest lane"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={busy}
                  onClick={() => sweep.mutate()}
                  title={`Searches every one of your lanes, one after another. ${laneCount} Apify runs.`}
                >
                  {sweep.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Layers className="size-3.5" aria-hidden />
                  )}
                  {sweep.isPending
                    ? "Searching every lane…"
                    : `Search every lane (${laneCount} runs)`}
                </Button>
              </div>
            </div>

            {/* Coverage across every lane, empty ones included: the gaps are
                what decides where to search next. */}
            {coverage.length ? (
              <div className="flex flex-wrap gap-1.5">
                {coverage.map((entry) => (
                  <Badge
                    key={entry.lane}
                    variant="outline"
                    className={cn(
                      "gap-1 font-normal",
                      entry.shown === 0 && "border-dashed text-muted-foreground",
                    )}
                  >
                    {entry.lane}
                    <span className="font-semibold tabular-nums">{entry.shown}</span>
                  </Badge>
                ))}
              </div>
            ) : null}

            {/* Said before the list runs dry, not after. */}
            {thin.length && !search.isPending ? (
              <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                Running low in {thin.map((entry) => `${entry.lane} (${entry.shown})`).join(", ")}.
                Press Search for reels to look for more — each press searches a different term, and
                what you tick decides what it looks for next.
              </p>
            ) : null}

            {sweepOutcome ? (
              <p className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
                Searched {sweepOutcome.passes.length} lane
                {sweepOutcome.passes.length === 1 ? "" : "s"}:{" "}
                {sweepOutcome.passes
                  .map((pass) =>
                    pass.ran
                      ? `“${pass.query}” → ${pass.stored ?? 0} new`
                      : (pass.reason ?? "did not run"),
                  )
                  .join("; ")}
                .
              </p>
            ) : null}

            {outcome ? (
              <p
                className={cn(
                  "rounded-md border px-3 py-2 text-xs",
                  outcome.ran ? "text-muted-foreground" : "border-destructive/30 text-destructive",
                )}
              >
                {outcome.ran
                  ? `Searched “${outcome.query}” — ${outcome.stored ?? 0} new reel${
                      outcome.stored === 1 ? "" : "s"
                    } in your lanes, ${outcome.offLane ?? 0} off-lane.` +
                    (outcome.alreadyTracked
                      ? ` ${outcome.alreadyTracked} were from accounts you already track, so they stay in Rising on Instagram.`
                      : "") +
                    (outcome.hiddenByPlan
                      ? ` ${outcome.hiddenByPlan} more could not be read: the free Apify plan hides their captions, and a reel with no caption cannot be matched to a lane.`
                      : "")
                  : outcome.reason}
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
                {visible.map((row) => (
                  <ReelRow key={row.postId} row={row} platform={platform} accent={meta.color} />
                ))}
              </ul>
            ) : null}

            {filtered.length > PAGE ? (
              <Button variant="ghost" size="sm" onClick={() => setExpanded((value) => !value)}>
                {expanded ? "Show fewer" : `Show all ${filtered.length}`}
              </Button>
            ) : null}

            {data?.hidden.length ? (
              <div className="border-t pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground"
                  onClick={() => setShowHidden((open) => !open)}
                >
                  {data.hidden.length} reel{data.hidden.length === 1 ? "" : "s"} hidden by your
                  votes
                  <ChevronDown
                    className={cn("size-3.5 transition-transform", showHidden && "rotate-180")}
                    aria-hidden
                  />
                </Button>
                {showHidden ? (
                  <ul className="mt-2 space-y-2">
                    {data.hidden.map((row) => (
                      <li
                        key={row.postId}
                        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
                      >
                        <span className="min-w-0 flex-1 truncate">{hookOf(row.caption)}</span>
                        <span className="text-muted-foreground">— {row.reason}</span>
                        <VoteButtons
                          platform={platform}
                          kind="trend"
                          itemId={row.postId}
                          text={row.caption}
                          lane={row.lane}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Each search is one Apify run. Everything else here is free: the lane match is computed
              from your own posts, and a reel&rsquo;s date is read out of its id rather than
              fetched. A reel is kept only if its caption matches one of your lanes, and the words
              that matched are shown on the row.
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}

/** The opening line of a caption, which is where these reels put the hook. */
function hookOf(caption: string): string {
  const first = caption.replace(/\s+/g, " ").split(/(?<=[.!?])\s/)[0] ?? caption;
  return first.slice(0, 160).trim();
}

function ReelRow({
  row,
  platform,
  accent,
}: {
  row: DiscoveredRow;
  platform: PlatformId;
  accent: string;
}) {
  // A low fit means the words it shares with the lane are common ones. The
  // reel is still worth showing; the LABEL is what must not look certain.
  const weak = row.laneFit < WEAK_FIT;

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        {row.views != null ? (
          <Badge variant="secondary" className="gap-1 font-semibold tabular-nums">
            <Eye className="size-3" style={{ color: accent }} aria-hidden />
            {compactNumber(row.views)}
          </Badge>
        ) : null}
        {row.creatorHandle ? (
          <span className="text-xs font-medium text-muted-foreground">@{row.creatorHandle}</span>
        ) : null}
        {row.ageDays != null ? (
          <span className="text-xs text-muted-foreground">
            {row.ageDays === 0 ? "today" : `${row.ageDays}d ago`}
          </span>
        ) : null}
        {row.lane ? (
          <Badge
            variant="outline"
            className={cn("font-normal", weak && "border-dashed text-muted-foreground")}
            title={
              weak
                ? "A weak match: the words it shares with this lane are common ones, so check the lane before using it"
                : `Matched this lane on ${row.matchedWords.join(", ")}`
            }
          >
            {row.lane}
            {weak ? " ?" : ""}
          </Badge>
        ) : null}
        <VoteButtons
          platform={platform}
          kind="trend"
          itemId={row.postId}
          text={row.caption}
          lane={row.lane}
          className="ml-auto"
        />
        <SaveTopicButton
          platform={platform}
          kind="trend"
          itemId={row.postId}
          title={hookOf(row.caption)}
          url={row.url}
          sourceLabel={row.creatorHandle ? `@${row.creatorHandle}` : null}
          lane={row.lane}
        />
      </div>

      <p className="mt-1.5 text-sm leading-snug">{hookOf(row.caption)}</p>

      {row.matchedWords.length ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {weak ? "Weak match — check the lane. " : ""}
          Matched your {row.lane} lane on: {row.matchedWords.join(", ")}
        </p>
      ) : null}

      <ReactToThisButton
        url={row.url}
        handle={row.creatorHandle}
        hook={hookOf(row.caption)}
        views={row.views}
      />
      <a
        href={row.url}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
        style={{ color: accent }}
      >
        See the reel
        <ExternalLink className="size-3" aria-hidden />
      </a>
    </li>
  );
}

/**
 * Takes a discovered reel into Reaction hooks, exactly as the same button does
 * on a rising post: it stores the clip and opens that screen. No tick required
 * here — a reel only reached this list by matching a lane, which is the
 * judgement the tick supplies over there.
 */
function ReactToThisButton({
  url,
  handle,
  hook,
  views,
}: {
  url: string;
  handle: string | null;
  hook: string;
  views: number | null;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () =>
      saveReactionClip({
        data: {
          platform: "instagram",
          sourceUrl: url,
          sourceCreatorHandle: handle,
          sourceType: "other",
          ...(hook.trim() ? { extractedClaim: hook.trim().slice(0, 1000) } : {}),
          ...(views != null ? { sourcePublicViews: views } : {}),
          foundBy: "trend_listener",
        },
      }),
    onSuccess: async (result) => {
      if ("reason" in result) {
        setFailure(result.reason);
        return;
      }
      setFailure(null);
      await queryClient.invalidateQueries({ queryKey: ["reactions", "instagram"] });
      await navigate({ to: "/reactions" });
    },
    onError: (error) => setFailure(error instanceof Error ? error.message : String(error)),
  });

  return (
    <>
      <button
        type="button"
        disabled={add.isPending}
        onClick={() => add.mutate()}
        className="mr-3 mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
        title="Stores this reel as a clip and opens it in Reaction hooks"
      >
        {add.isPending ? (
          <Loader2 className="size-3 animate-spin" aria-hidden />
        ) : (
          <Clapperboard className="size-3" aria-hidden />
        )}
        {add.isPending ? "Adding…" : "React to this"}
      </button>
      {failure ? <span className="mr-3 text-xs text-destructive">{failure}</span> : null}
    </>
  );
}
