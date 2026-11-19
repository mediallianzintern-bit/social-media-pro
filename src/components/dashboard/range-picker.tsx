import { useNavigate, useSearch, useRouterState } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDashboard } from "@/lib/use-dashboard";
import {
  dayMonth,
  QUICK_RANGES,
  resolveRange,
  sharedEra,
  toInputValue,
  type RangeKey,
} from "@/lib/date-range";

/** The dropdown's own words for each period: what a person is choosing. */
const OPTION_LABEL: Record<RangeKey, string> = {
  era: "Since strategy change",
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
  custom: "Custom dates…",
};

/**
 * The reporting window, as ONE dropdown (13 Nov 2026, UI review): the row of
 * eight buttons took the whole header and could disagree with the page. The
 * window lives in the URL, so a view is shareable and survives a reload, and
 * every header on the page reads from it.
 */
export function RangePicker() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/_app" });
  const raw = useDashboard();
  // "Since strategy change" exists only once one is confirmed. Without one it
  // would be a second "Last 30 days", so it is hidden, and the default shows
  // the 30 days it falls back to.
  const anyEra = sharedEra(raw.platforms);
  const active = search.range === "era" && !anyEra ? "30d" : search.range;
  const ranges = anyEra ? QUICK_RANGES : QUICK_RANGES.filter((key) => key !== "era");
  const resolved = resolveRange(active, search.from, search.to);
  // Each account has its own strategy change (19 Nov 2026). On an account's
  // page the label is that account's date; elsewhere each account uses its own.
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const onAccount = raw.platforms.find((platform) => pathname === `/${platform.platform}`);
  const eraLabel = onAccount
    ? onAccount.currentEra
      ? `Since strategy change · ${dayMonth(new Date(`${onAccount.currentEra.startsAt}T00:00:00`))}`
      : "Since strategy change · not set, last 30 days"
    : "Since each account's strategy change";

  const [draftFrom, setDraftFrom] = useState(() => toInputValue(resolved.from));
  const [draftTo, setDraftTo] = useState(() => toInputValue(resolved.to));
  const [open, setOpen] = useState(false);

  const select = (value: string) => {
    if (value === "custom") {
      setOpen(true);
      return;
    }
    void navigate({ to: ".", search: (prev) => ({ ...prev, range: value as RangeKey }) });
  };

  const applyCustom = () => {
    if (!draftFrom) return;
    void navigate({
      to: ".",
      search: (prev) => ({
        ...prev,
        range: "custom" as const,
        from: draftFrom,
        to: draftTo || undefined,
      }),
    });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div>
          <Select value={active} onValueChange={select}>
            <SelectTrigger
              className="h-11 min-w-[13rem] gap-2 text-sm"
              aria-label="Reporting period"
            >
              <SelectValue>
                {active === "era"
                  ? eraLabel
                  : active === "custom"
                    ? resolved.label
                    : OPTION_LABEL[active]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              {ranges.map((key) => (
                <SelectItem key={key} value={key} className="py-2.5 text-sm">
                  {key === "era" ? eraLabel : OPTION_LABEL[key]}
                </SelectItem>
              ))}
              <SelectSeparator />
              <SelectItem value="custom" className="py-2.5 text-sm">
                {active === "custom" ? `Custom: ${resolved.label}` : OPTION_LABEL.custom}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </PopoverAnchor>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="range-from" className="text-sm">
            From
          </Label>
          <Input
            id="range-from"
            type="date"
            className="h-11"
            value={draftFrom}
            max={draftTo || undefined}
            onChange={(event) => setDraftFrom(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="range-to" className="text-sm">
            To <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="range-to"
            type="date"
            className="h-11"
            value={draftTo}
            min={draftFrom || undefined}
            onChange={(event) => setDraftTo(event.target.value)}
          />
        </div>
        <Button className="h-11 w-full" disabled={!draftFrom} onClick={applyCustom}>
          Apply
        </Button>
      </PopoverContent>
    </Popover>
  );
}
