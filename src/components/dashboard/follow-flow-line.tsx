// "+26 followed · −44 unfollowed" for the period on the page, Instagram's own
// count (server/graph/follows.ts). Nothing on LinkedIn, or while loading, or
// when Instagram's API is not set up.
import { useQuery } from "@tanstack/react-query";

import type { PlatformId } from "@/lib/analytics-types";
import type { ResolvedRange } from "@/lib/date-range";
import { followFlowQueryOptions } from "@/lib/follow-flow.functions";
import { fullNumber, shortDate } from "@/lib/format";
import { periodOf } from "@/lib/linkedin-analytics";
import { useDashboard } from "@/lib/use-dashboard";

export function FollowFlowLine({
  platform,
  range,
  className,
}: {
  platform: PlatformId;
  range: ResolvedRange;
  className?: string;
}) {
  // Instagram's own count needs the account's Meta connection, and only
  // Pritesh's exists: a client from Studio shows nothing here.
  const forClient = useDashboard().client?.isDefault === false;
  const shown = platform === "instagram" && !forClient;
  const { data: flow } = useQuery({
    ...followFlowQueryOptions(periodOf(range)),
    enabled: shown,
  });
  if (!shown || !flow) return null;
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
