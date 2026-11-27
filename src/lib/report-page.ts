// What both report pages share that is not a component (26 Nov 2026): the
// period in the URL, and printing in light mode.
import { useEffect } from "react";
import { z } from "zod";

import type { ReportPeriod } from "@/lib/report-types";

export interface ReportSearch {
  period: ReportPeriod;
  from?: string | undefined;
  to?: string | undefined;
  /** For "month": YYYY-MM. */
  month?: string | undefined;
  /**
   * Which account's report the Performance report shows (26 Nov 2026). The
   * Instagram and LinkedIn monthly reports are separate reports, so the page
   * shows, and prints, one at a time.
   */
  platform?: "instagram" | "linkedin" | undefined;
}

/**
 * The period in the URL, for both reports, so a link to "last 30 days" stays
 * one (T49). An old link carrying ?period=era lands on the 30-day report
 * rather than an error. A custom period's first and last day are YYYY-MM-DD
 * (19 Nov 2026); a calendar month is YYYY-MM (26 Nov 2026).
 */
export const reportSearch = z.object({
  period: z.enum(["30d", "90d", "all", "month", "custom"]).catch("30d").default("30d"),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .catch(undefined),
  platform: z.enum(["instagram", "linkedin"]).optional().catch(undefined),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
});

/**
 * A PDF is printed in light mode whatever the screen is set to: dark cards
 * print as solid black blocks and a client receives an unreadable report.
 * Listening for the print events, not just the button, covers Ctrl+P too.
 */
export function useLightPrint() {
  useEffect(() => {
    const root = document.documentElement;
    let wasDark = false;
    const before = () => {
      wasDark = root.classList.contains("dark");
      if (wasDark) root.classList.remove("dark");
    };
    const after = () => {
      if (wasDark) root.classList.add("dark");
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
}
