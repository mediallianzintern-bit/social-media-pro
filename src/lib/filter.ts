// Applies the selected date range to a platform's stored payload.
import { withinRange, type ResolvedRange } from "@/lib/date-range";
import type { DashboardData, PlatformData } from "@/lib/analytics-types";

export function filterPlatform(data: PlatformData, range: ResolvedRange): PlatformData {
  return {
    ...data,
    posts: data.posts.filter((post) => withinRange(post.publishedAt, range)),
    growth: data.growth.filter((point) => withinRange(point.capturedAt, range)),
    // `latest` is the current follower count and is deliberately NOT filtered —
    // "followers as of now" is the truth regardless of the window being viewed.
  };
}

export function filterDashboard(data: DashboardData, range: ResolvedRange): DashboardData {
  return { ...data, platforms: data.platforms.map((p) => filterPlatform(p, range)) };
}
