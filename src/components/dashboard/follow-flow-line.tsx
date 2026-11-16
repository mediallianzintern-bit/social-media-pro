// "+26 followed · −44 unfollowed" for the period on the page, Instagram's own
// count (server/graph/follows.ts). Nothing on LinkedIn, or while loading, or
// when Instagram's API is not set up.
import { useQuery } from "@tanstack/react-query";

import type { PlatformId } from "@/lib/analytics-types";
import type { ResolvedRange } from "@/lib/date-range";
import { followFlowQueryOptions } from "@/lib/follow-flow.functions";
import { fullNumber, shortDate } from "@/lib/format";
import { periodOf } from "@/lib/linkedin-analytics";

export function FollowFlowLine({
  platform,
  range,
  className,
}: {
  platform: PlatformId;
  range: ResolvedRange;
  className?: string;
}) {
  const { data: flow } = useQuery({
    ...followFlowQueryOptions(periodOf(range)),
    enabled: platform === "instagram",
  });
  if (platform !== "instagram" || !flow) return null;
  return (
    <span
      className={className}
      title="Instagram's own count. The last day or two can still be filling in."
    >
      <span className="font-medium text-emerald-700 dark:text-emerald-400">
        +{fullNumber(flow.followed)} followed
      </span>
      {" · "}
      <span className="font-medium text-red-700 dark:text-red-400">
        −{fullNumber(flow.unfollowed)} unfollowed
      </span>
      {flow.capped ? ` since ${shortDate(flow.from)}` : ""}
    </span>
  );
}
