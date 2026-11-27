// What both reports share (26 Nov 2026): the period dropdown, Download PDF, the
// switch between the client-facing Performance report and the Technical
// performance report, and printing in light mode.
//
// None of the controls print: the PDF a client receives is the report alone.
import { Link } from "@tanstack/react-router";
import { CalendarRange, Download } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { REPORT_PERIOD_LABEL, REPORT_PERIODS } from "@/lib/report-types";
import type { ReportSearch } from "@/lib/report-page";
import { lastFullMonth, monthOptions } from "@/lib/report-periods";

const searchOf = ({ period, from, to, month }: ReportSearch) => ({
  period,
  ...(from ? { from } : {}),
  ...(to ? { to } : {}),
  ...(month ? { month } : {}),
});

/** The two reports, side by side; the period carries over between them. */
export function ReportSwitch({
  current,
  search,
}: {
  current: "client" | "technical";
  search: ReportSearch;
}) {
  const tab = (active: boolean) =>
    cn(
      "inline-flex h-11 items-center rounded-md px-3 text-sm font-medium transition-colors",
      active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
    );
  return (
    <nav
      aria-label="Report"
      className="inline-flex items-center gap-1 rounded-lg border bg-card p-1 print:hidden"
    >
      <Link
        to="/report"
        search={searchOf(search)}
        className={tab(current === "client")}
        aria-current={current === "client" ? "page" : undefined}
      >
        Performance report
      </Link>
      <Link
        to="/technical-report"
        search={searchOf(search)}
        className={tab(current === "technical")}
        aria-current={current === "technical" ? "page" : undefined}
      >
        Technical report
      </Link>
    </nav>
  );
}

const CUSTOM = "custom";

/** The dropdown's value for a period: "30d", "month:2026-10", "custom". */
function choiceOf({ period, month }: ReportSearch, fallbackMonth: string): string {
  if (period === "month") return `month:${month ?? fallbackMonth}`;
  return period;
}

/**
 * The period: one dropdown, per the UI/UX brief (12 Nov 2026), in place of a
 * row of buttons. Every heading on the page reads from it. Months are calendar
 * months, compared with the month before; "Custom dates" opens its own picker.
 */
export function ReportControls({
  search,
  periodLabel,
  onChoose,
}: {
  search: ReportSearch;
  /** How the chosen period reads, shown on the dropdown for custom dates. */
  periodLabel: string;
  onChoose: (search: ReportSearch) => void;
}) {
  const { period, from, to } = search;
  const today = new Date().toLocaleDateString("en-CA");
  const months = useMemo(() => monthOptions(), []);
  const [draftFrom, setDraftFrom] = useState(from ?? "");
  const [draftTo, setDraftTo] = useState(to ?? "");
  const [customOpen, setCustomOpen] = useState(false);
  const value = choiceOf(search, lastFullMonth());

  const choose = (next: string) => {
    if (next === CUSTOM) {
      setCustomOpen(true);
      return;
    }
    if (next.startsWith("month:")) onChoose({ period: "month", month: next.slice(6) });
    else onChoose({ period: next as ReportSearch["period"] });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
      <Popover open={customOpen} onOpenChange={setCustomOpen}>
        <PopoverAnchor asChild>
          <div className="w-full sm:w-72">
            <label htmlFor="report-period" className="sr-only">
              Reporting period
            </label>
            <Select value={value} onValueChange={choose}>
              <SelectTrigger id="report-period" className="h-11 gap-2 text-sm">
                <CalendarRange className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                {period === "custom" ? (
                  <span className="flex-1 truncate text-left">{periodLabel}</span>
                ) : (
                  <span className="flex-1 truncate text-left">
                    <SelectValue />
                  </span>
                )}
              </SelectTrigger>
              <SelectContent>
                {REPORT_PERIODS.map((option) => (
                  <SelectItem key={option} value={option} className="min-h-10">
                    {REPORT_PERIOD_LABEL[option]}
                  </SelectItem>
                ))}
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel className="text-[13px]">Monthly report</SelectLabel>
                  {months.map((option) => (
                    <SelectItem
                      key={option.month}
                      value={`month:${option.month}`}
                      className="min-h-10"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectSeparator />
                <SelectItem value={CUSTOM} className="min-h-10">
                  Custom dates…
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </PopoverAnchor>
        <PopoverContent align="start" className="w-72 space-y-3">
          <p className="text-sm font-semibold">Custom dates</p>
          <label className="block space-y-1">
            <span className="text-[13px] text-muted-foreground">From</span>
            <Input
              type="date"
              value={draftFrom}
              max={draftTo || today}
              onChange={(event) => setDraftFrom(event.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[13px] text-muted-foreground">To (leave empty for today)</span>
            <Input
              type="date"
              value={draftTo}
              min={draftFrom || undefined}
              max={today}
              onChange={(event) => setDraftTo(event.target.value)}
            />
          </label>
          <Button
            className="h-11 w-full"
            disabled={!draftFrom || Boolean(draftTo && draftTo < draftFrom)}
            onClick={() => {
              onChoose({
                period: "custom",
                from: draftFrom,
                ...(draftTo ? { to: draftTo } : {}),
              });
              setCustomOpen(false);
            }}
          >
            Show this period
          </Button>
        </PopoverContent>
      </Popover>
      <Button variant="outline" className="h-11 gap-1.5" onClick={() => window.print()}>
        <Download className="size-4" aria-hidden />
        Download PDF
      </Button>
    </div>
  );
}
