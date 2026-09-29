import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PLATFORM_META } from "@/lib/platform-meta";
import { dashboardQueryOptions, syncNow } from "@/lib/analytics.functions";
import { SYNC_INTERVAL_MS, type SyncResult } from "@/lib/analytics-types";

/**
 * "3m ago" / "2h ago" — recomputed on a timer so it doesn't go stale on screen.
 *
 * `now` starts as null rather than Date.now(). Seeding it with the clock meant
 * the server rendered the label at one instant and the browser re-rendered it at
 * another; whenever those two straddled a bucket boundary ("just now" versus
 * "1m ago") React threw a hydration mismatch and discarded the server HTML. The
 * first paint is therefore a placeholder that depends on nothing at all, and the
 * real value lands on mount, in the same tick — a formatted clock time would
 * have reintroduced the identical bug, since the server's locale and timezone
 * need not match the browser's.
 */
function useRelativeTime(iso: string | null): string {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  return useMemo(() => {
    if (!iso) return "never";
    if (now === null) return "…";
    const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }, [iso, now]);
}

/**
 * Manual sync, plus the automatic 2-hour cadence.
 *
 * The automatic half only fires while someone has the dashboard open. The
 * authoritative schedule runs in Apify's cloud (see README) — this is the
 * catch-up path, so a dashboard opened after a gap shows current numbers rather
 * than waiting for the next cloud run.
 */
export function SyncButton({
  lastSyncedAt,
  stale,
  auto = true,
  disabled,
}: {
  lastSyncedAt: string | null;
  stale: boolean;
  /** False when AUTO_SYNC=off — the button still works, nothing fires by itself. */
  auto?: boolean;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const relative = useRelativeTime(lastSyncedAt);
  const [lastError, setLastError] = useState<string | null>(null);
  const [failedPlatforms, setFailedPlatforms] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);

  const mutation = useMutation({
    // The trigger is the whole point: a scheduled pass skips a platform that is
    // still inside its own cadence, so an open tab stops buying LinkedIn every
    // two hours. Pressing the button always fetches.
    mutationFn: (trigger: "manual" | "schedule" = "manual") => syncNow({ data: { trigger } }),
    onSuccess: async (result: SyncResult) => {
      const failed = result.outcomes.filter((outcome) => outcome.status === "error");
      // Name the platform, and every one that failed: "Sync failed" alone hid
      // that Instagram had synced fine while only LinkedIn was blocked.
      setLastError(
        failed.length
          ? failed
              .map(
                (outcome) =>
                  `${PLATFORM_META[outcome.platform].label}: ${outcome.error ?? "sync failed"}`,
              )
              .join("\n\n")
          : null,
      );
      setFailedPlatforms(failed.map((outcome) => PLATFORM_META[outcome.platform].label));
      // A skip is not a failure and must not colour the badge red, but it does
      // explain why a platform's timestamp did not move — which otherwise reads
      // as a sync that silently did nothing.
      setSkipped(
        result.outcomes
          .filter((outcome) => outcome.status === "skipped")
          .map((outcome) => `${PLATFORM_META[outcome.platform].label}: ${outcome.reason ?? ""}`),
      );
      await queryClient.invalidateQueries({ queryKey: dashboardQueryOptions.queryKey });
    },
    onError: (error: unknown) => {
      setFailedPlatforms([]);
      setSkipped([]);
      setLastError(error instanceof Error ? error.message : String(error));
    },
  });

  // Auto-sync when the stored data is older than the cadence.
  //
  // The ref latch matters: isPending alone is not enough, because React's
  // development double-mount can fire this effect twice before the first
  // mutation flips isPending — which starts two scrapes and trips Apify's
  // concurrent-run limit.
  const { mutate, isPending } = mutation;
  const autoSyncStarted = useRef(false);
  useEffect(() => {
    if (!auto || disabled || isPending || !stale || autoSyncStarted.current) return;
    autoSyncStarted.current = true;
    mutate("schedule");
  }, [auto, disabled, isPending, stale, mutate]);

  // Re-check on the cadence for a dashboard left open all day.
  useEffect(() => {
    if (!auto || disabled) return;
    const timer = setInterval(() => {
      if (!isPending) mutate("schedule");
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [auto, disabled, isPending, mutate]);

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-xs text-muted-foreground sm:inline">
        Synced <span className="font-medium text-foreground">{relative}</span>
      </span>
      {/* Click to read, not hover to read.
          Every message explain() produces is an instruction — top up Apify,
          upgrade the plan, check APIFY_TOKEN — and all of it used to live in a
          title attribute: invisible on touch, and on a desktop only findable by
          someone who already suspected there was more to see. The badge stays
          compact because the header has no room for a paragraph, but the
          paragraph is now one click away and reachable from the keyboard. */}
      {lastError || skipped.length ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 rounded-sm text-xs underline decoration-dotted underline-offset-2 hover:opacity-80 focus-visible:ring-2 focus-visible:outline-none",
                lastError
                  ? "text-destructive focus-visible:ring-destructive/40"
                  : "text-muted-foreground focus-visible:ring-ring/40",
              )}
            >
              {lastError ? <AlertTriangle className="size-3.5" aria-hidden /> : null}
              {lastError
                ? failedPlatforms.length === 1
                  ? `${failedPlatforms[0]} not updated`
                  : "Sync failed"
                : `${skipped.length} skipped`}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-96">
            <p className="text-sm font-medium">Last sync</p>
            {/* pre-wrap: outcomes are joined with a blank line, one per failed
                platform, and that separation is the readable part. */}
            {lastError ? (
              <p className="mt-1.5 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {lastError}
              </p>
            ) : null}
            {skipped.length ? (
              <div className={cn("space-y-1", lastError && "mt-3 border-t pt-2")}>
                {skipped.map((line) => (
                  <p key={line} className="text-xs leading-relaxed text-muted-foreground">
                    {line}
                  </p>
                ))}
              </div>
            ) : null}
            <p className="mt-3 border-t pt-2 text-[11px] leading-relaxed text-muted-foreground">
              Stored data is untouched — a platform that fails or is skipped keeps its last good
              sync rather than being overwritten.
            </p>
          </PopoverContent>
        </Popover>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        className="gap-2"
        disabled={disabled || isPending}
        onClick={() => mutate("manual")}
      >
        <RefreshCw className={cn("size-3.5", isPending && "animate-spin")} aria-hidden />
        {isPending ? "Syncing…" : "Sync"}
      </Button>
    </div>
  );
}
