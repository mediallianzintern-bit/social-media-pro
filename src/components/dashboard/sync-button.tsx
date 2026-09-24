import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
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

  const mutation = useMutation({
    mutationFn: () => syncNow(),
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
      await queryClient.invalidateQueries({ queryKey: dashboardQueryOptions.queryKey });
    },
    onError: (error: unknown) => {
      setFailedPlatforms([]);
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
    mutate();
  }, [auto, disabled, isPending, stale, mutate]);

  // Re-check on the cadence for a dashboard left open all day.
  useEffect(() => {
    if (!auto || disabled) return;
    const timer = setInterval(() => {
      if (!isPending) mutate();
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [auto, disabled, isPending, mutate]);

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-xs text-muted-foreground sm:inline">
        Synced <span className="font-medium text-foreground">{relative}</span>
      </span>
      {lastError ? (
        <span className="inline-flex items-center gap-1 text-xs text-destructive" title={lastError}>
          <AlertTriangle className="size-3.5" aria-hidden />
          {failedPlatforms.length === 1 ? `${failedPlatforms[0]} not updated` : "Sync failed"}
        </span>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        className="gap-2"
        disabled={disabled || isPending}
        onClick={() => mutate()}
      >
        <RefreshCw className={cn("size-3.5", isPending && "animate-spin")} aria-hidden />
        {isPending ? "Syncing…" : "Sync"}
      </Button>
    </div>
  );
}
