// Shapes for the client report view. Client-safe — no server imports.
import type { GrowthPoint, LanePerformance, PlatformId, PostRecord } from "@/lib/analytics-types";
import type { CalibrationReport } from "@/lib/prediction";
import type { GrowthGoal, GrowthTrajectory } from "@/lib/growth";
import type { GoalScorecard } from "@/lib/goal-scorecard";

export interface ClientReportPlatform {
  platform: PlatformId;
  handle: string;
  displayName: string;
  followers: number;
  /** Oldest first. One point per stored sync. */
  growth: GrowthPoint[];
  /** Change across the whole stored history, not a rolling window. */
  followersGained: number;
  /** Days the growth figure spans, so it is never quoted without its period. */
  periodDays: number;
  postsTracked: number;
  topPosts: PostRecord[];
  lanes: LanePerformance[];
  /** Predicted vs actual. In cold-start this carries no numeric prediction. */
  calibration: CalibrationReport;
  /** Addendum A.2 — the primary metric's trajectory. Null without history. */
  trajectory: GrowthTrajectory | null;
  /** Addendum A.5 — did our advice move the primary metric? Correlational. */
  goalScore: GoalScorecard | null;
}

export interface ClientReport {
  generatedAt: string;
  /** Addendum A.6 — the goal the whole report is written against. */
  goal: { growthGoal: GrowthGoal; primaryMetric: string; label: string } | null;
  platforms: ClientReportPlatform[];
  /** How many accounts the benchmark set covers. Deliberately a count, not names. */
  benchmarkedAgainst: number;
  ephemeral: boolean;
}
