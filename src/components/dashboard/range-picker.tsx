import { useNavigate, useSearch } from "@tanstack/react-router";
import { CalendarRange } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  QUICK_RANGES,
  RANGE_LABELS,
  resolveRange,
  toInputValue,
  type RangeKey,
} from "@/lib/date-range";

/**
 * The reporting window lives in the URL, so a view is shareable and survives a
 * reload. One control row for the whole dashboard — never a per-chart picker.
 */
export function RangePicker() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/_app" });
  const active = search.range;
  const resolved = resolveRange(active, search.from, search.to);

  const [draftFrom, setDraftFrom] = useState(() => toInputValue(resolved.from));
  const [draftTo, setDraftTo] = useState(() => toInputValue(resolved.to));
  const [open, setOpen] = useState(false);

  const select = (key: RangeKey) => {
    navigate({ to: ".", search: { range: key } });
  };

  const applyCustom = () => {
    if (!draftFrom) return;
    navigate({
      to: ".",
      search: {
        range: "custom" as const,
        from: draftFrom,
        ...(draftTo ? { to: draftTo } : {}),
      },
    });
    setOpen(false);
  };

  return (
    <div className="flex items-center gap-2">
      <div
        role="group"
        aria-label="Reporting window"
        className="hidden items-center gap-1 rounded-lg border bg-card p-1 md:inline-flex"
      >
        {QUICK_RANGES.map((key) => (
          <Button
            key={key}
            size="sm"
            variant={key === active ? "secondary" : "ghost"}
            aria-pressed={key === active}
            className="h-7 px-2.5 text-xs font-medium"
            onClick={() => select(key)}
          >
            {RANGE_LABELS[key]}
          </Button>
        ))}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant={active === "custom" ? "secondary" : "outline"}
            className="h-8 gap-1.5 text-xs"
          >
            <CalendarRange className="size-3.5" aria-hidden />
            {active === "custom" ? resolved.label : "Custom"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="range-from" className="text-xs">
              From
            </Label>
            <Input
              id="range-from"
              type="date"
              value={draftFrom}
              max={draftTo || undefined}
              onChange={(event) => setDraftFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="range-to" className="text-xs">
              To <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="range-to"
              type="date"
              value={draftTo}
              min={draftFrom || undefined}
              onChange={(event) => setDraftTo(event.target.value)}
            />
          </div>
          <Button size="sm" className="w-full" disabled={!draftFrom} onClick={applyCustom}>
            Apply
          </Button>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Filters posts and growth points already stored. It does not scrape further back than the
            sync window.
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
