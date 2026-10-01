import { CalendarClock, TrendingDown } from "lucide-react";
import { useMemo } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cadenceNudge } from "@/lib/cadence";
import { PLATFORM_META } from "@/lib/platform-meta";
import { useDashboard } from "@/lib/use-dashboard";
import type { PlatformId } from "@/lib/analytics-types";

/**
 * T61 — "you haven't posted in a while", against this account's own rhythm.
 *
 * Reads the UNFILTERED posts: the nudge is about today, and a range picker set
 * to "last 7 days" must not make a two-week silence look like none at all.
 * Renders nothing when the account is on track — see cadence.ts.
 */
export function CadenceNudge({
  platform,
  compact = false,
}: {
  platform: PlatformId;
  /** One line for the overview, where both platforms sit side by side. */
  compact?: boolean;
}) {
  const raw = useDashboard();
  const entry = raw.platforms.find((item) => item.platform === platform);
  // Read inside the memo: a fallback `[]` built outside it is a new array on
  // every render, which would recompute the nudge each time.
  const nudge = useMemo(
    () => cadenceNudge(entry?.posts ?? [], Date.now(), entry?.lastSyncedAt ?? null),
    [entry],
  );

  if (!nudge?.message) return null;

  const meta = PLATFORM_META[platform];
  const overdue = nudge.state === "overdue";
  const Icon = nudge.state === "on_track" ? TrendingDown : CalendarClock;

  if (compact) {
    return (
      <p
        className={
          overdue
            ? "flex items-center gap-1.5 text-xs font-medium text-destructive"
            : "flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400"
        }
      >
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {nudge.message}
      </p>
    );
  }

  return (
    <Alert variant={overdue ? "destructive" : "default"}>
      <Icon className="size-4" aria-hidden />
      <AlertTitle>
        {nudge.state === "overdue"
          ? `Time to post on ${meta.label}`
          : nudge.state === "due"
            ? `A ${meta.label} post is due`
            : `${meta.label} posting has slowed`}
      </AlertTitle>
      <AlertDescription>{nudge.message} Pick the next idea from the workspace.</AlertDescription>
    </Alert>
  );
}
