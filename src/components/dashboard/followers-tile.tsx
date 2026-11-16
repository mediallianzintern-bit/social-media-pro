// The Followers tile for the selected period: the total as of the period's
// end, not today's, and how it changed across the period (lib/followers.ts).
// On LinkedIn, the new followers LinkedIn itself counted in the period too.
// On Instagram, how many followed and how many unfollowed, Instagram's own
// count (server/graph/follows.ts), since the net change hides both.
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";

import { KpiTile } from "@/components/dashboard/kpi-tile";
import type { PlatformData } from "@/lib/analytics-types";
import type { ResolvedRange } from "@/lib/date-range";
import { followFlowQueryOptions } from "@/lib/follow-flow.functions";
import { followersForPeriod } from "@/lib/followers";
import { fullNumber, shortDate } from "@/lib/format";
import { periodOf } from "@/lib/linkedin-analytics";
import { linkedInPeriodQueryOptions } from "@/lib/linkedin-api.functions";

export function FollowersTile({
  data,
  range,
  color,
}: {
  data: PlatformData;
  range: ResolvedRange;
  color: string;
}) {
  const linkedin = data.platform === "linkedin";
  const { data: figures } = useQuery({
    ...linkedInPeriodQueryOptions(periodOf(range)),
    enabled: linkedin,
  });
  const { data: flow } = useQuery({
    ...followFlowQueryOptions(periodOf(range)),
    enabled: data.platform === "instagram",
  });
  const period = data.followersInPeriod;
  const total = followersForPeriod(data);

  const parts: string[] = [];
  if (period && !period.current) {
    parts.push(
      period.end
        ? `as of ${shortDate(period.end.capturedAt)}`
        : `not recorded before ${period.firstRecorded ? shortDate(period.firstRecorded) : "the first sync"}`,
    );
  }
  if (period?.change != null && period.start) {
    const sign = period.change > 0 ? "+" : "";
    parts.push(
      `${sign}${fullNumber(period.change)} in this period${period.partial ? ` (since ${shortDate(period.start.capturedAt)})` : ""}`,
    );
  }
  if (linkedin && figures?.newFollowers != null) {
    parts.push(`${fullNumber(figures.newFollowers)} new followers, LinkedIn's count`);
  }

  return (
    <KpiTile
      label="Followers"
      value={total == null ? "—" : fullNumber(total)}
      icon={Users}
      hint={parts.join(" · ") || undefined}
      detail={
        flow ? (
          <span title="Instagram's own count. The last day or two can still be filling in.">
            <span className="font-medium text-emerald-700 dark:text-emerald-400">
              +{fullNumber(flow.followed)} followed
            </span>
            {" · "}
            <span className="font-medium text-red-700 dark:text-red-400">
              −{fullNumber(flow.unfollowed)} unfollowed
            </span>
            {flow.capped ? ` since ${shortDate(flow.from)}` : ""}
          </span>
        ) : undefined
      }
      accent={color}
    />
  );
}
