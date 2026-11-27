// Shapes for the client report view. Client-safe — no server imports.
import type {
  ContentFormat,
  GrowthPoint,
  LanePerformance,
  PlatformId,
  PostRecord,
} from "@/lib/analytics-types";
import type { CalibrationReport } from "@/lib/prediction";
import type { GrowthGoal, GrowthTrajectory } from "@/lib/growth";
import type { GoalScorecard } from "@/lib/goal-scorecard";
import type { MonthlyReview } from "@/lib/monthly-review";

/**
 * T49 — the reporting period a client report covers.
 *
 * Calendar periods only. "Era" is the agency's own word for a strategy change
 * and means nothing to a client reading a report, so it stays on the internal
 * dashboard and never appears here.
 */
export type ReportPeriod = "30d" | "90d" | "all" | "month" | "custom";

/** The quick choices; "custom" is chosen with its own dates. */
export const REPORT_PERIODS: Exclude<ReportPeriod, "custom">[] = ["30d", "90d", "all"];

export const REPORT_PERIOD_LABEL: Record<ReportPeriod, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
  month: "A month",
  custom: "Custom dates",
};

/**
 * What a report covers (19 Nov 2026): a quick period, or "custom" with its
 * own first and last day, both YYYY-MM-DD and both included.
 */
export interface ReportRange {
  period: ReportPeriod;
  from?: string | undefined;
  to?: string | undefined;
  /** For "month": the calendar month, YYYY-MM (26 Nov 2026). */
  month?: string | undefined;
}

/**
 * What the account published and earned in a period (26 Nov 2026), for the
 * client-facing report. Organic posts only, counted by when they went up.
 */
export interface PeriodTotals {
  posts: number;
  /** Views as the platform counts them; 0 when it publishes none (still images, most LinkedIn). */
  views: number;
  likes: number;
  comments: number;
  /** Likes + comments per post, rounded. 0 with no posts. */
  interactionsPerPost: number;
  formats: Partial<Record<ContentFormat, number>>;
}

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
  /** T58 — confirmed eras, for markers on the growth chart. */
  eras: Array<{ startsAt: string; label: string }>;
  /**
   * The window the follower change, best posts and lanes were computed over,
   * in words — for "Current era" that names the era, or says it fell back.
   */
  periodLabel: string;
  /** This period's totals, for the client-facing report. */
  totals: PeriodTotals;
  /**
   * The same totals for the period just before, of the same length, and the
   * follower change over it (null without two syncs in it). Null for "All
   * time" and an open-ended custom period, which have no period before them.
   */
  previous: (PeriodTotals & { followersGained: number | null }) | null;
  /**
   * The monthly report (26 Nov 2026), laid out like the agency's monthly
   * report: this period against the one before, topic by topic and post by
   * post. Present when the period is about a month; null otherwise.
   */
  monthly: MonthlyReview | null;
}

export interface ClientReport {
  generatedAt: string;
  /** The period this report was asked for. */
  period: ReportPeriod;
  /** How the period reads: "Last 30 days", or "1 Oct 2026 – 31 Oct 2026". */
  periodLabel: string;
  /** How the period before reads in full: "September 2026 (1–30 Sep)"; null when there is none. */
  previousLabel: string | null;
  /** The period before inside a sentence: "September", "the 30 days before". */
  previousName: string | null;
  /** The period is about a month, so the report is the monthly one. */
  monthly: boolean;
  /** Addendum A.6 — the goal the whole report is written against. */
  goal: { growthGoal: GrowthGoal; primaryMetric: string; label: string } | null;
  platforms: ClientReportPlatform[];
  /** How many accounts the benchmark set covers. Deliberately a count, not names. */
  benchmarkedAgainst: number;
  /** False for a client from Studio, which has no suggestions to score yet. */
  suggestions: boolean;
  /**
   * The viewer is an admin (27 Nov 2026), so may open the Technical
   * performance report. For anyone else its figures are not sent at all.
   */
  admin: boolean;
  ephemeral: boolean;
}
