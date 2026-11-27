// Small pieces both layouts of the Performance report use (26 Nov 2026): the
// key-number tile, its change against the period before, and the monthly
// report's table pieces.
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/dashboard/info-tip";
import { num } from "@/lib/monthly-review";
import { cn } from "@/lib/utils";

export const UP = "text-emerald-700 dark:text-emerald-400";
export const DOWN = "text-amber-700 dark:text-amber-400";

export function Change({ pct, against }: { pct: number | null; against: string | null }) {
  if (pct === null || !against) return null;
  const up = pct > 0;
  const flat = pct === 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "mt-1 inline-flex items-center gap-0.5 text-[13px] font-medium tabular-nums",
        flat ? "text-muted-foreground" : up ? UP : DOWN,
      )}
    >
      {flat ? null : <Icon className="size-3.5 shrink-0" aria-hidden />}
      {flat ? "Same as" : `${Math.abs(pct)}% ${up ? "more than" : "less than"}`} {against}
    </span>
  );
}

export function Stat({
  value,
  label,
  pct,
  against,
}: {
  value: string;
  label: string;
  pct?: number | null;
  against: string | null;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col pt-6">
        <span className="text-3xl font-bold tabular-nums">{value}</span>
        <span className="text-sm text-muted-foreground">{label}</span>
        <Change pct={pct ?? null} against={against} />
      </CardContent>
    </Card>
  );
}

// The monthly report's tables (26 Nov 2026), shared by its Instagram and LinkedIn layouts.

export type DeltaKind = "pct" | "diff" | "pts";

/** A change cell: +12%, −118, −0.96 pts. Green when it moved the good way. */
export function Delta({
  before,
  after,
  kind,
  better = "up",
}: {
  before: number | null;
  after: number | null;
  kind: DeltaKind;
  /** Which way is good: "down" for hashtag openers, "none" where neither is. */
  better?: "up" | "down" | "none";
}) {
  if (before === null || after === null) return <span className="text-muted-foreground">—</span>;
  let text: string;
  const diff = after - before;
  if (kind === "pct") {
    if (before <= 0) return <span className="text-muted-foreground">—</span>;
    text = `${Math.abs(Math.round((diff / before) * 100))}%`;
  } else if (kind === "pts") {
    text = `${Math.abs(diff * 100).toFixed(2)} pts`;
  } else {
    text = num(Math.abs(diff));
  }
  if (Math.abs(diff) < 1e-9) return <span className="text-muted-foreground">No change</span>;
  const up = diff > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium",
        better === "none" ? "text-muted-foreground" : up === (better === "up") ? UP : DOWN,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only">{up ? "Up" : "Down"} </span>
      {up ? "+" : "−"}
      {text}
    </span>
  );
}

/** A table that scrolls sideways inside its card on a phone, never the page. */
export function TableWrap({ children, wide = true }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className={cn("w-full border-collapse text-sm tabular-nums", wide && "min-w-[32rem]")}>
        {children}
      </table>
    </div>
  );
}

export const th = "border-b py-2 pr-3 text-left text-[13px] font-medium text-muted-foreground";
export const td = "border-b py-2 pr-3 align-top";

export function SectionCard({
  title,
  info,
  description,
  children,
}: {
  title: string;
  info?: string | undefined;
  description?: string | undefined;
  children: ReactNode;
}) {
  return (
    <Card className="print:break-inside-avoid">
      <CardHeader>
        <CardTitle className="flex items-center gap-1 text-base">
          {title}
          {info ? <InfoTip text={info} /> : null}
        </CardTitle>
        {description ? (
          <CardDescription className="text-[13px]">{description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
