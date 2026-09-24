import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

/** A hero number: one value, an icon, and a one-line qualifier. */
export function KpiTile({
  label,
  value,
  icon: Icon,
  hint,
  accent,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  hint?: string | undefined;
  accent?: string | undefined;
}) {
  return (
    <Card className="relative overflow-hidden">
      {accent ? (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-0.5"
          style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }}
        />
      ) : null}
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </div>
        <p className="mt-2.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
          {value}
        </p>
        {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
