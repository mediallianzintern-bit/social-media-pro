import { useSuspenseQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { useMemo } from "react";

import { dashboardQueryOptions } from "@/lib/analytics.functions";
import { resolveRange, type ResolvedRange } from "@/lib/date-range";
import { filterDashboard } from "@/lib/filter";
import type { DashboardData, PlatformData, PlatformId } from "@/lib/analytics-types";

/** The raw stored payload — unfiltered. Used by the shell and the sources page. */
export function useDashboard(): DashboardData {
  const { data } = useSuspenseQuery(dashboardQueryOptions);
  return data;
}

/** The selected reporting window, resolved from the URL. */
export function useRange(): ResolvedRange {
  const search = useSearch({ from: "/_app" });
  return useMemo(
    () => resolveRange(search.range, search.from, search.to),
    [search.range, search.from, search.to],
  );
}

/** The payload with the reporting window applied. */
export function useFilteredDashboard(): { data: DashboardData; range: ResolvedRange } {
  const raw = useDashboard();
  const range = useRange();
  const data = useMemo(() => filterDashboard(raw, range), [raw, range]);
  return { data, range };
}

export function usePlatform(platform: PlatformId): {
  data: PlatformData | undefined;
  range: ResolvedRange;
  /** Unfiltered posts, for "all time" comparisons inside a filtered view. */
  allPosts: PlatformData["posts"];
} {
  const raw = useDashboard();
  const { data, range } = useFilteredDashboard();
  return {
    data: data.platforms.find((p) => p.platform === platform),
    range,
    allPosts: raw.platforms.find((p) => p.platform === platform)?.posts ?? [],
  };
}
