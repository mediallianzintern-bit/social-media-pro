// The Followers tile for the selected period: the total as of the period's
// end, not today's, and how it changed across the period (lib/followers.ts).
// On LinkedIn, the new followers LinkedIn itself counted in the period too.
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";

import { KpiTile } from "@/components/dashboard/kpi-tile";
import type { PlatformData } from "@/lib/analytics-types";
import type { ResolvedRange } from "@/lib/date-range";
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
      accent={color}
    />
  );
}
